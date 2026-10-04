import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ComposedChart, Line, Legend } from "recharts";
import { useApi } from "../lib/live.jsx";
import { PageHead, Panel, Stat, Loading, ErrorNote, Stage } from "../components/ui.jsx";
import { kg, tonnes, inr, money, num } from "../lib/format.js";

export default function Impact() {
  const { data: d, error, loading, reload } = useApi("/impact");
  if (loading && !d) return <Loading />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!d) return null;
  const t = d.totals;
  return (
    <div className="space-y-6">
      <PageHead title="Impact" stage="working" sub="Calculated from the pilot history and the live ledger. Every figure can be traced back to weighed, sealed and certified bins." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Packaging recovered" value={tonnes(t.tonnesRecovered)} sub={`Includes ${kg(t.ledgerKg, 0)} in the live ledger`} tone="dark" />
        <Stat label="CO2e avoided" value={`${num(t.co2T, 1)} t`} sub="Counted only when aluminium is remelted" />
        <Stat label="Women earning" value={num(t.womenCollectors + t.womenSalaried)} sub={`${t.womenCollectors} collectors, ${t.womenSalaried} salaried at the hub`} />
        <Stat label="Average collector income" value={inr(t.avgCollectorIncome)} sub="Per month, part-time" />
        <Stat label="Branded packs destroyed" value={kg(t.brandedDestroyedKg, 0)} sub="Kept away from counterfeiters" />
        <Stat label="MSMEs financed" value={t.msmesFinanced} sub={`${t.womenLedMsmes} women-led`} />
        <Stat label="Satin loans in the chain" value={money(t.loansSanctioned)} sub={`${t.microEntrepreneurs} borrowers | ${t.onTimePct}% on time`} />
        <Stat label="Certificates issued" value={t.certificates} sub="Each with QR verification" />
      </div>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <Panel title="Monthly recovery and carbon" sub="Tonnes recovered (bars) and tonnes of CO2e avoided (line)." stage="working">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d.history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E9F4EC" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#10291F99" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#10291F99" }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tonnes" name="Tonnes recovered" fill="#1F6B47" radius={[6, 6, 0, 0]} />
                <Line dataKey="co2T" name="Tonnes CO2e avoided" stroke="#57B47D" strokeWidth={3} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Women collectors' monthly income" stage="working">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.collectorIncome} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={70} tick={{ fontSize: 12, fill: "#10291F" }} />
                <Tooltip formatter={(v) => [inr(v), "Monthly income"]} cursor={{ fill: "#E9F4EC" }} />
                <Bar dataKey="income" radius={[0, 6, 6, 0]} label={{ position: "right", fontSize: 11, fill: "#10291F99", formatter: (v) => inr(v) }}>
                  {d.collectorIncome.map((_, i) => <Cell key={i} fill={i % 2 ? "#3A9D63" : "#1F6B47"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <Panel title="Material recovered (ledger)">
          <div className="space-y-2 text-sm">
            {[["Aluminium powder", t.recovered.alKg], ["PVC granules", t.recovered.pvcKg], ["Paper pulp", t.recovered.paperKg]].map(([l, v]) => (
              <div key={l} className="flex justify-between border-b border-sage-200 pb-1.5"><span className="text-ink/65">{l}</span><b>{kg(v)}</b></div>
            ))}
          </div>
        </Panel>
        <Panel title="Destroyed by pack type (ledger)">
          <div className="space-y-2 text-sm">
            {d.byType.map((r) => (
              <div key={r.type} className="flex justify-between border-b border-sage-200 pb-1.5"><span className="text-ink/65">{r.label}</span><b>{kg(r.kg)}</b></div>
            ))}
          </div>
        </Panel>
        <Panel title="How carbon is counted">
          <ul className="text-[13.5px] text-ink/75 space-y-1.5">
            <li>PVC-alu blister: about {d.factors.PVC_ALU} kg CO2e saved per kg recovered (about 15% aluminium).</li>
            <li>Alu-alu strip: about {d.factors.ALU_ALU} kg CO2e per kg (about 65% aluminium).</li>
            <li>Basis: Indian primary aluminium at about 18 to 21 t CO2 per tonne against about 0.5 t for recycled aluminium.</li>
            <li>Counted only when the aluminium goes to remelting. Cartons and vials are not counted.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
