import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { X, Loader2, CheckCircle2, AlertTriangle, Ban, Info } from "lucide-react";
import { LANGS } from "../lib/i18n.js";
import { STATUS_LABEL } from "../lib/format.js";

export function cx(...a) {
  return a.filter(Boolean).join(" ");
}

// Honest build status shown on every screen and component for the jury.
const STAGE = {
  working: { label: "Working demo", cls: "bg-leaf text-white border-leaf" },
  mockup: { label: "Clickable mockup", cls: "bg-sage-100 text-moss border-sage" },
  roadmap: { label: "Planned roadmap", cls: "bg-white text-forest/70 border-forest/30 border-dashed" },
};

export function Stage({ kind = "working", className }) {
  const s = STAGE[kind];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", s.cls, className)}>
      {kind === "working" && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      {s.label}
    </span>
  );
}

const TONE = {
  green: "bg-sage-100 text-moss border-sage",
  solid: "bg-moss text-white border-moss",
  ochre: "bg-ochre-soft text-ochre border-ochre/30",
  clay: "bg-clay-soft text-clay border-clay/30",
  plain: "bg-white text-forest/80 border-sage",
  dark: "bg-forest text-sage-100 border-forest",
};

export function Badge({ tone = "green", children, className, icon: Icon }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[tone], className)}>
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {children}
    </span>
  );
}

const STATUS_TONE = {
  Assigned: "plain", Picked_Up: "green", Aggregated: "green", Hub_Received: "solid", Destroyed: "dark",
  Handed_To_CBMWTF: "ochre", Incinerated: "dark", Sealed: "plain", Dispatched: "green", Received: "solid", Held: "clay",
  open: "ochre", resolved: "green", Valid: "solid", "Pending approval": "ochre", Scheduled: "plain",
};

export function StatusPill({ status, className }) {
  return <Badge tone={STATUS_TONE[status] || "plain"} className={className}>{STATUS_LABEL[status] || status}</Badge>;
}

export function Button({ variant = "primary", size = "md", loading, icon: Icon, children, className, ...rest }) {
  const v = {
    primary: "bg-moss text-white hover:bg-forest-700 border-moss",
    dark: "bg-forest text-white hover:bg-forest-900 border-forest",
    secondary: "bg-white text-forest border-sage hover:border-moss hover:bg-sage-100",
    ghost: "bg-transparent text-moss border-transparent hover:bg-sage-100",
    danger: "bg-clay text-white border-clay hover:brightness-110",
    light: "bg-sage-100 text-forest border-sage-100 hover:bg-sage",
  }[variant];
  const s = { sm: "h-8 px-3 text-[13px] rounded-lg gap-1.5", md: "h-10 px-4 text-sm rounded-xl gap-2", lg: "h-14 px-5 text-base rounded-2xl gap-2.5", xl: "h-16 px-6 text-lg rounded-2xl gap-3" }[size];
  return (
    <button
      className={cx("inline-flex items-center justify-center font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none", v, s, className)}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Loader2 size={size === "sm" ? 14 : 18} className="animate-spin" /> : Icon ? <Icon size={size === "sm" ? 14 : size === "lg" || size === "xl" ? 22 : 17} strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

export function Panel({ title, sub, stage, actions, children, className, bodyClass, id }) {
  return (
    <section id={id} className={cx("panel", className)}>
      {(title || actions || stage) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-sage-200">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {title && <h3 className="text-[17px] font-semibold leading-tight">{title}</h3>}
              {stage && <Stage kind={stage} />}
            </div>
            {sub && <p className="mt-1 text-[13px] text-ink/60 max-w-prose">{sub}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("p-5", bodyClass)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone, className }) {
  return (
    <div className={cx("rounded-2xl border px-4 py-3.5", tone === "dark" ? "bg-forest text-white border-forest" : "bg-white border-sage/80", className)}>
      <div className={cx("text-[12.5px] font-medium", tone === "dark" ? "text-sprout" : "text-ink/60")}>{label}</div>
      <div className={cx("mt-1 font-display text-[26px] leading-none font-semibold tracking-tight", tone === "dark" ? "text-white" : "text-forest")}>{value}</div>
      {sub && <div className={cx("mt-1.5 text-[12px]", tone === "dark" ? "text-sage" : "text-ink/55")}>{sub}</div>}
    </div>
  );
}

export function PageHead({ title, sub, stage, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[28px] sm:text-[34px] font-semibold leading-[1.05]">{title}</h1>
          {stage && <Stage kind={stage} />}
        </div>
        {sub && <p className="mt-2 text-[15px] text-ink/70 leading-relaxed">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className, size = "md" }) {
  return (
    <div role="tablist" className={cx("inline-flex flex-wrap gap-1 rounded-xl bg-sage-100 p-1", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            "rounded-lg font-semibold transition-colors inline-flex items-center gap-2",
            size === "lg" ? "px-4 py-2.5 text-[15px]" : "px-3 py-1.5 text-sm",
            value === t.value ? "bg-white text-forest shadow-sm" : "text-forest/70 hover:text-forest"
          )}
        >
          {t.icon && <t.icon size={16} />}
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className={cx("rounded-full px-1.5 text-[11px]", value === t.value ? "bg-moss text-white" : "bg-sage text-forest")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }) {
  useEffect(() => {
    if (!open) return;
    const on = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-forest-900/50" onClick={onClose} />
      <div className={cx("relative bg-white w-full sm:rounded-2xl rounded-t-2xl shadow-lift max-h-[92vh] flex flex-col", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-sage-200">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-sage-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-sage-200 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, tone: "ok", ...t }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.ms || 5200);
  }, []);
  const icon = { ok: CheckCircle2, warn: AlertTriangle, block: Ban, info: Info };
  const cls = { ok: "border-leaf bg-white", warn: "border-ochre bg-ochre-soft", block: "border-clay bg-clay-soft", info: "border-sage bg-white" };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto sm:w-[400px] flex flex-col gap-2 no-print" aria-live="polite">
        {items.map((t) => {
          const I = icon[t.tone] || Info;
          return (
            <div key={t.id} className={cx("lockin rounded-xl border-l-4 border shadow-lift px-4 py-3 flex gap-3", cls[t.tone])}>
              <I size={20} className={t.tone === "block" ? "text-clay" : t.tone === "warn" ? "text-ochre" : "text-moss"} />
              <div className="min-w-0">
                <div className="font-semibold text-[14px] text-forest">{t.title}</div>
                {t.body && <div className="text-[13px] text-ink/75 mt-0.5 break-words">{t.body}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Empty({ icon: Icon = Info, title, children, action }) {
  return (
    <div className="text-center py-8 px-4">
      <div className="mx-auto mb-3 h-11 w-11 rounded-full bg-sage-100 grid place-items-center"><Icon size={20} className="text-moss" /></div>
      <div className="font-semibold text-forest">{title}</div>
      {children && <p className="text-sm text-ink/60 mt-1 max-w-sm mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading" }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink/60 py-10 justify-center"><Loader2 size={18} className="animate-spin text-moss" />{label}</div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="rounded-xl border border-clay/30 bg-clay-soft px-4 py-3 text-sm text-clay flex items-center justify-between gap-3">
      <span>{error.message}</span>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

// Visual check of a weight gap against the tolerance limit.
export function GapMeter({ gap, tolerance, compact }) {
  const max = Math.max(tolerance * 3, 10);
  const pct = Math.min(100, (gap / max) * 100);
  const tolPct = (tolerance / max) * 100;
  const over = gap > tolerance;
  return (
    <div className={compact ? "w-28" : "w-full"}>
      <div className="relative h-2 rounded-full bg-sage-100 overflow-hidden">
        <div className={cx("absolute inset-y-0 left-0 rounded-full", over ? "bg-ochre" : "bg-leaf")} style={{ width: `${Math.max(3, pct)}%` }} />
        <div className="absolute inset-y-[-2px] w-0.5 bg-forest" style={{ left: `${tolPct}%` }} title={`Tolerance ${tolerance}%`} />
      </div>
      {!compact && (
        <div className="flex justify-between mt-1 text-[11.5px] text-ink/55"><span>0%</span><span>Limit {tolerance}%</span><span>{max}%</span></div>
      )}
    </div>
  );
}

export function LangToggle({ lang, setLang, dark }) {
  return (
    <div className={cx("inline-flex rounded-lg p-0.5", dark ? "bg-forest-900/60" : "bg-sage-100")} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          title={l.name}
          aria-pressed={lang === l.code}
          className={cx("px-2.5 py-1 rounded-md text-[13px] font-semibold min-w-[34px]", lang === l.code ? (dark ? "bg-sprout text-forest" : "bg-white text-forest shadow-sm") : dark ? "text-sage" : "text-forest/60")}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function KeyVal({ k, v, className }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-1.5 border-b border-sage-200 last:border-0 text-sm", className)}>
      <span className="text-ink/60">{k}</span>
      <span className="font-semibold text-forest text-right">{v}</span>
    </div>
  );
}

export function Select({ value, onChange, options, className, ...rest }) {
  return (
    <select className={cx("field pr-8", className)} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
