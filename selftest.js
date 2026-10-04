// Quick backend check: loads demo data, runs one bin through the whole chain,
// and confirms the hash chain holds. Run with: npm test
import { db, verifyChain } from "./store.js";
import { seed } from "./seed.js";
import * as S from "./services.js";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok  ", msg);
}

seed();
assert(db.events.length > 50, `demo ledger has ${db.events.length} events`);
assert(verifyChain().ok, "hash chain verifies after seeding");

const bin = S.createBin({ pointId: "P-01", type: "ALU_ALU", assignedTo: "COL-01" });
S.pickup({ binId: bin.id, by: "COL-01", seal: bin.seal, weightKg: 5 });
const intake = S.aggIntake({ binId: bin.id, aggId: "AGG-01", weightKg: 4.98 });
assert(intake.gapPct < 2 && !intake.exception, "small weight gap passes reconciliation");
const bale = S.createBale({ aggId: "AGG-01", binIds: [bin.id] });
S.dispatchBale({ baleId: bale.id, vehicle: "GJ-01-TEST" });
S.hubReceiveBale({ baleId: bale.id, sealScanned: bale.seal, weightKg: 4.97 });
const { certificates } = S.destroyBatch({ binIds: [bin.id], alKg: 3.2, pvcKg: 1.7, residueKg: 0.05 });
assert(certificates.length === 1 && certificates[0].recovered.alKg > 3, "certificate issued with aluminium recovered");

let threw = false;
try { S.attemptResale({ binId: db.bins.find((b) => b.branded).id }); } catch (e) { threw = e.status === 403; }
assert(threw, "branded resale is blocked");

const before = db.exceptions.length;
const b2 = S.createBin({ pointId: "P-02", type: "PVC_ALU", assignedTo: "COL-01" });
S.pickup({ binId: b2.id, by: "COL-01", seal: b2.seal, weightKg: 10 });
S.aggIntake({ binId: b2.id, aggId: "AGG-01", weightKg: 9 });
assert(db.exceptions.length === before + 1, "10% weight gap raises an exception");

const st = S.stressTest({ tonnes: 25 });
assert(st.dscr > 3 && st.dscr < 4.2, `hub repayment cover at 25 t is ${st.dscr}x`);
assert(verifyChain().ok, `hash chain still verifies (${db.events.length} events)`);
console.log("All checks passed.");
