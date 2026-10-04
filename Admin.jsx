import React, { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, FlaskConical, Save, Lock, Printer, MapPin } from "lucide-react";
import { api } from "../lib/api.js";
import { useApi } from "../lib/live.jsx";
import { navigate } from "../lib/router.jsx";
import { PageHead, Panel, Button, Badge, Stat, Loading, ErrorNote, StatusPill, Stage, GapMeter, useToast, cx, Tabs } from "../components/ui.jsx";
import { Timeline } from "../components/custody.jsx";
import { kg, inr, num, when, shortHash } from "../lib/format.js";
import { ExceptionsQueue } from "./Hub.jsx";

function NetworkMap({ points, aggPoints, hubs }) {
  const all = [...points.filter((p) => p.lat), ...aggPoints, hubs[0]];
  const lats = all.map((p) => p.lat), lngs = all.map((p) => p.lng);
  const [minLa, maxLa, minLn, maxLn] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const W = 560, H = 330, pad = 30;
  const x = (lng) => pad + ((lng - minLn) / (maxLn - minLn || 1)) * (W - pad * 2);
  const y = (lat) => H - pad - ((lat - minLa) / (maxLa - minLa || 1)) * (H - pad * 2);
  const hub = hubs[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl bg-sage-100" role="img" aria-label="Schematic map of the Ahmedabad pilot network">
      <path d={`M${x(72.55)} ${pad} C ${x(72.57)} ${H * 0.4}, ${x(72.56)} ${H * 0.6}, ${x(72.575)} ${H - pad}`} stroke="#B9DCC5" strokeWidth="10" fill="none" strokeLinecap="round" />
      <text x={x(72.552) + 8} y={pad + 14} fontSize="10" fill="#1F6B47">Sabarmati</text>
      {points.filter((p) => p.aggId).map((p) => {
        const a = aggPoints.find((g) => g.id === p.aggId);
        return a ? <line key={p.id} x1={x(p.lng)} y1={y(p.lat)} x2={x(a.lng)} y2={y(a.lat)} stroke="#8CCB9E" strokeWidth="1.2" strokeDasharray="3 3" /> : null;
      })}
      {aggPoints.map((a) => <line key={a.id} x1={x(a.lng)} y1={y(a.lat)} x2={x(hub.lng)} y2={y(hub.lat)} stroke="#1F6B47" strokeWidth="2" />)}
      {points.filter((p) => p.kind === "FACTORY").map((p) => <line key={p.id} x1={x(p.lng)} y1={y(p.lat)} x2={x(hub.lng)} y2={y(hub.lat)} stroke="#0F3D2E" strokeWidth="2.5" strokeDasharray="7 4" />)}
      {points.map((p) => (
        <g key={p.id}>
          {p.kind === "FACTORY" ? <rect x={x(p.lng) - 7} y={y(p.lat) - 7} width="14" height="14" rx="3" fill="#0F3D2E" /> :
            <circle cx={x(p.lng)} cy={y(p.lat)} r={p.kind === "HOSPITAL" ? 6 : 4.5} fill={p.registered ? (p.kind === "HOSPITAL" ? "#3A9D63" : "#57B47D") : "#A63D2A"} stroke="white" strokeWidth="1.5" />}
          <title>{p.name}</title>
        </g>
      ))}
      {aggPoints.map((a) => (
        <g key={a.id}><rect x={x(a.lng) - 8} y={y(a.lat) - 8} width="16" height="16" rx="4" fill="#1F6B47" stroke="white" strokeWidth="2" /><title>{a.name}</title></g>
      ))}
      <g><circle cx={x(hub.lng)} cy={y(hub.lat)} r="13" fill="#0F3D2E" stroke="#8CCB9E" strokeWidth="3" /><text x={x(hub.lng)} y={y(hub.lat) + 4} fontSize="10" fontWeight="700" textAnchor="middle" fill="#E9F4EC">H1</text><title>{hub.name}</title></g>
    </svg>
  );
}

function Settings({ s }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(JSON.parse(JSON.stringify(s.settings))); }, [s.settings]);
  if (!form) return null;
  const setRate = (k, v) => setForm((f) => ({ ...f, rates: { ...f.rates, [k]: v } }));
  const setCol = (k, v) => setForm((f) => ({ ...f, rates: { ...f.rates, collectorPerKg: { ...f.rates.collectorPerKg, [k]: v } } }));
  async function save() {
    setBusy(true);
    try {
      await api.put("/settings", { tolerancePct: form.tolerancePct, massBalancePct: form.massBalancePct, rates: form.rates });
      toast({ title: "Rate card and limits saved", body: "Logged in the ledger. New pickups and checks use them now." });
    } catch (e) { toast({ tone: "block", title: "Not saved", body: e.message }); } finally { setBusy(false); }
  }
  const rateFields = [["destructionFeePerKg", "Destruction fee, per kg"], ["oncologyMonthlyFee", "Oncology custody, per month"], ["salePricePerKg", "Blended material sale, per kg"], ["buyPricePerKg", "Factory reject purchase, per kg"], ["stopIncentive", "Collector incentive, per stop"], ["hubOpexMonthly", "Hub running cost, per month"]];
  return (
    <Panel title="Rate card and limits" sub="Changes apply across the network at once and are written to the ledger." stage="working" actions={<Button size="sm" icon={Save} loading={busy} onClick={save}>Save</Button>}>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label className="label">Weight gap tolerance: {form.tolerancePct}%</label>
          <input type="range" min="0.5" max="10" step="0.5" value={form.tolerancePct} onChange={(e) => setForm({ ...form, tolerancePct: +e.target.value })} className="w-full accent-moss" />
        </div>
        <div>
          <label className="label">Hub mass balance limit: {form.massBalancePct}%</label>
          <input type="range" min="0.5" max="10" step="0.5" value={form.massBalancePct} onChange={(e) => setForm({ ...form, massBalancePct: +e.target.value })} className="w-full accent-moss" />
        </div>
      </div>
      <div className="mt-5 grid sm:grid-cols-3 gap-3">
        {[["PVC_ALU", "Collector rate, PVC-alu (Rs/kg)"], ["ALU_ALU", "Collector rate, alu-alu (Rs/kg)"], ["CARTON", "Collector rate, cartons (Rs/kg)"]].map(([k, l]) => (
          <div key={k}><label className="label">{l}</label><input className="field" inputMode="decimal" value={form.rates.collectorPerKg[k]} onChange={(e) => setCol(k, e.target.value)} /></div>
        ))}
        {rateFields.map(([k, l]) => (
          <div key={k}><label className="label">{l} (Rs)</label><input className="field" inputMode="decimal" value={form.rates[k]} onChange={(e) => setRate(k, e.target.value)} /></div>
        ))}
      </div>
    </Panel>
  );
}

function Rules({ s }) {
  const toast = useToast();
  async function toggle(r) {
    try { await api.put(`/rules/${r.id}`, { enabled: !r.enabled }); toast({ title: `${r.name}`, body: r.enabled ? "Switched off" : "Switched on" }); }
    catch (e) { toast({ tone: "block", title: "Rule not changed", body: e.message }); }
  }
  return (
    <Panel title="Exception rules" sub="Rules run on the server at every handover. Locked rules protect patients and brands and cannot be switched off." stage="working">
      <ul className="divide-y divide-sage-200">
        {s.rules.map((r) => (
          <li key={r.id} className="py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-forest text-[14.5px] flex items-center gap-2">{r.locked && <Lock size={14} className="text-moss" />}{r.name}{r.param != null && <Badge tone="plain">{r.param}{r.unit}</Badge>}</div>
              <div className="text-[12.5px] text-ink/55">{r.action}</div>
            </div>
            <button onClick={() => toggle(r)} disabled={r.locked} aria-pressed={r.enabled} aria-label={`${r.enabled ? "Switch off" : "Switch on"} ${r.name}`}
              className={cx("relative h-7 w-12 rounded-full transition-colors shrink-0", r.enabled ? "bg-moss" : "bg-sage", r.locked && "opacity-70 cursor-not-allowed")}>
              <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white transition-all", r.enabled ? "left-6" : "left-1")} />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Ledger({ total }) {
  const toast = useToast();
  const { data } = useApi("/events?limit=40");
  const [verify, setVerify] = useState(null);
  const [tamper, setTamper] = useState(null);
  const [busy, setBusy] = useState(null);
  async function run(kind) {
    setBusy(kind);
    try {
      if (kind === "verify") setVerify(await api.get("/audit/verify"));
      else setTamper(await api.post("/audit/tamper-test"));
    } catch (e) { toast({ tone: "block", title: "Check failed to run", body: e.message }); } finally { setBusy(null); }
  }
  return (
    <Panel title="Ledger integrity" sub={`${num(total)} entries. Each entry stores the hash of the one before it, so changing any past entry breaks every link after it.`} stage="working"
      actions={<><Button size="sm" icon={ShieldCheck} loading={busy === "verify"} onClick={() => run("verify")}>Verify whole ledger</Button><Button size="sm" variant="secondary" icon={FlaskConical} loading={busy === "tamper"} onClick={() => run("tamper")}>Run tamper test</Button></>}>
      {verify && (
        <div className={cx("mb-4 rounded-xl p-3 text-sm flex gap-3", verify.ok ? "bg-sage-100" : "bg-clay-soft")}>
          {verify.ok ? <ShieldCheck className="text-moss" /> : <ShieldAlert className="text-clay" />}
          <div>{verify.ok ? <><b className="text-forest">All {num(verify.checked)} entries verified.</b> Current head {shortHash(verify.head)}.</> : <><b>Broken at entry {verify.brokenAt}.</b> {verify.reason}</>}</div>
        </div>
      )}
      {tamper && (
        <div className="mb-4 rounded-xl p-3 text-sm bg-ochre-soft">
          <b className="text-forest">Tamper test on a copy of the ledger:</b> entry #{tamper.edited.seq} ({tamper.edited.entityId}) weight changed from {tamper.edited.from} kg to {tamper.edited.to} kg.{" "}
          {tamper.detected ? <>Detected at entry #{tamper.brokenAt}. </> : "Not detected. "}
          The real ledger is {tamper.realLogUntouched ? "untouched and still verifies" : "not verifying"}.
        </div>
      )}
      <div className="max-h-[440px] overflow-y-auto scrollbar-thin pr-1">{data ? <Timeline events={data.events} /> : <Loading />}</div>
    </Panel>
  );
}

function CertControls({ s }) {
  const toast = useToast();
  async function setAuto(v) {
    try { await api.put("/settings", { autoIssueCertificates: v }); toast({ title: v ? "Certificates issue automatically" : "Certificates now need approval" }); }
    catch (e) { toast({ tone: "block", title: "Not changed", body: e.message }); }
  }
  async function approve(id) {
    try { await api.post(`/certificates/${id}/approve`); toast({ title: `${id} approved` }); } catch (e) { toast({ tone: "block", title: "Not approved", body: e.message }); }
  }
  const pending = s.certificates.filter((c) => c.status === "Pending approval");
  return (
    <Panel title="Certificate issuing" stage="working" sub="Choose whether certificates go out the moment a batch is shredded, or wait for a desk check.">
      <label className="flex items-center justify-between gap-3 rounded-xl bg-sage-100 px-3 py-3 cursor-pointer">
        <span className="text-sm font-semibold text-forest">Issue automatically after shredding</span>
        <input type="checkbox" className="h-5 w-5 accent-moss" checked={!!s.settings.autoIssueCertificates} onChange={(e) => setAuto(e.target.checked)} />
      </label>
      {pending.length > 0 && (
        <ul className="mt-3 space-y-2">
          {pending.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-ochre/30 bg-ochre-soft/50 px-3 py-2 text-sm">
              <span><b>{c.id}</b> | {c.clientName} | {kg(c.destroyedKg)}</span>
              <Button size="sm" onClick={() => approve(c.id)}>Approve</Button>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-3 divide-y divide-sage-200 text-sm">
        {s.certificates.slice(0, 8).map((c) => (
          <li key={c.id} className="py-2 flex items-center justify-between gap-2">
            <button className="text-left" onClick={() => navigate(`/verify/${c.id}`)}><b className="text-moss underline">{c.id}</b> <span className="text-ink/60">{c.clientName}</span></button>
            <span className="flex items-center gap-2"><span className="tabular-nums text-ink/70">{kg(c.destroyedKg)}</span><StatusPill status={c.status} /></span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function Admin() {
  const { data: s, error, loading, reload } = useApi("/admin/overview");
  const [tab, setTab] = useState("network");
  return (
    <div>
      <PageHead title="StripLoop admin" stage="working" sub="The control room for the whole network: rates, limits, rules, reconciliation, certificates and the ledger.">
        <Button variant="secondary" icon={Printer} onClick={() => navigate("/labels")}>Print bin labels</Button>
      </PageHead>
      {loading && !s ? <Loading /> : error ? <ErrorNote error={error} onRetry={reload} /> : s && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <Stat label="Sealed bins" value={num(s.totals.bins)} />
            <Stat label="Shredded" value={kg(s.totals.destroyedKg, 0)} />
            <Stat label="Recovered" value={kg(s.totals.recoveredKg, 0)} sub="Aluminium, plastic, paper" />
            <Stat label="Open exceptions" value={s.totals.openExceptions} />
            <Stat label="Certificates" value={s.totals.certificates} sub={s.totals.pendingCertificates ? `${s.totals.pendingCertificates} waiting approval` : "All issued"} />
            <Stat label="Ledger entries" value={num(s.totals.events)} tone="dark" />
          </div>
          <Tabs size="lg" value={tab} onChange={setTab} tabs={[{ value: "network", label: "Network" }, { value: "recon", label: "Reconciliation engine" }, { value: "controls", label: "Rates, rules, certificates" }, { value: "ledger", label: "Ledger" }]} />
          {tab === "network" && (
            <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5">
              <Panel title="Ahmedabad pilot network" sub="Collection points feed aggregation MSMEs; factories send trucks straight to Hub 1." stage="mockup">
                <NetworkMap points={s.points} aggPoints={s.aggPoints} hubs={s.hubs} />
                <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-ink/65">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-leaf-400" />Chemist or clinic</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-leaf" />Hospital</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-forest" />Factory</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-moss" />Aggregation MSME</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-clay" />Not in registry</span>
                </div>
              </Panel>
              <div className="space-y-5">
                <Panel title="Hubs" bodyClass="p-0">
                  <ul className="divide-y divide-sage-200">
                    {s.hubs.map((h) => (
                      <li key={h.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div><div className="font-semibold text-forest">{h.name}</div><div className="text-[12.5px] text-ink/60">{h.owner} | {h.capacityKgHr} kg/hr</div></div>
                        <Badge tone={h.status === "Live" ? "solid" : "plain"}>{h.status}</Badge>
                      </li>
                    ))}
                  </ul>
                </Panel>
                <Panel title="Aggregation MSMEs" bodyClass="p-0 overflow-x-auto">
                  <table className="tbl">
                    <thead><tr><th>Point</th><th>Owner</th><th className="text-right">Bins</th><th className="text-right">Flags</th></tr></thead>
                    <tbody>
                      {s.aggPoints.map((a) => (
                        <tr key={a.id}><td className="font-semibold text-forest">{a.name}</td><td>{a.owner} {a.womenLed && <Badge tone="green" className="ml-1">Women-led</Badge>}</td><td className="text-right">{a.bins}</td><td className="text-right">{a.exceptions}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              </div>
            </div>
          )}
          {tab === "recon" && (
            <div className="space-y-5">
              <Panel title="Reconciliation engine" sub={`Weight Gap = |Weight In minus Weight Out| / Weight In, checked on every leg. Limit now ${s.settings.tolerancePct}%. Worst gaps first.`} stage="working" bodyClass="p-0 overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Bin</th><th>Type</th><th>Status</th><th>Legs checked</th><th>Worst gap</th><th /></tr></thead>
                  <tbody>
                    {s.reconciliation.slice(0, 18).map((r) => (
                      <tr key={r.id}>
                        <td className="font-semibold text-forest">{r.id}</td>
                        <td>{r.type}</td>
                        <td><StatusPill status={r.status} /></td>
                        <td className="text-[12.5px]">{r.steps.map((st) => <div key={st.leg}>{st.leg}: {kg(st.inKg, 2)} to {kg(st.outKg, 2)} ({st.gapPct}%)</div>)}{r.steps.length === 0 && <span className="text-ink/50">Awaiting next weigh-in</span>}</td>
                        <td><div className="flex items-center gap-2"><span className="w-12 tabular-nums">{r.worstGapPct}%</span><GapMeter gap={r.worstGapPct} tolerance={s.settings.tolerancePct} compact /></div></td>
                        <td>{r.overTolerance ? <Badge tone="ochre">Over limit</Badge> : <Badge tone="plain">OK</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
              <ExceptionsQueue />
            </div>
          )}
          {tab === "controls" && (
            <div className="grid lg:grid-cols-2 gap-5 items-start">
              <Settings s={s} />
              <div className="space-y-5"><Rules s={s} /><CertControls s={s} /></div>
            </div>
          )}
          {tab === "ledger" && <Ledger total={s.totals.events} />}
          <Panel title="Planned for the full product" stage="roadmap">
            <ul className="grid sm:grid-cols-3 gap-3 text-sm text-ink/75">
              <li>Role-based logins and permissions (granular access for each user type)</li>
              <li>Automated weekly UPI payouts to collectors</li>
              <li>Weighbridge and CCTV integration at the hub</li>
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}
