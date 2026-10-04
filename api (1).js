import express from "express";
import { db, bus, find, verifyChain, logEvent, changed, nextId, sha256, GENESIS } from "./store.js";
import * as S from "./services.js";
import { seed } from "./seed.js";

export const api = express.Router();

const STAGES = ["Assigned", "Picked_Up", "Aggregated", "Hub_Received", "Destroyed"];
const VIAL_STAGES = ["Assigned", "Picked_Up", "Handed_To_CBMWTF", "Incinerated"];

function enrichBin(b) {
  const point = find.point(b.pointId);
  const client = find.client(b.clientId);
  const stages = b.vial ? VIAL_STAGES : STAGES;
  const bale = b.baleId ? find.bale(b.baleId) : null;
  let stage = stages.indexOf(b.status);
  let inTransit = false;
  if (b.status === "Aggregated" && bale && (bale.status === "Dispatched" || bale.status === "Held")) inTransit = true;
  if (b.status === "Picked_Up" && b.source === "FACTORY") inTransit = true;
  const sold = b.status === "Destroyed";
  return {
    ...b,
    typeLabel: S.TYPES[b.type]?.label,
    pointName: point ? point.name : "Unknown point",
    area: point ? point.area : "",
    registered: point ? point.registered : false,
    clientName: client ? client.name : "",
    stage,
    stages,
    inTransit,
    baleStatus: bale ? bale.status : null,
    materialSold: sold,
    collectorName: find.collector(b.pickedBy || b.assignedTo)?.name || (b.assignedTo === "HUB-TRUCK" ? "Hub truck" : b.assignedTo),
  };
}

function eventsFor(ids) {
  const set = new Set(ids);
  return db.events.filter((e) => set.has(e.entityId) || (e.data && Array.isArray(e.data.binIds) && e.data.binIds.some((x) => set.has(x))));
}

function handle(fn) {
  return (req, res) => {
    try {
      const out = fn(req, res);
      if (out !== undefined) res.json(out);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      res.status(status).json({ error: err.message || "Something went wrong on the server.", ...(err.extra || {}) });
    }
  };
}

function savePhoto(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new S.AppError(422, "Photo must be a JPEG, PNG or WebP image.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 1_500_000) throw new S.AppError(413, "Photo is too large. Keep it under 1.5 MB.");
  const id = nextId("PH", 5);
  db.photos.set(id, { mime: m[1], buf, hash: sha256(buf.toString("base64")) });
  return `/api/photos/${id}`;
}

// ---------- meta ----------

api.get("/health", handle(() => ({ ok: true, version: db.version, events: db.events.length, uptimeSec: Math.round(process.uptime()) })));

api.get("/bootstrap", handle(() => ({
  version: db.version,
  settings: db.settings,
  rules: db.rules,
  hubs: db.hubs,
  aggPoints: db.aggPoints,
  collectors: db.collectors.map(({ ledger, week, ...c }) => c),
  points: db.points,
  clients: db.clients,
  types: S.TYPES,
  sources: S.SOURCES,
  reasonCodes: S.REASON_CODES,
})));

api.get("/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ version: db.version, kind: "hello" })}\n\n`);
  const onChange = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
  bus.on("change", onChange);
  const ping = setInterval(() => res.write(": ping\n\n"), 20000);
  req.on("close", () => { clearInterval(ping); bus.off("change", onChange); });
});

// ---------- bins ----------

api.get("/bins", handle((req) => {
  const { status, assignedTo, aggId, clientId, source } = req.query;
  let list = db.bins;
  if (status) list = list.filter((b) => status.split(",").includes(b.status));
  if (assignedTo) list = list.filter((b) => b.assignedTo === assignedTo);
  if (aggId) list = list.filter((b) => b.aggId === aggId);
  if (clientId) list = list.filter((b) => b.clientId === clientId);
  if (source) list = list.filter((b) => b.source === source);
  return list.map(enrichBin).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}));

api.post("/bins", handle((req) => {
  const { pointId, type, assignedTo, branded } = req.body || {};
  if (!find.point(pointId)) throw new S.AppError(422, "Choose a registered collection point.");
  if (!S.TYPES[type]) throw new S.AppError(422, "Choose a packaging type.");
  const point = find.point(pointId);
  return enrichBin(S.createBin({ pointId, type, branded: branded ?? (point.kind === "FACTORY" || type === "VIAL"), assignedTo: assignedTo || point.collectorId }));
}));

api.get("/bins/:id", handle((req) => {
  const bin = find.bin(req.params.id.toUpperCase());
  if (!bin) throw new S.AppError(404, `No bin found with code ${req.params.id}.`);
  const ids = [bin.id, bin.baleId, bin.batchId, bin.certId].filter(Boolean);
  return { bin: enrichBin(bin), events: eventsFor(ids), exceptions: db.exceptions.filter((e) => ids.includes(e.entityId)) };
}));

api.post("/bins/:id/pickup", handle((req) => {
  const { by, seal, weightKg, photo, geo } = req.body || {};
  const photoUrl = photo ? savePhoto(photo) : null;
  return enrichBin(S.pickup({ binId: req.params.id, by, seal, weightKg, photoUrl, geo }));
}));

api.post("/bins/:id/intake", handle((req) => {
  const { aggId, weightKg } = req.body || {};
  const r = S.aggIntake({ binId: req.params.id, aggId, weightKg });
  return { bin: enrichBin(r.bin), gapPct: r.gapPct, exception: r.exception };
}));

api.post("/bins/:id/hub-receive", handle((req) => {
  const { sealScanned, weightKg } = req.body || {};
  const r = S.hubReceiveBin({ binId: req.params.id, sealScanned, weightKg });
  return { bin: enrichBin(r.bin), gapPct: r.gapPct, exception: r.exception };
}));

api.post("/bins/:id/resale-attempt", handle((req) => S.attemptResale({ binId: req.params.id, by: req.body?.by })));
api.post("/bins/:id/vial-handover", handle((req) => enrichBin(S.vialHandover({ binId: req.params.id, ...(req.body || {}) }))));
api.post("/bins/:id/vial-confirm", handle((req) => {
  const r = S.vialConfirm({ binId: req.params.id, ...(req.body || {}) });
  return { bin: enrichBin(r.bin), certificate: r.certificate };
}));

// ---------- bales and batches ----------

api.get("/bales", handle((req) => {
  let list = db.bales;
  if (req.query.aggId) list = list.filter((b) => b.aggId === req.query.aggId);
  if (req.query.status) list = list.filter((b) => req.query.status.split(",").includes(b.status));
  return list.map((b) => ({ ...b, aggName: find.agg(b.aggId)?.name, bins: b.binIds.map((id) => enrichBin(find.bin(id))) }));
}));
api.post("/bales", handle((req) => S.createBale(req.body || {})));
api.post("/bales/:id/dispatch", handle((req) => S.dispatchBale({ baleId: req.params.id, ...(req.body || {}) })));
api.post("/bales/:id/receive", handle((req) => S.hubReceiveBale({ baleId: req.params.id, ...(req.body || {}) })));
api.post("/bales/:id/release", handle((req) => S.releaseHeldBale({ baleId: req.params.id, ...(req.body || {}) })));

api.get("/batches", handle(() => db.batches));
api.post("/batches", handle((req) => S.destroyBatch(req.body || {})));

// ---------- certificates ----------

api.get("/certificates", handle((req) => {
  let list = db.certificates;
  if (req.query.clientId) list = list.filter((c) => c.clientId === req.query.clientId);
  return list;
}));

api.get("/certificates/:id", handle((req) => {
  const cert = find.cert(req.params.id.toUpperCase());
  if (!cert) throw new S.AppError(404, `Certificate ${req.params.id} was not found. Check the code printed under the QR.`);
  const bins = cert.binIds.map((id) => enrichBin(find.bin(id)));
  const ids = [...cert.binIds, ...cert.batchIds, ...bins.map((b) => b.baleId).filter(Boolean), cert.id];
  const chain = verifyChain();
  const ev = db.events.find((e) => e.seq === cert.eventSeq);
  return {
    certificate: cert,
    client: find.client(cert.clientId),
    bins,
    events: eventsFor(ids),
    integrity: { chainOk: chain.ok, checked: chain.checked, certEventHashMatches: !!ev && ev.hash === cert.chainHead },
  };
}));

api.post("/certificates/:id/approve", handle((req) => S.approveCertificate({ id: req.params.id })));

api.get("/certificates/:id/audit.csv", (req, res) => {
  const cert = find.cert(req.params.id.toUpperCase());
  if (!cert) return res.status(404).send("Certificate not found");
  const ids = [...cert.binIds, ...cert.batchIds, ...cert.binIds.map((id) => find.bin(id)?.baleId).filter(Boolean), cert.id];
  const rows = [["seq", "timestamp", "event", "entity", "entity_id", "actor", "weight_kg", "seal", "lat", "lng", "photo", "note", "prev_hash", "hash"]];
  for (const e of eventsFor(ids)) {
    rows.push([e.seq, e.ts, e.type, e.entity, e.entityId, e.actor, e.weightKg ?? "", e.seal ?? "", e.geo?.lat ?? "", e.geo?.lng ?? "", e.photoUrl ?? "", (e.note || "").replace(/"/g, "'"), e.prevHash, e.hash]);
  }
  const header = [
    `# StripLoop audit pack for ${cert.id}`,
    `# Client: ${cert.clientName}`,
    `# Destroyed: ${cert.destroyedKg} kg; Aluminium recovered: ${cert.recovered.alKg} kg; Plastic recovered: ${cert.recovered.pvcKg} kg; CO2e avoided: ${cert.co2Kg} kg`,
    `# References: ${cert.refs.join(" | ")}`,
    `# Hash chain head at issue: ${cert.chainHead}`,
  ];
  const csv = header.join("\n") + "\n" + rows.map((r) => r.map((c) => `"${String(c)}"`).join(",")).join("\n");
  res.set({ "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${cert.id}-audit-pack.csv"` });
  res.send(csv);
});

// ---------- exceptions, rules, settings, audit ----------

api.get("/exceptions", handle((req) => {
  let list = db.exceptions;
  if (req.query.status) list = list.filter((e) => e.status === req.query.status);
  return list.map((e) => {
    const bin = e.entity === "bin" ? find.bin(e.entityId) : null;
    return { ...e, aggId: bin?.aggId || find.bale(e.entityId)?.aggId || null };
  });
}));
api.post("/exceptions/:id/resolve", handle((req) => S.resolveException({ id: req.params.id, ...(req.body || {}) })));

api.get("/settings", handle(() => ({ settings: db.settings, rules: db.rules })));
api.put("/settings", handle((req) => S.updateSettings(req.body || {})));
api.put("/rules/:id", handle((req) => S.toggleRule({ id: req.params.id, enabled: req.body?.enabled })));

api.get("/events", handle((req) => {
  const limit = Math.min(500, Number(req.query.limit) || 100);
  let list = db.events;
  if (req.query.entityId) list = list.filter((e) => e.entityId === req.query.entityId);
  if (req.query.type) list = list.filter((e) => e.type === req.query.type);
  return { total: db.events.length, events: list.slice(-limit).reverse() };
}));

api.get("/audit/verify", handle(() => verifyChain()));

// Shows what happens if anyone edits a past event: works on a copy, never on the real log.
api.post("/audit/tamper-test", handle(() => {
  const copy = db.events.map((e) => ({ ...e }));
  const target = copy.find((e) => e.type === "PICKUP" && e.weightKg) || copy[Math.floor(copy.length / 2)];
  const original = target.weightKg;
  target.weightKg = original ? +(original * 0.8).toFixed(2) : 1;
  let prevHash = GENESIS, brokenAt = null;
  for (const e of copy) {
    const payload = JSON.stringify([e.seq, e.ts, e.type, e.entity, e.entityId, e.actor, e.weightKg ?? null, e.seal ?? null, e.geo ?? null, e.photoUrl ?? null, e.note ?? null, e.data ?? null, e.refSeq ?? null]);
    if (sha256(prevHash + payload) !== e.hash || e.prevHash !== prevHash) { brokenAt = e.seq; break; }
    prevHash = e.hash;
  }
  return { edited: { seq: target.seq, entityId: target.entityId, from: original, to: target.weightKg }, detected: brokenAt !== null, brokenAt, realLogUntouched: verifyChain().ok };
}));

// ---------- pickups and clients ----------

api.get("/pickups", handle((req) => {
  let list = db.pickups;
  if (req.query.clientId) list = list.filter((p) => p.clientId === req.query.clientId);
  return list;
}));
api.post("/pickups", handle((req) => S.createPickupRequest(req.body || {})));

api.get("/clients/:id/summary", handle((req) => {
  const client = find.client(req.params.id);
  if (!client) throw new S.AppError(404, "Unknown client.");
  const bins = db.bins.filter((b) => b.clientId === client.id).map(enrichBin).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const certs = db.certificates.filter((c) => c.clientId === client.id);
  return {
    client,
    pickups: db.pickups.filter((p) => p.clientId === client.id),
    bins,
    certificates: certs,
    totals: {
      destroyedKg: +certs.reduce((s, c) => s + c.destroyedKg, 0).toFixed(1),
      alKg: +certs.reduce((s, c) => s + c.recovered.alKg, 0).toFixed(1),
      pvcKg: +certs.reduce((s, c) => s + c.recovered.pvcKg, 0).toFixed(1),
      co2Kg: +certs.reduce((s, c) => s + c.co2Kg, 0).toFixed(1),
      inProgress: bins.filter((b) => !["Destroyed", "Incinerated"].includes(b.status)).length,
    },
  };
}));

// ---------- role summaries ----------

api.get("/collectors/:id/summary", handle((req) => {
  const c = find.collector(req.params.id);
  if (!c) throw new S.AppError(404, "Unknown collector.");
  const today = new Date().toISOString().slice(0, 10);
  const stops = db.points.filter((p) => p.collectorId === c.id).map((p) => {
    const bins = db.bins.filter((b) => b.pointId === p.id && (b.assignedTo === c.id || b.pickedBy === c.id));
    const waiting = bins.filter((b) => b.status === "Assigned").map(enrichBin);
    const doneToday = bins.filter((b) => b.pickedBy === c.id && (b.pickedAt || "").slice(0, 10) === today).map(enrichBin);
    return { ...p, waiting, doneToday, status: waiting.length ? "Pending" : doneToday.length ? "Done" : "No pickup today" };
  }).filter((s) => s.waiting.length || s.doneToday.length);
  const todayLedger = c.ledger.filter((l) => l.at.slice(0, 10) === today);
  const loan = db.loans.find((l) => l.collectorId === c.id);
  const loanView = loan ? (() => {
    const e = S.emi(loan.principal, loan.ratePct, loan.tenureMonths);
    const out = S.outstandingAfter(loan.principal, loan.ratePct, loan.tenureMonths, loan.paidInstallments);
    const due = new Date(); due.setDate(due.getDate() + (loan.dpd ? -loan.dpd : 9));
    return { ...loan, emi: Math.round(e), outstanding: Math.round(out), nextDue: due.toISOString().slice(0, 10), paidPct: Math.round((loan.paidInstallments / loan.tenureMonths) * 100) };
  })() : null;
  const week = (c.week || []).map((d, i, arr) => (i === arr.length - 1 ? { ...d, amount: d.amount + todayLedger.reduce((s, l) => s + l.amount, 0) } : d));
  return {
    collector: { id: c.id, name: c.name, aggId: c.aggId, aggName: find.agg(c.aggId)?.name, monthlyIncome: c.monthlyIncome },
    stops,
    today: { kg: +todayLedger.reduce((s, l) => s + l.kg, 0).toFixed(1), amount: todayLedger.reduce((s, l) => s + l.amount, 0), pickups: todayLedger.length, ledger: todayLedger },
    week,
    payouts: db.payouts.filter((p) => p.collectorId === c.id),
    loan: loanView,
    rates: db.settings.rates.collectorPerKg,
    stopIncentive: db.settings.rates.stopIncentive,
  };
}));

api.get("/aggregation/:id/summary", handle((req) => {
  const a = find.agg(req.params.id);
  if (!a) throw new S.AppError(404, "Unknown aggregation point.");
  const bins = db.bins.filter((b) => b.aggId === a.id && !b.vial);
  const recon = bins.filter((b) => b.weights.pickup && b.weights.aggIntake).map((b) => ({
    id: b.id, type: S.TYPES[b.type].label, collector: find.collector(b.pickedBy)?.name || b.pickedBy, inKg: b.weights.pickup, outKg: b.weights.aggIntake,
    gapPct: S.gapPct(b.weights.pickup, b.weights.aggIntake), flagged: db.exceptions.some((e) => e.entityId === b.id && e.type === "WEIGHT_GAP"),
    resolved: db.exceptions.some((e) => e.entityId === b.id && e.type === "WEIGHT_GAP" && e.status === "resolved"), at: b.updatedAt,
  })).sort((x, y) => y.at.localeCompare(x.at));
  return {
    point: a,
    pendingIntake: bins.filter((b) => b.status === "Picked_Up").map(enrichBin),
    readyToBale: bins.filter((b) => b.status === "Aggregated" && !b.baleId).map(enrichBin),
    bales: db.bales.filter((b) => b.aggId === a.id).map((b) => ({ ...b, bins: b.binIds.map((id) => enrichBin(find.bin(id))) })),
    reconciliation: recon,
    totals: {
      inKg: +recon.reduce((s, r) => s + r.inKg, 0).toFixed(2),
      outKg: +recon.reduce((s, r) => s + r.outKg, 0).toFixed(2),
      flagged: recon.filter((r) => r.flagged && !r.resolved).length,
    },
    tolerancePct: db.settings.tolerancePct,
    collectors: db.collectors.filter((c) => c.aggId === a.id).map((c) => ({ id: c.id, name: c.name })),
  };
}));

api.get("/hub/summary", handle(() => {
  const incomingBales = db.bales.filter((b) => b.status === "Dispatched").map((b) => ({ ...b, aggName: find.agg(b.aggId)?.name }));
  const heldBales = db.bales.filter((b) => b.status === "Held").map((b) => ({ ...b, aggName: find.agg(b.aggId)?.name }));
  const directInbound = db.bins.filter((b) => b.status === "Picked_Up" && b.source === "FACTORY").map(enrichBin);
  const ready = db.bins.filter((b) => b.status === "Hub_Received").map(enrichBin);
  const vials = db.bins.filter((b) => b.vial && ["Picked_Up", "Handed_To_CBMWTF"].includes(b.status)).map(enrichBin);
  const monthKg = db.batches.reduce((s, b) => s + b.inputKg, 0);
  return {
    hub: db.hubs[0],
    incomingBales, heldBales, directInbound, ready, vials,
    batches: db.batches.slice(0, 12),
    openExceptions: db.exceptions.filter((e) => e.status === "open").length,
    totals: {
      shreddedKg: +monthKg.toFixed(1),
      alKg: +db.batches.reduce((s, b) => s + b.output.alKg, 0).toFixed(1),
      pvcKg: +db.batches.reduce((s, b) => s + b.output.pvcKg, 0).toFixed(1),
      readyKg: +ready.reduce((s, b) => s + (b.weights.hubReceive || 0), 0).toFixed(1),
    },
    massBalancePct: db.settings.massBalancePct,
  };
}));

api.get("/admin/overview", handle(() => {
  const recon = db.bins.filter((b) => b.weights.pickup).map((b) => {
    const steps = [];
    if (b.weights.aggIntake) steps.push({ leg: "Collector to aggregation", inKg: b.weights.pickup, outKg: b.weights.aggIntake, gapPct: S.gapPct(b.weights.pickup, b.weights.aggIntake) });
    if (b.weights.hubReceive) {
      const from = b.weights.aggIntake || b.weights.pickup;
      steps.push({ leg: b.weights.aggIntake ? "Aggregation to hub" : "Factory to hub", inKg: from, outKg: b.weights.hubReceive, gapPct: S.gapPct(from, b.weights.hubReceive) });
    }
    const worst = steps.reduce((m, s) => Math.max(m, s.gapPct), 0);
    return { id: b.id, type: S.TYPES[b.type].label, source: b.source, status: b.status, aggId: b.aggId, steps, worstGapPct: worst, overTolerance: worst > db.settings.tolerancePct };
  }).sort((x, y) => y.worstGapPct - x.worstGapPct);
  const statusCounts = {};
  for (const b of db.bins) statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
  return {
    hubs: db.hubs,
    aggPoints: db.aggPoints.map((a) => ({ ...a, bins: db.bins.filter((b) => b.aggId === a.id).length, exceptions: db.exceptions.filter((e) => (e.entity === "bin" && find.bin(e.entityId)?.aggId === a.id) || (e.entity === "bale" && find.bale(e.entityId)?.aggId === a.id)).length })),
    points: db.points,
    statusCounts,
    reconciliation: recon,
    settings: db.settings,
    rules: db.rules,
    certificates: db.certificates,
    totals: {
      bins: db.bins.length,
      destroyedKg: +db.batches.reduce((s, b) => s + b.inputKg, 0).toFixed(1),
      recoveredKg: +db.batches.reduce((s, b) => s + b.output.alKg + b.output.pvcKg + b.output.paperKg, 0).toFixed(1),
      openExceptions: db.exceptions.filter((e) => e.status === "open").length,
      events: db.events.length,
      certificates: db.certificates.length,
      pendingCertificates: db.certificates.filter((c) => c.status === "Pending approval").length,
    },
  };
}));

api.get("/credit", handle(() => S.creditView()));
api.post("/credit/stress", handle((req) => S.stressTest(req.body || {})));
api.get("/impact", handle(() => S.impactView()));

api.get("/photos/:id", (req, res) => {
  const p = db.photos.get(req.params.id);
  if (!p) return res.status(404).send("Photo not found");
  res.set({ "Content-Type": p.mime, "Cache-Control": "public, max-age=86400", "X-Content-SHA256": p.hash });
  res.send(p.buf);
});

api.post("/demo/reset", handle(() => {
  seed();
  changed("reset");
  return { ok: true, version: db.version, events: db.events.length };
}));

api.use((req, res) => res.status(404).json({ error: `No API route for ${req.method} ${req.path}` }));
