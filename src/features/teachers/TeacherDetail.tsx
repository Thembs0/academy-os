import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Link2, Pencil, FolderKanban, School as SchoolIcon,
  Hash, BookOpen, Mail, Phone, GraduationCap, FileText, ClipboardCheck, ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Badge, ErrorState, Skeleton } from "@/components/ui";
import { TeacherFormModal } from "@/features/schools/forms";
import { DocList } from "@/features/documents/DocList";
import { LinkModal } from "@/features/external/LinkModal";
import { OBS_STATUS } from "@/lib/constants";
import { fmtDate, obsRef } from "@/utils/format";
import type { Observation, Teacher } from "@/types/db";

/* Ambient page background - matches the rest of the app. */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "tdDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "tdDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes tdDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes tdDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

/* Section header with hairline rule - app-wide pattern. */
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

/* One info cell - label + value with a leading icon chip. */
function InfoCell({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200/70">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <div className="mt-0.5 truncate text-sm font-medium text-slate-800">{value}</div>
      </div>
    </div>
  );
}

/* Initials avatar for the hero. */
function Initials({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/20 to-brand/5 text-lg font-extrabold text-brand ring-1 ring-inset ring-brand/20 shadow-sm">
      {initials || "?"}
    </span>
  );
}

export default function TeacherDetail() {
  const { id } = useParams(); const a = useAuth(); const [edit, setEdit] = useState(false); const [link, setLink] = useState(false);
  const q = useQuery({ queryKey: ["teacher", id], queryFn: async () => {
    const [t, pt, o] = await Promise.all([
      supabase.from("teachers").select("*, school:schools(id,name)").eq("id", id!).single(),
      supabase.from("project_teachers").select("project_id, project:projects(name)").eq("teacher_id", id!).eq("is_active", true),
      supabase.from("observations").select("id,ref_no,status,observed_at,samr_level,facilitator:profiles!observations_facilitator_id_fkey(full_name)").eq("teacher_id", id!).neq("status", "draft").order("observed_at", { ascending: false }).limit(20),
    ]);
    if (t.error) throw t.error;
    return { t: t.data as unknown as Teacher & { school: { id: string; name: string } }, projects: (pt.data ?? []) as any[], obs: (o.data ?? []) as unknown as Observation[] };
  } });
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? "Teacher not found or you do not have access."} />;
  const { t, projects, obs } = q.data; const pid = projects[0]?.project_id as string | undefined;

  return (
    <>
      <Ambient />

      <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">

        {/* ── Hero header ─────────────────────────────────────────── */}
        <div className="relative mb-5 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 right-0 h-56 w-[60%] rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,0.30), transparent 65%)" }}
          />
          <div className="relative">
            <Link
              to="/teachers"
              className="group mb-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200/70 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-slate-900 hover:shadow-sm active:translate-y-0"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
              Teachers
            </Link>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3.5">
                <Initials name={t.full_name} />
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t.full_name}</h1>
                  <Link
                    to={`/schools/${t.school.id}`}
                    className="group mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-inset ring-sky-200/60 transition-all duration-200 hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-sm active:translate-y-0"
                  >
                    <SchoolIcon className="h-3 w-3 text-sky-600 transition-transform duration-200 group-hover:scale-110" />
                    {t.school.name}
                    <ChevronRight className="h-3 w-3 text-sky-500 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {pid && a.can("external_upload.manage") && (
                  <button
                    className="group inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.98]"
                    onClick={() => setLink(true)}
                  >
                    <Link2 className="h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:-rotate-12" />
                    Upload link
                  </button>
                )}
                {pid && a.can("teachers.manage") && (
                  <button
                    className="group inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.98]"
                    onClick={() => setEdit(true)}
                  >
                    <Pencil className="h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:-rotate-6" />
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Project badges + inactive state */}
            <div className="mt-4 flex flex-wrap gap-2">
              {projects.map((p) => (
                <Link
                  key={p.project_id}
                  to={`/projects/${p.project_id}`}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-inset ring-sky-200/70 transition-all duration-200 hover:-translate-y-0.5 hover:bg-sky-100 hover:shadow-sm active:translate-y-0"
                >
                  <FolderKanban className="h-3 w-3 text-sky-600 transition-transform duration-200 group-hover:scale-110" />
                  {p.project?.name}
                </Link>
              ))}
              {!t.is_active && <Badge tone="slate">Inactive</Badge>}
            </div>
          </div>
        </div>

        {/* ── Details card ────────────────────────────────────────── */}
        <div className="mb-7 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/75 p-5 shadow-[0_15px_40px_-25px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <InfoCell icon={Hash} label="SACE number" value={t.employee_or_teacher_number ?? "-"} />
            <InfoCell icon={BookOpen} label="Subjects" value={t.subjects?.join(", ") || "-"} />
            <InfoCell icon={Mail} label="Email" value={t.email ?? "-"} />
            <InfoCell icon={Phone} label="Phone" value={t.phone ?? "-"} />
            <InfoCell icon={GraduationCap} label="Grades" value={t.grade_levels?.join(", ") || "-"} />
          </div>
        </div>

        {/* ── Documents ───────────────────────────────────────────── */}
        <section className="mb-7">
          <SectionLabel icon={FileText}>Documents</SectionLabel>
          <div className="rounded-3xl border border-slate-200/70 bg-white/75 p-4 shadow-[0_15px_40px_-25px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-5">
            <DocList filter={{ teacher_id: t.id }} projectId={pid} schoolId={t.school_id} teacherId={t.id} />
          </div>
        </section>

        {/* ── Observation history ─────────────────────────────────── */}
        <section>
          <SectionLabel icon={ClipboardCheck}>Observation history</SectionLabel>
          {obs.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-sm text-slate-600 shadow-sm backdrop-blur">
              No visible observations for this teacher yet.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {obs.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/observations/${o.id}`}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/85 p-3.5 pr-4 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.2)] backdrop-blur transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-brand/40 hover:bg-white hover:shadow-[0_14px_30px_-14px_rgba(56,189,248,0.45)] active:translate-y-0 active:scale-[0.995]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="font-bold tracking-tight text-brand">{obsRef(o.ref_no)}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          SAMR {o.samr_level ?? "-"}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {fmtDate(o.observed_at)} <span className="text-slate-300">·</span> {o.facilitator?.full_name}
                      </span>
                    </span>
                    <Badge tone={OBS_STATUS[o.status].tone}>{OBS_STATUS[o.status].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <TeacherFormModal open={edit} onClose={() => setEdit(false)} projectId={pid} teacher={t} />
      {pid && <LinkModal open={link} onClose={() => setLink(false)} projectId={pid} schoolId={t.school_id} teacherId={t.id} />}
    </>
  );
}