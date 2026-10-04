import React, { useEffect, useRef, useState } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Legend, BarChart, Cell } from "recharts";
import { Landmark, AlertTriangle, CheckCircle2, XCircle, Factory, Scale, FileCheck2, Leaf, Users } from "lucide-react";
import { api } from "../lib/api.js";
import { useApi } from "../lib/live.jsx";
import { Panel, Button, Badge, Stat, Stage, Loading, ErrorNote, Tabs, cx } from "../components/ui.jsx";
import { inr, lakh, money, kg, num, tonnes } from "../lib/format.js";

function Gauge({ value, max = 5 }) {
  const v = Math.max(0, Math.min(max, value || 0));
  const angle = (v / max) * 180;
  const r = 70, cx0 = 90, cy0 = 88;
  const pt = (a) => [cx0 - r * Math.cos((a * Math.PI) / 180), cy0 - r * Math.sin((a * Math.PI) / 180)];
  const arc = (a0, a1, color) => {
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    return <path d={`M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`} stroke={color} strokeWidth="14" fill="none" />;
  };
  const [nx, ny] = pt(angle);
  return (
    <svg viewBox="0 0 180 100" className="w-full max-w-[220px]" role="img" aria-label={`Repayment cover ${value} times`}>
      {arc(0, 36, "#A63D2A")}
      {arc(36, 54, "#C9A24A")}
      {arc(54, 180, "#3A9D63")}
      <line x1={cx0} y1={cy0} x2={nx} y2={ny} stroke="#E9F4EC" strokeWidth="4" strokeLinecap="round" />
      <circle cx={cx0} cy={cy0} r="6" fill="#E9F4EC" />
      <text x="20" y="99" fontSize="9" fill="#CFE6D6">0x</text>
      <text x="152" y="99" fontSize="9" fill="#CFE6D6">{max}x</text>
    </svg>
  );
}

function StressTest({ base }) {
  const [p, setP] = useState({ tonnes: 25, marginPerKg: 20, feePerKg: 6, factoryShare: 0.8 });
  const [r, setR] = useState(null);
  const t = useRef();
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => { api.post("/credit/stress", p).then(setR).catch(() => {}); }, 180);
    return () => clearTimeout(t.current);
  }, [p]);
  const sliders = [
    ["tonnes", "Hub throughput (tonnes a month)", 8, 35, 0.5, (v) => `${v} t`],
    ["marginPerKg", "Margin between selling and buying (Rs per kg)", 4, 30, 0.5, (v) => `Rs ${v}`],
    ["feePerKg", "Destruction fee from factories (Rs per kg)", 0, 12, 0.5, (v) => `Rs ${v}`],
    ["factoryShare", "Share of volume from factories", 0.4, 1, 0.05, (v) => `${Math.round(v * 100)}%`],
  ];
  const tone = !r ? "" : r.dscr >= 1.5 ? "text-leaf" : r.dscr >= 1 ? "text-ochre" : "text-clay";
  return (
    <Panel title="Stress test the hub loan" sub="Move the sliders. The server recalculates repayment cover for the Rs 36 lakh loan (5 years, 18% assumed)." stage="working">
      <div className="grid md:grid-cols-[1.2fr_1fr] gap-6">
        <div className="space-y-4">
          {sliders.map(([k, l, min, max, step, f]) => (
            <div key={k}>
              <div className="flex justify-between text-sm mb-1"><span className="font-semibold text-forest">{l}</span><span className="tabular-nums font-semibold">{f(p[k])}</span></div>
              <input type="range" min={min} max={max} step={step} value={p[k]} onChange={(e) => setP({ ...p, [k]: +e.target.value })} className="w-full accent-moss" aria-label={l} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={() => setP({ tonnes: 25, marginPerKg: 20, feePerKg: 6, factoryShare: 0.8 })}>Plan</Button>
            <Button size="sm" variant="secondary" onClick={() => setP({ ...p, marginPerKg: 15 })}>Prices fall</Button>
            <Button size="sm" variant="secondary" onClick={() => setP({ ...p, tonnes: 18 })}>Less volume</Button>
            <Button size="sm" variant="secondary" onClick={() => setP({ ...p, feePerKg: 0 })}>No destruction fee</Button>
          </div>
        </div>
        <div className="rounded-2xl bg-sage-100 p-4">
          {r ? (
            <>
              <div className="text-sm text-ink/60">Repayment cover (DSCR)</div>
              <div className={cx("font-display text-5xl font-bold", tone)}>{r.dscr}x</div>
              <Badge tone={r.dscr >= 1.5 ? "green" : r.dscr >= 1 ? "ochre" : "clay"} className="mt-1">{r.verdict}</Badge>
              <div className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-ink/60">Monthly profit before repayment</span><b>{inr(r.profit)}</b></div>
                <div className="flex justify-between"><span className="text-ink/60">Monthly loan repayment</span><b>{inr(r.emi)}</b></div>
                <div className="flex justify-between"><span className="text-ink/60">Break-even margin at this volume</span><b>Rs {r.breakevenMarginPerKg} per kg</b></div>
                <div className="flex justify-between"><span className="text-ink/60">Break-even volume at this margin</span><b>{r.breakevenTonnes} t a month</b></div>
              </div>
            </>
          ) : <Loading />}
        </div>
      </div>
    </Panel>
  );
}

function GreenClaim({ c }) {
  const loan = c.hub.loan;
  const items = [
    { icon: Landmark, title: lakh(loan.principal), sub: "Satin Finserv MSME loan", note: loan.id },
    { icon: Factory, title: "Machine line", sub: "Hypothecated asset at Hub 1", note: "Crusher, grinder, separator" },
    { icon: Scale, title: tonnes(c.hub.latest.tonnes), sub: `Verified in ${c.hub.latest.month}`, note: "Every kg weighed and sealed" },
    { icon: FileCheck2, title: `${c.greenClaim.certificates} certificates`, sub: "Issued from the ledger", note: `${kg(c.greenClaim.verifiedKg, 0)} in live ledger` },
    { icon: Leaf, title: kg(c.greenClaim.co2Kg, 0), sub: "CO2e avoided (ledger)", note: "Aluminium remelted" },
  ];
  return (
    <div className="rounded-3xl bg-white border border-sage p-5">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h3 className="text-lg font-semibold">Green lending claim</h3>
        <Stage kind="working" />
      </div>
      <p className="text-sm text-ink/65 mb-4 max-w-3xl">The machinery and working capital loan is tied to an asset, and the asset to kilograms that were sealed, weighed and certified. This is the evidence trail behind a green loan tag.</p>
      <ol className="grid sm:grid-cols-5 gap-2">
        {items.map((it, i) => (
          <li key={i} className="relative rounded-2xl bg-sage-100 p-3.5">
            <it.icon size={20} className="text-moss" />
            <div className="font-display text-lg font-semibold text-forest mt-1.5 leading-tight">{it.title}</div>
            <div className="text-[13px] text-ink/70">{it.sub}</div>
            <div className="text-[11.5px] text-ink/50 mt-0.5">{it.note}</div>
            {i < items.length - 1 && <span className="hidden sm:block absolute top-1/2 -right-2 h-0.5 w-2 bg-moss" />}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Credit() {
  const { data: c, error, loading, reload } = useApi("/credit");
  const [book, setBook] = useState("ALL");
  if (loading && !c) return <Loading />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!c) return null;
  const latest = c.hub.latest;
  const loans = c.loans.filter((l) => book === "ALL" || l.tier === book);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-forest text-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-white text-[30px] sm:text-[38px] font-semibold leading-tight">Satin green lending desk</h1>
              <Stage kind="working" />
            </div>
            <p className="mt-2 text-sage text-[15px] leading-relaxed">One view of every StripLoop loan: the women-led hub, the aggregation MSMEs and the women collectors. Repayment capacity is read from verified kilograms, not from estimates.</p>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><div className="text-sage text-[12.5px]">Sanctioned</div><div className="font-display text-2xl font-semibold">{money(c.totals.sanctioned)}</div></div>
              <div><div className="text-sage text-[12.5px]">Outstanding</div><div className="font-display text-2xl font-semibold">{money(c.totals.outstanding)}</div></div>
              <div><div className="text-sage text-[12.5px]">Borrowers</div><div className="font-display text-2xl font-semibold">{c.totals.borrowers}<span className="text-sm text-sage font-normal"> ({c.totals.womenBorrowers} women-led)</span></div></div>
              <div><div className="text-sage text-[12.5px]">On time</div><div className="font-display text-2xl font-semibold">{c.totals.onTimePct}%<span className="text-sm text-sage font-normal"> | PAR30 {c.totals.par30Pct}%</span></div></div>
            </div>
          </div>
          <div className="rounded-2xl bg-forest-900/60 p-5 text-center min-w-[240px]">
            <div className="text-sage text-sm">Hub 1 repayment cover, {latest.month}</div>
            <Gauge value={latest.dscr} />
            <div className="font-display text-5xl font-bold text-sprout -mt-1">{latest.dscr}x</div>
            <div className="text-[12.5px] text-sage mt-1">{inr(latest.cashFlow)} cash flow vs {inr(c.hub.emi)} EMI</div>
          </div>
        </div>
      </section>

      <GreenClaim c={c} />

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title="Cash flow vs debt service" sub="Hub 1 monthly profit before repayment against the loan EMI. The first three months were the pilot, paying a recycler per kg; their losses are covered by the prize money and a CSR grant, not by debt." stage="working">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={c.hub.series} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E9F4EC" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#10291F99" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#10291F99" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v, n) => [inr(v), n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="cashFlow" name="Profit before repayment" radius={[6, 6, 0, 0]}>
                  {c.hub.series.map((m, i) => <Cell key={i} fill={m.loanLive ? "#1F6B47" : "#8CCB9E"} />)}
                </Bar>
                <Line dataKey="debtService" name="Loan EMI" stroke="#0F3D2E" strokeWidth={2.5} strokeDasharray="6 4" dot={false} type="stepAfter" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Throughput against covenant" sub="Tonnes processed per month. The loan covenant is at least 18 t." stage="working">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={c.hub.series} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E9F4EC" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#10291F99" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#10291F99" }} />
                <Tooltip formatter={(v) => [`${v} t`, "Throughput"]} />
                <ReferenceLine y={18} stroke="#9A6512" strokeDasharray="5 4" label={{ value: "18 t covenant", position: "insideTopLeft", fontSize: 11, fill: "#9A6512" }} />
                <Bar dataKey="tonnes" radius={[6, 6, 0, 0]}>
                  {c.hub.series.map((m, i) => <Cell key={i} fill={m.tonnes >= 18 ? "#1F6B47" : "#8CCB9E"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-5 items-start">
        <Panel title="Covenants" stage="working">
          <ul className="space-y-2.5">
            {c.covenants.map((cv) => (
              <li key={cv.name} className="flex items-center gap-3 rounded-xl border border-sage-200 px-3 py-2.5">
                {cv.ok ? <CheckCircle2 className="text-moss shrink-0" size={20} /> : <XCircle className="text-clay shrink-0" size={20} />}
                <span className="flex-1 text-sm text-forest font-semibold">{cv.name}</span>
                <span className="tabular-nums text-sm">{cv.value}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Risk flags" sub="Raised from repayments and from the custody ledger." stage="working">
          {c.flags.length === 0 ? <div className="text-sm text-ink/60">No flags. All borrowers on time and the ledger is clean.</div> : (
            <ul className="space-y-2.5">
              {c.flags.map((f, i) => (
                <li key={i} className={cx("rounded-xl px-3 py-2.5 border-l-4 bg-white border", f.level === "high" ? "border-l-clay border-clay/20" : "border-l-ochre border-ochre/20")}>
                  <div className="flex items-center gap-2 font-semibold text-forest text-sm"><AlertTriangle size={15} className={f.level === "high" ? "text-clay" : "text-ochre"} />{f.title}</div>
                  <div className="text-[13px] text-ink/65 mt-0.5">{f.detail}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <StressTest />

      <Panel title="Portfolio by borrower tier" stage="working" bodyClass="p-0 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Tier</th><th>Lender</th><th className="text-right">Borrowers</th><th className="text-right">Sanctioned</th><th className="text-right">Outstanding</th><th className="text-right">Overdue</th></tr></thead>
          <tbody>
            {c.tiers.map((t) => (
              <tr key={t.tier}>
                <td className="font-semibold text-forest">{t.label}</td>
                <td>{t.lender}</td>
                <td className="text-right">{t.count}</td>
                <td className="text-right tabular-nums">{money(t.sanctioned)}</td>
                <td className="text-right tabular-nums">{money(t.outstanding)}</td>
                <td className="text-right">{t.overdue ? <Badge tone="ochre">{t.overdue}</Badge> : "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Loan book" actions={<Tabs value={book} onChange={setBook} tabs={[{ value: "ALL", label: "All" }, { value: "HUB", label: "Hub" }, { value: "AGG", label: "MSMEs" }, { value: "COLLECTOR", label: "Collectors" }]} />} bodyClass="p-0 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Loan</th><th>Borrower</th><th>Purpose</th><th className="text-right">Amount</th><th className="text-right">EMI</th><th className="text-right">Outstanding</th><th>Repaid</th><th>Status</th></tr></thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.id}>
                <td className="font-semibold text-forest whitespace-nowrap">{l.id}</td>
                <td className="whitespace-nowrap">{l.borrower} {l.womenLed && <Users size={13} className="inline text-moss ml-1" aria-label="Women-led" />}</td>
                <td className="text-[12.5px] min-w-[180px]">{l.purpose}</td>
                <td className="text-right tabular-nums">{inr(l.principal)}</td>
                <td className="text-right tabular-nums">{inr(l.emi)}</td>
                <td className="text-right tabular-nums">{inr(l.outstanding)}</td>
                <td><div className="w-20 h-1.5 rounded-full bg-sage-100 overflow-hidden"><div className="h-full bg-moss" style={{ width: `${l.repaidPct}%` }} /></div></td>
                <td>{l.dpd ? <Badge tone="ochre">{l.dpd} days past due</Badge> : <Badge tone="green">Standard</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Next for the Satin integration" stage="roadmap">
        <p className="text-sm text-ink/70">A direct data link from the StripLoop ledger into Satin's loan management system, so throughput covenants and risk flags update the borrower file automatically.</p>
      </Panel>
    </div>
  );
}
