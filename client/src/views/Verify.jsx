import React from "react";
import { ShieldCheck } from "lucide-react";
import { useApi } from "../lib/live.jsx";
import { navigate } from "../lib/router.jsx";
import { Panel, Loading, Empty, Button, Stage } from "../components/ui.jsx";
import { CertificateCard, CertActions, Timeline, CustodyStrip, binSteps } from "../components/custody.jsx";

export default function Verify({ id }) {
  const { data, error, loading } = useApi(`/certificates/${encodeURIComponent(id)}`);
  if (loading && !data) return <Loading label="Checking certificate" />;
  if (error) {
    return (
      <Panel>
        <Empty icon={ShieldCheck} title="Certificate not found" action={<Button onClick={() => navigate("/")}>Go to StripLoop</Button>}>
          {error.message}
        </Empty>
      </Panel>
    );
  }
  if (!data) return null;
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold">Certificate check</h1>
          <Stage kind="working" />
        </div>
        <CertActions cert={data.certificate} />
      </div>
      <CertificateCard cert={data.certificate} client={data.client} integrity={data.integrity} bins={data.bins} />
      <Panel title="Chain of custody for each bin" className="no-print">
        <div className="space-y-3">
          {data.bins.map((b) => (
            <div key={b.id}>
              <div className="text-sm font-semibold text-forest mb-1.5">{b.id} <span className="font-normal text-ink/55">| seal {b.seal} | {b.typeLabel} | {b.pointName}</span></div>
              <CustodyStrip steps={binSteps(b, data.events)} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Ledger entries behind this certificate" sub="Each entry is linked to the one before it by its hash." className="no-print">
        <Timeline events={[...data.events].reverse()} />
      </Panel>
    </div>
  );
}
