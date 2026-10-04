// Demo data for the Ahmedabad pilot. All names of people, shops, hospitals and
// companies are fictional. Data is created through the same business rules as
// live actions, so the event log and hash chain are real.

import { db, clearDb, logEvent, rechainByTime } from "./store.js";
import * as S from "./services.js";

const AMD = { lat: 23.0225, lng: 72.5714 };

// Demo times are set in Indian Standard Time (UTC+5:30), whatever the server's
// own time zone is, and are never later than now.
function at(daysAgo, hour, minute = 0) {
  const now = Date.now();
  const ist = new Date(now + 330 * 60000);
  ist.setUTCDate(ist.getUTCDate() - daysAgo);
  ist.setUTCHours(hour, minute, Math.floor(Math.random() * 50), 0);
  let t = ist.getTime() - 330 * 60000;
  if (t > now) t = now - (hour * 60 + minute) * 1000 - 60000;
  return new Date(t).toISOString();
}

function monthLabel(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
}

function outputsFor(binIds, lossPct = 0.6) {
  let al = 0, pvc = 0, paper = 0, input = 0;
  for (const id of binIds) {
    const b = db.bins.find((x) => x.id === id);
    const t = S.TYPES[b.type];
    const w = b.weights.hubReceive;
    input += w;
    al += w * t.alShare;
    pvc += w * t.pvcShare;
    paper += w * t.paperShare;
  }
  const keep = 1 - lossPct / 100;
  return {
    alKg: +(al * keep * 0.985).toFixed(2),
    pvcKg: +(pvc * keep * 0.99).toFixed(2),
    paperKg: +(paper * keep).toFixed(2),
    residueKg: +(input * 0.008).toFixed(2),
  };
}

export function seed() {
  clearDb();

  db.settings = {
    tolerancePct: 2,
    massBalancePct: 3,
    autoIssueCertificates: true,
    rates: {
      collectorPerKg: { PVC_ALU: 20, ALU_ALU: 45, CARTON: 8, VIAL: 30 },
      stopIncentive: 15,
      destructionFeePerKg: 6,
      oncologyMonthlyFee: 10000,
      salePricePerKg: 45,
      buyPricePerKg: 25,
      alPowderPerKg: 150,
      pvcPowderPerKg: 55,
      paperPerKg: 10,
      hubOpexMonthly: 290000,
      collectionCostBenchmark: 20,
    },
    co2Factors: { PVC_ALU: 3.0, ALU_ALU: 12.0, CARTON: 0, VIAL: 0 },
  };

  db.rules = [
    { id: "R-WEIGHT", name: "Weight gap between two handovers is above tolerance", param: 2, unit: "%", enabled: true, locked: false, action: "Flag to exceptions queue" },
    { id: "R-SEAL", name: "Seal number scanned does not match the label", param: null, unit: null, enabled: true, locked: true, action: "Hold bin or bale and flag as high" },
    { id: "R-ORIGIN", name: "Pickup point is not in the registry", param: null, unit: null, enabled: true, locked: false, action: "Flag to exceptions queue" },
    { id: "R-BRANDED", name: "Branded packs never go to resale", param: null, unit: null, enabled: true, locked: true, action: "Block the sale and flag as high" },
    { id: "R-MASS", name: "Hub mass balance gap (input vs outputs) is above limit", param: 3, unit: "%", enabled: true, locked: false, action: "Flag batch for review" },
  ];

  db.hubs = [
    { id: "HUB-AMD-01", name: "StripLoop Hub 1, Vatva GIDC", city: "Ahmedabad", owner: "Parmar Green Recovery (women-led MSME)", proprietor: "Meena Parmar", status: "Live", capacityKgHr: 250, womenStaff: 8, machine: "Indian line: crusher, turbo grinder, electrostatic separator", lat: 22.965, lng: 72.635 },
    { id: "HUB-VAD-02", name: "Hub 2, Vadodara (planned)", city: "Vadodara", owner: "To be selected", status: "Planned Year 2", capacityKgHr: 250, womenStaff: 0, lat: 22.3072, lng: 73.1812 },
    { id: "HUB-BAD-03", name: "Hub 3, Baddi (planned)", city: "Baddi", owner: "To be selected", status: "Planned Year 3", capacityKgHr: 500, womenStaff: 0, lat: 30.958, lng: 76.791 },
  ];

  db.aggPoints = [
    { id: "AGG-01", name: "Ambika Dry Waste Point, Naroda", owner: "Rekha Solanki", womenLed: true, udyam: "UDYAM-GJ-01-00XXXX1", lat: 23.07, lng: 72.66 },
    { id: "AGG-02", name: "Shakti Sorting Centre, Vastral", owner: "Kanu Desai", womenLed: false, udyam: "UDYAM-GJ-01-00XXXX2", lat: 23.0, lng: 72.66 },
    { id: "AGG-03", name: "Green Sakhi Point, Juhapura", owner: "Nasreen Pathan", womenLed: true, udyam: "UDYAM-GJ-01-00XXXX3", lat: 22.995, lng: 72.53 },
    { id: "AGG-04", name: "Om Recyclables, Odhav", owner: "Bhavesh Rana", womenLed: false, udyam: "UDYAM-GJ-01-00XXXX4", lat: 23.03, lng: 72.67 },
  ];

  const col = (id, name, aggId, income, phone) => ({ id, name, aggId, monthlyIncome: income, phone, ledger: [], languages: ["gu", "hi"], joined: "2026-04" });
  db.collectors = [
    col("COL-01", "Savita Rathod", "AGG-01", 7650, "98250 1XXXX"),
    col("COL-02", "Kokila Vaghela", "AGG-01", 8100, "98250 2XXXX"),
    col("COL-03", "Jyoti Thakor", "AGG-02", 6900, "98250 3XXXX"),
    col("COL-04", "Hansa Makwana", "AGG-02", 6400, "98250 4XXXX"),
    col("COL-05", "Farida Shaikh", "AGG-03", 7200, "98250 5XXXX"),
    col("COL-06", "Manisha Chauhan", "AGG-03", 6200, "98250 6XXXX"),
    col("COL-07", "Geeta Solanki", "AGG-04", 6600, "98250 7XXXX"),
    col("COL-08", "Nirmala Bharwad", "AGG-04", 6300, "98250 8XXXX"),
    col("COL-09", "Asha Rabari", "AGG-01", 7000, "98250 9XXXX"),
    col("COL-10", "Pooja Prajapati", "AGG-02", 6800, "98251 0XXXX"),
  ];

  db.clients = [
    { id: "CLI-PH-01", name: "Narmada Pharma Packing Unit, Changodar", kind: "FACTORY", contact: "QA Head", plan: "Certified destruction, Rs 6 per kg" },
    { id: "CLI-PH-02", name: "Revati Lifesciences Plant, Sanand", kind: "FACTORY", contact: "EHS Manager", plan: "Certified destruction, Rs 6 per kg" },
    { id: "CLI-HO-01", name: "Sabarmati Multispeciality Hospital", kind: "HOSPITAL", contact: "Chief Pharmacist", plan: "Ward pickups, Rs 5,000 a month" },
    { id: "CLI-HO-02", name: "Lotus Cancer Care Centre", kind: "HOSPITAL", contact: "Oncology Pharmacy Lead", plan: "Oncology custody, Rs 10,000 a month" },
    { id: "POOL", name: "Consumer collection pool (brand sponsored)", kind: "POOL", contact: "StripLoop", plan: "Sponsor fee per kg" },
  ];

  const pt = (id, name, kind, area, collectorId, aggId, dLat, dLng, extra = {}) => ({ id, name, kind, area, collectorId, aggId, lat: +(AMD.lat + dLat).toFixed(4), lng: +(AMD.lng + dLng).toFixed(4), registered: true, clientId: null, ...extra });
  db.points = [
    pt("P-01", "Shubh Medical Stores", "CHEMIST", "Maninagar", "COL-01", "AGG-01", -0.02, 0.03),
    pt("P-02", "Sanjivani Clinic", "CLINIC", "Isanpur", "COL-01", "AGG-01", -0.05, 0.02),
    pt("P-03", "Navkar Chemists", "CHEMIST", "Ghodasar", "COL-01", "AGG-01", -0.04, 0.035),
    pt("P-04", "Arogya Medicals", "CHEMIST", "Naroda", "COL-01", "AGG-01", 0.05, 0.08),
    pt("P-05", "Sabarmati Multispeciality Hospital, ward pharmacy", "HOSPITAL", "Shahibaug", "COL-02", "AGG-01", 0.03, 0.01, { clientId: "CLI-HO-01" }),
    pt("P-06", "Lotus Cancer Care Centre, oncology pharmacy", "HOSPITAL", "Memnagar", "COL-02", null, 0.035, -0.03, { clientId: "CLI-HO-02" }),
    pt("P-07", "Krishna Medical", "CHEMIST", "Vastral", "COL-03", "AGG-02", -0.01, 0.09),
    pt("P-08", "Mahavir Clinic", "CLINIC", "Nikol", "COL-03", "AGG-02", 0.025, 0.1),
    pt("P-09", "Janta Medical Hall", "CHEMIST", "Juhapura", "COL-05", "AGG-03", -0.03, -0.04),
    pt("P-10", "Al-Shifa Clinic", "CLINIC", "Juhapura", "COL-05", "AGG-03", -0.025, -0.045),
    pt("P-11", "Om Sai Medical", "CHEMIST", "Odhav", "COL-07", "AGG-04", 0.01, 0.1),
    pt("P-12", "Narmada Pharma Packing Unit", "FACTORY", "Changodar", "HUB-TRUCK", null, -0.09, -0.11, { clientId: "CLI-PH-01" }),
    pt("P-13", "Revati Lifesciences Plant", "FACTORY", "Sanand", "HUB-TRUCK", null, 0.01, -0.2, { clientId: "CLI-PH-02" }),
    pt("P-14", "Sardar Medical", "CHEMIST", "Odhav", "COL-07", "AGG-04", 0.015, 0.105),
    pt("P-99", "New Life Medical, Bapunagar", "CHEMIST", "Bapunagar", "COL-03", "AGG-02", 0.02, 0.06, { registered: false }),
  ];

  // Hub monthly history: 3 months of toll processing, then Hub 1 live with the loan.
  const tonnes = [6.2, 9.8, 13.5, 17.9, 21.4, 25.3];
  db.hubSeries = tonnes.map((t, i) => ({
    month: monthLabel(6 - i),
    tonnes: t,
    factoryShare: 0.8,
    loanLive: i >= 3,
    phase: i < 3 ? "Pilot (toll processing)" : "Hub 1 live",
  }));

  // Loans
  const loan = (id, tier, borrower, principal, ratePct, tenureMonths, paidInstallments, dpd, womenLed, extra = {}) => ({ id, tier, borrower, principal, ratePct, tenureMonths, paidInstallments, dpd, womenLed, ...extra });
  db.loans = [
    loan("SFL-MSME-0412", "HUB", "Parmar Green Recovery (Hub 1)", 3600000, 18, 60, 3, 0, true, { purpose: "Machine line, dust control, shed set-up, working capital", security: "Hypothecation of machines; offtake contracts assigned", disbursed: monthLabel(3) }),
    loan("SFL-MSME-0418", "AGG", "Ambika Dry Waste Point", 300000, 20, 36, 3, 0, true, { purpose: "Baler, scale, storage racks", security: "Hypothecation of baler" }),
    loan("SFL-MSME-0419", "AGG", "Shakti Sorting Centre", 300000, 20, 36, 3, 0, false, { purpose: "Baler, scale, small loader", security: "Hypothecation of baler" }),
    loan("SFL-MSME-0420", "AGG", "Green Sakhi Point", 300000, 20, 36, 2, 0, true, { purpose: "Scale, storage, e-loader", security: "Hypothecation of e-loader" }),
    loan("SFL-MSME-0421", "AGG", "Om Recyclables", 300000, 20, 36, 2, 12, false, { purpose: "Baler and scale", security: "Hypothecation of baler", note: "Owner says scale repair slowed intake for 10 days." }),
    ...db.collectors.map((c, i) => loan(`SCNL-JLG-${7801 + i}`, "COLLECTOR", c.name, 20000, 24, 18, 2 + (i % 4), c.id === "COL-08" ? 8 : 0, true, { collectorId: c.id, purpose: "Digital scale, sealed bins, phone", security: "Joint liability group" })),
  ];

  // UPI payouts (manual today; automated payouts are on the roadmap)
  db.payouts = [];
  for (const c of db.collectors) {
    for (let w = 1; w <= 4; w++) {
      db.payouts.push({ id: `UPI-${c.id}-${w}`, collectorId: c.id, at: at(w * 7 - 1, 18, 30), amount: Math.round(c.monthlyIncome / 4.3 + (w % 2 ? 120 : -90)), upiRef: `UTR${(400000000 + Math.floor(Math.random() * 99999999)).toString()}`, status: "Paid", mode: "Manual UPI by aggregation point" });
    }
  }

  // ---------- flows through the real rules ----------

  // Batch A (9 to 8 days ago): three factory bins direct to hub.
  const f1 = S.createBin({ pointId: "P-12", type: "PVC_ALU", branded: true, assignedTo: "HUB-TRUCK", ts: at(9, 8) });
  S.pickup({ binId: f1.id, by: "HUB-TRUCK", seal: f1.seal, weightKg: 412, ts: at(9, 10) });
  S.hubReceiveBin({ binId: f1.id, sealScanned: f1.seal, weightKg: 409.5, ts: at(9, 15) });
  const f2 = S.createBin({ pointId: "P-12", type: "ALU_ALU", branded: true, assignedTo: "HUB-TRUCK", ts: at(9, 8) });
  S.pickup({ binId: f2.id, by: "HUB-TRUCK", seal: f2.seal, weightKg: 186, ts: at(9, 10, 20) });
  S.hubReceiveBin({ binId: f2.id, sealScanned: f2.seal, weightKg: 185.2, ts: at(9, 15, 10) });
  const f3 = S.createBin({ pointId: "P-13", type: "PVC_ALU", branded: true, assignedTo: "HUB-TRUCK", ts: at(9, 9) });
  S.pickup({ binId: f3.id, by: "HUB-TRUCK", seal: f3.seal, weightKg: 355, ts: at(8, 9) });
  S.hubReceiveBin({ binId: f3.id, sealScanned: f3.seal, weightKg: 353.8, ts: at(8, 13) });
  S.destroyBatch({ binIds: [f1.id, f2.id, f3.id], ...outputsFor([f1.id, f2.id, f3.id]), operator: "Shift A, Meena Parmar", ts: at(8, 17) });

  // Batch B (7 to 5 days ago): chemist and hospital bins through Ambika point, plus a factory bin.
  const c1 = S.createBin({ pointId: "P-01", type: "PVC_ALU", assignedTo: "COL-01", ts: at(7, 8) });
  S.pickup({ binId: c1.id, by: "COL-01", seal: c1.seal, weightKg: 8.4, ts: at(7, 10, 5) });
  S.aggIntake({ binId: c1.id, aggId: "AGG-01", weightKg: 8.3, ts: at(7, 16) });
  const c2 = S.createBin({ pointId: "P-02", type: "PVC_ALU", assignedTo: "COL-01", ts: at(7, 8) });
  S.pickup({ binId: c2.id, by: "COL-01", seal: c2.seal, weightKg: 6.1, ts: at(7, 10, 40) });
  S.aggIntake({ binId: c2.id, aggId: "AGG-01", weightKg: 5.6, ts: at(7, 16, 10) });
  const h1 = S.createBin({ pointId: "P-05", type: "PVC_ALU", branded: true, assignedTo: "COL-02", ts: at(7, 8) });
  S.pickup({ binId: h1.id, by: "COL-02", seal: h1.seal, weightKg: 14.2, ts: at(7, 11, 15) });
  S.aggIntake({ binId: h1.id, aggId: "AGG-01", weightKg: 14.1, ts: at(7, 16, 20) });
  const gapEx = db.exceptions.find((e) => e.entityId === c2.id);
  if (gapEx) S.resolveException({ id: gapEx.id, reasonCode: "CONTAM", note: "Loose tablets removed at sorting and sent for incineration. Photo on file.", by: "Rekha Solanki, AGG-01", ts: at(7, 17) });
  const baleA = S.createBale({ aggId: "AGG-01", binIds: [c1.id, c2.id, h1.id], stream: "PVC-alu blister", ts: at(6, 11) });
  S.dispatchBale({ baleId: baleA.id, vehicle: "GJ-27-TA-4412", driver: "Ramesh Bhai", ts: at(6, 15) });
  S.hubReceiveBale({ baleId: baleA.id, sealScanned: baleA.seal, weightKg: 27.9, ts: at(5, 10) });
  const f4 = S.createBin({ pointId: "P-12", type: "PVC_ALU", branded: true, assignedTo: "HUB-TRUCK", ts: at(6, 8) });
  S.pickup({ binId: f4.id, by: "HUB-TRUCK", seal: f4.seal, weightKg: 298, ts: at(6, 10) });
  S.hubReceiveBin({ binId: f4.id, sealScanned: f4.seal, weightKg: 296.9, ts: at(6, 14) });
  const batchB = [c1.id, c2.id, h1.id, f4.id];
  S.destroyBatch({ binIds: batchB, ...outputsFor(batchB), operator: "Shift A, Meena Parmar", ts: at(5, 16) });

  // Batch C (4 to 3 days ago): Vastral bale plus factory alu-alu.
  const c3 = S.createBin({ pointId: "P-07", type: "PVC_ALU", assignedTo: "COL-03", ts: at(5, 8) });
  S.pickup({ binId: c3.id, by: "COL-03", seal: c3.seal, weightKg: 9.6, ts: at(5, 10) });
  S.aggIntake({ binId: c3.id, aggId: "AGG-02", weightKg: 9.5, ts: at(5, 17) });
  const c4 = S.createBin({ pointId: "P-08", type: "CARTON", assignedTo: "COL-03", ts: at(5, 8) });
  S.pickup({ binId: c4.id, by: "COL-03", seal: c4.seal, weightKg: 22.5, ts: at(5, 11) });
  S.aggIntake({ binId: c4.id, aggId: "AGG-02", weightKg: 22.3, ts: at(5, 17, 15) });
  const baleB = S.createBale({ aggId: "AGG-02", binIds: [c3.id, c4.id], stream: "Mixed blister and cartons", ts: at(4, 10) });
  S.dispatchBale({ baleId: baleB.id, vehicle: "GJ-01-KD-2290", driver: "Salim Khan", ts: at(4, 12) });
  S.hubReceiveBale({ baleId: baleB.id, sealScanned: baleB.seal, weightKg: 31.7, ts: at(4, 15) });
  const f5 = S.createBin({ pointId: "P-13", type: "ALU_ALU", branded: true, assignedTo: "HUB-TRUCK", ts: at(4, 8) });
  S.pickup({ binId: f5.id, by: "HUB-TRUCK", seal: f5.seal, weightKg: 221, ts: at(4, 10) });
  S.hubReceiveBin({ binId: f5.id, sealScanned: f5.seal, weightKg: 219.4, ts: at(4, 14) });
  const batchC = [c3.id, c4.id, f5.id];
  S.destroyBatch({ binIds: batchC, ...outputsFor(batchC), operator: "Shift B, Sonal Vaghela", ts: at(3, 12) });

  // Vials: one fully incinerated, one awaiting facility confirmation, one assigned today.
  const v1 = S.createBin({ pointId: "P-06", type: "VIAL", branded: true, assignedTo: "COL-02", ts: at(5, 8) });
  S.pickup({ binId: v1.id, by: "COL-02", seal: v1.seal, weightKg: 3.6, ts: at(4, 11) });
  S.vialHandover({ binId: v1.id, facility: "Licensed CBMWTF, Odhav", ts: at(4, 15) });
  S.vialConfirm({ binId: v1.id, ts: at(2, 11) });
  const v2 = S.createBin({ pointId: "P-06", type: "VIAL", branded: true, assignedTo: "COL-02", ts: at(2, 8) });
  S.pickup({ binId: v2.id, by: "COL-02", seal: v2.seal, weightKg: 2.9, ts: at(1, 11) });
  S.vialHandover({ binId: v2.id, facility: "Licensed CBMWTF, Odhav", ts: at(1, 15) });
  S.createBin({ pointId: "P-06", type: "VIAL", branded: true, assignedTo: "COL-02", ts: at(0, 7) });

  // Om Recyclables (AGG-04): two weight gaps, then a bale held for a seal mismatch.
  const o1 = S.createBin({ pointId: "P-11", type: "PVC_ALU", assignedTo: "COL-07", ts: at(3, 8) });
  S.pickup({ binId: o1.id, by: "COL-07", seal: o1.seal, weightKg: 8.4, ts: at(3, 10) });
  S.aggIntake({ binId: o1.id, aggId: "AGG-04", weightKg: 7.6, ts: at(3, 16) });
  const o2 = S.createBin({ pointId: "P-14", type: "ALU_ALU", assignedTo: "COL-07", ts: at(3, 8) });
  S.pickup({ binId: o2.id, by: "COL-07", seal: o2.seal, weightKg: 5.2, ts: at(3, 11) });
  S.aggIntake({ binId: o2.id, aggId: "AGG-04", weightKg: 4.9, ts: at(3, 16, 20) });
  const baleH = S.createBale({ aggId: "AGG-04", binIds: [o1.id, o2.id], stream: "Mixed blister and strip", ts: at(2, 10) });
  S.dispatchBale({ baleId: baleH.id, vehicle: "GJ-01-HT-7781", driver: "Mahesh", ts: at(2, 12) });
  S.hubReceiveBale({ baleId: baleH.id, sealScanned: "B-700000", weightKg: 12.4, ts: at(2, 16) });

  // Waiting at hub, ready for a shredding batch.
  const f6 = S.createBin({ pointId: "P-12", type: "PVC_ALU", branded: true, assignedTo: "HUB-TRUCK", ts: at(1, 8) });
  S.pickup({ binId: f6.id, by: "HUB-TRUCK", seal: f6.seal, weightKg: 376, ts: at(1, 10) });
  S.hubReceiveBin({ binId: f6.id, sealScanned: f6.seal, weightKg: 374.6, ts: at(1, 15) });
  const j1 = S.createBin({ pointId: "P-09", type: "PVC_ALU", assignedTo: "COL-05", ts: at(2, 8) });
  S.pickup({ binId: j1.id, by: "COL-05", seal: j1.seal, weightKg: 7.7, ts: at(2, 10) });
  S.aggIntake({ binId: j1.id, aggId: "AGG-03", weightKg: 7.6, ts: at(2, 17) });
  const j2 = S.createBin({ pointId: "P-10", type: "PVC_ALU", assignedTo: "COL-05", ts: at(2, 8) });
  S.pickup({ binId: j2.id, by: "COL-05", seal: j2.seal, weightKg: 4.8, ts: at(2, 11) });
  S.aggIntake({ binId: j2.id, aggId: "AGG-03", weightKg: 4.8, ts: at(2, 17, 10) });
  const baleC = S.createBale({ aggId: "AGG-03", binIds: [j1.id, j2.id], stream: "PVC-alu blister", ts: at(1, 10) });
  S.dispatchBale({ baleId: baleC.id, vehicle: "GJ-01-CB-1190", driver: "Imran", ts: at(1, 13) });
  S.hubReceiveBale({ baleId: baleC.id, sealScanned: baleC.seal, weightKg: 12.3, ts: at(0, 9, 10) });

  // In transit: bale from Ambika point dispatched this morning.
  const n1 = S.createBin({ pointId: "P-03", type: "PVC_ALU", assignedTo: "COL-09", ts: at(1, 8) });
  S.pickup({ binId: n1.id, by: "COL-09", seal: n1.seal, weightKg: 6.8, ts: at(1, 10) });
  S.aggIntake({ binId: n1.id, aggId: "AGG-01", weightKg: 6.7, ts: at(1, 16) });
  const n2 = S.createBin({ pointId: "P-04", type: "ALU_ALU", assignedTo: "COL-09", ts: at(1, 8) });
  S.pickup({ binId: n2.id, by: "COL-09", seal: n2.seal, weightKg: 3.9, ts: at(1, 11) });
  S.aggIntake({ binId: n2.id, aggId: "AGG-01", weightKg: 3.9, ts: at(1, 16, 5) });
  const baleT = S.createBale({ aggId: "AGG-01", binIds: [n1.id, n2.id], stream: "Mixed blister and strip", ts: at(0, 8) });
  S.dispatchBale({ baleId: baleT.id, vehicle: "GJ-27-TA-4412", driver: "Ramesh Bhai", ts: at(0, 8, 40) });

  // Factory truck on the way to the hub (direct route).
  const f7 = S.createBin({ pointId: "P-13", type: "PVC_ALU", branded: true, assignedTo: "HUB-TRUCK", ts: at(0, 7) });
  S.pickup({ binId: f7.id, by: "HUB-TRUCK", seal: f7.seal, weightKg: 402, ts: at(0, 9) });

  // Aggregated today, not yet baled.
  const a1 = S.createBin({ pointId: "P-05", type: "PVC_ALU", branded: true, assignedTo: "COL-02", ts: at(0, 7) });
  S.pickup({ binId: a1.id, by: "COL-02", seal: a1.seal, weightKg: 11.8, ts: at(0, 9, 30) });
  S.aggIntake({ binId: a1.id, aggId: "AGG-01", weightKg: 11.7, ts: at(0, 12) });

  // Picked up today, waiting for intake at aggregation points.
  const p1 = S.createBin({ pointId: "P-01", type: "PVC_ALU", assignedTo: "COL-01", ts: at(0, 7) });
  S.pickup({ binId: p1.id, by: "COL-01", seal: p1.seal, weightKg: 7.2, ts: at(0, 9, 5), geo: { lat: 23.0026, lng: 72.6011, accuracy: 18 } });
  const p2 = S.createBin({ pointId: "P-07", type: "PVC_ALU", assignedTo: "COL-03", ts: at(0, 7) });
  S.pickup({ binId: p2.id, by: "COL-03", seal: p2.seal, weightKg: 9.1, ts: at(0, 10) });
  const p3 = S.createBin({ pointId: "P-09", type: "CARTON", assignedTo: "COL-05", ts: at(0, 7) });
  S.pickup({ binId: p3.id, by: "COL-05", seal: p3.seal, weightKg: 18.4, ts: at(0, 10, 25) });
  const u1 = S.createBin({ pointId: "P-99", type: "PVC_ALU", assignedTo: "COL-03", ts: at(0, 7) });
  S.pickup({ binId: u1.id, by: "COL-03", seal: u1.seal, weightKg: 5.3, ts: at(0, 11) });

  // Still waiting on today's routes.
  S.createBin({ pointId: "P-02", type: "PVC_ALU", assignedTo: "COL-01", ts: at(0, 7) });
  S.createBin({ pointId: "P-03", type: "ALU_ALU", assignedTo: "COL-01", ts: at(0, 7) });
  S.createBin({ pointId: "P-04", type: "PVC_ALU", assignedTo: "COL-01", ts: at(0, 7) });
  S.createBin({ pointId: "P-04", type: "CARTON", assignedTo: "COL-01", ts: at(0, 7) });
  S.createBin({ pointId: "P-08", type: "PVC_ALU", assignedTo: "COL-03", ts: at(0, 7) });
  S.createBin({ pointId: "P-10", type: "PVC_ALU", assignedTo: "COL-05", ts: at(0, 7) });

  // Upcoming client pickup.
  const d = new Date(); d.setDate(d.getDate() + 1);
  S.createPickupRequest({ clientId: "CLI-PH-01", type: "PVC_ALU", estKg: 800, date: d.toISOString().slice(0, 10), slot: "09:00 to 11:00", notes: "Rejected printed lidding foil, batch line 3", ts: at(0, 8) });

  // Collector earnings history for the earnings chart.
  for (const c of db.collectors) {
    c.week = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const base = c.monthlyIncome / 26;
      c.week.push({ day: dt.toLocaleDateString("en-IN", { weekday: "short" }), amount: Math.round(base * (0.75 + ((i * 37 + c.id.charCodeAt(5)) % 50) / 100)) });
    }
  }

  const map = rechainByTime();
  const bySeq = (n) => db.events[map.get(n) - 1];
  for (const c of db.certificates) { const ev = bySeq(c.eventSeq); c.eventSeq = ev.seq; c.chainHead = ev.hash; }
  for (const e of db.exceptions) {
    if (e.eventSeq) e.eventSeq = map.get(e.eventSeq);
    if (e.resolution?.eventSeq) e.resolution.eventSeq = map.get(e.resolution.eventSeq);
  }
  logEvent({ type: "DEMO_READY", entity: "system", entityId: "seed", actor: "system", note: "Demo data loaded. All names are fictional." });
  db.version += 1;
}
