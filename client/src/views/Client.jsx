import React, { useEffect, useState } from "react";
import { CalendarPlus, FileCheck2, Truck, Download, ExternalLink, Syringe, Info } from "lucide-react";
import { api } from "../lib/api.js";
import { useApi } from "../lib/live.jsx";
import { navigate } from "../lib/router.jsx";
import { PageHead, Panel, Button, Badge, Stat, Loading, ErrorNote, Empty, Select, StatusPill, Modal, useToast, cx } from "../components/ui.jsx";
import { CustodyStrip, binSteps, CertificateCard, CertActions } from "../components/custody.jsx";
import { kg, when } from "../lib/format.js";

function BinRow({ bin }) {
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let live = true;
    api.get(`/bins/${bin.id}`).then((r) => live && setEvents(r.events)).catch(() => {});
    return () => { live = false; };
  }, [bin.id, bin.status, bin.updatedAt]);
  return (
    <li className="rounded-xl border border-sage-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="text-sm">
          <span className="font-semibold text-forest">{bin.id}</span>
          <span className="text-ink/55"> | {bin.typeLabel} | seal {bin.seal}{bin.weights.pickup ? ` | ${kg(bin.weights.pickup, 1)}` : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          {bin.inTransit && <Badge tone="green" icon={Truck}>In transit</Badge>}
          <StatusPill status={bin.status} />
          {bin.certId && <Button size="sm" variant="secondary" onClick={() => navigate(`/verify/${bin.certId}`)}>{bin.certId}</Button>}
        </div>
      </div>
      {events ? <CustodyStrip steps={binSteps(bin, events)} /> : <div className="h-14 rounded-xl bg-sage-100 animate-pulse" />}
    </li>
  );
}

function PickupForm({ client, types }) {
  const toast = useToast();
  const isHospital = client.kind === "HOSPITAL";
  const [type, setType] = useState("PVC_ALU");
  const [estKg, setEstKg] = useState(client.kind === "FACTORY" ? "600" : "15");
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const [date, setDate] = useState(tomorrow.toISOString().slice(0, 10));
  const [slot, setSlot] = useState("10:00 to 12:00");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setType("PVC_ALU"); setEstKg(client.kind === "FACTORY" ? "600" : "15"); }, [client.id, client.kind]);
  const options = Object.entries(types).filter(([k]) => k !== "VIAL" || isHospital).map(([k, v]) => ({ value: k, label: v.label }));

  async function submit() {
    setBusy(true);
    try {
      const r = await api.post("/pickups", { clientId: client.id, type, estKg: parseFloat(estKg), date, slot, notes });
      toast({ title: `Pickup ${r.id} scheduled`, body: `${r.binIds.length} sealed bin(s) created and assigned. Follow them below.` });
      setNotes("");
    } catch (e) { toast({ tone: "block", title: "Pickup not scheduled", body: e.message }); } finally { setBusy(false); }
  }

  return (
    <Panel title="Request a pickup" sub="Sealed, numbered bins are created as soon as you book." stage="working">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className="label">Packaging type</label><Select value={type} onChange={setType} options={options} /></div>
        <div><label className="label">Estimated weight (kg)</label><input className="field" inputMode="decimal" value={estKg} onChange={(e) => setEstKg(e.target.value.replace(/[^0-9.]/g, ""))} /></div>
        <div><label className="label">Date</label><input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="label">Time slot</label><Select value={slot} onChange={setSlot} options={["09:00 to 11:00", "10:00 to 12:00", "14:00 to 16:00", "16:00 to 18:00"].map((v) => ({ value: v, label: v }))} /></div>
        <div className="sm:col-span-2"><label className="label">Notes for the team (optional)</label><input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={client.kind === "FACTORY" ? "Line number, batch of rejected foil" : "Ward or pharmacy counter"} /></div>
      </div>
      {type === "VIAL" && (
        <div className="mt-4 rounded-xl border-2 border-forest/20 bg-sage-100 p-3 text-[13.5px] flex gap-3">
          <Syringe size={20} className="text-moss shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-forest">Glass vial protocol (Bio-Medical Waste Rules 2016)</div>
            <ul className="mt-1 text-ink/75 space-y-0.5 list-disc ml-4">
              <li>Bins stay sealed. No opening or shredding at StripLoop.</li>
              <li>Handed to a licensed CBMWTF with a manifest; cytotoxic vials are incinerated there.</li>
              <li>You receive a custody and destruction certificate with the facility confirmation number.</li>
            </ul>
          </div>
        </div>
      )}
      <Button size="lg" className="mt-4 w-full sm:w-auto" icon={CalendarPlus} loading={busy} onClick={submit}>Schedule pickup</Button>
    </Panel>
  );
}

export default function Client() {
  const boot = useApi("/bootstrap");
  const [clientId, setClientId] = useState("CLI-PH-01");
  const { data: s, error, loading, reload } = useApi(`/clients/${clientId}/summary`);
  const [certId, setCertId] = useState(null);
  const certQ = useApi(certId ? `/certificates/${certId}` : null, { skip: !certId });
  const clients = (boot.data?.clients || []).filter((c) => c.kind !== "POOL");

  return (
    <div>
      <PageHead title="Client portal" stage="working" sub="For factory QA heads and hospital pharmacy leads: book pickups, follow every sealed bin to the shredder, and download proof for GMP audits and BRSR reports.">
        <Select value={clientId} onChange={setClientId} options={clients.map((c) => ({ value: c.id, label: c.name }))} className="w-auto min-w-[300px]" />
      </PageHead>
      {loading && !s ? <Loading /> : error ? <ErrorNote error={error} onRetry={reload} /> : s && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 -mt-2">
            <Badge tone="dark">{s.client.kind === "FACTORY" ? "Pharma factory" : "Hospital"}</Badge>
            <Badge tone="plain">Plan: {s.client.plan}</Badge>
            <Badge tone="plain">Contact: {s.client.contact}</Badge>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="Destroyed with certificate" value={kg(s.totals.destroyedKg, 0)} />
            <Stat label="Aluminium recovered" value={kg(s.totals.alKg, 0)} />
            <Stat label="Plastic recovered" value={kg(s.totals.pvcKg, 0)} />
            <Stat label="CO2e avoided" value={kg(s.totals.co2Kg, 0)} sub="When aluminium is remelted" />
            <Stat label="Bins in progress" value={s.totals.inProgress} tone="dark" />
          </div>
          <div className="grid lg:grid-cols-[1fr_1.35fr] gap-5 items-start">
            {boot.data && <PickupForm client={s.client} types={boot.data.types} />}
            <Panel title="Live chain of custody" sub="Pickup, aggregation, hub shredding and recycler sale. Each tag locks when its ledger entry is written." stage="working" bodyClass="p-3">
              {s.bins.length === 0 ? <Empty icon={Truck} title="No bins yet">Schedule a pickup to start.</Empty> : (
                <ul className="space-y-2.5 max-h-[640px] overflow-y-auto scrollbar-thin pr-1">
                  {s.bins.slice(0, 14).map((b) => <BinRow key={b.id} bin={b} />)}
                </ul>
              )}
            </Panel>
          </div>
          <Panel title="Certificates and compliance" sub="Each certificate carries a QR code that anyone can scan to check it against the ledger." stage="working" bodyClass="p-0 overflow-x-auto">
            {s.certificates.length === 0 ? <Empty icon={FileCheck2} title="No certificates yet">They are issued automatically when your bins are shredded.</Empty> : (
              <table className="tbl">
                <thead><tr><th>Certificate</th><th>Issued</th><th className="text-right">Destroyed</th><th className="text-right">Aluminium</th><th className="text-right">CO2e</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {s.certificates.map((c) => (
                    <tr key={c.id}>
                      <td className="font-semibold text-forest">{c.id}</td>
                      <td>{when(c.issuedAt)}</td>
                      <td className="text-right tabular-nums">{kg(c.destroyedKg)}</td>
                      <td className="text-right tabular-nums">{kg(c.recovered.alKg)}</td>
                      <td className="text-right tabular-nums">{kg(c.co2Kg, 0)}</td>
                      <td><StatusPill status={c.status} /></td>
                      <td className="whitespace-nowrap">
                        <Button size="sm" variant="secondary" onClick={() => setCertId(c.id)}>View</Button>
                        <a href={`/api/certificates/${c.id}/audit.csv`} className="ml-2 text-moss font-semibold text-[13px] inline-flex items-center gap-1"><Download size={14} />Audit pack</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <div className="rounded-xl bg-white border border-sage p-4 text-[13.5px] text-ink/70 flex gap-3">
            <Info size={18} className="text-moss shrink-0 mt-0.5" />
            <span>Audit packs list every ledger entry behind a certificate (time, actor, weight, seal, GPS, photo, hash). Use them for Schedule M records of destroyed printed packaging, BRSR Principle 6 disclosures and EPR Category III recycling evidence.</span>
          </div>
        </div>
      )}
      <Modal open={!!certId} onClose={() => setCertId(null)} title={certId || ""} wide footer={certQ.data && <><CertActions cert={certQ.data.certificate} /><Button icon={ExternalLink} onClick={() => navigate(`/verify/${certId}`)}>Open public check page</Button></>}>
        {certQ.data ? <CertificateCard cert={certQ.data.certificate} client={certQ.data.client} integrity={certQ.data.integrity} bins={certQ.data.bins} /> : <Loading />}
      </Modal>
    </div>
  );
}
