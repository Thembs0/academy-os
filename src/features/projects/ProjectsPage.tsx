import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderKanban, Plus, Pencil, Trash2, School as SchoolIcon,
  Building2, HeartHandshake, MapPin, AlertTriangle,
} from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { useProjects } from "@/hooks";
import {
  Alert, Badge, EmptyState, ErrorState, LabeledInput, LabeledSelect,
  LabeledText, Modal, PageHeader, Skeleton,
} from "@/components/ui";
import { fmtDate } from "@/utils/format";
import type { Project } from "@/types/db";

/* ── Ambient background ──────────────────────────────────────────────── */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "prjDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "prjDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes prjDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes prjDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

/* ── Project type metadata ───────────────────────────────────────────── */
const PROJECT_TYPES = [
  { value: "school_based",    label: "School-based",    icon: SchoolIcon,     hint: "Works with schools and teachers" },
  { value: "venue_based",     label: "Venue-based",     icon: Building2,      hint: "Runs at a specific venue" },
  { value: "community_based", label: "Community-based", icon: HeartHandshake, hint: "Works with community groups" },
  { value: "other",           label: "Other",           icon: MapPin,         hint: "Non-school programme" },
] as const;

function projectTypeMeta(t: string | undefined) {
  return PROJECT_TYPES.find((x) => x.value === t) ?? PROJECT_TYPES[3];
}

/* ── Form body for create/edit ───────────────────────────────────────── */
interface FormState {
  name: string;
  project_code: string;
  description: string;
  reporting_frequency: string;
  start_date: string;
  project_type: string;
  session_frequency: string;
  sba_enabled: boolean;
}

function ProjectFormFields({
  f, setF, disabled,
}: { f: FormState; setF: (v: FormState) => void; disabled?: boolean }) {
  const isSchoolBased = f.project_type === "school_based";
  return (
    <>
      <LabeledInput label="Project name" required value={f.name} disabled={disabled} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <LabeledInput label="Funding sponsor" hint="The organisation or company funding this project" value={f.project_code} disabled={disabled} onChange={(e) => setF({ ...f, project_code: e.target.value })} />

      <fieldset className="mb-4">
        <legend className="label">Project type <span className="text-red-600">*</span></legend>
        <div className="grid grid-cols-2 gap-3">
          {PROJECT_TYPES.map((opt) => {
            const active = f.project_type === opt.value;
            const Icon = opt.icon;
            return (
              <label
                key={opt.value}
                className={`group relative flex min-h-[96px] cursor-pointer flex-col justify-center overflow-hidden rounded-2xl border-2 p-3.5 transition-all duration-200 ${
                  active
                    ? "border-brand bg-gradient-to-br from-brand/10 to-sky-50 shadow-[0_10px_25px_-15px_rgba(14,165,233,0.7)] scale-[1.01]"
                    : "border-slate-200 bg-white/60 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brand/5 hover:shadow-md active:translate-y-0 active:scale-[0.99]"
                } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
              >
                <input
                  type="radio"
                  name="project_type"
                  className="sr-only"
                  checked={active}
                  disabled={disabled}
                  onChange={() => setF({ ...f, project_type: opt.value })}
                />
                <span className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? "bg-brand/15 ring-1 ring-inset ring-brand/30" : "bg-slate-100 ring-1 ring-inset ring-slate-200"}`}>
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-brand" : "text-slate-500"}`} aria-hidden />
                  </span>
                  <span className={`text-sm font-bold ${active ? "text-brand" : "text-slate-800"}`}>{opt.label}</span>
                </span>
                <span className="mt-1.5 text-[11px] leading-snug text-slate-500">{opt.hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {isSchoolBased ? (
        <>
          <LabeledSelect
            label="Session frequency"
            value={f.session_frequency}
            disabled={disabled}
            onChange={(e) => setF({ ...f, session_frequency: e.target.value })}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="termly">Termly</option>
            <option value="custom">Custom</option>
          </LabeledSelect>

          <label className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-800">Has SBA?</span>
              <span className="block text-xs text-slate-500">Enables SBA learner register for this project</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-9 appearance-none rounded-full bg-slate-300 transition-colors checked:bg-brand relative
                before:absolute before:left-0.5 before:top-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white
                before:transition-transform checked:before:translate-x-4"
              checked={f.sba_enabled}
              disabled={disabled}
              onChange={(e) => setF({ ...f, sba_enabled: e.target.checked })}
            />
          </label>
        </>
      ) : (
        <LabeledSelect
          label="Session frequency"
          value={f.session_frequency}
          disabled={disabled}
          onChange={(e) => setF({ ...f, session_frequency: e.target.value })}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="custom">Custom</option>
        </LabeledSelect>
      )}

      <LabeledText label="Description" value={f.description} disabled={disabled} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <LabeledSelect label="Reporting frequency" value={f.reporting_frequency} disabled={disabled} onChange={(e) => setF({ ...f, reporting_frequency: e.target.value })}>
        {["weekly", "monthly", "termly", "quarterly", "custom"].map((x) => <option key={x}>{x}</option>)}
      </LabeledSelect>
      <LabeledInput label="Start date" type="date" value={f.start_date} disabled={disabled} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
    </>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function ProjectsPage() {
  const a = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useProjects();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const blankForm: FormState = {
    name: "",
    project_code: "",
    description: "",
    reporting_frequency: "monthly",
    start_date: "",
    project_type: "school_based",
    session_frequency: "weekly",
    sba_enabled: false,
  };
  const [f, setF] = useState<FormState>(blankForm);

  const canCreate = a.hasRole("super_admin", "hod");
  const canEdit = a.hasRole("super_admin", "hod");
  const canDelete = a.hasRole("super_admin");

  /* Create */
  const create = useMutation({
    mutationFn: async () => {
      const { data: dep } = await supabase.from("departments").select("id").limit(1).single();
      const { data, error } = await supabase.from("projects").insert({
        department_id: dep!.id,
        name: f.name.trim(),
        project_code: f.project_code.trim() || null,
        description: f.description.trim() || null,
        reporting_frequency: f.reporting_frequency,
        start_date: f.start_date || null,
        status: "active",
        project_type: f.project_type,
        session_frequency: f.session_frequency,
        sba_enabled: f.project_type === "school_based" ? f.sba_enabled : false,
        created_by: a.profile!.id,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      nav(`/projects/${id}`);
    },
    onError: (e) => setErr(errMsg(e)),
  });

  /* Edit */
  const update = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("No project selected.");
      const { error } = await supabase.from("projects").update({
        name: f.name.trim(),
        project_code: f.project_code.trim() || null,
        description: f.description.trim() || null,
        reporting_frequency: f.reporting_frequency,
        start_date: f.start_date || null,
        project_type: f.project_type,
        session_frequency: f.session_frequency,
        sba_enabled: f.project_type === "school_based" ? f.sba_enabled : false,
      }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project-overview", editing?.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setEditing(null);
      setErr(null);
    },
    onError: (e) => setErr(errMsg(e)),
  });

  /* Delete */
  const remove = useMutation({
    mutationFn: async () => {
      if (!deleting) throw new Error("No project selected.");
      if (deleteConfirmText.trim() !== deleting.name.trim()) {
        throw new Error("Type the project name exactly to confirm.");
      }
      const { error } = await supabase.from("projects").delete().eq("id", deleting.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
      setDeleteConfirmText("");
      setErr(null);
    },
    onError: (e) => setErr(errMsg(e)),
  });

  /* Modal openers */
  const openCreate = () => { setErr(null); setF(blankForm); setOpen(true); };
  const openEdit = (p: Project) => {
    setErr(null);
    setF({
      name: p.name,
      project_code: p.project_code ?? "",
      description: p.description ?? "",
      reporting_frequency: p.reporting_frequency ?? "monthly",
      start_date: p.start_date ?? "",
      project_type: (p as any).project_type ?? "school_based",
      session_frequency: (p as any).session_frequency ?? "weekly",
      sba_enabled: !!(p as any).sba_enabled,
    });
    setEditing(p);
  };
  const openDelete = (p: Project) => { setErr(null); setDeleteConfirmText(""); setDeleting(p); };

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
          <div className="relative">
            <PageHeader
              title={a.persona === "facilitator" || a.persona === "admin" ? "My projects" : "Projects"}
              actions={
                canCreate && (
                  <button
                    className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98]"
                    onClick={openCreate}
                  >
                    <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
                    New project
                  </button>
                )
              }
            />
          </div>
        </div>

        {/* List */}
        {q.isLoading ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-2 shadow-sm backdrop-blur">
            <EmptyState
              title="No projects"
              icon={<FolderKanban className="h-6 w-6" />}
              text={canCreate ? "Create your first project to start assigning people and schools." : "You haven't been assigned to any project yet."}
              action={canCreate && (
                <button
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98]"
                  onClick={openCreate}
                >
                  <Plus className="h-4 w-4" /> New project
                </button>
              )}
            />
          </div>
        ) : (
          <div className="grid gap-3.5 md:grid-cols-2">
            {q.data.map((p) => {
              const meta = projectTypeMeta((p as any).project_type);
              const TypeIcon = meta.icon;
              return (
                <div
                  key={p.id}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_6px_20px_-12px_rgba(15,23,42,0.25)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500/40 hover:shadow-[0_20px_44px_-22px_rgba(14,165,233,0.55)]"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-sky-400 to-brand opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-sky-400/0 blur-3xl transition-all duration-300 group-hover:bg-sky-400/20"
                  />

                  <Link to={`/projects/${p.id}`} className="block">
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-slate-900 transition-colors group-hover:text-sky-700">
                          {p.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {p.project_code && (
                          <span
                            title={p.project_code}
                            className="inline-flex max-w-[240px] items-center gap-1 truncate rounded-full bg-slate-100/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200/70"
                          >
                            <Building2 className="h-2.5 w-2.5 shrink-0" aria-hidden />
                            <span className="truncate">{p.project_code}</span>
                          </span>
                        )}
                          <Badge tone={p.status === "active" ? "green" : p.status === "paused" ? "amber" : "slate"}>
                            {p.status}
                          </Badge>
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200/70">
                            <TypeIcon className="h-2.5 w-2.5" aria-hidden />
                            {meta.label}
                          </span>
                        </div>
                      </div>
                    </div>
                    {p.description && (
                      <p className="relative mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600">{p.description}</p>
                    )}
                    <div className="relative mt-3 text-xs text-slate-500">
                      Reporting: {p.reporting_frequency ?? "-"} · Started {fmtDate(p.start_date)}
                    </div>
                  </Link>

                  {(canEdit || canDelete) && (
                    <div className="relative mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                      {canEdit && (
                        <button
                          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200/70 transition-all hover:-translate-y-0.5 hover:bg-white hover:text-slate-900 hover:shadow-sm active:translate-y-0"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(p); }}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200/70 transition-all hover:-translate-y-0.5 hover:bg-red-100 hover:shadow-sm active:translate-y-0"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDelete(p); }}
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal open={open} title="New project" onClose={() => setOpen(false)}>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <ProjectFormFields f={f} setF={setF} disabled={create.isPending} />
          {err && <Alert tone="red">{err}</Alert>}
          <button
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-5 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={create.isPending || !f.name.trim()}
          >
            {create.isPending ? "Creating…" : "Create project"}
          </button>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editing} title={`Edit ${editing?.name ?? ""}`} onClose={() => setEditing(null)}>
        <form onSubmit={(e) => { e.preventDefault(); update.mutate(); }}>
          <ProjectFormFields f={f} setF={setF} disabled={update.isPending} />
          {err && <Alert tone="red">{err}</Alert>}
          <button
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-5 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={update.isPending || !f.name.trim()}
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={!!deleting} title="Delete project" onClose={() => { setDeleting(null); setDeleteConfirmText(""); }}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/70 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
            <div className="text-sm text-red-900">
              <p className="font-bold">This action cannot be undone.</p>
              <p className="mt-1 leading-relaxed">
                Deleting <strong>{deleting?.name}</strong> will remove the project, its team assignments,
                and any project-scoped data. Observations, documents and reports linked to this project may
                also be affected depending on your database rules.
              </p>
            </div>
          </div>

          <LabeledInput
            label={`Type "${deleting?.name ?? ""}" to confirm`}
            required
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={deleting?.name ?? ""}
          />

          {err && <Alert tone="red">{err}</Alert>}

          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
              onClick={() => { setDeleting(null); setDeleteConfirmText(""); }}
              disabled={remove.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex-1 rounded-2xl bg-gradient-to-b from-red-500 to-red-700 px-5 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(239,68,68,0.6)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={remove.isPending || deleteConfirmText.trim() !== (deleting?.name ?? "").trim()}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}