import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Pencil, FolderKanban, Hash, MapPin, UserRound, Phone, Mail, MapPinned,
  GraduationCap, Plus, ChevronRight, FileText, ClipboardCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { SchoolFormModal, TeacherFormModal } from "./forms";
import { DocList } from "@/features/documents/DocList";
import { OBS_STATUS } from "@/lib/constants";
import { fmtDate, obsRef } from "@/utils/format";
import type { Observation, School, Teacher } from "@/types/db";

/* Ambient page background - matches the rest of the app. */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "sdDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "sdDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes sdDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes sdDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

/* Section header with hairline rule, matching the app-wide pattern. */
function SectionLabel({ icon: Icon, children, right }: { icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-3 px-1">
      {Icon && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-inset ring-brand/15">
          <Icon className="h-3.5 w-3.5 text-brand" aria-hidden />
        </span>
      )}
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-slate-300/80 via-slate-200/60 to-transparent" />
      {right}
    </div>
  );
}

/* One info cell - label + value, with leading icon chip. */
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

/* Simple initials avatar for teachers. */
function Initials({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/15 to-brand/5 text-sm font-bold text-brand ring-1 ring-inset ring-brand/20">
      {initials || "?"}
    </span>
  );
}

export default function SchoolDetail() {
  const { id } = useParams(); const a = useAuth(); const [edit, setEdit] = useState(false); const [addT, setAddT] = useState(false);
  const q = useQuery({ queryKey: ["school", id], queryFn: async () => {
    const [s, links, t, o] = await Promise.all([
      supabase.from("schools").select("*").eq("id", id!).single(),
      supabase.from("project_schools").select("project_id, project:projects(name)").eq("school_id", id!).eq("is_active", true),
      supabase.from("teachers").select("*").eq("school_id", id!).order("full_name"),
      supabase.from("observations").select("id,ref_no,status,observed_at,teacher:teachers(full_name),facilitator:profiles!observations_facilitator_id_fkey(full_name)").eq("school_id", id!).neq("status", "draft").order("observed_at", { ascending: false }).limit(15),
    ]);
    if (s.error) throw s.error;
    return { school: s.data as School, links: (links.data ?? []) as any[], teachers: (t.data ?? []) as Teacher[], obs: (o.data ?? []) as unknown as Observation[] };
  } });
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? "School not found or you do not have access."} />;
  const { school: s, links, teachers, obs } = q.data; const pid = links[0]?.project_id as string | undefined;
  const canEdit = a.can("schools.manage") && !!pid;

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
              to="/schools"
              className="group mb-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200/70 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-slate-900 hover:shadow-sm active:translate-y-0"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
              Schools
            </Link>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{s.name}</h1>
                {([s.district, s.province].filter(Boolean).join(", ")) && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    <span className="truncate">{[s.district, s.province].filter(Boolean).join(", ")}</span>
                  </p>
                )}
              </div>
              {canEdit && (
                <button
                  className="group inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.98]"
                  onClick={() => setEdit(true)}
                >
                  <Pencil className="h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:-rotate-6" />
                  Edit
                </button>
              )}
            </div>

            {/* Project badges + inactive state */}
            <div className="mt-4 flex flex-wrap gap-2">
              {links.map((l) => (
                <Link
                  key={l.project_id}
                  to={`/projects/${l.project_id}`}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-inset ring-sky-200/70 transition-all duration-200 hover:-translate-y-0.5 hover:bg-sky-100 hover:shadow-sm active:translate-y-0"
                >
                  <FolderKanban className="h-3 w-3 text-sky-600 transition-transform duration-200 group-hover:scale-110" />
                  {l.project?.name}
                </Link>
              ))}
              {!s.is_active && <Badge tone="slate">Inactive</Badge>}
            </div>
          </div>
        </div>

        {/* ── Details card ────────────────────────────────────────── */}
        <div className="mb-7 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/75 p-5 shadow-[0_15px_40px_-25px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <InfoCell icon={Hash} label="School code" value={s.school_code ?? "-"} />
            <InfoCell icon={MapPinned} label="Municipality" value={s.municipality ?? "-"} />
            <InfoCell icon={UserRound} label="Contact" value={s.contact_person ?? "-"} />
            <InfoCell icon={Phone} label="Phone" value={s.contact_phone ?? "-"} />
            <InfoCell icon={Mail} label="Email" value={s.contact_email ?? "-"} />
            <InfoCell icon={MapPin} label="Address" value={s.address ?? "-"} />
          </div>
        </div>

        {/* ── Teachers ────────────────────────────────────────────── */}
        <section className="mb-7">
          <SectionLabel
            icon={GraduationCap}
            right={canEdit && (
              <button
                className="group inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-brand ring-1 ring-inset ring-brand/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand/15 hover:shadow-sm active:translate-y-0"
                onClick={() => setAddT(true)}
              >
                <Plus className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90" />
                Add teacher
              </button>
            )}
          >
            Teachers ({teachers.length})
          </SectionLabel>

          {teachers.length === 0 ? (
            <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-2 shadow-sm backdrop-blur">
              <EmptyState title="No teachers yet" text="Add the teachers you work with at this school." />
            </div>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {teachers.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/teachers/${t.id}`}
                    className="group flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/85 p-3.5 pr-3 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.2)] backdrop-blur transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-brand/40 hover:bg-white hover:shadow-[0_14px_30px_-14px_rgba(56,189,248,0.45)] active:translate-y-0 active:scale-[0.99]"
                  >
                    <Initials name={t.full_name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900 transition-colors group-hover:text-brand">{t.full_name}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{t.subjects?.join(", ") || "No subjects"}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Documents ───────────────────────────────────────────── */}
        <section className="mb-7">
          <SectionLabel icon={FileText}>Documents</SectionLabel>
          <div className="rounded-3xl border border-slate-200/70 bg-white/75 p-4 shadow-[0_15px_40px_-25px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-5">
            <DocList filter={{ school_id: s.id }} projectId={pid} schoolId={s.id} />
          </div>
        </section>

        {/* ── Recent observations ─────────────────────────────────── */}
        <section>
          <SectionLabel icon={ClipboardCheck}>Recent observations</SectionLabel>
          {obs.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-sm text-slate-600 shadow-sm backdrop-blur">
              No visible observations at this school yet.
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
                      <span className="block truncate">
                        <span className="font-bold tracking-tight text-brand">{obsRef(o.ref_no)}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="text-slate-800">{o.teacher?.full_name ?? "-"}</span>
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

      <SchoolFormModal open={edit} onClose={() => setEdit(false)} projectId={pid} school={s} />
      <TeacherFormModal open={addT} onClose={() => setAddT(false)} projectId={pid} schoolId={s.id} />
    </>
  );
}