export const inr = (n) => `Rs ${Math.round(n || 0).toLocaleString("en-IN")}`;
export const lakh = (n) => `Rs ${(n / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} lakh`;
export const crore = (n) => `Rs ${(n / 10000000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} crore`;
export const money = (n) => (n >= 10000000 ? crore(n) : n >= 100000 ? lakh(n) : inr(n));
export const kg = (n, d = 1) => `${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: d })} kg`;
export const tonnes = (n, d = 1) => `${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: d })} t`;
export const num = (n, d = 0) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: d });

export function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

export const shortHash = (h) => (h ? `${h.slice(0, 6)}..${h.slice(-4)}` : "");

export const STATUS_LABEL = {
  Assigned: "Waiting at stop",
  Picked_Up: "Picked up",
  Aggregated: "At aggregation point",
  Hub_Received: "At hub, ready to shred",
  Destroyed: "Shredded and recovered",
  Handed_To_CBMWTF: "At licensed BMW facility",
  Incinerated: "Incinerated (licensed)",
};

export const EVENT_LABEL = {
  BIN_ASSIGNED: "Bin assigned to route",
  PICKUP: "Picked up at source",
  AGG_INTAKE: "Weighed in at aggregation point",
  BALED: "Sealed into a bale",
  DISPATCH: "Dispatched to hub",
  HUB_RECEIVE: "Received at hub, seal checked",
  HUB_HOLD: "Held at hub receiving",
  DESTROYED: "Shredded on camera",
  CERT_ISSUED: "Certificate issued",
  CERT_APPROVED: "Certificate approved",
  EXCEPTION_RAISED: "Exception raised",
  ADJUSTMENT: "Adjustment with reason code",
  RULE_BLOCKED: "Blocked by rule",
  CBMWTF_HANDOVER: "Handed to licensed BMW facility",
  INCINERATION_CONFIRMED: "Incineration confirmed by facility",
  PICKUP_REQUESTED: "Pickup requested by client",
  SETTINGS_CHANGED: "Settings changed",
  RULE_CHANGED: "Rule switched",
  DEMO_READY: "Demo data loaded",
};
