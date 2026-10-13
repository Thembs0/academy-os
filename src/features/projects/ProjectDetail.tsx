import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ChevronDown, Info, Activity, Gauge, TrendingUp, Users,
  School as SchoolIcon, Building2, HeartHandshake, MapPin,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Badge, BarChart, ErrorState, ScoreBar, Skeleton, Stat, Tabs } from "@/components/ui";
import { OutstandingPanel } from "@/features/documents/OutstandingPage";
import { TeamTab, SchoolsTab, TeachersTab, LinksTab, ConfigTab } from "./ProjectTabs";
import type { Health, Project, ProjectCounts } from "@/types/db";

interface Overview {
  project: Project;
  counts: ProjectCounts;
  health: Health;
  outstanding_by_label: { kind: string; label: string; count: number }[];
  trend: { month: string; submitted: number; approved: number; queried: number }[];
  facilitator_activity: { user_id: string; name: string; observations: number; approved: number }[];
}

type Tab = "overview" | "team" | "schools" | "teachers" | "outstanding" | "links" | "config";

const DIMS: [keyof Health, string][] = [
  ["documentation", "Documentation completeness"],
  ["field_activity", "Field activity"],
  ["data_completeness", "Data completeness"],
  ["approvals", "Approval turnaround"],
  ["reporting", "Reporting"],
];

/** Human label + icon for each project type. */
function projectTypeMeta(t: string) {
  switch (t) {
    case "school_based":    return { label: "School-based",    icon: SchoolIcon,   hint: "Works with schools and teachers" };
    case "venue_based":     return { label: "Venue-based",     icon: Building2,    hint: "Runs at a specific venue" };
    case "community_based": return { label: "Community-based", icon: HeartHandshake, hint: "Works with community groups or individuals" };
    default:                return { label: "Other",           icon: MapPin,       hint: "Non-school programme" };
  }
}

/* Ambient page background - consistent with the rest of the app. */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "pdDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "pdDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes pdDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes pdDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

/* Section label with hairline - app-wide pattern. */
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

export default function ProjectDetail() {
  const { id = "" } = useParams();
  const a = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) ?? "overview";
  const [how, setHow] = useState(false);

  const q = useQuery({
    queryKey: ["project-overview", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("project_overview", { p_project: id });
      if (error) throw error;
      return data as Overview;
    },
  });

  if (q.isLoading) return <Skeleton rows={5} />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const { project: p, counts: c, health: h, trend, facilitator_activity: fa } = q.data;

  // Which type of project is this? Falls back to "school_based" for older projects
  // that were created before the `project_type` column existed.
  const projectType = (p as any).project_type ?? "school_based";
  const isSchoolBased = projectType === "school_based";
  const typeMeta = projectTypeMeta(projectType);
  const TypeIcon = typeMeta.icon;

  const roles = a.projectRoles(id);
  const canTeam = a.hasRole("super_admin", "hod", "coordinator") || roles.includes("manager");
  const canLinks = a.can("external_upload.manage");

  // Build the tab list. Schools and Teachers only appear for school-based projects.
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "team", label: "Team" },
    ...(isSchoolBased ? [
      { id: "schools" as Tab, label: "Schools" },
      { id: "teachers" as Tab, label: "Teachers" },
    ] : []),
    { id: "outstanding", label: "Outstanding", badge: c.outstanding_total || undefined },
    ...(canLinks ? [{ id: "links" as Tab, label: "Upload links" }] : []),
    { id: "config", label: "Configuration" },
  ];

  return (
    <>
      <Ambient />

      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        {/* ── Hero header ─────────────────────────────────────────── */}
        <div className="relative mb-5 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 right-0 h-56 w-[60%] rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,0.30), transparent 65%)" }}
          />
          <div className="relative">
            <Link
              to="/projects"
              className="group mb-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200/70 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-slate-900 hover:shadow-sm active:translate-y-0"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
              Projects
            </Link>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{p.name}</h1>

                {/* Badge row: project code · status · project type */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {p.project_code && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200/70">
                      <Building2 className="h-3 w-3" aria-hidden />
                      Funded by {p.project_code}
                    </span>
                  )}
                  <Badge tone={p.status === "active" ? "green" : "slate"}>{p.status}</Badge>

                  <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200/70"
                    title={typeMeta.hint}
                  >
                    <TypeIcon className="h-3 w-3" aria-hidden />
                    {typeMeta.label}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Observations", to: `/projects/${id}/observations` },
                  { label: "Documents", to: `/documents?project=${id}` },
                  { label: "Reports", to: `/reports?project=${id}` },
                ].map((x) => (
                  <button
                    key={x.to}
                    className="group inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.98]"
                    onClick={() => nav(x.to)}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────── */}
        <div className="mb-5">
          <Tabs tabs={tabs} value={tab} onChange={(t) => setSp({ tab: t })} />
        </div>

        {/* ── Overview ────────────────────────────────────────────── */}
        {tab === "overview" && (<>
          <section className="mb-7">
            <SectionLabel icon={Users}>People</SectionLabel>
            <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4`}>
              {/* Schools and Teachers only make sense for school-based projects */}
              {isSchoolBased && (
                <>
                  <Stat label="Schools" value={c.schools} />
                  <Stat label="Teachers" value={c.teachers} />
                </>
              )}
              <Stat label="Facilitators" value={c.facilitators} />
              <Stat label="Administrators" value={c.administrators} />
            </div>
          </section>

          <section className="mb-7">
            <SectionLabel icon={Activity}>Observations</SectionLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Observations this month" value={c.observations_month} />
              <Stat label="Pending review" value={c.pending} tone={c.pending ? "amber" : undefined} />
              <Stat label="Queried" value={c.queried} tone={c.queried ? "amber" : undefined} />
              <Stat label="Approved" value={c.approved} tone="green" />
            </div>
          </section>

          {/* Health */}
          <section className="mb-7 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/75 p-5 shadow-[0_15px_40px_-25px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-brand/5 ring-1 ring-inset ring-brand/20">
                  <Gauge className="h-4 w-4 text-brand" aria-hidden />
                </span>
                <h2 className="text-base font-bold tracking-tight">Project health</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <ScoreBar score={h.overall} />
                <button
                  className="group inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200/70 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-slate-900 hover:shadow-sm active:translate-y-0"
                  aria-expanded={how}
                  onClick={() => setHow(!how)}
                >
                  <Info className="h-3.5 w-3.5" />
                  How is this calculated?
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${how ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            <ul className="space-y-4">
              {DIMS.map(([k, l]) => {
                const d = h[k] as { score: number | null; detail: string };
                return (
                  <li key={k} className="rounded-2xl border border-slate-200/60 bg-white/60 p-3.5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-800">{l}</span>
                      <ScoreBar score={d.score} />
                    </div>
                    {how && <p className="mt-2 text-xs leading-relaxed text-slate-600">{d.detail}</p>}
                  </li>
                );
              })}
            </ul>

            {how && (
              <p className="mt-4 rounded-2xl border border-slate-200/60 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-600">
                The overall score is the simple average of the dimensions that have data. Dimensions with no data are excluded, never counted as zero or 100.
              </p>
            )}
          </section>

          {/* Charts + activity */}
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/75 p-5 shadow-[0_15px_40px_-25px_rgba(15,23,42,0.3)] backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-brand/5 ring-1 ring-inset ring-brand/20">
                  <TrendingUp className="h-4 w-4 text-brand" aria-hidden />
                </span>
                <h2 className="text-base font-bold tracking-tight">Last 6 months</h2>
              </div>
              <BarChart
                height={150}
                data={trend.map((t) => ({ label: t.month.slice(5), values: [t.submitted, t.approved, t.queried] }))}
                series={[
                  { name: "Submitted", color: "#1E4589" },
                  { name: "Approved", color: "#10b981" },
                  { name: "Queried", color: "#f59e0b" },
                ]}
              />
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/75 p-5 shadow-[0_15px_40px_-25px_rgba(15,23,42,0.3)] backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-brand/5 ring-1 ring-inset ring-brand/20">
                  <Activity className="h-4 w-4 text-brand" aria-hidden />
                </span>
                <h2 className="text-base font-bold tracking-tight">
                  Facilitator activity <span className="font-medium text-slate-500">(90 days)</span>
                </h2>
              </div>
              {fa.length === 0 ? (
                <p className="rounded-2xl border border-slate-200/60 bg-white/60 p-4 text-sm text-slate-600">
                  No submitted observations in the last 90 days.
                </p>
              ) : (
                <ul className="space-y-2">
                  {fa.map((f) => (
                    <li
                      key={f.user_id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/60 bg-white/60 px-3.5 py-2.5 text-sm shadow-sm transition-colors hover:bg-white"
                    >
                      <span className="truncate font-medium text-slate-800">{f.name}</span>
                      <span className="shrink-0 text-xs font-semibold text-slate-600">
                        <span className="text-slate-900">{f.observations}</span> submitted
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="text-emerald-700">{f.approved}</span> approved
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>)}

        {/* ── Tabs whose data comes from ProjectTabs.tsx ────────── */}
        {tab === "team" && <TeamTab projectId={id} canManage={canTeam} />}

        {tab === "schools" && isSchoolBased && (
          <SchoolsTab
            projectId={id}
            canManage={a.can("schools.manage")}
            canAssign={canTeam || roles.includes("admin") || roles.includes("senior_admin")}
          />
        )}

        {tab === "teachers" && isSchoolBased && (
          <TeachersTab projectId={id} canManage={a.can("teachers.manage")} />
        )}

        {tab === "outstanding" && <OutstandingPanel projectId={id} />}
        {tab === "links" && canLinks && <LinksTab projectId={id} />}
        {tab === "config" && <ConfigTab project={p} canEdit={a.hasRole("super_admin", "hod")} />}
      </div>
    </>
  );
}