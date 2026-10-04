// In-memory data store with a tamper-evident (hash-chained) event log.
// Every change to a bin, bale, batch, certificate or exception is written as an
// event. Events are append-only: they are never edited or deleted. Corrections
// are made by adding an ADJUSTMENT event that points to the original.

import crypto from "node:crypto";
import { EventEmitter } from "node:events";

export const bus = new EventEmitter();
bus.setMaxListeners(200);

export const GENESIS = "0".repeat(64);

export const db = {
  version: 0,
  settings: {},
  rules: [],
  hubs: [],
  aggPoints: [],
  collectors: [],
  points: [],
  clients: [],
  bins: [],
  bales: [],
  batches: [],
  certificates: [],
  exceptions: [],
  pickups: [],
  loans: [],
  payouts: [],
  hubSeries: [],
  events: [],
  photos: new Map(),
  counters: {},
};

export function clearDb() {
  for (const k of Object.keys(db)) {
    if (Array.isArray(db[k])) db[k] = [];
  }
  db.photos = new Map();
  db.counters = {};
  db.settings = {};
  db.version = 0;
}

export function nextId(prefix, width = 4) {
  db.counters[prefix] = (db.counters[prefix] || 0) + 1;
  return `${prefix}-${String(db.counters[prefix]).padStart(width, "0")}`;
}

export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function eventPayload(ev) {
  // Fixed field order so the hash can be recomputed exactly.
  return JSON.stringify([
    ev.seq, ev.ts, ev.type, ev.entity, ev.entityId, ev.actor,
    ev.weightKg ?? null, ev.seal ?? null, ev.geo ?? null, ev.photoUrl ?? null,
    ev.note ?? null, ev.data ?? null, ev.refSeq ?? null,
  ]);
}

const snapshot = (v) => (v === null || v === undefined ? null : JSON.parse(JSON.stringify(v)));

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

export function logEvent(input) {
  const prev = db.events[db.events.length - 1];
  const ev = {
    seq: db.events.length + 1,
    ts: input.ts || new Date().toISOString(),
    type: input.type,
    entity: input.entity,
    entityId: input.entityId,
    actor: input.actor || "system",
    weightKg: input.weightKg ?? null,
    seal: input.seal ?? null,
    geo: snapshot(input.geo),
    photoUrl: input.photoUrl ?? null,
    note: input.note ?? null,
    data: snapshot(input.data),
    refSeq: input.refSeq ?? null,
    prevHash: prev ? prev.hash : GENESIS,
  };
  ev.hash = sha256(ev.prevHash + eventPayload(ev));
  db.events.push(deepFreeze(ev));
  return ev;
}

// Used once after loading demo data, which is created out of time order.
// Sorts events by time, renumbers them and rebuilds every hash.
export function rechainByTime() {
  const sorted = db.events.map((e) => JSON.parse(JSON.stringify(e))).sort((a, b) => a.ts.localeCompare(b.ts) || a.seq - b.seq);
  const map = new Map();
  sorted.forEach((e, i) => map.set(e.seq, i + 1));
  let prevHash = GENESIS;
  db.events = sorted.map((e) => {
    const ev = { ...e, seq: map.get(e.seq), refSeq: e.refSeq ? map.get(e.refSeq) : null, prevHash };
    delete ev.hash;
    ev.hash = sha256(ev.prevHash + eventPayload(ev));
    prevHash = ev.hash;
    return deepFreeze(ev);
  });
  return map;
}

export function verifyChain() {
  let prevHash = GENESIS;
  for (const ev of db.events) {
    if (ev.prevHash !== prevHash) {
      return { ok: false, brokenAt: ev.seq, reason: "Previous hash does not match", checked: ev.seq - 1 };
    }
    const recomputed = sha256(ev.prevHash + eventPayload(ev));
    if (recomputed !== ev.hash) {
      return { ok: false, brokenAt: ev.seq, reason: "Event content was changed after it was written", checked: ev.seq - 1 };
    }
    prevHash = ev.hash;
  }
  return { ok: true, checked: db.events.length, head: prevHash };
}

export function changed(kind = "update") {
  db.version += 1;
  bus.emit("change", { version: db.version, kind });
}

export const find = {
  bin: (id) => db.bins.find((b) => b.id === id),
  bale: (id) => db.bales.find((b) => b.id === id),
  batch: (id) => db.batches.find((b) => b.id === id),
  point: (id) => db.points.find((p) => p.id === id),
  collector: (id) => db.collectors.find((c) => c.id === id),
  agg: (id) => db.aggPoints.find((a) => a.id === id),
  client: (id) => db.clients.find((c) => c.id === id),
  cert: (id) => db.certificates.find((c) => c.id === id),
  exception: (id) => db.exceptions.find((e) => e.id === id),
  hub: (id) => db.hubs.find((h) => h.id === id),
  rule: (id) => db.rules.find((r) => r.id === id),
};
