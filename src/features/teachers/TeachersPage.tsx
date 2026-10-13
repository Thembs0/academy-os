import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Download, GraduationCap, Plus, Search, ChevronRight, School as SchoolIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { useDebounce } from "@/hooks";
import ProjectSelect from "@/components/ProjectSelect";
import { Badge, EmptyState, ErrorState, PageHeader, Pagination, ResponsiveList, Skeleton } from "@/components/ui";
import { TeacherFormModal } from "@/features/schools/forms";
import { downloadCsv } from "@/utils/csv";
import { safeTerm } from "@/utils/format";
import type { Teacher } from "@/types/db";

const PAGE = 20;

/* Ambient page background - matches the rest of the app. */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "tpDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "tpDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes tpDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes tpDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

/* iOS-style switch - same semantics as a checkbox. */
function IOSSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-white hover:shadow-md active:translate-y-0">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors duration-200 peer-checked:bg-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand/25" aria-hidden />
        <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out peer-checked:translate-x-5" aria-hidden />
      </span>
    </label>
  );
}

/* Simple initials avatar for the mobile card. */
function Initials({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/15 to-brand/5 text-sm font-bold text-brand ring-1 ring-inset ring-brand/20">
      {initials || "?"}
    </span>
  );
}

export default function TeachersPage() {
  const a = useAuth(); const [sp, setSp] = useSearchParams(); const project = sp.get("project") ?? "";
  const [term, setTerm] = useState(""); const dq = useDebounce(term); const [page, setPage] = useState(0); const [add, setAdd] = useState(false); const [showAll, setShowAll] = useState(false);
  const mine = a.persona === "facilitator" && !showAll;
  const q = useQuery({
    queryKey: ["teachers", { dq, page, project, mine, uid: a.profile?.id }],
    queryFn: async () => {
      let schoolIds: string[] | null = null;
      if (mine) { const { data } = await supabase.from("school_facilitators").select("school_id").eq("user_id", a.profile!.id).eq("is_active", true); schoolIds = (data ?? []).map((r: any) => r.school_id); if (!schoolIds.length) return { rows: [] as Teacher[], count: 0 }; }
      let r = supabase.from("teachers").select(project ? "*, school:schools(name), project_teachers!inner(project_id)" : "*, school:schools(name)", { count: "exact" }).order("full_name").range(page * PAGE, page * PAGE + PAGE - 1);
      if (project) r = r.eq("project_teachers.project_id", project);
      if (schoolIds) r = r.in("school_id", schoolIds);
      const t = safeTerm(dq); if (t) r = r.or(`full_name.ilike.%${t}%,employee_or_teacher_number.ilike.%${t}%`);
      const { data, count, error } = await r; if (error) throw error; return { rows: data as unknown as Teacher[], count: count ?? 0 };
    },
  });
  const canAdd = a.can("teachers.manage") && a.persona !== "viewer";
  const exportCsv = async () => { const { data } = await supabase.from("teachers").select("full_name,employee_or_teacher_number,email,phone,is_active,school:schools(name)").order("full_name").limit(5000); downloadCsv("teachers.csv", ((data ?? []) as any[]).map((t) => ({ full_name: t.full_name, "SACE number": t.employee_or_teacher_number, email: t.email, phone: t.phone, is_active: t.is_active, school: t.school?.name }))); };

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
              title={a.persona === "facilitator" ? "My teachers" : "Teachers"}
              actions={
                <>
                  {a.persona !== "facilitator" && (
                    <button
                      className="group inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.98]"
                      onClick={exportCsv}
                    >
                      <Download className="h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:translate-y-0.5" />
                      Export CSV
                    </button>
                  )}
                  {canAdd && (
                    <button
                      className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98]"
                      onClick={() => setAdd(true)}
                    >
                      <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
                      Add teacher
                    </button>
                  )}
                </>
              }
            />
          </div>
        </div>

        {/* ── Search + project filter ─────────────────────────────── */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="group relative flex-1">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors duration-200 group-focus-within:bg-brand/10 group-focus-within:text-brand"
            >
              <Search className="h-3.5 w-3.5" />
            </span>
            <input
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white/75 pl-12 pr-4 text-sm shadow-sm backdrop-blur transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15"
              placeholder="Search by name or teacher number"
              aria-label="Search teachers"
              value={term}
              onChange={(e) => { setTerm(e.target.value); setPage(0); }}
            />
          </div>
          <ProjectSelect value={project} onChange={(v) => { setSp(v ? { project: v } : {}); setPage(0); }} className="sm:w-64" />
        </div>

        {/* ── Show all toggle (facilitator only) ──────────────────── */}
        {a.persona === "facilitator" && (
          <div className="mb-4">
            <IOSSwitch
              checked={showAll}
              onChange={(v) => { setShowAll(v); setPage(0); }}
              label="Show all teachers in my projects"
            />
          </div>
        )}

        {/* ── List ────────────────────────────────────────────────── */}
        {q.isLoading ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !q.data?.rows.length ? (
          <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-2 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
            <EmptyState
              title="No teachers found"
              icon={<GraduationCap className="h-6 w-6" />}
              text="Teachers appear here once they are added to a school in your project."
              action={canAdd && (
                <button
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98]"
                  onClick={() => setAdd(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add teacher
                </button>
              )}
            />
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/75 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
              <ResponsiveList
                rows={q.data.rows}
                rowKey={(t) => t.id}
                columns={[
                  {
                    header: "Teacher",
                    cell: (t) => (
                      <Link className="group/link inline-flex items-center gap-1.5 font-bold tracking-tight text-brand transition-colors hover:text-brand-700" to={`/teachers/${t.id}`}>
                        {t.full_name}
                        <ChevronRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover/link:translate-x-0 group-hover/link:opacity-100" aria-hidden />
                      </Link>
                    ),
                  },
                  { header: "School", cell: (t) => <span className="text-slate-700">{t.school?.name ?? "-"}</span> },
                  { header: "SACE number", cell: (t) => <span className="font-mono text-xs text-slate-700">{t.employee_or_teacher_number ?? "-"}</span> },
                  { header: "Subjects", cell: (t) => <span className="text-slate-700">{t.subjects?.join(", ") || "-"}</span> },
                  { header: "Status", cell: (t) => <Badge tone={t.is_active ? "green" : "slate"}>{t.is_active ? "Active" : "Inactive"}</Badge> },
                ]}
                card={(t) => (
                  <Link to={`/teachers/${t.id}`} className="group flex items-center gap-3">
                    <Initials name={t.full_name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold tracking-tight text-brand">{t.full_name}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <SchoolIcon className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{t.school?.name ?? "No school"}</span>
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
                  </Link>
                )}
              />
            </div>
            <div className="mt-4">
              <Pagination page={page} pageSize={PAGE} total={q.data.count} onPage={setPage} />
            </div>
          </>
        )}
      </div>

      <TeacherFormModal open={add} onClose={() => setAdd(false)} projectId={project || undefined} />
    </>
  );
}