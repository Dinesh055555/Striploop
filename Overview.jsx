import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Play, Smartphone, Warehouse, Factory, Building2, SlidersHorizontal, Landmark, Leaf, ShieldCheck, ExternalLink, RotateCcw } from "lucide-react";
import { api } from "../lib/api.js";
import { useApi } from "../lib/live.jsx";
import { Link, navigate } from "../lib/router.jsx";
import { Button, Stage, Badge, cx, useToast, Tabs } from "../components/ui.jsx";
import { CustodyStrip, verifyUrl } from "../components/custody.jsx";
import { kg, tonnes, money, num, when, shortHash } from "../lib/format.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const JOURNEYS = {
  chemist: {
    label: "Chemist strip pack",
    steps: ["Sealed", "Pickup", "Intake", "Baled", "Hub check", "Shredded", "Certified"],
  },
  factory: {
    label: "Factory rejects",
    steps: ["Sealed", "Pickup", "To hub", "Hub check", "Shredded", "Certified"],
  },
};

function LiveJourney() {
  const toast = useToast();
  const [kind, setKind] = useState("chemist");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState({});
  const [log, setLog] = useState([]);
  const [cert, setCert] = useState(null);
  const labels = JOURNEYS[kind].steps;

  function mark(label, ev, sub) {
    setDone((d) => ({ ...d, [label]: { hash: ev?.hash, sub } }));
    setLog((l) => [{ label, ev, sub }, ...l]);
  }

  async function lastEvent(entityId, type) {
    const r = await api.get(`/events?entityId=${encodeURIComponent(entityId)}&type=${type}&limit=1`);
    return r.events[0];
  }

  async function run() {
    setRunning(true); setDone({}); setLog([]); setCert(null);
    try {
      if (kind === "chemist") {
        const bin = await api.post("/bins", { pointId: "P-01", type: "ALU_ALU", assignedTo: "COL-01" });
        mark("Sealed", await lastEvent(bin.id, "BIN_ASSIGNED"), bin.id); await wait(650);
        await api.post(`/bins/${bin.id}/pickup`, { by: "COL-01", seal: bin.seal, weightKg: 6.4, geo: { lat: 23.0026, lng: 72.6011, accuracy: 15 } });
        mark("Pickup", await lastEvent(bin.id, "PICKUP"), "6.4 kg, GPS"); await wait(650);
        const r = await api.post(`/bins/${bin.id}/intake`, { aggId: "AGG-01", weightKg: 6.38 });
        mark("Intake", await lastEvent(bin.id, "AGG_INTAKE"), `Gap ${r.gapPct}%`); await wait(650);
        const bale = await api.post("/bales", { aggId: "AGG-01", binIds: [bin.id], stream: "Alu-alu strip" });
        await api.post(`/bales/${bale.id}/dispatch`, { vehicle: "GJ-27-TA-4412", driver: "Ramesh Bhai" });
        mark("Baled", await lastEvent(bale.id, "DISPATCH"), bale.id); await wait(650);
        await api.post(`/bales/${bale.id}/receive`, { sealScanned: bale.seal, weightKg: 6.36 });
        mark("Hub check", await lastEvent(bale.id, "HUB_RECEIVE"), "Seal ok"); await wait(650);
        const out = await api.post("/batches", { binIds: [bin.id], alKg: 4.08, pvcKg: 2.2, residueKg: 0.05, operator: "Live demo" });
        mark("Shredded", await lastEvent(out.batch.id, "DESTROYED"), out.batch.id); await wait(650);
        const c = out.certificates[0];
        mark("Certified", (await api.get(`/certificates/${c.id}`)).events.find((e) => e.type === "CERT_ISSUED"), c.id);
        setCert(c);
      } else {
        const bin = await api.post("/bins", { pointId: "P-12", type: "PVC_ALU", assignedTo: "HUB-TRUCK" });
        mark("Sealed", await lastEvent(bin.id, "BIN_ASSIGNED"), bin.id); await wait(650);
        await api.post(`/bins/${bin.id}/pickup`, { by: "HUB-TRUCK", seal: bin.seal, weightKg: 318 });
        mark("Pickup", await lastEvent(bin.id, "PICKUP"), "318 kg"); await wait(650);
        mark("To hub", await lastEvent(bin.id, "PICKUP"), "Factory truck"); await wait(650);
        await api.post(`/bins/${bin.id}/hub-receive`, { sealScanned: bin.seal, weightKg: 316.8 });
        mark("Hub check", await lastEvent(bin.id, "HUB_RECEIVE"), "Seal ok"); await wait(650);
        const out = await api.post("/batches", { binIds: [bin.id], alKg: 46.9, pvcKg: 266.1, residueKg: 2.5, operator: "Live demo" });
        mark("Shredded", await lastEvent(out.batch.id, "DESTROYED"), out.batch.id); await wait(650);
        const c = out.certificates[0];
        mark("Certified", (await api.get(`/certificates/${c.id}`)).events.find((e) => e.type === "CERT_ISSUED"), c.id);
        setCert(c);
      }
    } catch (e) {
      toast({ tone: "block", title: "The run stopped", body: e.message });
    } finally {
      setRunning(false);
    }
  }

  const steps = labels.map((l, i) => ({
    label: l,
    done: !!done[l],
    hash: done[l]?.hash,
    sub: done[l]?.sub,
    active: running && !done[l] && (i === 0 || !!done[labels[i - 1]]),
  }));

  return (
    <div className="rounded-3xl bg-forest text-white p-5 sm:p-7 shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-white text-xl font-semibold">Run one bin through the chain</h2>
          <Stage kind="working" />
        </div>
        <div className="inline-flex rounded-xl bg-white/10 p-1">
          {Object.entries(JOURNEYS).map(([k, j]) => (
            <button key={k} disabled={running} onClick={() => { setKind(k); setDone({}); setLog([]); setCert(null); }} className={cx("px-3 py-1.5 rounded-lg text-[13px] font-semibold", kind === k ? "bg-sprout text-forest" : "text-sage")}>{j.label}</button>
          ))}
        </div>
      </div>
      <p className="text-sage mt-2 text-[14.5px] max-w-2xl">
        Each step below calls the real backend: the seal is checked, weights are reconciled, and every handover is written to a hash-linked ledger before the certificate is issued.
      </p>
      <div className="mt-5">
        <CustodyStrip steps={steps} dark />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="light" size="lg" icon={running ? undefined : log.length ? RotateCcw : Play} loading={running} onClick={run}>
          {running ? "Running" : log.length ? "Run again" : "Start the run"}
        </Button>
        {cert && <Button variant="secondary" size="lg" icon={ExternalLink} onClick={() => navigate(`/verify/${cert.id}`)}>Open certificate {cert.id}</Button>}
      </div>
      {(log.length > 0 || cert) && (
        <div className="mt-5 grid md:grid-cols-[1fr_auto] gap-5 items-start">
          <ol className="text-[13px] space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin pr-2">
            {log.map((l, i) => (
              <li key={i} className="lockin flex flex-wrap gap-x-3 text-sage">
                <span className="font-semibold text-white w-28">{l.label}</span>
                <span>{l.sub}</span>
                {l.ev && <span className="tabular-nums text-sprout">#{l.ev.seq} {shortHash(l.ev.hash)}</span>}
              </li>
            ))}
          </ol>
          {cert && (
            <div className="lockin bg-white rounded-2xl p-3 text-forest flex items-center gap-3">
              <QRCodeSVG value={verifyUrl(cert.id)} size={92} fgColor="#0F3D2E" />
              <div className="text-sm">
                <div className="font-semibold">{cert.id}</div>
                <div className="text-ink/60">{kg(cert.destroyedKg)} destroyed</div>
                <div className="text-ink/60">{kg(cert.recovered.alKg)} aluminium</div>
                <div className="text-ink/60">{kg(cert.co2Kg, 0)} CO2e avoided</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ROLE_CARDS = [
  { path: "/collector", icon: Smartphone, title: "Collector", who: "Women collectors on fixed routes", does: "Scan sealed bins, check the seal, weigh, photo and GPS. See earnings, UPI payouts and Satin loan. English, Hindi, Gujarati.", stage: "working" },
  { path: "/aggregation", icon: Warehouse, title: "Aggregation point", who: "Local MSME sorting points", does: "Weigh in bins, automatic weight check against the collector, make sealed bales with QR labels, dispatch to the hub.", stage: "working" },
  { path: "/hub", icon: Factory, title: "Hub operator", who: "Women-led recovery hub", does: "Seal audit at receiving, shredding batches on camera, mass balance, exceptions queue, vial protocol.", stage: "working" },
  { path: "/client", icon: Building2, title: "Client portal", who: "Factory QA and hospital pharmacy", does: "Request pickups, follow each bin live, download certificates with QR and audit packs for GMP and BRSR.", stage: "working" },
  { path: "/admin", icon: SlidersHorizontal, title: "StripLoop admin", who: "Network control room", does: "Rate cards, tolerance, rules, reconciliation across the network, certificate controls, ledger check.", stage: "working" },
  { path: "/satin", icon: Landmark, title: "Satin credit officer", who: "Green lending desk", does: "Loan book across hub, MSMEs and women collectors, repayment cover, covenants, risk flags, stress test.", stage: "working" },
];

export default function Overview() {
  const impact = useApi("/impact");
  const credit = useApi("/credit");
  const t = impact.data?.totals;
  const c = credit.data;
  return (
    <div className="space-y-10">
      <section className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-8 items-start">
        <div className="pt-2">
          <h1 className="text-[46px] sm:text-[64px] leading-[0.95] font-bold tracking-tight">
            Destroy.<br />Recover.<br />Prove.
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-ink/75 max-w-xl">
            StripLoop follows every sealed bin of medicine packaging from the chemist counter or factory line to shredded aluminium and plastic. Each handover is weighed, sealed and logged, so a pharma company gets a certificate it can audit, and Satin Finserv sees verified kilograms behind every green loan.
          </p>
        </div>
        <LiveJourney />
          <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-white border border-sage px-4 py-3">
            <div className="text-[12.5px] text-ink/55">Recovered in pilot</div>
            <div className="font-display text-2xl font-semibold text-forest">{t ? tonnes(t.tonnesRecovered) : "..."}</div>
          </div>
          <div className="rounded-2xl bg-white border border-sage px-4 py-3">
            <div className="text-[12.5px] text-ink/55">Hub repayment cover</div>
            <div className="font-display text-2xl font-semibold text-forest">{c ? `${c.hub.latest.dscr}x` : "..."}</div>
          </div>
          <div className="rounded-2xl bg-white border border-sage px-4 py-3">
            <div className="text-[12.5px] text-ink/55">Satin loans in the chain</div>
            <div className="font-display text-2xl font-semibold text-forest">{c ? money(c.totals.sanctioned) : "..."}</div>
          </div>
          <div className="rounded-2xl bg-white border border-sage px-4 py-3">
            <div className="text-[12.5px] text-ink/55">Women earning</div>
            <div className="font-display text-2xl font-semibold text-forest">{t ? num(t.womenCollectors + t.womenSalaried) : "..."}</div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="text-2xl font-semibold">Six roles, one ledger</h2>
          <p className="text-sm text-ink/60">Open any role. Changes made in one screen show up in the others within a second.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ROLE_CARDS.map((r) => (
            <Link key={r.path} to={r.path} className="group panel p-5 hover:border-moss transition-colors block">
              <div className="flex items-start justify-between gap-3">
                <div className="h-11 w-11 rounded-xl bg-sage-100 grid place-items-center group-hover:bg-moss group-hover:text-white text-moss transition-colors"><r.icon size={21} /></div>
                <Stage kind={r.stage} />
              </div>
              <h3 className="mt-3 text-lg font-semibold">{r.title}</h3>
              <div className="text-[13px] text-moss font-semibold">{r.who}</div>
              <p className="mt-2 text-[14px] text-ink/70 leading-relaxed">{r.does}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid lg:grid-cols-3 gap-4">
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-3"><Stage kind="working" /></div>
          <ul className="text-[14px] text-ink/75 space-y-2">
            <li>Sealed-bin chain of custody with seal checks at every handover</li>
            <li>Hash-linked ledger: past entries cannot be edited, corrections need a reason code</li>
            <li>Reconciliation engine with an adjustable tolerance and automatic flags</li>
            <li>Rule enforcement: branded packs can never be resold</li>
            <li>Certificates with QR verification and CSV audit packs</li>
            <li>Satin credit view with repayment cover, covenants and stress test</li>
          </ul>
        </div>
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-3"><Stage kind="mockup" /></div>
          <ul className="text-[14px] text-ink/75 space-y-2">
            <li>CCTV panel on the shredding screen shows a recorded clip reference, not a live feed</li>
            <li>Collector UPI payout log is entered by the aggregation point today</li>
            <li>Network map is a schematic of the Ahmedabad pilot, not a live GIS map</li>
          </ul>
        </div>
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-3"><Stage kind="roadmap" /></div>
          <ul className="text-[14px] text-ink/75 space-y-2">
            <li>Automated UPI payouts to collectors</li>
            <li>Native offline sync engine (a basic offline queue already works in the collector app)</li>
            <li>Role-based logins and permissions for each user</li>
            <li>Live CCTV stream and weighbridge integration</li>
            <li>Direct data link into Satin's loan management system</li>
          </ul>
        </div>
      </section>

      <section className="panel p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-moss" />
          <div>
            <div className="font-semibold text-forest">Try it on a phone</div>
            <div className="text-sm text-ink/65">Print bin labels, open the collector screen on your phone and scan a real QR with the camera.</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate("/labels")}>Print bin labels</Button>
          <Button onClick={() => navigate("/collector")}>Open collector app</Button>
        </div>
      </section>
    </div>
  );
}
