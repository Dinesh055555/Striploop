import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import { useApi } from "../lib/live.jsx";
import { PageHead, Button, Loading, Stage } from "../components/ui.jsx";

export default function Labels() {
  const { data } = useApi("/bins?status=Assigned");
  const bins = (data || []).filter((b) => !b.vial).slice(0, 24);
  return (
    <div>
      <div className="no-print">
        <PageHead title="Bin labels" stage="working" sub="QR labels for bins waiting on today's routes. Print them, or open the collector app on a phone and scan straight from this screen.">
          <Button icon={Printer} onClick={() => window.print()}>Print labels</Button>
        </PageHead>
      </div>
      {!data ? <Loading /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {bins.map((b) => (
            <div key={b.id} className="print-area bg-white rounded-2xl border-2 border-forest p-4 text-center break-inside-avoid">
              <div className="font-display font-semibold text-forest">StripLoop sealed bin</div>
              <div className="my-2 flex justify-center"><QRCodeSVG value={b.id} size={132} fgColor="#0F3D2E" level="M" /></div>
              <div className="font-display text-xl font-bold text-forest">{b.id}</div>
              <div className="text-sm font-semibold">Seal {b.seal}</div>
              <div className="text-[12px] text-ink/60 mt-1">{b.typeLabel}</div>
              <div className="text-[12px] text-ink/60">{b.pointName}</div>
              <div className="text-[11px] text-clay font-semibold mt-1">Do not open. Do not resell.</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
