import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, ClipboardPlus, GraduationCap, School,
  FileText, ClipboardCheck, FolderKanban,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { useSync } from "@/features/auth/SyncProvider";
import { ErrorState, ScoreBar, Skeleton, Stat, PageHeader, EmptyState } from "@/components/ui";
import type { ProjectCounts } from "@/types/db";
import { CheckInCard } from "@/features/checkins/CheckInCard";

interface Summary {
  totals: Record<string, number>; my: Record<string, number>;
  projects: { id: string; name: string; code: string | null; status: string; counts: ProjectCounts; health: number | null }[];
}
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

/* Ambient page background - subtle, never distracting. */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[calc(100dvh-72px)] overflow-hidden lg:h-dvh">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/60 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.5), rgba(56,189,248,0) 70%)",
          animation: "dashDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-35 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "dashDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes dashDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes dashDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

/* Section header - small label + hairline rule (Apple Settings style). */
function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="mb-3.5 flex items-center gap-3 px-1">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-slate-300/80 via-slate-200/60 to-transparent" />
    </div>
  );
}

export default function Dashboard() {
  const a = useAuth(); const { pending: localPending } = useSync();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: async () => { const { data, error } = await supabase.rpc("dashboard_summary"); if (error) throw error; return data as Summary; } });
  const first = a.profile?.full_name.split(" ")[0] ?? "";
  if (q.isLoading) return <Skeleton rows={5} />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { totals: t, my, projects } = q.data;
  const field = a.persona === "facilitator"; const admin = a.persona === "admin";
  const canReview = ["super_admin", "hod", "manager"].includes(a.persona);

  const actions: { text: string; to: string; show: boolean }[] = [
    { text: `${my.queried} of your observations need changes`, to: "/observations?status=queried", show: field && my.queried > 0 },
    { text: `${my.drafts} draft observation${my.drafts === 1 ? "" : "s"} not yet submitted`, to: "/observations?status=draft", show: field && my.drafts > 0 },
    { text: `${localPending} item${localPending === 1 ? "" : "s"} saved on this device waiting to sync`, to: "/observations", show: field && localPending > 0 },
    { text: `${t.pending} observation${t.pending === 1 ? "" : "s"} waiting for review`, to: "/observations?status=pending", show: canReview && t.pending > 0 },
    { text: `${t.queried} observation${t.queried === 1 ? "" : "s"} queried, awaiting facilitator response`, to: "/observations?status=queried", show: canReview && t.queried > 0 },
    { text: `${t.docs_awaiting} document${t.docs_awaiting === 1 ? "" : "s"} awaiting verification`, to: "/documents?status=uploaded", show: !field && t.docs_awaiting > 0 },
    { text: `${t.new_external} new external submission${t.new_external === 1 ? "" : "s"}`, to: "/documents?status=uploaded", show: !field && t.new_external > 0 },
    { text: `${t.missing_documents} required document${t.missing_documents === 1 ? "" : "s"} missing`, to: "/outstanding", show: !field && t.missing_documents > 0 },
    { text: `${t.overdue_reports} report${t.overdue_reports === 1 ? "" : "s"} overdue`, to: "/reports", show: !field && t.overdue_reports > 0 },
  ].filter((x) => x.show);

  return (
    <>
      <Ambient />

      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        
        
      {/* ── Greeting hero ──────────────────────────────────────────── */}
      <div className="relative mb-7 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 h-56 w-[60%] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.35), transparent 65%)" }}
        />
        <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <PageHeader
            title={`${greeting()}, ${first}`}
            subtitle={field ? "Ready for the field?" : a.persona === "hod" || a.persona === "super_admin" ? "Department overview" : "Here's what needs your attention."}
          />
          <div className="lg:w-[380px]">
            <CheckInCard />
          </div>
        </div>
      </div>

        {/* ── Primary CTA (facilitator) ──────────────────────────────── */}
        {field && a.isFieldUser && (
          <Link
            to="/observations/new"
            className="group relative mb-7 flex items-center justify-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-b from-brand to-brand-700 px-6 py-7 text-lg font-extrabold tracking-wide text-white shadow-[0_18px_40px_-18px_rgba(15,23,42,0.7)] ring-1 ring-inset ring-white/20 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:brightness-[1.04] hover:shadow-[0_24px_50px_-20px_rgba(15,23,42,0.75)] active:translate-y-0 active:scale-[0.985] active:brightness-[0.96]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-8 rounded-full opacity-40 blur-2xl"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.35), transparent 60%)" }}
            />
            <ClipboardPlus className="relative h-7 w-7 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-[-3deg]" aria-hidden />
            <span className="relative">START OBSERVATION</span>
          </Link>
        )}

        {/* ── Action required ────────────────────────────────────────── */}
        <section aria-labelledby="ar" className="mb-9">
          <SectionLabel id="ar">Action required</SectionLabel>
          {actions.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 text-sm text-slate-600 shadow-sm backdrop-blur">
              Nothing needs your attention right now.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {actions.map((x) => (
                <li key={x.text}>
                  <Link
                    to={x.to}
                    className="group flex items-center gap-3.5 rounded-2xl border border-slate-200/70 border-l-4 border-l-amber-500 bg-white/85 p-3.5 pr-4 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.2)] backdrop-blur transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-amber-300/80 hover:bg-amber-50/70 hover:shadow-[0_12px_28px_-14px_rgba(217,119,6,0.4)] active:translate-y-0 active:scale-[0.995]"
                  >
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100/80 ring-1 ring-inset ring-amber-200/70 transition-transform duration-200 group-hover:scale-105">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-full opacity-0 ring-2 ring-amber-400/40 transition-opacity duration-300 group-hover:opacity-100"
                      />
                      <AlertTriangle className="h-4.5 w-4.5 text-amber-600" aria-hidden />
                    </span>
                    <span className="flex-1 text-sm font-medium leading-snug text-slate-800">{x.text}</span>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100/80 text-slate-400 transition-all duration-200 group-hover:bg-amber-500 group-hover:text-white group-hover:shadow-[0_4px_10px_-4px_rgba(217,119,6,0.7)]">
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-px" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Stats ──────────────────────────────────────────────────── */}
        {field ? (
          <section aria-labelledby="ms" className="mb-9">
            <SectionLabel id="ms">My activity</SectionLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Observations" value={my.total} />
              <Stat label="Pending review" value={my.pending} />
              <Stat label="Queried" value={my.queried} tone={my.queried ? "amber" : undefined} />
              <Stat label="Approved" value={my.approved} tone="green" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {[["/schools", "My Schools", School], ["/teachers", "My Teachers", GraduationCap], ["/observations", "My Submissions", ClipboardCheck], ["/documents", "Upload Document", FileText]].map(([to, label, Icon]: any) => (
                <Link
                  key={to}
                  to={to}
                  className="group relative flex min-h-[88px] items-center gap-3 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/85 p-4 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.2)] backdrop-blur transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-brand/40 hover:bg-white hover:shadow-[0_14px_30px_-14px_rgba(56,189,248,0.45)] active:translate-y-0 active:scale-[0.98]"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand/0 blur-2xl transition-all duration-300 group-hover:bg-brand/15"
                  />
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-brand/5 ring-1 ring-inset ring-brand/20 transition-transform duration-200 group-hover:scale-110">
                    <Icon className="h-5.5 w-5.5 text-brand" aria-hidden />
                  </span>
                  <span className="relative font-semibold leading-tight text-slate-800">{label}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section aria-labelledby="ov" className="mb-9">
            <SectionLabel id="ov">Overview</SectionLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Stat label="Projects" value={t.projects} hint={`${t.active_projects} active`} />
              <Stat label="Schools" value={t.schools} />
              <Stat label="Teachers" value={t.teachers} />
              <Stat label="Facilitators" value={t.facilitators} />
              {!admin && <Stat label="Administrators" value={t.administrators} />}
              <Stat label="Observations" value={t.observations} hint="submitted" />
              <Stat label="Approved" value={t.approved} tone="green" />
              <Stat label="Pending review" value={t.pending} tone={t.pending ? "amber" : undefined} />
              <Stat label="Queried" value={t.queried} tone={t.queried ? "amber" : undefined} />
              <Stat label="Missing documents" value={t.missing_documents} tone={t.missing_documents ? "red" : undefined} />
              {(a.persona === "hod" || a.persona === "super_admin") && <Stat label="Approved this week" value={t.approved_this_week} tone="green" />}
            </div>
          </section>
        )}

        {/* ── Projects ───────────────────────────────────────────────── */}
        <section aria-labelledby="mp">
          <SectionLabel id="mp">{field || admin ? "My projects" : "Project health"}</SectionLabel>
          {projects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              text={a.hasRole("super_admin") ? "Create the first project from the Projects page." : "You haven't been assigned to a project yet. Ask your project manager."}
              icon={<FolderKanban className="h-6 w-6" />}
            />
          ) : (
            <div className="grid gap-3.5 md:grid-cols-2">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_6px_20px_-12px_rgba(15,23,42,0.25)] backdrop-blur transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-sky-500/40 hover:shadow-[0_20px_44px_-22px_rgba(14,165,233,0.55)] active:translate-y-0 active:scale-[0.99]"
                >
                  {/* Hover accent stripe */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-sky-400 to-brand opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  {/* Ambient glow on hover */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-sky-400/0 blur-3xl transition-all duration-300 group-hover:bg-sky-400/20"
                  />

                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.35)]" aria-hidden />
                        <div className="truncate font-semibold text-slate-900 transition-colors group-hover:text-sky-700">
                          {p.name}
                        </div>
                      </div>
                      <div className="mt-1 pl-3.5 text-xs capitalize text-slate-500">{p.status}</div>
                    </div>
                    <div className="shrink-0 transition-transform duration-200 group-hover:scale-[1.04]">
                      <ScoreBar score={p.health} />
                    </div>
                  </div>

                  <div className="relative mt-4 grid grid-cols-4 overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50/70 transition-colors group-hover:border-sky-200/70 group-hover:bg-white">
                    {[
                      { label: "Schools", value: p.counts.schools },
                      { label: "Pending", value: p.counts.pending },
                      { label: "Queried", value: p.counts.queried },
                      { label: "Approved", value: p.counts.approved },
                    ].map((c, i) => (
                      <div
                        key={c.label}
                        className={`px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500 ${i > 0 ? "border-l border-slate-200/70" : ""}`}
                      >
                        <div className="text-[15px] font-bold leading-tight tracking-normal text-slate-900">{c.value}</div>
                        {c.label}
                      </div>
                    ))}
                  </div>

                  <ArrowRight
                    className="pointer-events-none absolute right-4 top-4 h-4 w-4 -translate-x-1 text-slate-300 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-sky-600 group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}