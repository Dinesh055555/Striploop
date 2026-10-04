import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Lock, ShieldCheck, ShieldAlert, Printer, Download, Recycle, Flame, Leaf } from "lucide-react";
import { cx, Badge, Button, StatusPill } from "./ui.jsx";
import { EVENT_LABEL, kg, when, shortHash, num } from "../lib/format.js";

export function Logo({ light, size = 30 }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill={light ? "#E9F4EC" : "#0F3D2E"} />
        <path d="M18 40a14 14 0 1 1 28 0" fill="none" stroke={light ? "#1F6B47" : "#8CCB9E"} strokeWidth="6" strokeLinecap="round" />
        <path d="M46 40l-6-5m6 5l5-6" fill="none" stroke={light ? "#1F6B47" : "#8CCB9E"} strokeWidth="5" strokeLinecap="round" />
        <rect x="22" y="18" width="6" height="8" rx="3" fill={light ? "#0F3D2E" : "#E9F4EC"} />
        <rect x="31" y="18" width="6" height="8" rx="3" fill={light ? "#0F3D2E" : "#E9F4EC"} />
        <rect x="40" y="18" width="6" height="8" rx="3" fill={light ? "#0F3D2E" : "#E9F4EC"} opacity=".5" />
      </svg>
      <span className={cx("font-display font-semibold text-[19px] tracking-tight", light ? "text-forest" : "text-white")}>StripLoop</span>
    </div>
  );
}

// The custody strip: each handover is a seal tag. A tag locks when its event is
// in the ledger, and shows the start of that event's hash.
export function CustodyStrip({ steps, dark, compact }) {
  return (
    <ol className={cx("flex", compact ? "gap-0" : "gap-0", "items-stretch overflow-x-auto scrollbar-thin pb-1")}>
      {steps.map((s, i) => {
        const state = s.done ? "done" : s.active ? "active" : "todo";
        return (
          <li key={s.label} className="flex items-center min-w-0 flex-1">
            <div
              className={cx(
                "relative flex-1 min-w-[88px] rounded-xl border px-2 py-2",
                state === "done" && (dark ? "bg-sprout/15 border-sprout/50 lockin" : "bg-sage-100 border-leaf/60 lockin"),
                state === "active" && (dark ? "border-sprout border-dashed" : "border-moss border-dashed bg-white"),
                state === "todo" && (dark ? "border-white/15" : "border-sage bg-white/60")
              )}
            >
              <div className="flex items-start gap-1.5">
                <span className={cx("grid place-items-center h-5 w-5 rounded-full shrink-0", state === "done" ? (dark ? "bg-sprout text-forest" : "bg-moss text-white") : dark ? "bg-white/10 text-sage" : "bg-sage-100 text-moss")}>
                  {state === "done" ? <Check size={12} strokeWidth={3} /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                </span>
                <span className={cx("text-[12.5px] font-semibold leading-tight", dark ? "text-white" : "text-forest")}>{s.label}</span>
              </div>
              {!compact && (
                <div className={cx("mt-1 text-[11px] leading-snug min-h-[28px]", dark ? "text-sage/80" : "text-ink/55")}>
                  {s.done ? (
                    <>
                      {s.sub && <div className="line-clamp-2 break-words">{s.sub}</div>}
                      {s.hash && <div className="font-semibold tabular-nums flex items-center gap-1"><Lock size={10} className="shrink-0" />{s.hash.slice(0, 8)}</div>}
                    </>
                  ) : (
                    <span>{s.hint || (state === "active" ? "In progress" : "Not yet")}</span>
                  )}
                </div>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={cx("h-0.5 w-3 sm:w-4 shrink-0", steps[i + 1].done || s.done ? (dark ? "bg-sprout" : "bg-leaf") : dark ? "bg-white/15" : "bg-sage")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Builds custody steps for a bin from its ledger events.
export function binSteps(bin, events = []) {
  const ev = (type) => events.find((e) => e.type === type && (e.entityId === bin.id || e.entityId === bin.baleId || e.entityId === bin.batchId || (e.data?.binIds || []).includes(bin.id)));
  if (bin.vial) {
    const p = ev("PICKUP"), h = ev("CBMWTF_HANDOVER"), c = ev("INCINERATION_CONFIRMED");
    return [
      { label: "Pickup", done: !!p, hash: p?.hash, sub: p && when(p.ts) },
      { label: "Sealed custody", done: !!h, hash: h?.hash, sub: h && "No opening" },
      { label: "Licensed facility", done: !!h, hash: h?.hash, sub: h && (bin.cbmwtf?.manifestNo || "") },
      { label: "Incinerated", done: !!c, hash: c?.hash, sub: c && when(c.ts) },
    ];
  }
  const p = ev("PICKUP"), a = ev("AGG_INTAKE"), r = ev("HUB_RECEIVE"), d = ev("DESTROYED"), cert = ev("CERT_ISSUED");
  const direct = bin.source === "FACTORY";
  return [
    { label: "Pickup", done: !!p, hash: p?.hash, sub: p && when(p.ts), active: bin.status === "Assigned" },
    { label: direct ? "Direct to hub" : "Aggregation", done: direct ? !!p : !!a, hash: direct ? p?.hash : a?.hash, sub: direct ? "Factory truck" : a && when(a.ts), active: !direct && bin.status === "Picked_Up" },
    { label: "Hub shredding", done: !!d, hash: d?.hash, sub: d && when(d.ts), active: !!r && !d, hint: r && !d ? "Received, queued" : undefined },
    { label: "Recycler sale", done: !!cert, hash: cert?.hash, sub: cert && "Aluminium, plastic" },
  ];
}

export function Timeline({ events, limit }) {
  const list = limit ? events.slice(0, limit) : events;
  return (
    <ol className="relative border-l-2 border-sage ml-2">
      {list.map((e) => (
        <li key={e.seq} className="ml-4 pb-4 last:pb-0">
          <span className={cx("absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 border-white", e.type === "EXCEPTION_RAISED" || e.type === "RULE_BLOCKED" || e.type === "HUB_HOLD" ? "bg-ochre" : e.type === "ADJUSTMENT" ? "bg-sprout" : "bg-moss")} />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-semibold text-[14px] text-forest">{EVENT_LABEL[e.type] || e.type}</span>
            <span className="text-[12px] text-ink/50">{when(e.ts)}</span>
            <span className="text-[11.5px] text-ink/40 tabular-nums">#{e.seq}</span>
          </div>
          <div className="text-[12.5px] text-ink/65 mt-0.5">
            {e.actor}
            {e.weightKg ? ` | ${kg(e.weightKg, 2)}` : ""}
            {e.seal ? ` | seal ${e.seal}` : ""}
            {e.geo ? ` | ${e.geo.lat.toFixed(4)}, ${e.geo.lng.toFixed(4)}${e.geo.approx ? " (approx)" : ""}` : ""}
          </div>
          {e.note && <div className="text-[12.5px] text-ink/70 mt-0.5">{e.note}</div>}
          {e.photoUrl && (
            <a href={e.photoUrl} target="_blank" rel="noreferrer" className="inline-block mt-1.5">
              <img src={e.photoUrl} alt="Pickup evidence" className="h-16 w-24 object-cover rounded-lg border border-sage" />
            </a>
          )}
          <div className="text-[11px] text-ink/40 mt-0.5 font-medium tabular-nums flex items-center gap-1"><Lock size={10} /> {shortHash(e.hash)} links to {shortHash(e.prevHash)}</div>
        </li>
      ))}
    </ol>
  );
}

export function verifyUrl(id) {
  return `${window.location.origin}/verify/${id}`;
}

// Certificate of Destruction and Recovery. Printable.
export function CertificateCard({ cert, client, integrity, bins = [] }) {
  const isVial = !!cert.byType?.VIAL;
  return (
    <div className="print-area bg-white rounded-2xl border-2 border-forest/80 overflow-hidden">
      <div className="bg-forest text-white px-6 py-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Logo />
          <div className="mt-4 font-display text-[24px] sm:text-[28px] leading-tight font-semibold">
            Certificate of {isVial ? "Custody and Destruction" : "Destruction and Recovery"}
          </div>
          <div className="text-sage text-sm mt-1">{cert.id} | Issued {new Date(cert.issuedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
        </div>
        <div className="bg-white p-2 rounded-xl">
          <QRCodeSVG value={verifyUrl(cert.id)} size={104} fgColor="#0F3D2E" level="M" />
          <div className="text-[10px] text-forest text-center mt-1 font-semibold">Scan to verify</div>
        </div>
      </div>
      <div className="px-6 py-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm text-ink/60">Issued to</span>
          <span className="font-semibold text-forest">{cert.clientName}</span>
          <Badge tone={cert.status === "Valid" ? "solid" : "ochre"}>{cert.status}</Badge>
          {cert.branded && <Badge tone="plain">Branded packs, no resale</Badge>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Figure icon={Flame} label={isVial ? "Vials destroyed" : "Packaging destroyed"} value={kg(cert.destroyedKg)} />
          <Figure icon={Recycle} label="Aluminium recovered" value={kg(cert.recovered.alKg)} />
          <Figure icon={Recycle} label="Plastic recovered" value={kg(cert.recovered.pvcKg + (cert.recovered.paperKg || 0))} />
          <Figure icon={Leaf} label="CO2e avoided" value={kg(cert.co2Kg, 0)} />
        </div>
        <div className="mt-5 grid sm:grid-cols-2 gap-5 text-sm">
          <div>
            <div className="font-semibold text-forest mb-1.5">What was destroyed</div>
            {Object.entries(cert.byType).map(([t, w]) => (
              <div key={t} className="flex justify-between border-b border-sage-200 py-1"><span className="text-ink/70">{TYPE_NAME[t] || t}</span><span className="font-semibold">{kg(w, 2)}</span></div>
            ))}
            <div className="flex justify-between py-1"><span className="text-ink/70">Sealed bins</span><span className="font-semibold">{cert.binIds.length}</span></div>
          </div>
          <div>
            <div className="font-semibold text-forest mb-1.5">How</div>
            <p className="text-ink/75 leading-relaxed">{cert.method}.</p>
            {cert.cctvRef && <p className="text-ink/60 mt-1">Camera record: {cert.cctvRef}</p>}
          </div>
        </div>
        <div className="mt-5">
          <div className="font-semibold text-forest text-sm mb-1.5">Use this record for</div>
          <ul className="text-sm text-ink/75 space-y-1">
            {cert.refs.map((r) => <li key={r} className="flex gap-2"><Check size={15} className="text-moss mt-0.5 shrink-0" />{r}</li>)}
          </ul>
        </div>
        {integrity && (
          <div className={cx("mt-5 rounded-xl px-4 py-3 flex items-start gap-3 text-sm", integrity.chainOk && integrity.certEventHashMatches ? "bg-sage-100" : "bg-clay-soft")}>
            {integrity.chainOk && integrity.certEventHashMatches ? <ShieldCheck className="text-moss shrink-0" /> : <ShieldAlert className="text-clay shrink-0" />}
            <div>
              <div className="font-semibold text-forest">{integrity.chainOk && integrity.certEventHashMatches ? "Record checked: unchanged since issue" : "Record check failed"}</div>
              <div className="text-ink/65">Checked {num(integrity.checked)} linked ledger entries. Certificate entry hash {shortHash(cert.chainHead)}.</div>
            </div>
          </div>
        )}
        {bins.length > 0 && (
          <div className="mt-4 text-[12px] text-ink/55">Bins: {bins.map((b) => `${b.id} (seal ${b.seal})`).join(", ")}</div>
        )}
        <div className="mt-4 text-[11.5px] text-ink/45">Prototype certificate for the Sankalp by Satin Finserv demo. All names are fictional.</div>
      </div>
    </div>
  );
}

const TYPE_NAME = { PVC_ALU: "PVC-alu blister", ALU_ALU: "Alu-alu strip", CARTON: "Cartons and leaflets", VIAL: "Glass vials" };

function Figure({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-sage-100/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[12px] text-ink/60"><Icon size={13} className="text-moss" />{label}</div>
      <div className="font-display text-xl font-semibold text-forest mt-0.5">{value}</div>
    </div>
  );
}

export function CertActions({ cert }) {
  return (
    <div className="flex flex-wrap gap-2 no-print">
      <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>Print or save as PDF</Button>
      <a href={`/api/certificates/${cert.id}/audit.csv`} className="inline-flex"><Button variant="secondary" size="sm" icon={Download}>Download audit pack (CSV)</Button></a>
    </div>
  );
}

export { StatusPill };
