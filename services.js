// Business rules for StripLoop. Routes and the seed script both call these
// functions, so demo data goes through exactly the same checks as live use.

import { db, logEvent, changed, find, nextId } from "./store.js";

export class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const TYPES = {
  PVC_ALU: { label: "PVC-alu blister", alShare: 0.15, pvcShare: 0.85, paperShare: 0, shred: true },
  ALU_ALU: { label: "Alu-alu strip", alShare: 0.65, pvcShare: 0.35, paperShare: 0, shred: true },
  CARTON: { label: "Cartons and leaflets", alShare: 0, pvcShare: 0, paperShare: 1, shred: true },
  VIAL: { label: "Glass vials (hospital)", alShare: 0, pvcShare: 0, paperShare: 0, shred: false },
};

export const SOURCES = {
  FACTORY: "Factory rejects",
  HOSPITAL: "Hospital",
  CHEMIST: "Chemist",
  CLINIC: "Clinic",
};

export const REASON_CODES = [
  { code: "MOISTURE", label: "Moisture or dust loss in handling" },
  { code: "SCALE", label: "Scale calibration difference (checked)" },
  { code: "CONTAM", label: "Contamination or loose tablets removed" },
  { code: "SEAL_WITNESS", label: "Seal replaced in front of a witness" },
  { code: "ENTRY", label: "Data entry error, corrected with proof" },
  { code: "ORIGIN_REG", label: "Origin point registered after check" },
];

const nowIso = () => new Date().toISOString();
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function actorName(id) {
  if (id === "HUB-TRUCK") return "StripLoop hub truck";
  const c = find.collector(id);
  if (c) return `${c.id} ${c.name}`;
  const a = find.agg(id);
  if (a) return `${a.id} ${a.name}`;
  const h = find.hub(id);
  if (h) return `${h.id} ${h.name}`;
  const cl = find.client(id);
  if (cl) return `${cl.id} ${cl.name}`;
  return id || "system";
}

function ruleOn(id) {
  const r = find.rule(id);
  return r ? r.enabled : true;
}

function mustBin(id) {
  const bin = find.bin(id);
  if (!bin) throw new AppError(404, `No bin found with code ${id}. Check the code on the bin label.`);
  return bin;
}

function touch(bin, ts) {
  bin.updatedAt = ts;
}

export function gapPct(a, b) {
  if (!a || a <= 0) return 0;
  return round((Math.abs(a - b) / a) * 100, 2);
}

// ---------- exceptions ----------

export function raiseException({ type, entity, entityId, detail, gapPct: gap = null, severity = "medium", ts, actor }) {
  const ex = {
    id: nextId("EXC", 3),
    type,
    entity,
    entityId,
    detail,
    gapPct: gap,
    severity,
    status: "open",
    raisedAt: ts || nowIso(),
    raisedBy: actor || "Reconciliation engine",
    resolution: null,
  };
  db.exceptions.unshift(ex);
  const ev = logEvent({ type: "EXCEPTION_RAISED", entity, entityId, actor: ex.raisedBy, note: detail, data: { exceptionId: ex.id, type, gapPct: gap }, ts: ex.raisedAt });
  ex.eventSeq = ev.seq;
  return ex;
}

export function resolveException({ id, reasonCode, note, by, ts }) {
  const ex = find.exception(id);
  if (!ex) throw new AppError(404, `Exception ${id} not found.`);
  if (ex.status !== "open") throw new AppError(409, `Exception ${id} is already resolved.`);
  const reason = REASON_CODES.find((r) => r.code === reasonCode);
  if (!reason) throw new AppError(422, "Choose a reason code. Adjustments without a reason are not allowed.");
  if (!note || note.trim().length < 5) throw new AppError(422, "Add a short note (at least 5 characters) explaining the check you did.");
  const at = ts || nowIso();
  const ev = logEvent({
    type: "ADJUSTMENT",
    entity: ex.entity,
    entityId: ex.entityId,
    actor: by || "Hub supervisor",
    note: `${reason.label}. ${note.trim()}`,
    data: { exceptionId: ex.id, reasonCode },
    refSeq: ex.eventSeq,
    ts: at,
  });
  ex.status = "resolved";
  ex.resolution = { reasonCode, reasonLabel: reason.label, note: note.trim(), by: by || "Hub supervisor", at, eventSeq: ev.seq };
  changed("exception");
  return ex;
}

// ---------- bins ----------

export function createBin({ pointId, type, clientId = null, branded = false, assignedTo, aggId = null, ts, seal, pickupId = null }) {
  const point = find.point(pointId);
  const at = ts || nowIso();
  const bin = {
    id: nextId("SL-BIN"),
    seal: seal || `S-${Math.floor(480000 + Math.random() * 19999)}`,
    type,
    source: point ? point.kind : "CHEMIST",
    pointId,
    clientId: clientId || (point && point.clientId) || "POOL",
    branded: !!branded,
    assignedTo,
    aggId: aggId || (point && point.aggId) || null,
    status: "Assigned",
    weights: { pickup: null, aggIntake: null, hubReceive: null },
    baleId: null,
    batchId: null,
    certId: null,
    pickupId,
    vial: type === "VIAL",
    cbmwtf: null,
    createdAt: at,
    updatedAt: at,
  };
  db.bins.push(bin);
  logEvent({ type: "BIN_ASSIGNED", entity: "bin", entityId: bin.id, actor: "StripLoop dispatch", seal: bin.seal, data: { pointId, assignedTo, type }, ts: at });
  changed("bin");
  return bin;
}

export function pickup({ binId, by, seal, weightKg, photoUrl, geo, ts }) {
  const bin = mustBin(binId);
  const at = ts || nowIso();
  if (bin.status !== "Assigned") throw new AppError(409, `Bin ${bin.id} is already ${bin.status.replace("_", " ").toLowerCase()}. Pick a bin that is still waiting at this stop.`);
  const w = Number(weightKg);
  if (!w || w <= 0 || w > 2000) throw new AppError(422, "Enter the weight in kg shown on the scale (between 0.1 and 2,000).");
  if (seal && seal.trim().toUpperCase() !== bin.seal.toUpperCase()) {
    if (ruleOn("R-SEAL")) {
      raiseException({ type: "SEAL_MISMATCH", entity: "bin", entityId: bin.id, detail: `Seal at pickup read ${seal}, label says ${bin.seal}.`, severity: "high", ts: at, actor: actorName(by) });
      changed("exception");
    }
    throw new AppError(422, `Seal number does not match. Label says ${bin.seal}. The bin has been flagged for the hub supervisor.`, { flagged: true });
  }
  const point = find.point(bin.pointId);
  if (ruleOn("R-ORIGIN") && (!point || !point.registered)) {
    raiseException({ type: "UNREGISTERED_ORIGIN", entity: "bin", entityId: bin.id, detail: `Picked up from ${point ? point.name : "an unknown point"}, which is not in the registry.`, severity: "medium", ts: at });
  }
  bin.status = "Picked_Up";
  bin.weights.pickup = round(w, 2);
  bin.pickedBy = by;
  bin.pickedAt = at;
  touch(bin, at);
  logEvent({ type: "PICKUP", entity: "bin", entityId: bin.id, actor: actorName(by), weightKg: bin.weights.pickup, seal: bin.seal, geo: geo || (point ? { lat: point.lat, lng: point.lng, approx: true } : null), photoUrl: photoUrl || null, ts: at });
  if (by && by.startsWith("COL-")) creditCollector(by, bin, at);
  changed("bin");
  return bin;
}

function creditCollector(collectorId, bin, at) {
  const c = find.collector(collectorId);
  if (!c) return;
  const r = db.settings.rates.collectorPerKg;
  const rate = r[bin.type] ?? 0;
  const amount = round(bin.weights.pickup * rate + db.settings.rates.stopIncentive, 0);
  c.ledger.unshift({ at, binId: bin.id, kg: bin.weights.pickup, type: bin.type, amount });
}

export function aggIntake({ binId, aggId, weightKg, ts }) {
  const bin = mustBin(binId);
  const at = ts || nowIso();
  if (bin.status !== "Picked_Up") throw new AppError(409, `Bin ${bin.id} is ${bin.status.replace("_", " ").toLowerCase()}, not waiting for intake.`);
  if (bin.vial) throw new AppError(409, "Glass vials do not go to aggregation points. They go to the licensed bio-medical waste facility.");
  const w = Number(weightKg);
  if (!w || w <= 0) throw new AppError(422, "Enter the intake scale weight in kg.");
  bin.status = "Aggregated";
  bin.aggId = aggId || bin.aggId;
  bin.weights.aggIntake = round(w, 2);
  touch(bin, at);
  const gap = gapPct(bin.weights.pickup, bin.weights.aggIntake);
  logEvent({ type: "AGG_INTAKE", entity: "bin", entityId: bin.id, actor: actorName(bin.aggId), weightKg: bin.weights.aggIntake, seal: bin.seal, data: { gapPct: gap, pickupKg: bin.weights.pickup }, ts: at });
  let exception = null;
  if (ruleOn("R-WEIGHT") && gap > db.settings.tolerancePct) {
    exception = raiseException({ type: "WEIGHT_GAP", entity: "bin", entityId: bin.id, detail: `Collector weighed ${bin.weights.pickup} kg, intake scale shows ${bin.weights.aggIntake} kg.`, gapPct: gap, severity: gap > 10 ? "high" : "medium", ts: at });
  }
  changed("bin");
  return { bin, gapPct: gap, exception };
}

// ---------- bales ----------

export function createBale({ aggId, binIds, stream, ts }) {
  const at = ts || nowIso();
  if (!binIds || binIds.length === 0) throw new AppError(422, "Select at least one bin to make a bale.");
  const bins = binIds.map(mustBin);
  for (const b of bins) {
    if (b.status !== "Aggregated" || b.baleId) throw new AppError(409, `Bin ${b.id} is not ready for baling.`);
  }
  const weight = round(bins.reduce((s, b) => s + (b.weights.aggIntake || 0), 0), 2);
  const bale = {
    id: nextId("BALE"),
    aggId,
    stream: stream || "Mixed blister and strip",
    binIds: bins.map((b) => b.id),
    seal: `B-${Math.floor(710000 + Math.random() * 9999)}`,
    weightKg: weight,
    status: "Sealed",
    createdAt: at,
    dispatch: null,
    received: null,
  };
  bins.forEach((b) => { b.baleId = bale.id; touch(b, at); });
  db.bales.unshift(bale);
  logEvent({ type: "BALED", entity: "bale", entityId: bale.id, actor: actorName(aggId), weightKg: weight, seal: bale.seal, data: { binIds: bale.binIds, stream: bale.stream }, ts: at });
  changed("bale");
  return bale;
}

export function dispatchBale({ baleId, vehicle, driver, ts }) {
  const bale = find.bale(baleId);
  if (!bale) throw new AppError(404, `No bale ${baleId}.`);
  if (bale.status !== "Sealed") throw new AppError(409, `Bale ${bale.id} is already ${bale.status.toLowerCase()}.`);
  const at = ts || nowIso();
  bale.status = "Dispatched";
  bale.dispatch = { vehicle: vehicle || "GJ-01-XX-0000", driver: driver || "Not recorded", at, noteNo: nextId("DN", 4) };
  logEvent({ type: "DISPATCH", entity: "bale", entityId: bale.id, actor: actorName(bale.aggId), seal: bale.seal, weightKg: bale.weightKg, data: bale.dispatch, ts: at });
  changed("bale");
  return bale;
}

export function hubReceiveBale({ baleId, sealScanned, weightKg, hubId = "HUB-AMD-01", ts }) {
  const bale = find.bale(baleId);
  if (!bale) throw new AppError(404, `No bale ${baleId}.`);
  if (bale.status !== "Dispatched") throw new AppError(409, `Bale ${bale.id} is ${bale.status.toLowerCase()}, not in transit.`);
  const at = ts || nowIso();
  const w = Number(weightKg);
  if (!w || w <= 0) throw new AppError(422, "Enter the weight on the hub weighbridge.");
  const sealOk = (sealScanned || "").trim().toUpperCase() === bale.seal.toUpperCase();
  if (!sealOk && ruleOn("R-SEAL")) {
    raiseException({ type: "SEAL_MISMATCH", entity: "bale", entityId: bale.id, detail: `Seal scanned as ${sealScanned || "blank"}, dispatch note says ${bale.seal}. Bale held at receiving.`, severity: "high", ts: at, actor: actorName(hubId) });
    bale.status = "Held";
    logEvent({ type: "HUB_HOLD", entity: "bale", entityId: bale.id, actor: actorName(hubId), seal: sealScanned || null, weightKg: w, note: "Seal does not match. Held for supervisor.", ts: at });
    changed("bale");
    return { bale, sealOk: false, gapPct: null };
  }
  const gap = gapPct(bale.weightKg, w);
  bale.status = "Received";
  bale.received = { at, weightKg: round(w, 2), sealOk: true, gapPct: gap, hubId };
  const factor = bale.weightKg ? w / bale.weightKg : 1;
  for (const id of bale.binIds) {
    const b = find.bin(id);
    b.status = "Hub_Received";
    b.weights.hubReceive = round((b.weights.aggIntake || 0) * factor, 2);
    touch(b, at);
  }
  logEvent({ type: "HUB_RECEIVE", entity: "bale", entityId: bale.id, actor: actorName(hubId), seal: bale.seal, weightKg: round(w, 2), data: { gapPct: gap, binIds: bale.binIds }, ts: at });
  let exception = null;
  if (ruleOn("R-WEIGHT") && gap > db.settings.tolerancePct) {
    exception = raiseException({ type: "WEIGHT_GAP", entity: "bale", entityId: bale.id, detail: `Bale left aggregation at ${bale.weightKg} kg, arrived at ${round(w, 2)} kg.`, gapPct: gap, severity: gap > 10 ? "high" : "medium", ts: at });
  }
  changed("bale");
  return { bale, sealOk: true, gapPct: gap, exception };
}

export function releaseHeldBale({ baleId, sealScanned, weightKg, ts }) {
  const bale = find.bale(baleId);
  if (!bale || bale.status !== "Held") throw new AppError(409, "Only held bales can be released.");
  bale.status = "Dispatched";
  return hubReceiveBale({ baleId, sealScanned: sealScanned || bale.seal, weightKg, ts });
}

export function hubReceiveBin({ binId, sealScanned, weightKg, hubId = "HUB-AMD-01", ts }) {
  const bin = mustBin(binId);
  const at = ts || nowIso();
  if (bin.status !== "Picked_Up") throw new AppError(409, `Bin ${bin.id} is ${bin.status.replace("_", " ").toLowerCase()}.`);
  if (bin.vial) throw new AppError(409, "Glass vials are never received at the hub. Use the vial protocol.");
  const w = Number(weightKg);
  if (!w || w <= 0) throw new AppError(422, "Enter the weighbridge reading in kg.");
  if ((sealScanned || "").trim().toUpperCase() !== bin.seal.toUpperCase() && ruleOn("R-SEAL")) {
    raiseException({ type: "SEAL_MISMATCH", entity: "bin", entityId: bin.id, detail: `Direct factory bin arrived with seal ${sealScanned || "blank"}, expected ${bin.seal}.`, severity: "high", ts: at, actor: actorName(hubId) });
    changed("exception");
    throw new AppError(422, `Seal does not match (expected ${bin.seal}). Bin held and flagged.`, { flagged: true });
  }
  bin.status = "Hub_Received";
  bin.weights.hubReceive = round(w, 2);
  touch(bin, at);
  const gap = gapPct(bin.weights.pickup, bin.weights.hubReceive);
  logEvent({ type: "HUB_RECEIVE", entity: "bin", entityId: bin.id, actor: actorName(hubId), seal: bin.seal, weightKg: bin.weights.hubReceive, data: { gapPct: gap }, ts: at });
  let exception = null;
  if (ruleOn("R-WEIGHT") && gap > db.settings.tolerancePct) {
    exception = raiseException({ type: "WEIGHT_GAP", entity: "bin", entityId: bin.id, detail: `Factory weighed ${bin.weights.pickup} kg, hub weighbridge shows ${bin.weights.hubReceive} kg.`, gapPct: gap, ts: at });
  }
  changed("bin");
  return { bin, gapPct: gap, exception };
}

// ---------- destruction and certificates ----------

export function destroyBatch({ binIds, alKg, pvcKg, paperKg = 0, residueKg = 0, cctvRef, operator = "Hub shift lead", ts, hubId = "HUB-AMD-01" }) {
  const at = ts || nowIso();
  if (!binIds || binIds.length === 0) throw new AppError(422, "Select the received bins to shred in this batch.");
  const bins = binIds.map(mustBin);
  for (const b of bins) {
    if (b.status !== "Hub_Received") throw new AppError(409, `Bin ${b.id} has not been received at the hub yet.`);
  }
  const inputKg = round(bins.reduce((s, b) => s + (b.weights.hubReceive || 0), 0), 2);
  const outputKg = round(Number(alKg || 0) + Number(pvcKg || 0) + Number(paperKg || 0) + Number(residueKg || 0), 2);
  const balanceGap = gapPct(inputKg, outputKg);
  const batch = {
    id: nextId("BATCH", 3),
    hubId,
    binIds: bins.map((b) => b.id),
    inputKg,
    output: { alKg: round(Number(alKg || 0), 2), pvcKg: round(Number(pvcKg || 0), 2), paperKg: round(Number(paperKg || 0), 2), residueKg: round(Number(residueKg || 0), 2) },
    massBalanceGapPct: balanceGap,
    cctvRef: cctvRef || `CAM2-${at.slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`,
    operator,
    at,
    certIds: [],
  };
  db.batches.unshift(batch);
  for (const b of bins) {
    b.status = "Destroyed";
    b.batchId = batch.id;
    touch(b, at);
  }
  logEvent({ type: "DESTROYED", entity: "batch", entityId: batch.id, actor: `${actorName(hubId)} (${operator})`, weightKg: inputKg, data: { binIds: batch.binIds, output: batch.output, cctvRef: batch.cctvRef, massBalanceGapPct: balanceGap }, ts: at });
  if (ruleOn("R-MASS") && balanceGap > db.settings.massBalancePct) {
    raiseException({ type: "MASS_BALANCE", entity: "batch", entityId: batch.id, detail: `Input ${inputKg} kg, outputs add up to ${outputKg} kg.`, gapPct: balanceGap, severity: "medium", ts: at });
  }
  const certs = issueCertificates(batch, bins, at);
  batch.certIds = certs.map((c) => c.id);
  changed("batch");
  return { batch, certificates: certs };
}

function allocate(bins, batch) {
  // Share recovered material across bins by their expected material content.
  const exp = { al: 0, pvc: 0, paper: 0 };
  for (const b of bins) {
    const t = TYPES[b.type];
    exp.al += b.weights.hubReceive * t.alShare;
    exp.pvc += b.weights.hubReceive * t.pvcShare;
    exp.paper += b.weights.hubReceive * t.paperShare;
  }
  const out = new Map();
  for (const b of bins) {
    const t = TYPES[b.type];
    out.set(b.id, {
      al: exp.al ? (b.weights.hubReceive * t.alShare / exp.al) * batch.output.alKg : 0,
      pvc: exp.pvc ? (b.weights.hubReceive * t.pvcShare / exp.pvc) * batch.output.pvcKg : 0,
      paper: exp.paper ? (b.weights.hubReceive * t.paperShare / exp.paper) * batch.output.paperKg : 0,
    });
  }
  return out;
}

function issueCertificates(batch, bins, at) {
  const shares = allocate(bins, batch);
  const byClient = new Map();
  for (const b of bins) {
    if (!byClient.has(b.clientId)) byClient.set(b.clientId, []);
    byClient.get(b.clientId).push(b);
  }
  const certs = [];
  for (const [clientId, list] of byClient) {
    const byType = {};
    let al = 0, pvc = 0, paper = 0, co2 = 0, kg = 0;
    for (const b of list) {
      byType[b.type] = round((byType[b.type] || 0) + b.weights.hubReceive, 2);
      const s = shares.get(b.id);
      al += s.al; pvc += s.pvc; paper += s.paper;
      kg += b.weights.hubReceive;
      co2 += b.weights.hubReceive * (db.settings.co2Factors[b.type] || 0);
    }
    certs.push(makeCertificate({
      clientId, binIds: list.map((b) => b.id), batchIds: [batch.id], byType,
      destroyedKg: round(kg, 2), recovered: { alKg: round(al, 2), pvcKg: round(pvc, 2), paperKg: round(paper, 2) },
      co2Kg: round(co2, 1), method: "Shredded on camera at StripLoop Hub 1, then separated into aluminium and plastic",
      cctvRef: batch.cctvRef, branded: list.some((b) => b.branded), at,
    }));
    list.forEach((b) => { b.certId = certs[certs.length - 1].id; });
  }
  return certs;
}

function makeCertificate(c) {
  const client = find.client(c.clientId);
  const cert = {
    id: nextId("CERT-2026", 4),
    clientId: c.clientId,
    clientName: client ? client.name : "Consumer collection pool",
    issuedAt: c.at,
    binIds: c.binIds,
    batchIds: c.batchIds || [],
    byType: c.byType,
    destroyedKg: c.destroyedKg,
    recovered: c.recovered,
    co2Kg: c.co2Kg,
    method: c.method,
    cctvRef: c.cctvRef || null,
    branded: !!c.branded,
    refs: c.refs || [
      "Schedule M (GMP): record of destruction of rejected printed packaging material",
      "BRSR Principle 6: waste recovered through recycling",
      "Plastic Waste Management Rules: EPR Category III (multilayer) recycling",
    ],
    status: db.settings.autoIssueCertificates ? "Valid" : "Pending approval",
    chainHead: null,
  };
  const ev = logEvent({ type: "CERT_ISSUED", entity: "certificate", entityId: cert.id, actor: "StripLoop certification desk", weightKg: cert.destroyedKg, data: { clientId: cert.clientId, binIds: cert.binIds, status: cert.status }, ts: c.at });
  cert.chainHead = ev.hash;
  cert.eventSeq = ev.seq;
  db.certificates.unshift(cert);
  return cert;
}

export function approveCertificate({ id, by = "StripLoop admin" }) {
  const cert = find.cert(id);
  if (!cert) throw new AppError(404, `Certificate ${id} not found.`);
  if (cert.status !== "Pending approval") throw new AppError(409, `Certificate ${id} is ${cert.status.toLowerCase()}.`);
  cert.status = "Valid";
  logEvent({ type: "CERT_APPROVED", entity: "certificate", entityId: id, actor: by });
  changed("certificate");
  return cert;
}

// ---------- vials (Bio-Medical Waste Rules 2016) ----------

export function vialHandover({ binId, facility, manifestNo, ts }) {
  const bin = mustBin(binId);
  if (!bin.vial) throw new AppError(409, "This protocol is only for glass vials.");
  if (bin.status !== "Picked_Up") throw new AppError(409, `Vial bin ${bin.id} must be picked up from the hospital first.`);
  const at = ts || nowIso();
  bin.status = "Handed_To_CBMWTF";
  bin.cbmwtf = { facility: facility || "Licensed CBMWTF, Odhav", manifestNo: manifestNo || nextId("BMW-MAN", 5), handedAt: at, confirmedAt: null, facilityCertNo: null };
  touch(bin, at);
  logEvent({ type: "CBMWTF_HANDOVER", entity: "bin", entityId: bin.id, actor: "StripLoop vial custody officer", seal: bin.seal, weightKg: bin.weights.pickup, data: bin.cbmwtf, note: "Handed over sealed. No shredding or opening at StripLoop.", ts: at });
  changed("bin");
  return bin;
}

export function vialConfirm({ binId, facilityCertNo, ts }) {
  const bin = mustBin(binId);
  if (bin.status !== "Handed_To_CBMWTF") throw new AppError(409, "Hand the vials over to the licensed facility first.");
  const at = ts || nowIso();
  bin.status = "Incinerated";
  bin.cbmwtf.confirmedAt = at;
  bin.cbmwtf.facilityCertNo = facilityCertNo || nextId("CBMWTF-INC", 5);
  touch(bin, at);
  logEvent({ type: "INCINERATION_CONFIRMED", entity: "bin", entityId: bin.id, actor: bin.cbmwtf.facility, weightKg: bin.weights.pickup, data: { facilityCertNo: bin.cbmwtf.facilityCertNo }, ts: at });
  const cert = makeCertificate({
    clientId: bin.clientId, binIds: [bin.id], byType: { VIAL: bin.weights.pickup }, destroyedKg: bin.weights.pickup,
    recovered: { alKg: 0, pvcKg: 0, paperKg: 0 }, co2Kg: 0,
    method: `Incinerated at ${bin.cbmwtf.facility} (facility certificate ${bin.cbmwtf.facilityCertNo}). StripLoop held sealed custody from ward to facility.`,
    refs: ["Bio-Medical Waste Management Rules 2016: cytotoxic and pharmaceutical waste to licensed CBMWTF", "Hospital anti-counterfeit custody record"],
    branded: true, at,
  });
  bin.certId = cert.id;
  changed("bin");
  return { bin, certificate: cert };
}

// ---------- rules ----------

export function attemptResale({ binId, by = "Hub sales desk" }) {
  const bin = mustBin(binId);
  if (bin.branded || bin.source === "FACTORY" || bin.vial) {
    logEvent({ type: "RULE_BLOCKED", entity: "bin", entityId: bin.id, actor: by, note: "Branded packs never go to resale. Request blocked." });
    raiseException({ type: "BRANDED_RESALE_ATTEMPT", entity: "bin", entityId: bin.id, detail: `${by} tried to sell ${bin.id} as is. Blocked by rule.`, severity: "high" });
    changed("rule");
    throw new AppError(403, "Blocked: branded packs never go to resale. They can only leave as shredded aluminium or plastic. This attempt is now in the exceptions queue.", { blocked: true });
  }
  throw new AppError(403, "Blocked: only shredded and separated material can be sold.", { blocked: true });
}

// ---------- client pickups ----------

export function createPickupRequest({ clientId, type, estKg, date, slot, notes, ts }) {
  const client = find.client(clientId);
  if (!client) throw new AppError(404, "Unknown client.");
  if (!TYPES[type]) throw new AppError(422, "Choose a packaging type.");
  const kg = Number(estKg);
  if (!kg || kg <= 0) throw new AppError(422, "Enter an estimated weight in kg.");
  if (type === "VIAL" && client.kind !== "HOSPITAL") throw new AppError(422, "Glass vial pickups are only for hospital clients.");
  const at = ts || nowIso();
  const req = {
    id: nextId("PU", 4),
    clientId,
    type,
    estKg: kg,
    date: date || at.slice(0, 10),
    slot: slot || "10:00 to 12:00",
    notes: notes || "",
    status: "Scheduled",
    createdAt: at,
    binIds: [],
  };
  const point = db.points.find((p) => p.clientId === clientId);
  const assignedTo = client.kind === "FACTORY" ? "HUB-TRUCK" : (point && point.collectorId) || "COL-02";
  const binCount = Math.max(1, Math.min(4, Math.ceil(kg / (client.kind === "FACTORY" ? 400 : 25))));
  for (let i = 0; i < binCount; i++) {
    const bin = createBin({ pointId: point ? point.id : null, type, clientId, branded: client.kind === "FACTORY" || type === "VIAL", assignedTo, ts: at, pickupId: req.id });
    req.binIds.push(bin.id);
  }
  db.pickups.unshift(req);
  logEvent({ type: "PICKUP_REQUESTED", entity: "pickup", entityId: req.id, actor: actorName(clientId), data: { type, estKg: kg, date: req.date, slot: req.slot, binIds: req.binIds }, ts: at });
  changed("pickup");
  return req;
}

// ---------- settings ----------

export function updateSettings(patch, by = "StripLoop admin") {
  const s = db.settings;
  if (patch.tolerancePct !== undefined) {
    const v = Number(patch.tolerancePct);
    if (!(v >= 0.5 && v <= 15)) throw new AppError(422, "Tolerance must be between 0.5% and 15%.");
    s.tolerancePct = v;
    const r = find.rule("R-WEIGHT");
    if (r) r.param = v;
  }
  if (patch.massBalancePct !== undefined) {
    const v = Number(patch.massBalancePct);
    if (!(v >= 0.5 && v <= 15)) throw new AppError(422, "Mass balance limit must be between 0.5% and 15%.");
    s.massBalancePct = v;
    const r = find.rule("R-MASS");
    if (r) r.param = v;
  }
  if (patch.autoIssueCertificates !== undefined) s.autoIssueCertificates = !!patch.autoIssueCertificates;
  if (patch.rates) {
    for (const [k, v] of Object.entries(patch.rates)) {
      if (k === "collectorPerKg" && typeof v === "object") {
        for (const [t, n] of Object.entries(v)) s.rates.collectorPerKg[t] = Math.max(0, Number(n) || 0);
      } else if (k in s.rates) {
        s.rates[k] = Math.max(0, Number(v) || 0);
      }
    }
  }
  logEvent({ type: "SETTINGS_CHANGED", entity: "settings", entityId: "network", actor: by, data: patch });
  changed("settings");
  return s;
}

export function toggleRule({ id, enabled, by = "StripLoop admin" }) {
  const r = find.rule(id);
  if (!r) throw new AppError(404, "Rule not found.");
  if (r.locked && !enabled) throw new AppError(403, `"${r.name}" is a locked rule and cannot be switched off.`);
  r.enabled = !!enabled;
  logEvent({ type: "RULE_CHANGED", entity: "rule", entityId: id, actor: by, data: { enabled: r.enabled } });
  changed("rule");
  return r;
}

// ---------- finance ----------

export function emi(principal, annualRatePct, months) {
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const f = (1 + r) ** months;
  return (principal * r * f) / (f - 1);
}

export function outstandingAfter(principal, annualRatePct, months, paid) {
  const r = annualRatePct / 12 / 100;
  const e = emi(principal, annualRatePct, months);
  const f = (1 + r) ** paid;
  return Math.max(0, principal * f - (e * (f - 1)) / r);
}

export function hubProfit({ tonnes, factoryShare = 0.8, marginPerKg, feePerKg, opex }) {
  const s = db.settings.rates;
  const margin = marginPerKg ?? s.salePricePerKg - s.buyPricePerKg;
  const fee = feePerKg ?? s.destructionFeePerKg;
  const op = opex ?? s.hubOpexMonthly;
  const revenueMargin = tonnes * 1000 * margin;
  const fees = tonnes * factoryShare * 1000 * fee;
  return { revenueMargin, fees, opex: op, profit: revenueMargin + fees - op };
}

export function stressTest({ tonnes = 25, marginPerKg, feePerKg, factoryShare = 0.8, loanAmount, ratePct = 18, months = 60 }) {
  const hubLoan = db.loans.find((l) => l.tier === "HUB");
  const P = loanAmount ?? (hubLoan ? hubLoan.principal : 3600000);
  const e = emi(P, ratePct, months);
  const p = hubProfit({ tonnes, factoryShare, marginPerKg, feePerKg });
  const dscr = p.profit / e;
  const fee = feePerKg ?? db.settings.rates.destructionFeePerKg;
  const breakevenMargin = (e + p.opex - tonnes * factoryShare * 1000 * fee) / (tonnes * 1000);
  const m = marginPerKg ?? db.settings.rates.salePricePerKg - db.settings.rates.buyPricePerKg;
  const breakevenTonnes = (e + p.opex) / (1000 * (m + factoryShare * fee));
  return {
    inputs: { tonnes, marginPerKg: m, feePerKg: fee, factoryShare, loanAmount: P, ratePct, months },
    emi: Math.round(e),
    profit: Math.round(p.profit),
    revenueMargin: Math.round(p.revenueMargin),
    fees: Math.round(p.fees),
    opex: p.opex,
    dscr: round(dscr, 2),
    breakevenMarginPerKg: round(breakevenMargin, 1),
    breakevenTonnes: round(breakevenTonnes, 1),
    verdict: dscr >= 1.5 ? "Comfortable" : dscr >= 1.0 ? "Tight" : "Cannot repay",
  };
}

export function creditView() {
  const today = new Date();
  const loans = db.loans.map((l) => {
    const e = emi(l.principal, l.ratePct, l.tenureMonths);
    const out = outstandingAfter(l.principal, l.ratePct, l.tenureMonths, l.paidInstallments);
    return { ...l, emi: Math.round(e), outstanding: Math.round(out), repaidPct: round((1 - out / l.principal) * 100, 1) };
  });
  const tiers = ["HUB", "AGG", "COLLECTOR"].map((tier) => {
    const list = loans.filter((l) => l.tier === tier);
    return {
      tier,
      label: tier === "HUB" ? "Recovery hub (women-led MSME)" : tier === "AGG" ? "Aggregation point MSMEs" : "Women collectors (JLG microloans)",
      lender: tier === "COLLECTOR" ? "Satin Creditcare" : "Satin Finserv",
      count: list.length,
      sanctioned: list.reduce((s, l) => s + l.principal, 0),
      outstanding: list.reduce((s, l) => s + l.outstanding, 0),
      overdue: list.filter((l) => l.dpd > 0).length,
    };
  });
  const hubLoan = loans.find((l) => l.tier === "HUB");
  const hubEmi = hubLoan ? hubLoan.emi : 0;
  const series = db.hubSeries.map((m) => {
    const p = hubProfit({ tonnes: m.tonnes, factoryShare: m.factoryShare });
    const debt = m.loanLive ? hubEmi : 0;
    return { ...m, cashFlow: Math.round(p.profit), debtService: debt, dscr: debt ? round(p.profit / debt, 2) : null };
  });
  const latest = [...series].reverse().find((m) => m.loanLive) || series[series.length - 1];
  const handovers = db.events.filter((e) => ["PICKUP", "HUB_RECEIVE", "HUB_HOLD", "DISPATCH"].includes(e.type)).length;
  const sealIssues = db.exceptions.filter((e) => e.type === "SEAL_MISMATCH").length;
  const sealIntegrity = handovers ? round((1 - sealIssues / handovers) * 100, 1) : 100;
  const covenants = [
    { name: "Hub throughput at least 18 t a month", value: `${latest.tonnes} t`, ok: latest.tonnes >= 18 },
    { name: "Repayment cover (DSCR) at least 1.5x", value: `${latest.dscr}x`, ok: latest.dscr >= 1.5 },
    { name: "Seal integrity at least 98%", value: `${sealIntegrity}%`, ok: sealIntegrity >= 98 },
    { name: "Every shredded kg covered by a certificate", value: `${db.batches.filter((b) => b.certIds.length).length}/${db.batches.length} batches`, ok: db.batches.every((b) => b.certIds.length > 0) },
  ];
  const flags = [];
  for (const l of loans.filter((l) => l.dpd > 0)) {
    flags.push({ level: l.dpd > 30 ? "high" : "medium", title: `${l.borrower}: ${l.dpd} days past due`, detail: `EMI of Rs ${l.emi.toLocaleString("en-IN")} missed. ${l.note || "Field officer visit scheduled."}`, ref: l.id });
  }
  for (const a of db.aggPoints) {
    const n = db.exceptions.filter((e) => e.type === "WEIGHT_GAP" && e.entity === "bin" && find.bin(e.entityId)?.aggId === a.id).length;
    if (n >= 2) flags.push({ level: "medium", title: `${a.name}: ${n} weight gaps this cycle`, detail: "Repeated gaps at intake. Check the scale and collector handovers before the next top-up loan.", ref: a.id });
  }
  const openHigh = db.exceptions.filter((e) => e.status === "open" && e.severity === "high").length;
  if (openHigh) flags.push({ level: "high", title: `${openHigh} high-severity custody exceptions open`, detail: "Seal or resale issues. Certificates for affected bins stay on hold until resolved.", ref: "exceptions" });
  if (latest.tonnes < 18) flags.push({ level: "high", title: "Hub below 18 t covenant", detail: "Throughput under the level that keeps repayment cover safe.", ref: "HUB-AMD-01" });
  const verifiedKg = db.certificates.reduce((s, c) => s + c.destroyedKg, 0);
  return {
    tiers,
    loans,
    totals: {
      sanctioned: loans.reduce((s, l) => s + l.principal, 0),
      outstanding: loans.reduce((s, l) => s + l.outstanding, 0),
      borrowers: loans.length,
      womenBorrowers: loans.filter((l) => l.womenLed).length,
      onTimePct: round((loans.filter((l) => l.dpd === 0).length / loans.length) * 100, 1),
      par30Pct: round((loans.filter((l) => l.dpd > 30).reduce((s, l) => s + l.outstanding, 0) / Math.max(1, loans.reduce((s, l) => s + l.outstanding, 0))) * 100, 2),
    },
    hub: { latest, series, emi: hubEmi, loan: hubLoan },
    covenants,
    flags,
    greenClaim: {
      verifiedKg: round(verifiedKg, 1),
      certificates: db.certificates.length,
      co2Kg: round(db.certificates.reduce((s, c) => s + c.co2Kg, 0), 1),
      rupeesPerVerifiedKg: verifiedKg ? round((hubLoan ? hubLoan.principal : 0) / (series.filter((m) => m.loanLive).reduce((s, m) => s + m.tonnes * 1000, 0) || 1), 2) : 0,
    },
    asOf: today.toISOString(),
  };
}

export function impactView() {
  const destroyedBins = db.bins.filter((b) => b.status === "Destroyed" || b.status === "Incinerated");
  const ledgerKg = destroyedBins.reduce((s, b) => s + (b.weights.hubReceive || b.weights.pickup || 0), 0);
  const ledgerCo2 = db.certificates.reduce((s, c) => s + c.co2Kg, 0);
  const historyT = db.hubSeries.reduce((s, m) => s + m.tonnes, 0);
  const historyCo2T = db.hubSeries.reduce((s, m) => s + m.tonnes * (m.factoryShare * 3.0 + (1 - m.factoryShare) * 2.4), 0);
  const recovered = db.certificates.reduce((a, c) => ({ al: a.al + c.recovered.alKg, pvc: a.pvc + c.recovered.pvcKg, paper: a.paper + c.recovered.paperKg }), { al: 0, pvc: 0, paper: 0 });
  const incomes = db.collectors.map((c) => c.monthlyIncome);
  const byType = {};
  for (const b of destroyedBins) byType[b.type] = (byType[b.type] || 0) + (b.weights.hubReceive || b.weights.pickup || 0);
  const credit = creditView();
  return {
    history: db.hubSeries.map((m) => ({ month: m.month, tonnes: m.tonnes, co2T: round(m.tonnes * (m.factoryShare * 3.0 + (1 - m.factoryShare) * 2.4), 1) })),
    totals: {
      tonnesRecovered: round(historyT + ledgerKg / 1000, 1),
      co2T: round(historyCo2T + ledgerCo2 / 1000, 1),
      ledgerKg: round(ledgerKg, 1),
      ledgerCo2Kg: round(ledgerCo2, 1),
      brandedDestroyedKg: round(destroyedBins.filter((b) => b.branded).reduce((s, b) => s + (b.weights.hubReceive || b.weights.pickup || 0), 0), 1),
      recovered: { alKg: round(recovered.al, 1), pvcKg: round(recovered.pvc, 1), paperKg: round(recovered.paper, 1) },
      certificates: db.certificates.length,
      womenCollectors: db.collectors.length,
      womenSalaried: db.hubs[0]?.womenStaff || 0,
      avgCollectorIncome: Math.round(incomes.reduce((s, n) => s + n, 0) / Math.max(1, incomes.length)),
      msmesFinanced: db.loans.filter((l) => l.tier !== "COLLECTOR").length,
      womenLedMsmes: db.loans.filter((l) => l.tier !== "COLLECTOR" && l.womenLed).length,
      microEntrepreneurs: db.loans.length,
      loansSanctioned: credit.totals.sanctioned,
      onTimePct: credit.totals.onTimePct,
    },
    byType: Object.entries(byType).map(([type, kg]) => ({ type, label: TYPES[type].label, kg: round(kg, 1) })),
    factors: db.settings.co2Factors,
    collectorIncome: db.collectors.map((c) => ({ name: c.name.split(" ")[0], income: c.monthlyIncome })),
  };
}
