import React, { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { MapPin, ScanLine, Wallet, Store, Stethoscope, Hospital, Factory, Camera, Check, ChevronLeft, Delete, WifiOff, Wifi, Image as ImageIcon, Lock, CloudUpload, Navigation, AlertTriangle, IndianRupee } from "lucide-react";
import { api } from "../lib/api.js";
import { useApi } from "../lib/live.jsx";
import { useLang } from "../lib/i18n.js";
import { Button, Stage, Badge, cx, useToast, LangToggle, Loading, ErrorNote, Select } from "../components/ui.jsx";
import { inr, kg, when, shortHash, num } from "../lib/format.js";

const KIND_ICON = { CHEMIST: Store, CLINIC: Stethoscope, HOSPITAL: Hospital, FACTORY: Factory };
const QKEY = "sl-offline-queue";

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch {}
}

async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getGeo(fallback) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(fallback);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), accuracy: Math.round(p.coords.accuracy) }),
      () => resolve(fallback),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  });
}

// ---------- scan and weigh flow ----------

function Viewfinder({ onDetect, t, active }) {
  const videoRef = useRef(null);
  const cbRef = useRef(onDetect);
  cbRef.current = onDetect;
  const [cam, setCam] = useState(false);
  const [err, setErr] = useState(null);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window && navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!cam) return;
    let stream, timer, stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const det = new window.BarcodeDetector({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          try {
            const codes = await det.detect(videoRef.current);
            const raw = codes[0]?.rawValue;
            const m = raw && raw.match(/SL-BIN-\d{4}/i);
            if (m) { cbRef.current(m[0].toUpperCase()); setCam(false); }
          } catch {}
        }, 350);
      } catch (e) {
        setErr("Camera not available. Tap a bin below instead.");
        setCam(false);
      }
    })();
    return () => { stopped = true; clearInterval(timer); stream && stream.getTracks().forEach((tr) => tr.stop()); };
  }, [cam]);

  return (
    <div>
      <div className="relative mx-auto h-[196px] w-full rounded-2xl bg-forest-900 overflow-hidden">
        {cam ? <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline /> : (
          <div className="absolute inset-0 grid place-items-center text-sage/70 text-[13px]">{active ? "Reading QR" : t("tapToScan")}</div>
        )}
        <div className="absolute inset-5 pointer-events-none">
          {["top-0 left-0 border-t-4 border-l-4 rounded-tl-xl", "top-0 right-0 border-t-4 border-r-4 rounded-tr-xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl"].map((c) => (
            <span key={c} className={cx("absolute h-8 w-8 border-sprout", c)} />
          ))}
          <div className="scanline absolute left-2 right-2 top-0 h-0.5 bg-sprout/90 shadow-[0_0_12px_#8CCB9E]" />
        </div>
      </div>
      {supported && (
        <Button variant="secondary" size="lg" className="w-full mt-3" icon={Camera} onClick={() => setCam((c) => !c)}>
          {cam ? t("stopCamera") : t("useCamera")}
        </Button>
      )}
      {err && <div className="text-[12.5px] text-ochre mt-2">{err}</div>}
    </div>
  );
}

function Keypad({ value, onChange }) {
  const press = (k) => {
    if (k === "del") return onChange(value.slice(0, -1));
    if (k === "." && value.includes(".")) return;
    if (value.replace(".", "").length >= 6) return;
    onChange(value === "0" && k !== "." ? k : value + k);
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map((k) => (
        <button key={k} onClick={() => press(k)} className="h-14 rounded-2xl bg-sage-100 active:bg-sage text-2xl font-semibold text-forest grid place-items-center" aria-label={k === "del" ? "Delete" : k}>
          {k === "del" ? <Delete size={24} /> : k}
        </button>
      ))}
    </div>
  );
}

function ScanFlow({ summary, stop, t, collectorId, offline, onQueued, onExit }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [bin, setBin] = useState(null);
  const [reading, setReading] = useState(false);
  const [code, setCode] = useState("");
  const [seal, setSeal] = useState("");
  const [weight, setWeight] = useState("");
  const [photo, setPhoto] = useState(null);
  const [geo, setGeo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const waiting = useMemo(() => {
    const stops = stop ? [stop] : summary.stops;
    return stops.flatMap((s) => s.waiting.map((b) => ({ ...b, stopName: s.name })));
  }, [summary, stop]);

  const rate = bin ? summary.rates[bin.type] || 0 : 0;
  const w = parseFloat(weight) || 0;
  const earning = Math.round(w * rate + (w > 0 ? summary.stopIncentive : 0));

  function choose(id) {
    const found = waiting.find((b) => b.id === id.toUpperCase());
    if (!found) {
      toast({ tone: "warn", title: `Bin ${id} is not waiting on your route`, body: "Check the code on the label, or pick from the list." });
      return;
    }
    setReading(true);
    setTimeout(() => { setReading(false); setBin(found); setStep(2); }, 650);
  }

  useEffect(() => {
    if (step !== 5 || geo) return;
    const fallback = summary.stops.find((s) => s.id === bin?.pointId);
    getGeo(fallback ? { lat: fallback.lat, lng: fallback.lng, approx: true } : null).then(setGeo);
  }, [step, geo, bin, summary]);

  async function confirm() {
    const body = { by: collectorId, seal, weightKg: w, photo, geo: geo ? { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy, approx: !!geo.approx } : null };
    if (offline) {
      const q = readQueue();
      q.push({ binId: bin.id, body, savedAt: new Date().toISOString(), earning });
      writeQueue(q);
      onQueued(q.length);
      setResult({ offline: true, earning });
      return;
    }
    setBusy(true);
    try {
      await api.post(`/bins/${bin.id}/pickup`, body);
      const r = await api.get(`/bins/${bin.id}`);
      const ev = [...r.events].reverse().find((e) => e.type === "PICKUP");
      setResult({ ev, earning });
    } catch (e) {
      toast({ tone: e.body?.flagged ? "warn" : "block", title: e.body?.flagged ? "Seal does not match" : "Pickup not saved", body: e.message });
      if (e.body?.flagged) setStep(2);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="text-center pt-6">
        <div className="lockin mx-auto h-20 w-20 rounded-full bg-moss text-white grid place-items-center"><Check size={40} strokeWidth={3} /></div>
        <div className="mt-4 font-display text-2xl font-semibold text-forest">{result.offline ? t("savedOffline") : t("saved")}</div>
        <div className="mt-1 text-ink/60">{bin.id} | {kg(w, 2)}</div>
        <div className="mt-6 rounded-2xl bg-sage-100 p-4">
          <div className="text-sm text-ink/60">{t("youEarned")}</div>
          <div className="font-display text-4xl font-bold text-moss">{inr(result.earning)}</div>
        </div>
        {result.ev && (
          <div className="mt-3 text-[12px] text-ink/50 flex items-center justify-center gap-1"><Lock size={11} /> Ledger #{result.ev.seq} {shortHash(result.ev.hash)}</div>
        )}
        <Button size="xl" className="w-full mt-6" onClick={onExit}>{t("nextStop")}</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => (step === 1 ? onExit() : setStep(step - 1))} className="flex items-center gap-1 text-moss font-semibold text-[15px] py-1"><ChevronLeft size={20} />{t("back")}</button>
        <span className="text-[13px] text-ink/55 font-semibold">{t("step", { n: step })}</span>
      </div>
      <div className="flex gap-1 mb-4">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={cx("h-1.5 flex-1 rounded-full", n <= step ? "bg-moss" : "bg-sage")} />)}</div>

      {step === 1 && (
        <div>
          <h3 className="text-[22px] font-semibold mb-3">{t("step1")}</h3>
          <Viewfinder onDetect={choose} t={t} active={reading} />
          <div className="mt-4 space-y-2">
            {waiting.map((b) => (
              <button key={b.id} onClick={() => choose(b.id)} disabled={reading} className="w-full flex items-center gap-3 rounded-2xl border-2 border-sage bg-white p-3 text-left active:border-moss">
                <div className="bg-white p-1 rounded-lg border border-sage-200"><QRCodeSVG value={b.id} size={44} fgColor="#0F3D2E" /></div>
                <div className="min-w-0">
                  <div className="font-semibold text-forest text-[16px]">{b.id}</div>
                  <div className="text-[13px] text-ink/60 truncate">{b.typeLabel} | {b.stopName}</div>
                </div>
              </button>
            ))}
            {waiting.length === 0 && <div className="text-center text-ink/60 py-4">{t("noStops")}</div>}
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="code">{t("orType")}</label>
            <div className="flex gap-2">
              <input id="code" className="field text-lg uppercase" placeholder="SL-BIN-0000" value={code} onChange={(e) => setCode(e.target.value)} />
              <Button size="lg" variant="secondary" className="whitespace-nowrap shrink-0" onClick={() => code && choose(code.trim())}>{t("find")}</Button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && bin && (
        <div>
          <h3 className="text-[22px] font-semibold">{t("step2")}</h3>
          <p className="text-ink/60 mt-1">{t("sealHint")}</p>
          <div className="mt-4 rounded-2xl bg-sage-100 p-3 text-sm"><span className="font-semibold text-forest">{bin.id}</span> | {bin.typeLabel} | {bin.pointName}</div>
          <input className="field mt-4 h-16 text-3xl font-display tracking-wide uppercase text-center" placeholder="S-000000" value={seal} onChange={(e) => setSeal(e.target.value.toUpperCase())} inputMode="text" aria-label="Seal number" />
          {seal && seal !== bin.seal && (
            <div className="mt-2 flex items-start gap-2 text-[13px] text-ochre"><AlertTriangle size={16} className="shrink-0 mt-0.5" />Does not match the seal on record. If you continue, the bin is flagged for the supervisor.</div>
          )}
          {seal === bin.seal && <div className="mt-2 flex items-center gap-2 text-[13px] text-moss font-semibold"><Check size={16} />Seal matches</div>}
          <button onClick={() => setSeal(bin.seal)} className="mt-3 text-[13px] text-moss font-semibold underline underline-offset-2">{t("fillSeal")}</button>
          <Button size="xl" className="w-full mt-6" disabled={seal.length < 4} onClick={() => setStep(3)}>{t("next")}</Button>
        </div>
      )}

      {step === 3 && bin && (
        <div>
          <h3 className="text-[22px] font-semibold">{t("step3")}</h3>
          <div className="mt-3 rounded-2xl bg-forest text-white p-4 flex items-end justify-between">
            <div>
              <div className="font-display text-5xl font-bold tabular-nums">{weight || "0"}</div>
              <div className="text-sage">{t("kg")}</div>
            </div>
            <div className="text-right">
              <div className="text-sage text-[13px]">{t("youEarned")}</div>
              <div className="font-display text-2xl font-semibold text-sprout">{inr(earning)}</div>
              <div className="text-[11.5px] text-sage/80">{inr(rate)} / {t("kg")} + {inr(summary.stopIncentive)}</div>
            </div>
          </div>
          <div className="mt-3"><Keypad value={weight} onChange={setWeight} /></div>
          <Button size="xl" className="w-full mt-4" disabled={!w || w <= 0} onClick={() => setStep(4)}>{t("next")}</Button>
        </div>
      )}

      {step === 4 && (
        <div>
          <h3 className="text-[22px] font-semibold">{t("step4")}</h3>
          <p className="text-ink/60 mt-1">{t("photoHint")}</p>
          <label className="mt-4 block cursor-pointer">
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compressImage(f)); }} />
            {photo ? (
              <img src={photo} alt="Bin on scale" className="w-full h-56 object-cover rounded-2xl border-2 border-moss" />
            ) : (
              <div className="h-56 rounded-2xl border-2 border-dashed border-moss/60 bg-sage-100 grid place-items-center text-moss">
                <div className="text-center"><Camera size={40} className="mx-auto" /><div className="mt-2 font-semibold text-lg">{t("takePhoto")}</div></div>
              </div>
            )}
          </label>
          {photo && <button className="mt-2 text-moss font-semibold text-sm" onClick={() => setPhoto(null)}>{t("retake")}</button>}
          <Button size="xl" className="w-full mt-5" onClick={() => setStep(5)} disabled={!photo}>{t("next")}</Button>
          {!photo && <button className="w-full mt-3 text-[14px] text-ink/60 font-semibold py-2" onClick={() => setStep(5)}>{t("skipPhoto")}</button>}
        </div>
      )}

      {step === 5 && bin && (
        <div>
          <h3 className="text-[22px] font-semibold">{t("step5")}</h3>
          <div className="mt-3 rounded-2xl border border-sage divide-y divide-sage-200 bg-white">
            {[["Bin", bin.id], ["Seal", seal], ["Weight", kg(w, 2)], ["Stop", bin.pointName], ["Photo", photo ? "Attached" : "Not attached"]].map(([k, v]) => (
              <div key={k} className="flex justify-between px-4 py-2.5 text-[15px]"><span className="text-ink/55">{k}</span><span className={cx("font-semibold text-forest text-right", k === "Seal" && seal !== bin.seal && "text-ochre")}>{v}</span></div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-sage-100 px-3 py-2.5 text-[13px]">
            <Navigation size={16} className="text-moss shrink-0" />
            {geo ? (
              <span><b className="text-forest">{geo.approx ? t("approxLocation") : t("location")}</b><br />{geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}{geo.accuracy ? ` (within ${geo.accuracy} m)` : ""} | {new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
            ) : <span>Reading location</span>}
          </div>
          <Button size="xl" className="w-full mt-5" loading={busy} icon={offline ? CloudUpload : Check} onClick={confirm}>{t("confirm")}</Button>
        </div>
      )}
    </div>
  );
}

// ---------- tabs ----------

function RouteTab({ summary, t, onStart }) {
  const total = summary.stops.length;
  const done = summary.stops.filter((s) => s.status === "Done").length;
  return (
    <div>
      <div className="rounded-2xl bg-forest text-white p-4">
        <div className="text-sage text-sm">{t("route")}</div>
        <div className="font-display text-[26px] font-semibold mt-0.5">{t("stopsDone", { d: done, t: total })}</div>
        <div className="mt-3 h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-sprout rounded-full" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        <div className="mt-2 text-[12.5px] text-sage">Drop at {summary.collector.aggName}</div>
      </div>
      <ol className="mt-4 space-y-3">
        {summary.stops.map((s, i) => {
          const Icon = KIND_ICON[s.kind] || Store;
          const pending = s.waiting.length > 0;
          return (
            <li key={s.id} className={cx("rounded-2xl border-2 p-3.5 bg-white", pending ? "border-sage" : "border-sage-200 opacity-80")}>
              <div className="flex gap-3">
                <div className={cx("h-11 w-11 rounded-xl grid place-items-center shrink-0", pending ? "bg-sage-100 text-moss" : "bg-moss text-white")}>{pending ? <Icon size={22} /> : <Check size={22} />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-forest text-[16px] leading-snug">{i + 1}. {s.name}</div>
                  </div>
                  <div className="text-[13px] text-ink/55 flex items-center gap-1"><MapPin size={12} />{s.area}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {pending && <Badge tone="ochre">{t("binsWaiting", { n: s.waiting.length })}</Badge>}
                    {s.doneToday.length > 0 && <Badge tone="green">{t("pickedToday", { n: s.doneToday.length })}</Badge>}
                    {!s.registered && <Badge tone="clay">Not in registry</Badge>}
                    {s.waiting.some((b) => b.vial) && <Badge tone="dark">Vials: sealed custody</Badge>}
                  </div>
                </div>
              </div>
              {pending && <Button size="lg" className="w-full mt-3" icon={ScanLine} onClick={() => onStart(s)}>{t("startPickup")}</Button>}
            </li>
          );
        })}
        {summary.stops.length === 0 && <div className="text-center text-ink/60 py-10">{t("noStops")}</div>}
      </ol>
    </div>
  );
}

function EarnTab({ summary, t, payoutsStage }) {
  const loan = summary.loan;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-forest text-white p-4">
        <div className="text-sage text-sm">{t("today")}</div>
        <div className="font-display text-[40px] font-bold leading-none mt-1">{inr(summary.today.amount)}</div>
        <div className="mt-2 text-sage text-[13px]">{kg(summary.today.kg)} | {summary.today.pickups} {t("pickups").toLowerCase()}</div>
      </div>
      <div className="rounded-2xl bg-white border border-sage p-3">
        <div className="font-semibold text-forest text-[15px] mb-1">{t("thisWeek")}</div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.week} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#10291F99" }} />
              <Tooltip cursor={{ fill: "#E9F4EC" }} formatter={(v) => [inr(v), "Earned"]} />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                {summary.week.map((d, i) => <Cell key={i} fill={i === summary.week.length - 1 ? "#1F6B47" : "#8CCB9E"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {loan && (
        <div className="rounded-2xl bg-white border border-sage p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-forest text-[15px]">{t("loan")}</div>
            <Badge tone={loan.dpd ? "ochre" : "green"}>{loan.dpd ? `${loan.dpd} days late` : "On time"}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div><div className="text-[12px] text-ink/55">{t("outstanding")}</div><div className="font-display text-lg font-semibold text-forest">{inr(loan.outstanding)}</div></div>
            <div><div className="text-[12px] text-ink/55">{t("emi")}</div><div className="font-display text-lg font-semibold text-forest">{inr(loan.emi)}</div></div>
            <div><div className="text-[12px] text-ink/55">{t("nextDue")}</div><div className="font-display text-lg font-semibold text-forest">{new Date(loan.nextDue).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div></div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-sage-100 overflow-hidden"><div className="h-full bg-moss" style={{ width: `${loan.paidPct}%` }} /></div>
          <div className="mt-1 text-[12px] text-ink/55">{loan.paidInstallments} of {loan.tenureMonths} EMIs paid | {loan.id} | Satin Creditcare</div>
        </div>
      )}
      <div className="rounded-2xl bg-white border border-sage p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-forest text-[15px]">{t("payouts")}</div>
          <Stage kind="roadmap" />
        </div>
        <p className="text-[12px] text-ink/55 mt-1">Today the aggregation point pays by UPI and logs it here. Automatic weekly payouts are planned.</p>
        <ul className="mt-2 divide-y divide-sage-200">
          {summary.payouts.map((p) => (
            <li key={p.id} className="flex justify-between py-2 text-[14px]">
              <span><span className="font-semibold text-forest">{inr(p.amount)}</span><br /><span className="text-[12px] text-ink/50">{p.upiRef}</span></span>
              <span className="text-right text-[12.5px] text-ink/60">{when(p.at)}<br /><span className="text-moss font-semibold">{t("paid")}</span></span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl bg-sage-100 p-4 text-[13.5px]">
        <div className="font-semibold text-forest mb-1">{t("rateCard")}</div>
        {Object.entries(summary.rates).filter(([k]) => k !== "VIAL").map(([k, v]) => (
          <div key={k} className="flex justify-between py-0.5"><span className="text-ink/65">{{ PVC_ALU: "PVC-alu blister", ALU_ALU: "Alu-alu strip", CARTON: "Cartons and leaflets" }[k]}</span><span className="font-semibold">{inr(v)}</span></div>
        ))}
      </div>
    </div>
  );
}

// ---------- screen ----------

export default function Collector() {
  const toast = useToast();
  const { lang, setLang, t } = useLang();
  const [collectorId, setCollectorId] = useState("COL-01");
  const [tab, setTab] = useState("route");
  const [stop, setStop] = useState(null);
  const [simOffline, setSimOffline] = useState(false);
  const [netOffline, setNetOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [queueLen, setQueueLen] = useState(readQueue().length);
  const [flushing, setFlushing] = useState(false);
  const { data, error, loading, reload } = useApi(`/collectors/${collectorId}/summary`);
  const boot = useApi("/bootstrap");
  const offline = simOffline || netOffline;

  useEffect(() => {
    const on = () => setNetOffline(false), off = () => setNetOffline(true);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  async function flush() {
    const q = readQueue();
    if (!q.length) return;
    setFlushing(true);
    const left = [];
    let sent = 0;
    for (const item of q) {
      try { await api.post(`/bins/${item.binId}/pickup`, item.body); sent++; } catch (e) {
        if (e.status === 0) left.push(item); else toast({ tone: "warn", title: `${item.binId} not accepted`, body: e.message });
      }
    }
    writeQueue(left); setQueueLen(left.length); setFlushing(false);
    if (sent) toast({ title: `${sent} saved pickups sent`, body: "They are now in the ledger with their original weights and photos." });
    reload();
  }

  useEffect(() => { if (!offline && queueLen > 0) flush(); }, [offline]); // eslint-disable-line react-hooks/exhaustive-deps

  const collectorOptions = (boot.data?.collectors || []).map((c) => ({ value: c.id, label: `${c.name} (${c.id})` }));

  const phone = (
    <div className={cx("bg-mist flex flex-col", "lg:w-[392px] lg:h-[800px] lg:rounded-[46px] lg:border-[10px] lg:border-forest lg:shadow-lift lg:overflow-hidden")}>
      <div className="bg-forest text-white px-4 pt-3 pb-3 lg:pt-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[12px] text-sage">StripLoop Sakhi</div>
            <div className="font-display text-[19px] font-semibold truncate">{data?.collector.name || "..."}</div>
          </div>
          <LangToggle lang={lang} setLang={setLang} dark />
        </div>
      </div>
      {offline && (
        <div className="bg-ochre-soft text-ochre px-4 py-2 text-[13px] flex items-start gap-2 border-b border-ochre/20">
          <WifiOff size={16} className="shrink-0 mt-0.5" /><span>{t("offline")}</span>
        </div>
      )}
      {queueLen > 0 && (
        <div className="bg-sage-100 px-4 py-2 text-[13px] flex items-center justify-between gap-2 border-b border-sage">
          <span className="text-forest font-semibold">{t("queued", { n: queueLen })}</span>
          {!offline && <Button size="sm" loading={flushing} onClick={flush}>{t("sendNow")}</Button>}
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
        {loading && !data ? <Loading /> : error ? <ErrorNote error={error} onRetry={reload} /> : data && (
          tab === "route" ? <RouteTab summary={data} t={t} onStart={(s) => { setStop(s); setTab("scan"); }} /> :
          tab === "scan" ? <ScanFlow key={`${stop?.id || "any"}-${collectorId}`} summary={data} stop={stop} t={t} collectorId={collectorId} offline={offline} onQueued={setQueueLen} onExit={() => { setStop(null); setTab("route"); reload(); }} /> :
          <EarnTab summary={data} t={t} />
        )}
      </div>
      <nav className="bg-white border-t border-sage grid grid-cols-3 sticky bottom-0 z-10 lg:static" aria-label="Collector sections">
        {[["route", MapPin, t("route")], ["scan", ScanLine, t("scan")], ["earn", IndianRupee, t("earnings")]].map(([k, I, l]) => (
          <button key={k} onClick={() => { if (k === "scan") setStop(null); setTab(k); }} className={cx("flex flex-col items-center gap-0.5 py-2.5 text-[12px] font-semibold", tab === k ? "text-moss" : "text-ink/45")}>
            <I size={22} />{l}
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="grid lg:grid-cols-[auto_1fr] gap-8 items-start -mx-4 sm:mx-0">
      <div className="lg:sticky lg:top-24">{phone}</div>
      <div className="space-y-4 px-4 sm:px-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[30px] font-semibold">Collector app</h1>
          <Stage kind="working" />
        </div>
        <p className="text-ink/70 leading-relaxed max-w-xl">
          Built for women collectors on foot or e-cart: large buttons, three languages, and five steps per pickup. Scanning the bin, checking the seal, weighing, the photo and the GPS stamp are all saved to the ledger, and the collector sees what she earned straight away.
        </p>
        <div className="panel p-4 space-y-3 max-w-xl">
          <div>
            <label className="label">Demo collector</label>
            <Select value={collectorId} onChange={(v) => { setCollectorId(v); setTab("route"); setStop(null); }} options={collectorOptions.length ? collectorOptions : [{ value: "COL-01", label: "Savita Rathod (COL-01)" }]} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-sage-100 px-3 py-2.5 cursor-pointer">
            <span className="flex items-center gap-2 text-sm font-semibold text-forest">{offline ? <WifiOff size={16} /> : <Wifi size={16} />}Simulate no internet</span>
            <input type="checkbox" className="h-5 w-5 accent-moss" checked={simOffline} onChange={(e) => setSimOffline(e.target.checked)} />
          </label>
          <p className="text-[12.5px] text-ink/60">Basic offline queue: pickups are kept on the phone and sent when the connection returns. <Stage kind="working" className="ml-1" /> A full native sync engine is <Stage kind="roadmap" className="ml-1" /></p>
        </div>
        <div className="panel p-4 max-w-xl flex items-center gap-4">
          <div className="bg-white p-1.5 rounded-lg border border-sage shrink-0"><QRCodeSVG value={`${window.location.origin}/collector`} size={96} fgColor="#0F3D2E" /></div>
          <div className="text-sm text-ink/70">
            <div className="font-semibold text-forest">Open on your phone</div>
            Scan to open this screen on a phone. Real QR scanning with the phone camera works in Chrome on Android. Print labels from the <a href="/labels" className="text-moss font-semibold underline">bin labels page</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
