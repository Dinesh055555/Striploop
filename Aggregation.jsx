import React, { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Scale, ClipboardCheck, Package, Truck, Printer, Check, AlertTriangle, Inbox } from "lucide-react";
import { api } from "../lib/api.js";
import { useApi } from "../lib/live.jsx";
import { useLang } from "../lib/i18n.js";
import { PageHead, Panel, Button, Badge, Tabs, Stat, Modal, GapMeter, LangToggle, Loading, ErrorNote, Empty, Select, StatusPill, useToast, cx } from "../components/ui.jsx";
import { kg, when } from "../lib/format.js";

function gapOf(a, b) {
  if (!a) return 0;
  return Math.round((Math.abs(a - b) / a) * 10000) / 100;
}

function IntakeTab({ s, aggId, t }) {
  const toast = useToast();
  const [sel, setSel] = useState(null);
  const [w, setW] = useState("");
  const [busy, setBusy] = useState(false);
  const bin = s.pendingIntake.find((b) => b.id === sel) || null;
  useEffect(() => { if (!bin && s.pendingIntake[0]) setSel(s.pendingIntake[0].id); }, [s.pendingIntake, bin]);
  useEffect(() => { setW(""); }, [sel]);
  const weight = parseFloat(w) || 0;
  const gap = bin && weight ? gapOf(bin.weights.pickup, weight) : 0;
  const over = gap > s.tolerancePct;

  async function record() {
    setBusy(true);
    try {
      const r = await api.post(`/bins/${bin.id}/intake`, { aggId, weightKg: weight });
      if (r.exception) toast({ tone: "warn", title: `${bin.id} recorded and flagged`, body: `Gap of ${r.gapPct}% is above the ${s.tolerancePct}% limit. It is now in the hub exceptions queue as ${r.exception.id}.` });
      else toast({ title: `${bin.id} recorded`, body: `Gap ${r.gapPct}%, within tolerance.` });
      setSel(null);
    } catch (e) {
      toast({ tone: "block", title: "Intake not recorded", body: e.message });
    } finally { setBusy(false); }
  }

  if (!s.pendingIntake.length) return <Panel><Empty icon={Inbox} title={t("awaitingIntake")}>{t("nothingWaiting")}</Empty></Panel>;

  return (
    <div className="grid lg:grid-cols-[1fr_1.1fr] gap-5">
      <Panel title={t("awaitingIntake")} sub="Tap a bin, or scan its QR with the counter scanner." stage="working" bodyClass="p-3">
        <ul className="space-y-2">
          {s.pendingIntake.map((b) => (
            <li key={b.id}>
              <button onClick={() => setSel(b.id)} className={cx("w-full text-left rounded-xl border-2 p-3 flex items-center gap-3", sel === b.id ? "border-moss bg-sage-100" : "border-sage-200 bg-white hover:border-sage")}>
                <div className="bg-white p-1 rounded-md border border-sage-200"><QRCodeSVG value={b.id} size={40} fgColor="#0F3D2E" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-forest">{b.id}</div>
                  <div className="text-[13px] text-ink/60 truncate">{b.typeLabel} | {b.collectorName} | {b.pointName}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-lg font-semibold text-forest">{kg(b.weights.pickup, 2)}</div>
                  <div className="text-[12px] text-ink/50">{when(b.pickedAt)}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {bin && (
        <Panel title={`${bin.id} weigh-in`} sub={`Seal ${bin.seal} | ${bin.typeLabel} from ${bin.pointName}`}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-sage-100 p-4">
              <div className="text-[13px] text-ink/60">{t("collectorWeight")}</div>
              <div className="font-display text-3xl font-semibold text-forest">{kg(bin.weights.pickup, 2)}</div>
            </div>
            <div className="rounded-2xl border-2 border-moss p-4">
              <label className="text-[13px] text-ink/60" htmlFor="scalew">{t("scaleWeight")}</label>
              <input id="scalew" inputMode="decimal" className="w-full font-display text-3xl font-semibold text-forest bg-transparent outline-none" placeholder="0.00" value={w} onChange={(e) => setW(e.target.value.replace(/[^0-9.]/g, ""))} autoFocus />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5 text-sm">
              <span className="font-semibold text-forest">{t("gap")}: {weight ? `${gap}%` : "..."}</span>
              {weight > 0 && (over ? <Badge tone="ochre" icon={AlertTriangle}>{t("overTol")}</Badge> : <Badge tone="green" icon={Check}>{t("withinTol")}</Badge>)}
            </div>
            <GapMeter gap={gap} tolerance={s.tolerancePct} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="lg" icon={Scale} disabled={!weight} loading={busy} onClick={record}>{t("recordIntake")}</Button>
            <Button size="lg" variant="secondary" onClick={() => setW(String(bin.weights.pickup))}>Demo: same as collector</Button>
            <Button size="lg" variant="ghost" onClick={() => setW(String(Math.round(bin.weights.pickup * 0.9 * 100) / 100))}>Demo: 10% short</Button>
          </div>
          <p className="mt-3 text-[12.5px] text-ink/55">The gap rule and the {s.tolerancePct}% limit are set by StripLoop admin. A flagged bin still moves on, but its certificate shows the adjustment and reason once the hub resolves it.</p>
        </Panel>
      )}
    </div>
  );
}

function ReconTab({ s, t }) {
  const gap = gapOf(s.totals.inKg, s.totals.outKg);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={t("weightIn")} value={kg(s.totals.inKg)} sub="Sum of collector weights" />
        <Stat label={t("weightOut")} value={kg(s.totals.outKg)} sub="Sum of intake scale weights" />
        <Stat label={t("gap")} value={`${gap}%`} sub={`Limit ${s.tolerancePct}% per bin`} />
        <Stat label="Open flags" value={s.totals.flagged} sub="Waiting for the hub supervisor" tone={s.totals.flagged ? undefined : undefined} />
      </div>
      <Panel title={t("recon")} sub="Weight gap = | weight in minus weight out | divided by weight in. Every row is checked automatically at intake." stage="working" bodyClass="p-0 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Bin</th><th>Type</th><th>Collector</th><th className="text-right">{t("weightIn")}</th><th className="text-right">{t("weightOut")}</th><th>{t("gap")}</th><th>Status</th></tr></thead>
          <tbody>
            {s.reconciliation.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold text-forest">{r.id}</td>
                <td>{r.type}</td>
                <td>{r.collector}</td>
                <td className="text-right tabular-nums">{kg(r.inKg, 2)}</td>
                <td className="text-right tabular-nums">{kg(r.outKg, 2)}</td>
                <td><div className="flex items-center gap-2"><span className="w-12 tabular-nums">{r.gapPct}%</span><GapMeter gap={r.gapPct} tolerance={s.tolerancePct} compact /></div></td>
                <td>{r.flagged ? (r.resolved ? <Badge tone="green">Resolved with reason</Badge> : <Badge tone="ochre">Flagged</Badge>) : <Badge tone="plain">Matched</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function BaleLabel({ bale, aggName }) {
  return (
    <div className="print-area rounded-2xl border-2 border-forest p-5 flex gap-5 items-center">
      <QRCodeSVG value={`${bale.id}|${bale.seal}`} size={128} fgColor="#0F3D2E" />
      <div>
        <div className="font-display text-3xl font-bold text-forest">{bale.id}</div>
        <div className="text-lg font-semibold mt-1">Seal {bale.seal}</div>
        <div className="text-sm text-ink/70 mt-1">{bale.stream} | {kg(bale.weightKg, 2)} | {bale.binIds.length} bins</div>
        <div className="text-sm text-ink/70">{aggName}</div>
        <div className="text-[12px] text-ink/50 mt-1">{new Date(bale.createdAt).toLocaleString("en-IN")}</div>
        <div className="text-[12px] font-semibold text-clay mt-1">Branded medicine packaging. Do not open. Do not resell.</div>
      </div>
    </div>
  );
}

function BalingTab({ s, aggId, t }) {
  const toast = useToast();
  const [picked, setPicked] = useState([]);
  const [stream, setStream] = useState("Mixed blister and strip");
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(null);
  const [disp, setDisp] = useState(null);
  const [vehicle, setVehicle] = useState("GJ-27-TA-4412");
  const [driver, setDriver] = useState("Ramesh Bhai");
  const total = s.readyToBale.filter((b) => picked.includes(b.id)).reduce((x, b) => x + (b.weights.aggIntake || 0), 0);

  async function make() {
    setBusy(true);
    try {
      const bale = await api.post("/bales", { aggId, binIds: picked, stream });
      setPicked([]);
      setLabel(bale);
      toast({ title: `${bale.id} sealed`, body: `Seal ${bale.seal}, ${kg(bale.weightKg, 2)}.` });
    } catch (e) { toast({ tone: "block", title: "Bale not made", body: e.message }); } finally { setBusy(false); }
  }
  async function dispatch() {
    setBusy(true);
    try {
      const b = await api.post(`/bales/${disp.id}/dispatch`, { vehicle, driver });
      toast({ title: `${b.id} dispatched`, body: `Dispatch note ${b.dispatch.noteNo}. The hub sees it in receiving now.` });
      setDisp(null);
    } catch (e) { toast({ tone: "block", title: "Not dispatched", body: e.message }); } finally { setBusy(false); }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Panel title={t("readyToBale")} sub="Pick bins of the same stream and seal them into one bale." stage="working">
        {s.readyToBale.length === 0 ? <Empty icon={Package} title="No bins ready">Bins appear here after intake.</Empty> : (
          <>
            <ul className="space-y-2">
              {s.readyToBale.map((b) => (
                <li key={b.id}>
                  <label className={cx("flex items-center gap-3 rounded-xl border-2 p-3 cursor-pointer", picked.includes(b.id) ? "border-moss bg-sage-100" : "border-sage-200")}>
                    <input type="checkbox" className="h-5 w-5 accent-moss" checked={picked.includes(b.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, b.id] : p.filter((x) => x !== b.id)))} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-forest">{b.id} {b.branded && <Badge tone="plain" className="ml-1">Branded</Badge>}</div>
                      <div className="text-[13px] text-ink/60 truncate">{b.typeLabel} | {b.pointName}</div>
                    </div>
                    <div className="font-semibold tabular-nums">{kg(b.weights.aggIntake, 2)}</div>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="label">Material stream</label>
                <Select value={stream} onChange={setStream} options={["PVC-alu blister", "Alu-alu strip", "Mixed blister and strip", "Cartons and leaflets"].map((v) => ({ value: v, label: v }))} />
              </div>
              <Button size="lg" icon={Package} disabled={!picked.length} loading={busy} onClick={make}>{t("makeBale")} ({kg(total, 2)})</Button>
            </div>
          </>
        )}
      </Panel>
      <Panel title={t("bales")} sub="Sealed bales and their trip to the hub.">
        <ul className="space-y-2.5">
          {s.bales.map((b) => (
            <li key={b.id} className="rounded-xl border border-sage-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-forest">{b.id} <span className="text-ink/50 font-normal text-sm">seal {b.seal}</span></div>
                  <div className="text-[13px] text-ink/60">{b.stream} | {kg(b.weightKg, 2)} | {b.binIds.length} bins | {when(b.createdAt)}</div>
                  {b.dispatch && <div className="text-[12.5px] text-ink/55 mt-0.5">Note {b.dispatch.noteNo} | {b.dispatch.vehicle} | {b.dispatch.driver}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={b.status} />
                  <Button size="sm" variant="secondary" icon={Printer} onClick={() => setLabel(b)}>Label</Button>
                  {b.status === "Sealed" && <Button size="sm" icon={Truck} onClick={() => setDisp(b)}>{t("dispatch")}</Button>}
                </div>
              </div>
            </li>
          ))}
          {s.bales.length === 0 && <Empty icon={Package} title="No bales yet" />}
        </ul>
      </Panel>
      <Modal open={!!label} onClose={() => setLabel(null)} title="Bale label" wide footer={<><Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print label</Button><Button onClick={() => setLabel(null)}>Done</Button></>}>
        {label && <BaleLabel bale={label} aggName={s.point.name} />}
      </Modal>
      <Modal open={!!disp} onClose={() => setDisp(null)} title={`Dispatch ${disp?.id || ""} to Hub 1`} footer={<><Button variant="secondary" onClick={() => setDisp(null)}>Cancel</Button><Button icon={Truck} loading={busy} onClick={dispatch}>{t("dispatch")}</Button></>}>
        <div className="space-y-3">
          <div><label className="label">Vehicle number</label><input className="field" value={vehicle} onChange={(e) => setVehicle(e.target.value.toUpperCase())} /></div>
          <div><label className="label">Driver</label><input className="field" value={driver} onChange={(e) => setDriver(e.target.value)} /></div>
          <p className="text-[13px] text-ink/60">A dispatch note number is created and the seal {disp?.seal} must match when the hub scans it.</p>
        </div>
      </Modal>
    </div>
  );
}

export default function Aggregation() {
  const { lang, setLang, t } = useLang();
  const [aggId, setAggId] = useState("AGG-01");
  const [tab, setTab] = useState("intake");
  const boot = useApi("/bootstrap");
  const { data: s, error, loading, reload } = useApi(`/aggregation/${aggId}/summary`);
  const opts = (boot.data?.aggPoints || []).map((a) => ({ value: a.id, label: a.name }));

  return (
    <div>
      <PageHead title="Aggregation point" stage="working" sub="Local MSMEs, many run by women, receive bins from collectors, check every weight, and seal bales for the hub. Each point is financed by a Satin Finserv MSME loan of about Rs 3 lakh.">
        <LangToggle lang={lang} setLang={setLang} />
      </PageHead>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <Tabs size="lg" value={tab} onChange={setTab} tabs={[
          { value: "intake", label: t("intake"), icon: Scale, count: s?.pendingIntake.length },
          { value: "recon", label: t("recon"), icon: ClipboardCheck, count: s?.totals.flagged },
          { value: "baling", label: t("baling"), icon: Package, count: s?.readyToBale.length },
        ]} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink/60">Point</span>
          <Select value={aggId} onChange={setAggId} options={opts.length ? opts : [{ value: "AGG-01", label: "Ambika Dry Waste Point, Naroda" }]} className="w-auto min-w-[260px]" />
        </div>
      </div>
      {s && (
        <div className="mb-5 flex flex-wrap gap-2 text-[13px]">
          <Badge tone="plain">Owner: {s.point.owner}</Badge>
          {s.point.womenLed && <Badge tone="green">Women-led MSME</Badge>}
          <Badge tone="plain">{s.point.udyam}</Badge>
          <Badge tone="plain">Collectors: {s.collectors.map((c) => c.name.split(" ")[0]).join(", ")}</Badge>
        </div>
      )}
      {loading && !s ? <Loading /> : error ? <ErrorNote error={error} onRetry={reload} /> : s && (
        tab === "intake" ? <IntakeTab s={s} aggId={aggId} t={t} /> : tab === "recon" ? <ReconTab s={s} t={t} /> : <BalingTab s={s} aggId={aggId} t={t} />
      )}
    </div>
  );
}
