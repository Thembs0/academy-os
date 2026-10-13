import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, CloudOff, Download, Plus, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import ProjectSelect from "@/components/ProjectSelect";
import { Badge, EmptyState, ErrorState, PageHeader, Pagination, ResponsiveList, Skeleton } from "@/components/ui";
import { OBS_STATUS } from "@/lib/constants";
import { OBS_SELECT } from "@/services/observations";
import { listLocalDrafts, type LocalDraft } from "@/lib/offline";
import { downloadCsv } from "@/utils/csv";
import { fmtDate, obsRef } from "@/utils/format";
import type { Observation } from "@/types/db";

const PAGE = 15;
const FILTERS = [["", "All"], ["draft", "Drafts"], ["pending", "Pending review"], ["queried", "Queried"], ["approved", "Approved"]] as const;

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "obsDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "obsDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes obsDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes obsDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

export default function ObservationsPage() {
  const a = useAuth(); const nav = useNavigate(); const { id: routeProject } = useParams(); const [sp, setSp] = useSearchParams();

  const canViewAll = a.can("observations.view.all");
  const canViewOwn = a.can("observations.view.own");
  const canReview  = a.can("observations.review");
  const canExport  = a.can("observations.export");

  const status = sp.get("status") ?? (canReview ? "pending" : "");
  const project = routeProject ?? sp.get("project") ?? "";
  const [page, setPage] = useState(0); const [local, setLocal] = useState<LocalDraft[]>([]);
  useEffect(() => { if (a.profile) listLocalDrafts(a.profile.id).then(setLocal); }, [a.profile]);

  const q = useQuery({
    queryKey: ["observations", { status, project, page, uid: a.profile?.id, canViewAll, canViewOwn }],
    queryFn: async () => {
      let r = supabase.from("observations").select(OBS_SELECT, { count: "exact" }).order("updated_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (!canViewAll && canViewOwn) r = r.eq("facilitator_id", a.profile!.id);
      if (status === "pending") r = r.in("status", ["submitted", "under_review", "resubmitted"]); else if (status) r = r.eq("status", status);
      if (project) r = r.eq("project_id", project);
      const { data, count, error } = await r; if (error) throw error; return { rows: data as unknown as Observation[], count: count ?? 0 };
    },
  });

  const setStatus = (v: string) => { const n = new URLSearchParams(sp); v ? n.set("status", v) : n.set("status", ""); if (!v) n.delete("status"); setSp(n); setPage(0); };
  const unsyncedLocal = local.filter((l) => !l.serverId || l.dirty);
  const exportCsv = () => downloadCsv("observations.csv", (q.data?.rows ?? []).map((o) => ({ ref: obsRef(o.ref_no), project: o.project?.name, school: o.school?.name, teacher: o.teacher?.full_name, facilitator: o.facilitator?.full_name, observed: o.observed_at, samr: o.samr_level, status: o.status, submitted: o.submitted_at, approved: o.approved_at })));
  const title = a.isFieldUser && !canViewAll ? "My observations" : a.persona === "hod" ? "Approved records" : "Submissions";

  const visibleFilters = FILTERS.filter(([k]) => !(a.persona === "hod" && k && k !== "approved") && !(!a.isFieldUser && k === "draft"));

  return (
    <>
      <Ambient />

      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="relative mb-6 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 right-0 h-56 w-[60%] rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,0.30), transparent 65%)" }}
          />
          <div className="relative">
            <PageHeader
              title={title}
              subtitle={a.persona === "hod" ? "You see observations once they have been approved." : undefined}
              actions={
                <>
                  {canExport && q.data?.rows.length ? (
                    <button
                      className="group inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.98]"
                      onClick={exportCsv}
                    >
                      <Download className="h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:translate-y-0.5" />
                      Export CSV
                    </button>
                  ) : null}
                  {a.isFieldUser && (
                    <Link
                      to="/observations/new"
                      className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
                      New observation
                    </Link>
                  )}
                </>
              }
            />
          </div>
        </div>

        {/* ── Filters + project select ───────────────────────────── */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            role="tablist"
            aria-label="Status filter"
            className="flex gap-1.5 overflow-x-auto rounded-full bg-slate-100/70 p-1 ring-1 ring-inset ring-slate-200/60 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {visibleFilters.map(([k, l]) => {
              const active = status === k;
              return (
                <button
                  key={k}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatus(k)}
                  className={`relative whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.97] ${
                    active
                      ? "bg-gradient-to-b from-brand to-brand-700 text-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.6)] ring-1 ring-inset ring-white/15"
                      : "text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-sm"
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>
          {!routeProject && (
            <div className="sm:ml-auto sm:w-64">
              <ProjectSelect value={project} onChange={(v) => { const n = new URLSearchParams(sp); v ? n.set("project", v) : n.delete("project"); setSp(n); setPage(0); }} />
            </div>
          )}
        </div>

        {/* ── Local drafts ────────────────────────────────────────── */}
        {unsyncedLocal.length > 0 && a.isFieldUser && (
          <section aria-label="Saved on this device" className="mb-6">
            <div className="mb-3 flex items-center gap-3 px-1">
              <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">
                <CloudOff className="h-3.5 w-3.5" />
                Saved on this device
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-amber-300/80 via-amber-200/60 to-transparent" />
            </div>
            <ul className="space-y-2.5">
              {unsyncedLocal.map((l) => (
                <li key={l.clientRef}>
                  <Link
                    to={`/observations/new?ref=${l.clientRef}`}
                    className="group flex items-center gap-3.5 rounded-2xl border border-slate-200/70 border-l-4 border-l-amber-500 bg-white/85 p-3.5 pr-4 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.2)] backdrop-blur transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-amber-300/80 hover:bg-amber-50/60 hover:shadow-[0_12px_28px_-14px_rgba(217,119,6,0.4)] active:translate-y-0 active:scale-[0.995]"
                  >
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100/80 ring-1 ring-inset ring-amber-200/70 transition-transform duration-200 group-hover:scale-105">
                      <CloudOff className="h-4.5 w-4.5 text-amber-600" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-800">{l.data.subject || "Untitled draft"}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {l.submitRequested ? "Waiting to submit" : "Not yet synced"} · step {l.step + 1}/7{l.lastError ? ` · ${l.lastError}` : ""}
                      </span>
                    </span>
                    <Badge tone="amber">Local</Badge>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-amber-600" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── List ────────────────────────────────────────────────── */}
        {q.isLoading ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !q.data?.rows.length ? (
          <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-2 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
            <EmptyState
              title={status === "pending" ? "No observations waiting for review" : "No observations here"}
              icon={<ClipboardCheck className="h-6 w-6" />}
              text={a.isFieldUser ? "Start a new observation from the button above." : "They will appear here as facilitators submit them."}
            />
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/75 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
              <ResponsiveList
                rows={q.data.rows}
                rowKey={(o) => o.id}
                onRow={(o) => nav(`/observations/${o.id}${["draft", "queried"].includes(o.status) && o.facilitator_id === a.profile?.id ? "/edit" : ""}`)}
                columns={[
                  { header: "Ref", cell: (o) => <span className="font-bold tracking-tight text-brand">{obsRef(o.ref_no)}</span> },
                  { header: "School", cell: (o) => <span className="text-slate-700">{o.school?.name ?? "-"}</span> },
                  { header: "Teacher", cell: (o) => <span className="text-slate-700">{o.teacher?.full_name ?? "-"}</span> },
                  { header: "Facilitator", cell: (o) => <span className="text-slate-700">{o.facilitator?.full_name ?? "-"}</span> },
                  { header: "Observed", cell: (o) => <span className="text-slate-600">{fmtDate(o.observed_at)}</span> },
                  { header: "SAMR", cell: (o) => <span className="text-slate-600">{o.samr_level ?? "-"}</span> },
                  { header: "Status", cell: (o) => <Badge tone={OBS_STATUS[o.status].tone}>{OBS_STATUS[o.status].label}</Badge> },
                ]}
                card={(o) => (
                  <div className="transition-transform duration-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold tracking-tight text-brand">{obsRef(o.ref_no)}</span>
                      <Badge tone={OBS_STATUS[o.status].tone}>{OBS_STATUS[o.status].label}</Badge>
                    </div>
                    <div className="mt-1.5 truncate text-sm font-medium text-slate-800">
                      {o.teacher?.full_name ?? "No teacher"} <span className="text-slate-400">·</span> <span className="text-slate-600">{o.school?.name ?? "No school"}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {fmtDate(o.observed_at)}{a.persona !== "facilitator" ? ` · ${o.facilitator?.full_name}` : ""}
                    </div>
                  </div>
                )}
              />
            </div>
            <div className="mt-4">
              <Pagination page={page} pageSize={PAGE} total={q.data.count} onPage={setPage} />
            </div>
          </>
        )}
      </div>
    </>
  );
}