import React, { useState } from "react";
import { Home, Smartphone, Warehouse, Factory, Building2, SlidersHorizontal, Landmark, Leaf, RotateCcw, Menu, X } from "lucide-react";
import { LiveProvider, useLive } from "./lib/live.jsx";
import { usePath, Link, navigate } from "./lib/router.jsx";
import { api } from "./lib/api.js";
import { ToastProvider, useToast, cx, Button } from "./components/ui.jsx";
import { Logo } from "./components/custody.jsx";
import Overview from "./views/Overview.jsx";
import Collector from "./views/Collector.jsx";
import Aggregation from "./views/Aggregation.jsx";
import Hub from "./views/Hub.jsx";
import Client from "./views/Client.jsx";
import Admin from "./views/Admin.jsx";
import Credit from "./views/Credit.jsx";
import Impact from "./views/Impact.jsx";
import Verify from "./views/Verify.jsx";
import Labels from "./views/Labels.jsx";

export const ROLES = [
  { path: "/", label: "Overview", short: "Overview", icon: Home },
  { path: "/collector", label: "Collector", short: "Collector", icon: Smartphone, device: "Mobile" },
  { path: "/aggregation", label: "Aggregation point", short: "Aggregation", icon: Warehouse, device: "Tablet" },
  { path: "/hub", label: "Hub operator", short: "Hub", icon: Factory, device: "Tablet" },
  { path: "/client", label: "Client portal", short: "Client", icon: Building2, device: "Desktop" },
  { path: "/admin", label: "StripLoop admin", short: "Admin", icon: SlidersHorizontal, device: "Desktop" },
  { path: "/satin", label: "Satin credit officer", short: "Satin desk", icon: Landmark, device: "Desktop" },
  { path: "/impact", label: "Impact", short: "Impact", icon: Leaf, device: "Desktop" },
];

function Shell() {
  const path = usePath();
  const { connected } = useLive();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [resetting, setResetting] = useState(false);

  let view;
  if (path.startsWith("/verify/")) view = <Verify id={decodeURIComponent(path.split("/")[2] || "")} />;
  else if (path === "/collector") view = <Collector />;
  else if (path === "/aggregation") view = <Aggregation />;
  else if (path === "/hub") view = <Hub />;
  else if (path === "/client") view = <Client />;
  else if (path === "/admin") view = <Admin />;
  else if (path === "/satin") view = <Credit />;
  else if (path === "/impact") view = <Impact />;
  else if (path === "/labels") view = <Labels />;
  else view = <Overview />;

  const isVerify = path.startsWith("/verify/");

  async function reset() {
    setResetting(true);
    try {
      await api.post("/demo/reset");
      toast({ title: "Demo data reloaded", body: "Every screen now shows the starting pilot data again." });
    } catch (e) {
      toast({ tone: "block", title: "Could not reload demo data", body: e.message });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-forest text-white sticky top-0 z-40 no-print">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to="/" className="shrink-0" aria-label="StripLoop home"><Logo /></Link>
          {!isVerify && (
            <nav className="hidden xl:flex items-center gap-0.5 ml-3 overflow-x-auto" aria-label="Roles">
              {ROLES.map((r) => (
                <Link
                  key={r.path}
                  to={r.path}
                  className={cx(
                    "flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-[13.5px] font-semibold whitespace-nowrap transition-colors",
                    path === r.path ? "bg-white text-forest" : "text-sage hover:text-white hover:bg-white/10"
                  )}
                >
                  <r.icon size={15} />
                  {r.short || r.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-[12px] text-sage" title={connected ? "Live updates connected" : "Live updates reconnecting"}>
              <span className={cx("h-2 w-2 rounded-full", connected ? "bg-sprout" : "bg-ochre")} />
              {connected ? "Live" : "Reconnecting"}
            </span>
            {!isVerify && (
              <Button variant="light" size="sm" icon={RotateCcw} loading={resetting} onClick={reset} className="hidden sm:inline-flex whitespace-nowrap">Reset demo</Button>
            )}
            {!isVerify && (
              <button className="xl:hidden p-2 rounded-lg hover:bg-white/10" onClick={() => setMenu((m) => !m)} aria-label="Open role menu" aria-expanded={menu}>
                {menu ? <X size={22} /> : <Menu size={22} />}
              </button>
            )}
          </div>
        </div>
        {menu && !isVerify && (
          <nav className="xl:hidden border-t border-white/10 px-4 pb-4 pt-2 grid grid-cols-2 gap-1.5" aria-label="Roles">
            {ROLES.map((r) => (
              <button
                key={r.path}
                onClick={() => { navigate(r.path); setMenu(false); }}
                className={cx("flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-left", path === r.path ? "bg-white text-forest" : "text-sage bg-white/5")}
              >
                <r.icon size={16} />{r.label}
              </button>
            ))}
            <button onClick={() => { reset(); setMenu(false); }} className="col-span-2 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-sage bg-white/5"><RotateCcw size={16} />Reset demo data</button>
          </nav>
        )}
      </header>
      <main className="flex-1 w-full max-w-[1320px] mx-auto px-4 sm:px-6 py-6 sm:py-8">{view}</main>
      <footer className="no-print border-t border-sage bg-white/60">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-5 text-[12.5px] text-ink/55 flex flex-wrap gap-x-6 gap-y-1 justify-between">
          <span>StripLoop prototype for Sankalp by Satin Finserv: The Climate Edition (Students Track).</span>
          <span>Simulated Ahmedabad pilot data. All names of people, shops, hospitals and companies are fictional.</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <LiveProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </LiveProvider>
  );
}
