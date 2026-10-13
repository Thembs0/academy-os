import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Filter, TrendingUp, FileText, Building2,
  UserRound, AlertTriangle, BookOpen, CheckCircle2, Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import ProjectSelect from "@/components/ProjectSelect";
import { BarChart, EmptyState, ErrorState, LabeledInput, Skeleton, Stat } from "@/components/ui";
import { DOC_STATUS, OBS_STATUS } from "@/lib/constants";

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
  "Mpumalanga", "North West", "Northern Cape", "Western Cape",
];

interface A {
  by_status: Record<string, number>;
  monthly: { month: string; submitted: number; approved: number }[];
  samr_trend: { month: string; S: number; A: number; M: number; R: number }[];
  turnaround_days: number | null;
  facilitators: { name: string; total: number; approved: number }[];
  projects: { name: string; total: number; approved: number }[];
  documents_by_status: Record<string, number>;
  outstanding_by_project: { name: string; count: number }[];
  reporting: { periods_ended: number; with_report: number };
}

/* ── Ambient background ─────────────────────────────────────────────── */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "anDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "anDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes anDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes anDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-3 px-1">
      {Icon && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-inset ring-brand/15">
          <Icon className="h-3.5 w-3.5 text-brand" aria-hidden />
        </span>
      )}
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-slate-300/80 via-slate-200/60 to-transparent" />
    </div>
  );
}

/* ── Status row with progress bar ───────────────────────────────────── */
function StatusRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <li className="rounded-2xl border border-slate-200/60 bg-white/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-slate-800">{label}</span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{value}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

/* ── List row for projects / facilitators ───────────────────────────── */
function StatRow({ name, total, approved, maxTotal }: { name: string; total: number; approved: number; maxTotal: number }) {
  const pctTotal = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const pctApproved = total > 0 ? (approved / total) * 100 : 0;
  return (
    <li className="rounded-2xl border border-slate-200/60 bg-white/60 p-3 transition-colors hover:bg-white">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-slate-800">{name}</span>
        <span className="shrink-0 text-xs font-semibold text-slate-500 tabular-nums">
          <span className="text-slate-900">{total}</span> submitted · <span className="text-emerald-700">{approved}</span> approved
        </span>
      </div>
      <div className="mt-2 flex gap-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70">
          <div className="h-full rounded-full bg-brand" style={{ width: `${pctTotal}%` }} />
        </div>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pctApproved}%` }} />
        </div>
      </div>
    </li>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */
export default function AnalyticsPage() {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 5, 1)));
  const [to, setTo] = useState(iso(now));
  const [project, setProject] = useState("");
  const [province, setProvince] = useState("");

  const q = useQuery({
    queryKey: ["analytics", from, to, project, province],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analytics", {
        p_from: from, p_to: to,
        p_project: project || null, p_facilitator: null,
        p_school: null, p_province: province || null,
      });
      if (error) throw error;
      return data as A;
    },
  });

  const d = q.data;
  const total = d ? Object.values(d.by_status).reduce((x, y) => x + y, 0) : 0;
  const docsTotal = d ? Object.values(d.documents_by_status).reduce((x, y) => x + y, 0) : 0;
  const maxProjectTotal = useMemo(() => Math.max(1, ...(d?.projects ?? []).map((p) => p.total)), [d]);
  const maxFacilitatorTotal = useMemo(() => Math.max(1, ...(d?.facilitators ?? []).map((p) => p.total)), [d]);

  return (
    <>
      <Ambient />
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="relative mb-6 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 right-0 h-56 w-[60%] rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,0.30), transparent 65%)" }}
          />
          <div className="relative flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-brand/5 ring-1 ring-inset ring-brand/20">
              <BarChart3 className="h-5 w-5 text-brand" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">Analytics</h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Counts include submitted observations in the selected period. Quality measures use approved records only.
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <section className="mb-6">
          <SectionLabel icon={Filter}>Filters</SectionLabel>
          <div className="rounded-3xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <LabeledInput label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <LabeledInput label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <div>
                <div className="label">Project</div>
                <ProjectSelect value={project} onChange={setProject} />
              </div>
              <div>
                <div className="label">Province</div>
                <select
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white/70 px-3 text-sm shadow-sm transition-all focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                >
                  <option value="">All provinces</option>
                  {PROVINCES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Body */}
        {q.isLoading ? (
          <Skeleton rows={4} />
        ) : q.error || !d ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : total === 0 && !Object.keys(d.documents_by_status).length ? (
          <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-2 shadow-sm backdrop-blur">
            <EmptyState
              title="No data for these filters"
              text="Try a wider date range or clear the project/province filters."
              icon={<BarChart3 className="h-6 w-6" />}
            />
          </div>
        ) : (
          <>
            {/* KPI strip */}
            <section className="mb-6">
              <SectionLabel icon={Sparkles}>Key metrics</SectionLabel>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Submitted" value={total} hint="in this period" />
                <Stat label="Approved" value={d.by_status.approved ?? 0} tone="green" />
                <Stat label="Queried" value={d.by_status.queried ?? 0} tone="amber" />
                <Stat
                  label="Avg. days to approval"
                  value={d.turnaround_days != null ? d.turnaround_days : "-"}
                  hint="submission → approval"
                />
              </div>
            </section>

            {/* Charts row */}
            <section className="mb-6">
              <SectionLabel icon={TrendingUp}>Trends</SectionLabel>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
                  <h3 className="mb-4 flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
                    <BarChart3 className="h-4 w-4 text-brand" aria-hidden />
                    Observations by month
                  </h3>
                  <BarChart
                    height={150}
                    data={d.monthly.map((m) => ({ label: m.month.slice(2), values: [m.submitted, m.approved] }))}
                    series={[
                      { name: "Submitted", color: "#1E4589" },
                      { name: "Approved", color: "#10b981" },
                    ]}
                  />
                </div>
                <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
                  <h3 className="mb-4 flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
                    <TrendingUp className="h-4 w-4 text-brand" aria-hidden />
                    SAMR trend <span className="font-medium text-slate-500">(approved)</span>
                  </h3>
                  {d.samr_trend.length ? (
                    <BarChart
                      height={150}
                      data={d.samr_trend.map((m) => ({ label: m.month.slice(2), values: [m.S, m.A, m.M, m.R] }))}
                      series={[
                        { name: "S", color: "#94a3b8" },
                        { name: "A", color: "#56BBED" },
                        { name: "M", color: "#1E4589" },
                        { name: "R", color: "#7c3aed" },
                      ]}
                    />
                  ) : (
                    <p className="rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 text-sm text-slate-600">
                      No approved observations in range.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Status breakdowns */}
            <section className="mb-6">
              <SectionLabel icon={CheckCircle2}>Breakdowns</SectionLabel>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
                  <h3 className="mb-4 flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
                    <CheckCircle2 className="h-4 w-4 text-brand" aria-hidden />
                    Observations by status
                  </h3>
                  {Object.keys(d.by_status).length === 0 ? (
                    <p className="text-sm text-slate-500">No observations in range.</p>
                  ) : (
                    <ul className="space-y-2">
                      {Object.entries(d.by_status).map(([k, v]) => {
                        const label = OBS_STATUS[k as keyof typeof OBS_STATUS]?.label ?? k;
                        const tone =
                          k === "approved" ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                          : k === "queried" ? "bg-gradient-to-r from-amber-400 to-amber-600"
                          : k === "rejected" ? "bg-gradient-to-r from-red-400 to-red-600"
                          : "bg-gradient-to-r from-sky-400 to-brand";
                        return <StatusRow key={k} label={label} value={v} total={total} tone={tone} />;
                      })}
                    </ul>
                  )}
                </div>
                <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
                  <h3 className="mb-4 flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
                    <FileText className="h-4 w-4 text-brand" aria-hidden />
                    Documents by status
                  </h3>
                  {Object.keys(d.documents_by_status).length === 0 ? (
                    <p className="text-sm text-slate-500">No documents in range.</p>
                  ) : (
                    <ul className="space-y-2">
                      {Object.entries(d.documents_by_status).map(([k, v]) => {
                        const label = DOC_STATUS[k as keyof typeof DOC_STATUS]?.label ?? k;
                        return (
                          <StatusRow
                            key={k}
                            label={label}
                            value={v}
                            total={docsTotal}
                            tone="bg-gradient-to-r from-sky-400 to-brand"
                          />
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            {/* By project / facilitator */}
            <section className="mb-6">
              <SectionLabel icon={Building2}>Activity</SectionLabel>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
                  <h3 className="mb-4 flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
                    <Building2 className="h-4 w-4 text-brand" aria-hidden />
                    By project
                  </h3>
                  {d.projects.length === 0 ? (
                    <p className="text-sm text-slate-500">No activity in range.</p>
                  ) : (
                    <ul className="space-y-2">
                      {d.projects.map((p) => (
                        <StatRow key={p.name} name={p.name} total={p.total} approved={p.approved} maxTotal={maxProjectTotal} />
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
                  <h3 className="mb-4 flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
                    <UserRound className="h-4 w-4 text-brand" aria-hidden />
                    By facilitator
                  </h3>
                  {d.facilitators.length === 0 ? (
                    <p className="text-sm text-slate-500">No activity in range.</p>
                  ) : (
                    <ul className="space-y-2">
                      {d.facilitators.map((p) => (
                        <StatRow key={p.name} name={p.name} total={p.total} approved={p.approved} maxTotal={maxFacilitatorTotal} />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            {/* Outstanding + Reporting */}
            <section className="mb-6">
              <SectionLabel icon={AlertTriangle}>Operational</SectionLabel>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
                  <h3 className="mb-4 flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
                    Outstanding items by project
                  </h3>
                  {d.outstanding_by_project.length === 0 ? (
                    <p className="text-sm text-slate-500">Nothing outstanding.</p>
                  ) : (
                    <ul className="space-y-2">
                      {d.outstanding_by_project.map((p) => (
                        <li key={p.name} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/60 px-3 py-2">
                          <span className="truncate text-sm font-medium text-amber-900">{p.name}</span>
                          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">{p.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-slate-500">Current position, not date-filtered.</p>
                </div>
                <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
                  <h3 className="mb-4 flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
                    <BookOpen className="h-4 w-4 text-brand" aria-hidden />
                    Reporting completion
                  </h3>
                  {d.reporting.periods_ended === 0 ? (
                    <p className="text-sm text-slate-500">No reporting periods ended in this range.</p>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                          {d.reporting.with_report}<span className="text-slate-400">/{d.reporting.periods_ended}</span>
                        </span>
                        <span className="text-sm text-slate-600">ended periods have a report</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/70">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-brand"
                          style={{ width: `${d.reporting.periods_ended > 0 ? (d.reporting.with_report / d.reporting.periods_ended) * 100 : 0}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}