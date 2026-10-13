import { ReactNode, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Clock, FileQuestion, Inbox, Loader2, XCircle, MinusCircle, X } from "lucide-react";
import type { Tone } from "@/lib/constants";

const toneCls: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200", blue: "bg-blue-50 text-blue-800 ring-blue-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200", amber: "bg-amber-50 text-amber-900 ring-amber-300", red: "bg-red-50 text-red-800 ring-red-200",
};
const toneIcon: Record<Tone, ReactNode> = {
  slate: <MinusCircle className="h-3.5 w-3.5" aria-hidden />, blue: <Clock className="h-3.5 w-3.5" aria-hidden />,
  green: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />, amber: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />, red: <XCircle className="h-3.5 w-3.5" aria-hidden />,
};
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${toneCls[tone]}`}>{toneIcon[tone]}{children}</span>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <div role="status" className="flex items-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /><span className="text-sm">{label}…</span></div>;
}
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200/70" />)}</div>;
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = (error as { message?: string })?.message ?? "Something went wrong.";
  return (
    <div role="alert" className="card border-red-200 bg-red-50 p-5 text-red-900">
      <p className="font-semibold">We couldn't load this.</p><p className="mt-1 text-sm">{msg}</p>
      {retry && <button className="btn-secondary mt-3" onClick={retry}>Try again</button>}
    </div>
  );
}
export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand">{icon ?? <Inbox className="h-6 w-6" aria-hidden />}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {text && <p className="mt-1 max-w-md text-sm text-slate-600">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function NoAccess() { return <EmptyState title="You don't have access to this page" text="If you think this is a mistake, ask your project manager or the Super Admin." icon={<FileQuestion className="h-6 w-6" />} />; }

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
      </div>
    </div>
  );
}
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : tone === "green" ? "text-emerald-700" : "text-slate-900"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Modal - portaled, full-height sheet on mobile, centered dialog on desktop
   ───────────────────────────────────────────────────────────────────────── */
export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`
          relative flex w-full flex-col
          max-h-[92vh] overflow-hidden
          rounded-t-3xl sm:rounded-2xl
          border border-slate-200/70 bg-white
          shadow-[0_25px_60px_-25px_rgba(15,23,42,0.55)]
          ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}
        `}
      >
        {/* Mobile drag handle (sheet feel) */}
        <div aria-hidden className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-slate-300 sm:hidden" />

        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/70 bg-white/95 px-5 py-3.5 backdrop-blur">
          <h2 id={id} className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 hover:text-slate-700 active:scale-95"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function Field({ label, error, hint, required, children }: { label: string; error?: string | null; hint?: string; required?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <div className="mb-4">
      <label className="label" htmlFor={id}>{label}{required && <span className="text-red-600" aria-hidden> *</span>}</label>
      <div id={id}>{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
export function LabeledInput({ label, error, hint, required, ...rest }: { label: string; error?: string | null; hint?: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="mb-4">
      <label className="label" htmlFor={id}>{label}{required && <span className="text-red-600" aria-hidden> *</span>}</label>
      <input id={id} className="input" aria-invalid={!!error} aria-describedby={error ? id + "e" : undefined} required={required} {...rest} />
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={id + "e"} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
export function LabeledSelect({ label, error, required, children, ...rest }: { label: string; error?: string | null; required?: boolean; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="mb-4">
      <label className="label" htmlFor={id}>{label}{required && <span className="text-red-600" aria-hidden> *</span>}</label>
      <select id={id} className="input" aria-invalid={!!error} {...rest}>{children}</select>
      {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
export function LabeledText({ label, error, hint, required, ...rest }: { label: string; error?: string | null; hint?: string; required?: boolean } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="mb-4">
      <label className="label" htmlFor={id}>{label}{required && <span className="text-red-600" aria-hidden> *</span>}</label>
      <textarea id={id} className="input" aria-invalid={!!error} {...rest} />
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function Alert({ tone = "blue", children }: { tone?: Tone; children: ReactNode }) {
  const c = { slate: "bg-slate-50 border-slate-200 text-slate-800", blue: "bg-blue-50 border-blue-200 text-blue-900", green: "bg-emerald-50 border-emerald-200 text-emerald-900", amber: "bg-amber-50 border-amber-300 text-amber-900", red: "bg-red-50 border-red-200 text-red-900" }[tone];
  return <div role={tone === "red" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm no-print">
      <span className="text-slate-600">{page * pageSize + 1}-{Math.min(total, (page + 1) * pageSize)} of {total}</span>
      <div className="flex gap-2">
        <button className="btn-secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="btn-secondary" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 no-print">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${value === t.id ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
          {t.label}{t.badge ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-slate-500">Not enough data</span>;
  const tone = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
  const word = score >= 80 ? "Good" : score >= 60 ? "Needs attention" : "At risk";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200" aria-hidden><div className={`h-full ${tone}`} style={{ width: `${score}%` }} /></div>
      <span className="text-sm font-semibold tabular-nums">{score}%</span><span className="text-xs text-slate-600">{word}</span>
    </div>
  );
}

export function BarChart({ data, series, height = 140 }: { data: { label: string; values: number[] }[]; series: { name: string; color: string }[]; height?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  return (
    <figure>
      <div className="flex items-end gap-2 overflow-x-auto pb-1" style={{ height }} role="img" aria-label={series.map((s) => s.name).join(", ") + " by " + data.map((d) => d.label).join(", ")}>
        {data.map((d) => (
          <div key={d.label} className="flex min-w-[36px] flex-1 flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
            <div className="flex w-full flex-1 items-end justify-center gap-0.5">
              {d.values.map((v, i) => <div key={i} title={`${series[i].name}: ${v}`} className="w-full max-w-[18px] rounded-t" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 3 : 0, background: series[i].color }} />)}
            </div>
            <div className="text-[10px] text-slate-500">{d.label}</div>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">{series.map((s) => <span key={s.name} className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}</figcaption>
      <table className="sr-only"><caption>Chart data</caption><thead><tr><th>Period</th>{series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead><tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td>{d.values.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody></table>
    </figure>
  );
}

export function ResponsiveList<T>({ rows, columns, card, rowKey, onRow }: {
  rows: T[]; rowKey: (r: T) => string; onRow?: (r: T) => void;
  columns: { header: string; cell: (r: T) => ReactNode; className?: string }[]; card: (r: T) => ReactNode;
}) {
  return (
    <>
      <div className="space-y-2 md:hidden">{rows.map((r) => (
        <div key={rowKey(r)} className={`card p-4 ${onRow ? "cursor-pointer active:bg-slate-50" : ""}`} onClick={() => onRow?.(r)}>{card(r)}</div>))}</div>
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{columns.map((c) => <th key={c.header} scope="col" className={`px-4 py-3 font-semibold ${c.className ?? ""}`}>{c.header}</th>)}</tr></thead>
          <tbody className="divide-y">{rows.map((r) => (
            <tr key={rowKey(r)} className={onRow ? "cursor-pointer hover:bg-slate-50" : ""} onClick={() => onRow?.(r)}>
              {columns.map((c) => <td key={c.header} className={`px-4 py-3 align-top ${c.className ?? ""}`}>{c.cell(r)}</td>)}</tr>))}</tbody>
        </table>
      </div>
    </>
  );
}