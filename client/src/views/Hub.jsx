import React, { useEffect, useMemo, useState } from "react";
import { Truck, ScanLine, Flame, AlertTriangle, Syringe, Ban, ShieldCheck, Video, Check, PackageCheck, Factory as FactoryIcon, FileCheck2 } from "lucide-react";
import { api } from "../lib/api.js";
import { useApi } from "../lib/live.jsx";
import { navigate } from "../lib/router.jsx";
import { PageHead, Panel, Button, Badge, Tabs, Stat, Modal, Stage, Loading, ErrorNote, Empty, Select, StatusPill, GapMeter, useToast, cx } from "../components/ui.jsx";
import { kg, when, num } from "../lib/format.js";

const SHARES = { PVC_ALU: [0.15, 0.85, 0], ALU_ALU: [0.65, 0.35, 0], CARTON: [0, 0, 1] };

// ---------- receiving ----------

function ReceiveModal({ item, onClose }) {
  const toast = useToast();
  const [seal, setSeal] = useState("");
  const [w, setW] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!item) return;
    setSeal("");
    const expected = item.kind === "bale" ? item.weightKg : item.weights.pickup;
    setW(String(Math.round(expected * 0.996 * 100) / 100));
  }, [item]);
  if (!item) return null;
  const expectedSeal = item.seal;
  const expectedKg = item.kind === "bale" ? item.weightKg : item.weights.pickup;

  async function submit() {
    setBusy(true);
    try {
      if (item.kind === "bale") {
        const path = item.status === "Held" ? `/bales/${item.id}/release` : `/bales/${item.id}/receive`;
        const r = await api.post(path, { sealScanned: seal, weightKg: parseFloat(w) });
        if (!r.sealOk) toast({ tone: "block", title: `${item.id} held at receiving`, body: "Seal does not match the dispatch note. Flagged as high severity." });
        else if (r.exception) toast({ tone: "warn", title: `${item.id} received with a weight gap`, body: `${r.gapPct}% above tolerance. Added to the exceptions queue.` });
        else toast({ title: `${item.id} received`, body: `Seal matches. Gap ${r.gapPct}%. Bins are ready to shred.` });
      } else {
        const r = await api.post(`/bins/${item.id}/hub-receive`, { sealScanned: seal, weightKg: parseFloat(w) });
        toast({ tone: r.exception ? "warn" : "ok", title: `${item.id} received`, body: `Gap ${r.gapPct}%.${r.exception ? " Flagged for review." : ""}` });
      }
      onClose();
    } catch (e) {
      toast({ tone: e.body?.flagged ? "block" : "warn", title: "Not received", body: e.message });
      if (e.body?.flagged) onClose();
    } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Receive ${item.id}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={PackageCheck} loading={busy} disabled={!seal || !w} onClick={submit}>{item.status === "Held" ? "Check seal and release" : "Check seal and receive"}</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-sage-100 p-3 text-sm">
          {item.kind === "bale" ? <>From <b>{item.aggName}</b> | {item.binIds.length} bins | dispatch note {item.dispatch?.noteNo} | {item.dispatch?.vehicle}</> : <>Direct from <b>{item.pointName}</b> | {item.typeLabel} | factory truck</>}
        </div>
        <div>
          <label className="label">Scan or type the seal number</label>
          <input className="field h-14 text-2xl font-display uppercase tracking-wide" placeholder={item.kind === "bale" ? "B-000000" : "S-000000"} value={seal} onChange={(e) => setSeal(e.target.value.toUpperCase())} autoFocus />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={ScanLine} onClick={() => setSeal(expectedSeal)}>Demo: scan correct seal</Button>
            <Button size="sm" variant="ghost" onClick={() => setSeal(expectedSeal.slice(0, 2) + "999999")}>Demo: broken seal</Button>
          </div>
        </div>
        <div>
          <label className="label">Weighbridge reading (kg)</label>
          <input className="field text-lg" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value.replace(/[^0-9.]/g, ""))} />
          <div className="text-[12.5px] text-ink/55 mt-1">Dispatched at {kg(expectedKg, 2)}</div>
        </div>
      </div>
    </Modal>
  );
}

function Receiving({ s }) {
  const [item, setItem] = useState(null);
  const rows = [
    ...s.heldBales.map((b) => ({ ...b, kind: "bale" })),
    ...s.incomingBales.map((b) => ({ ...b, kind: "bale" })),
    ...s.directInbound.map((b) => ({ ...b, kind: "bin" })),
  ];
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
      <Panel title="Arriving at the hub" sub="Every bale and factory bin is held until its seal number matches the dispatch record." stage="working" bodyClass="p-3">
        {rows.length === 0 ? <Empty icon={Truck} title="Nothing in transit">Dispatched bales from aggregation points and factory trucks show up here.</Empty> : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className={cx("rounded-xl border-2 p-3 flex flex-wrap items-center gap-3", r.status === "Held" ? "border-clay/40 bg-clay-soft/50" : "border-sage-200 bg-white")}>
                <div className={cx("h-10 w-10 rounded-lg grid place-items-center", r.kind === "bale" ? "bg-sage-100 text-moss" : "bg-forest text-sprout")}>{r.kind === "bale" ? <Truck size={19} /> : <FactoryIcon size={19} />}</div>
                <div className="flex-1 min-w-[180px]">
                  <div className="font-semibold text-forest">{r.id} <span className="text-sm font-normal text-ink/55">seal {r.seal}</span></div>
                  <div className="text-[13px] text-ink/60">{r.kind === "bale" ? `${r.aggName} | ${r.binIds.length} bins` : `${r.pointName} | ${r.typeLabel}`} | {kg(r.kind === "bale" ? r.weightKg : r.weights.pickup, 1)}</div>
                </div>
                {r.status === "Held" ? <Badge tone="clay" icon={AlertTriangle}>Held: seal mismatch</Badge> : <Badge tone="green">In transit</Badge>}
                <Button size="sm" icon={ScanLine} onClick={() => setItem(r)}>{r.status === "Held" ? "Re-check" : "Receive"}</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Seal audit rules" sub="Applied by the server on every scan.">
        <ul className="space-y-3 text-sm text-ink/75">
          <li className="flex gap-2"><Check size={16} className="text-moss mt-0.5 shrink-0" />Seal number must match the label printed at pickup or baling.</li>
          <li className="flex gap-2"><Check size={16} className="text-moss mt-0.5 shrink-0" />A broken or missing seal holds the bale and raises a high-severity exception.</li>
          <li className="flex gap-2"><Check size={16} className="text-moss mt-0.5 shrink-0" />Weighbridge reading is compared with the dispatch weight using the network tolerance.</li>
          <li className="flex gap-2"><Check size={16} className="text-moss mt-0.5 shrink-0" />Held bales can only be released after a correct seal check, and the hold stays in the ledger.</li>
        </ul>
      </Panel>
      <ReceiveModal item={item} onClose={() => setItem(null)} />
    </div>
  );
}

// ---------- destruction ----------

function Cctv({ batchHint }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(i); }, []);
  return (
    <div className="relative rounded-2xl overflow-hidden bg-forest-900 aspect-video">
      <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full opacity-60" aria-hidden="true">
        <rect x="40" y="70" width="110" height="80" rx="6" fill="#15513C" />
        <rect x="58" y="40" width="74" height="34" rx="4" fill="#1F6B47" />
        <path d="M150 110h70l20 30h-90z" fill="#15513C" />
        <rect x="235" y="95" width="50" height="55" rx="5" fill="#1F6B47" />
        <circle cx="95" cy="110" r="22" fill="none" stroke="#8CCB9E" strokeWidth="3" strokeDasharray="6 5" />
        <rect x="245" y="125" width="30" height="18" rx="3" fill="#8CCB9E" opacity=".6" />
      </svg>
      <div className="absolute top-3 left-3 flex items-center gap-2 text-white text-[12px] font-semibold">
        <span className="rec h-2.5 w-2.5 rounded-full bg-clay" /> REC | CAM 2 Shredder line
      </div>
      <div className="absolute bottom-3 left-3 text-sage text-[12px] tabular-nums">{now.toLocaleString("en-IN")}</div>
      <div className="absolute bottom-3 right-3"><Stage kind="mockup" /></div>
      {batchHint && <div className="absolute top-3 right-3 text-[11px] text-sprout font-semibold">{batchHint}</div>}
    </div>
  );
}

function Destruction({ s }) {
  const toast = useToast();
  const [picked, setPicked] = useState([]);
  const [out, setOut] = useState({ alKg: "", pvcKg: "", paperKg: "", residueKg: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const sel = s.ready.filter((b) => picked.includes(b.id));
  const input = sel.reduce((x, b) => x + (b.weights.hubReceive || 0), 0);
  const expected = useMemo(() => {
    const e = { al: 0, pvc: 0, paper: 0 };
    for (const b of sel) { const sh = SHARES[b.type] || [0, 0, 0]; e.al += b.weights.hubReceive * sh[0]; e.pvc += b.weights.hubReceive * sh[1]; e.paper += b.weights.hubReceive * sh[2]; }
    return e;
  }, [sel]);
  const outSum = ["alKg", "pvcKg", "paperKg", "residueKg"].reduce((x, k) => x + (parseFloat(out[k]) || 0), 0);
  const gap = input ? Math.round((Math.abs(input - outSum) / input) * 10000) / 100 : 0;

  function useExpected() {
    const f = (n) => String(Math.round(n * 0.99 * 100) / 100);
    setOut({ alKg: f(expected.al), pvcKg: f(expected.pvc), paperKg: f(expected.paper), residueKg: String(Math.round(input * 0.008 * 100) / 100) });
  }
  async function shred() {
    setBusy(true);
    try {
      const r = await api.post("/batches", { binIds: picked, alKg: +out.alKg || 0, pvcKg: +out.pvcKg || 0, paperKg: +out.paperKg || 0, residueKg: +out.residueKg || 0, operator: "Shift A, Meena Parmar" });
      setDone(r); setPicked([]); setOut({ alKg: "", pvcKg: "", paperKg: "", residueKg: "" });
      toast({ title: `${r.batch.id} shredded`, body: `${r.certificates.length} certificate(s) issued: ${r.certificates.map((c) => c.id).join(", ")}` });
    } catch (e) { toast({ tone: "block", title: "Batch not recorded", body: e.message }); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-5">
        <Panel title="Ready to shred" sub="Received bins with matched seals." stage="working" bodyClass="p-3">
          {s.ready.length === 0 ? <Empty icon={Flame} title="Nothing waiting">Receive a bale or factory bin first.</Empty> : (
            <ul className="space-y-2">
              {s.ready.map((b) => (
                <li key={b.id}>
                  <label className={cx("flex items-center gap-3 rounded-xl border-2 p-3 cursor-pointer", picked.includes(b.id) ? "border-moss bg-sage-100" : "border-sage-200")}>
                    <input type="checkbox" className="h-5 w-5 accent-moss" checked={picked.includes(b.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, b.id] : p.filter((x) => x !== b.id)))} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-forest">{b.id} {b.branded && <Badge tone="plain" className="ml-1">Branded</Badge>}</div>
                      <div className="text-[13px] text-ink/60 truncate">{b.typeLabel} | {b.clientName}</div>
                    </div>
                    <div className="font-semibold tabular-nums">{kg(b.weights.hubReceive, 1)}</div>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {s.ready.length > 0 && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setPicked(s.ready.map((b) => b.id))}>Select all</Button>}
        </Panel>
        <div className="space-y-4">
          <Cctv batchHint={picked.length ? `${picked.length} bins on belt` : null} />
          <p className="text-[12.5px] text-ink/55">Each batch stores the camera clip reference. A live CCTV stream is <Stage kind="roadmap" className="ml-1" /></p>
        </div>
      </div>
      <Panel title="Batch output" sub="Enter what came out of the separator. The server checks the mass balance before issuing certificates." actions={<Button size="sm" variant="secondary" disabled={!picked.length} onClick={useExpected}>Fill expected yield</Button>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="rounded-xl bg-forest text-white p-3"><div className="text-[12px] text-sage">Input</div><div className="font-display text-2xl font-semibold">{kg(input, 1)}</div></div>
          {[["alKg", "Aluminium powder"], ["pvcKg", "PVC granules"], ["paperKg", "Paper pulp"], ["residueKg", "Residue and dust"]].map(([k, l]) => (
            <div key={k}><label className="label">{l} (kg)</label><input className="field" inputMode="decimal" value={out[k]} onChange={(e) => setOut((o) => ({ ...o, [k]: e.target.value.replace(/[^0-9.]/g, "") }))} /></div>
          ))}
        </div>
        <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <div className="text-sm font-semibold text-forest mb-1">Mass balance gap: {input ? `${gap}%` : "..."} {input > 0 && outSum > 0 && (gap > s.massBalancePct ? <Badge tone="ochre" className="ml-2">Will be flagged</Badge> : <Badge tone="green" className="ml-2">Within {s.massBalancePct}%</Badge>)}</div>
            <GapMeter gap={gap} tolerance={s.massBalancePct} />
          </div>
          <Button size="lg" icon={Flame} disabled={!picked.length || !outSum} loading={busy} onClick={shred}>Shred and issue certificates</Button>
        </div>
        {done && (
          <div className="mt-4 rounded-xl bg-sage-100 p-3 flex flex-wrap items-center gap-2 text-sm">
            <FileCheck2 size={18} className="text-moss" />
            <span className="font-semibold text-forest">{done.batch.id}</span> issued
            {done.certificates.map((c) => <Button key={c.id} size="sm" variant="secondary" onClick={() => navigate(`/verify/${c.id}`)}>{c.id}</Button>)}
          </div>
        )}
      </Panel>
      <Panel title="Recent batches" bodyClass="p-0 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Batch</th><th>When</th><th className="text-right">Input</th><th className="text-right">Aluminium</th><th className="text-right">Plastic</th><th>Balance</th><th>Camera</th><th>Certificates</th></tr></thead>
          <tbody>
            {s.batches.map((b) => (
              <tr key={b.id}>
                <td className="font-semibold text-forest">{b.id}</td>
                <td>{when(b.at)}</td>
                <td className="text-right tabular-nums">{kg(b.inputKg)}</td>
                <td className="text-right tabular-nums">{kg(b.output.alKg)}</td>
                <td className="text-right tabular-nums">{kg(b.output.pvcKg + b.output.paperKg)}</td>
                <td>{b.massBalanceGapPct}%</td>
                <td className="text-[12px]">{b.cctvRef}</td>
                <td>{b.certIds.map((c) => <button key={c} onClick={() => navigate(`/verify/${c}`)} className="text-moss font-semibold underline mr-2">{c}</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ---------- exceptions ----------

const EX_LABEL = { WEIGHT_GAP: "Weight gap", SEAL_MISMATCH: "Seal mismatch", UNREGISTERED_ORIGIN: "Unregistered origin", BRANDED_RESALE_ATTEMPT: "Resale attempt blocked", MASS_BALANCE: "Mass balance" };

export function ExceptionsQueue({ compact }) {
  const toast = useToast();
  const { data: list } = useApi("/exceptions");
  const boot = useApi("/bootstrap");
  const [filter, setFilter] = useState("open");
  const [ex, setEx] = useState(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = (list || []).filter((e) => filter === "all" || e.status === filter);
  const codes = boot.data?.reasonCodes || [];

  async function resolve() {
    setBusy(true);
    try {
      await api.post(`/exceptions/${ex.id}/resolve`, { reasonCode: code, note, by: "Hub supervisor, Meena Parmar" });
      toast({ title: `${ex.id} resolved`, body: "An adjustment entry with your reason was added. The original entry is unchanged." });
      setEx(null); setCode(""); setNote("");
    } catch (e) { toast({ tone: "block", title: "Not resolved", body: e.message }); } finally { setBusy(false); }
  }

  return (
    <Panel title="Exceptions queue" sub="Raised automatically by the reconciliation engine and rules. Nothing is deleted: resolving adds an adjustment with a reason code." stage="working"
      actions={<Tabs value={filter} onChange={setFilter} tabs={[{ value: "open", label: "Open", count: (list || []).filter((e) => e.status === "open").length }, { value: "resolved", label: "Resolved" }, { value: "all", label: "All" }]} />}
      bodyClass="p-0 overflow-x-auto">
      {rows.length === 0 ? <Empty icon={ShieldCheck} title="No exceptions here">Every handover matched.</Empty> : (
        <table className="tbl">
          <thead><tr><th>ID</th><th>Type</th><th>Item</th><th>What happened</th><th>Gap</th><th>Raised</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="font-semibold text-forest">{e.id}</td>
                <td><Badge tone={e.severity === "high" ? "clay" : "ochre"}>{EX_LABEL[e.type] || e.type}</Badge></td>
                <td className="whitespace-nowrap">{e.entityId}</td>
                <td className="min-w-[220px]">{e.detail}{e.resolution && <div className="text-[12px] text-moss mt-1">Resolved: {e.resolution.reasonLabel}. {e.resolution.note}</div>}</td>
                <td>{e.gapPct != null ? `${e.gapPct}%` : ""}</td>
                <td className="whitespace-nowrap text-[12.5px]">{when(e.raisedAt)}</td>
                <td><StatusPill status={e.status} /></td>
                <td>{e.status === "open" && <Button size="sm" variant="secondary" onClick={() => setEx(e)}>Resolve</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal open={!!ex} onClose={() => setEx(null)} title={`Resolve ${ex?.id || ""}`} footer={<><Button variant="secondary" onClick={() => setEx(null)}>Cancel</Button><Button loading={busy} disabled={!code || note.trim().length < 5} onClick={resolve}>Add adjustment</Button></>}>
        {ex && (
          <div className="space-y-4">
            <div className="rounded-xl bg-ochre-soft p-3 text-sm text-ink/80">{ex.detail}</div>
            <div><label className="label">Reason code</label><Select value={code} onChange={setCode} options={[{ value: "", label: "Choose a reason" }, ...codes.map((c) => ({ value: c.code, label: c.label }))]} /></div>
            <div><label className="label">What did you check?</label><textarea className="field min-h-[90px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: re-weighed on calibrated scale, photo attached in register" /></div>
            <p className="text-[12.5px] text-ink/55">The original ledger entry stays as it is. Your adjustment is added as a new linked entry with your name and time.</p>
          </div>
        )}
      </Modal>
    </Panel>
  );
}

// ---------- vials ----------

function Vials({ s }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  async function act(bin, kind) {
    setBusy(bin.id);
    try {
      if (kind === "handover") {
        await api.post(`/bins/${bin.id}/vial-handover`, { facility: "Licensed CBMWTF, Odhav" });
        toast({ title: `${bin.id} handed over`, body: "Manifest recorded. Vials stay sealed." });
      } else {
        const r = await api.post(`/bins/${bin.id}/vial-confirm`, {});
        toast({ title: "Incineration confirmed", body: `Certificate ${r.certificate.id} issued to the hospital.` });
      }
    } catch (e) { toast({ tone: "block", title: "Not recorded", body: e.message }); } finally { setBusy(null); }
  }
  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5">
      <Panel title="Hospital glass vials" sub="Vials are never opened, shredded or stored at the hub." stage="working" bodyClass="p-3">
        {s.vials.length === 0 ? <Empty icon={Syringe} title="No vials in custody" /> : (
          <ul className="space-y-2">
            {s.vials.map((b) => (
              <li key={b.id} className="rounded-xl border-2 border-sage-200 p-3 flex flex-wrap items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-forest text-sprout grid place-items-center"><Syringe size={18} /></div>
                <div className="flex-1 min-w-[180px]">
                  <div className="font-semibold text-forest">{b.id} <span className="text-sm text-ink/55 font-normal">seal {b.seal}</span></div>
                  <div className="text-[13px] text-ink/60">{b.clientName} | {kg(b.weights.pickup, 1)}{b.cbmwtf ? ` | manifest ${b.cbmwtf.manifestNo}` : ""}</div>
                </div>
                <StatusPill status={b.status} />
                {b.status === "Picked_Up" && <Button size="sm" loading={busy === b.id} onClick={() => act(b, "handover")}>Hand over to CBMWTF</Button>}
                {b.status === "Handed_To_CBMWTF" && <Button size="sm" loading={busy === b.id} onClick={() => act(b, "confirm")}>Record facility confirmation</Button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Bio-Medical Waste Rules 2016 protocol">
        <ol className="space-y-2.5 text-sm text-ink/75 list-decimal ml-4">
          <li>Oncology pharmacy places empty vials and cartons in a sealed, numbered bin.</li>
          <li>Collector picks up with seal check, weight, photo and GPS. No opening.</li>
          <li>Bin goes straight to the licensed common bio-medical waste facility (CBMWTF) with a manifest.</li>
          <li>Cytotoxic vials are incinerated there, not at StripLoop.</li>
          <li>Facility confirmation number is recorded; the hospital gets a custody and destruction certificate.</li>
        </ol>
      </Panel>
    </div>
  );
}

function ResaleRule({ s }) {
  const toast = useToast();
  const { data: bins } = useApi("/bins?status=Hub_Received,Destroyed");
  const branded = (bins || []).filter((b) => b.branded).slice(0, 12);
  const [bin, setBin] = useState("");
  useEffect(() => { if (!bin && branded[0]) setBin(branded[0].id); }, [branded, bin]);
  async function tryIt() {
    try { await api.post(`/bins/${bin}/resale-attempt`, { by: "Hub sales desk (demo)" }); }
    catch (e) { toast({ tone: "block", title: "Sale blocked by rule", body: e.message, ms: 7000 }); }
  }
  return (
    <Panel title="Rule: branded packs never go to resale" sub="Enforced on the server. Try it: the attempt is blocked, logged and flagged." stage="working">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1"><label className="label">Branded bin</label><Select value={bin} onChange={setBin} options={branded.map((b) => ({ value: b.id, label: `${b.id} | ${b.clientName}` }))} /></div>
        <Button variant="danger" icon={Ban} onClick={tryIt} disabled={!bin}>Try to sell as is</Button>
      </div>
    </Panel>
  );
}

export default function Hub() {
  const [tab, setTab] = useState("receive");
  const { data: s, error, loading, reload } = useApi("/hub/summary");
  return (
    <div>
      <PageHead title="Hub operator" stage="working" sub="StripLoop Hub 1 at Vatva GIDC, run by a women-led MSME on a Satin Finserv loan. Receive, check seals, shred on camera and issue certificates.">
        {s && <Badge tone="dark">{s.hub.machine}</Badge>}
      </PageHead>
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Stat label="Shredded in ledger" value={kg(s.totals.shreddedKg, 0)} sub={`${s.batches.length} batches`} />
          <Stat label="Aluminium recovered" value={kg(s.totals.alKg, 0)} sub="Sold to remelters" />
          <Stat label="Plastic recovered" value={kg(s.totals.pvcKg, 0)} sub="PVC granules to pipe makers" />
          <Stat label="Waiting to shred" value={kg(s.totals.readyKg, 0)} sub={`${s.ready.length} bins received`} tone="dark" />
        </div>
      )}
      <Tabs size="lg" className="mb-5" value={tab} onChange={setTab} tabs={[
        { value: "receive", label: "Receiving and seal audit", icon: Truck, count: s ? s.incomingBales.length + s.directInbound.length + s.heldBales.length : 0 },
        { value: "shred", label: "Destruction log", icon: Flame, count: s?.ready.length },
        { value: "ex", label: "Exceptions", icon: AlertTriangle, count: s?.openExceptions },
        { value: "vials", label: "Vial protocol", icon: Syringe, count: s?.vials.length },
      ]} />
      {loading && !s ? <Loading /> : error ? <ErrorNote error={error} onRetry={reload} /> : s && (
        tab === "receive" ? <Receiving s={s} /> :
        tab === "shred" ? <div className="space-y-5"><Destruction s={s} /><ResaleRule s={s} /></div> :
        tab === "ex" ? <div className="space-y-5"><ExceptionsQueue /><ResaleRule s={s} /></div> :
        <Vials s={s} />
      )}
    </div>
  );
}
