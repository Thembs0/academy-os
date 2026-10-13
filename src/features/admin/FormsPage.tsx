import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ScrollText, Plus, ChevronDown, Power, FolderKanban, Hash,
  Trash2, Pencil, GripVertical, X, Check, Type, AlignLeft, Calendar,
  Hash as HashIcon, List, ToggleLeft
} from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { Badge, EmptyState, ErrorState, LabeledInput, LabeledSelect, LabeledText, Modal, PageHeader, Skeleton, Alert } from "@/components/ui";

interface Field {
  field_key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  section_name: string | null;
  sort_order: number;
  help_text?: string | null;
}
interface Template {
  id: string; name: string; version: number; is_active: boolean;
  project_id: string | null; project_name: string | null;
  field_count: number; fields: Field[];
}

/* ── Ambient background ──────────────────────────────────────────────── */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "fpDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "fpDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes fpDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes fpDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
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

/* ── Field type picker options ──────────────────────────────────────── */
const FIELD_TYPES = [
  { value: "text",     label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "number",   label: "Number" },
  { value: "date",     label: "Date" },
  { value: "select",   label: "Dropdown" },
  { value: "boolean",  label: "Yes / No" },
];

const typeIcon = (t: string) => {
  switch (t) {
    case "textarea": return AlignLeft;
    case "date": return Calendar;
    case "number": return HashIcon;
    case "select": return List;
    case "boolean": return ToggleLeft;
    default: return Type;
  }
};

/* ── Single field row in the editor ─────────────────────────────────── */
function FieldRow({
  field, onSave, onDelete, saving,
}: {
  field: Field;
  onSave: (f: Field) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Field>(field);

  useEffect(() => { setDraft(field); }, [field]);

  const Icon = typeIcon(field.field_type);

  if (!editing) {
    return (
      <li className="group flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/85 p-3 shadow-sm backdrop-blur transition-colors hover:bg-white">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 ring-1 ring-inset ring-brand/15">
          <Icon className="h-4 w-4 text-brand" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-800">{field.label}</span>
            {field.is_required && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 ring-1 ring-inset ring-red-200">
                Required
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span className="font-mono">{field.field_key}</span>
            <span className="text-slate-300">·</span>
            <span>{field.field_type}</span>
            {field.section_name && (
              <>
                <span className="text-slate-300">·</span>
                <span>{field.section_name}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing(true)}
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Edit ${field.label}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { if (confirm(`Delete field "${field.label}"?`)) onDelete(); }}
            disabled={saving}
            className="rounded-full p-2 text-red-600 transition-colors hover:bg-red-50"
            aria-label={`Delete ${field.label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-2xl border-2 border-brand/40 bg-white/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-brand">Editing field</span>
        <button onClick={() => setEditing(false)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput
          label="Label"
          required
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
        <LabeledInput
          label="Field key"
          required
          hint="Snake_case, unique within this template"
          value={draft.field_key}
          disabled={true}
          onChange={() => {}}
        />
        <LabeledSelect
          label="Type"
          value={draft.field_type}
          onChange={(e) => setDraft({ ...draft, field_type: e.target.value })}
        >
          {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </LabeledSelect>
        <LabeledInput
          label="Section"
          hint="Optional group (e.g. 'Technology', 'Reflection')"
          value={draft.section_name ?? ""}
          onChange={(e) => setDraft({ ...draft, section_name: e.target.value || null })}
        />
        <LabeledInput
          label="Sort order"
          type="number"
          value={draft.sort_order}
          onChange={(e) => setDraft({ ...draft, sort_order: parseInt(e.target.value) || 0 })}
        />
        <label className="flex items-center gap-3 self-end rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
          <input
            type="checkbox"
            className="h-5 w-5 rounded-md border-slate-300 text-brand focus:ring-brand/30"
            checked={draft.is_required}
            onChange={(e) => setDraft({ ...draft, is_required: e.target.checked })}
          />
          <span className="text-sm font-medium text-slate-800">Required</span>
        </label>
        <div className="sm:col-span-2">
          <LabeledText
            label="Help text"
            hint="Optional - shown under the field"
            value={draft.help_text ?? ""}
            onChange={(e) => setDraft({ ...draft, help_text: e.target.value || null })}
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98] disabled:opacity-60"
          disabled={!draft.label.trim() || saving}
          onClick={() => { onSave(draft); setEditing(false); }}
        >
          <Check className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </li>
  );
}

/* ── Manage fields modal ─────────────────────────────────────────────── */
function FieldsEditor({
  template, open, onClose,
}: { template: Template | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [newField, setNewField] = useState({ label: "", field_type: "text", is_required: false, section_name: "" });
  const [err, setErr] = useState<string | null>(null);

  /* Build a field_key from the label if not provided */
  const slug = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);

  const add = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error("No template selected.");
      if (!newField.label.trim()) throw new Error("Label is required.");
      const key = slug(newField.label);
      if (!key) throw new Error("Could not build a field key from that label.");
      const { error } = await supabase.rpc("add_form_field", {
        p_template: template.id,
        p_field_key: key,
        p_label: newField.label.trim(),
        p_field_type: newField.field_type,
        p_is_required: newField.is_required,
        p_section_name: newField.section_name.trim() || null,
        p_help_text: null,
        p_sort_order: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["form-templates-list"] });
      setNewField({ label: "", field_type: "text", is_required: false, section_name: "" });
      setErr(null);
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const update = useMutation({
    mutationFn: async (f: Field) => {
      if (!template) throw new Error("No template selected.");
      const { error } = await supabase.rpc("update_form_field", {
        p_template: template.id,
        p_field_key: f.field_key,
        p_label: f.label,
        p_field_type: f.field_type,
        p_is_required: f.is_required,
        p_section_name: f.section_name,
        p_help_text: f.help_text ?? null,
        p_sort_order: f.sort_order,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-templates-list"] }),
    onError: (e) => setErr(errMsg(e)),
  });

  const remove = useMutation({
    mutationFn: async (key: string) => {
      if (!template) throw new Error("No template selected.");
      const { error } = await supabase.rpc("delete_form_field", {
        p_template: template.id,
        p_field_key: key,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-templates-list"] }),
    onError: (e) => setErr(errMsg(e)),
  });

  if (!template) return null;

  const fields = [...template.fields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <Modal open={open} title={`Fields · ${template.name}`} onClose={onClose} wide>
      <div className="space-y-5">
        {/* Summary */}
        <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-3.5 w-3.5 text-brand" />
            <span className="font-semibold">{template.project_name ?? "Unassigned"}</span>
            <span className="text-slate-300">·</span>
            <span>{fields.length} field{fields.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        {/* Existing fields */}
        <section>
          <SectionLabel icon={GripVertical}>Fields on this template</SectionLabel>
          {fields.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
              No fields yet. Add the first one below.
            </p>
          ) : (
            <ul className="space-y-2">
              {fields.map((f) => (
                <FieldRow
                  key={f.field_key}
                  field={f}
                  saving={update.isPending || remove.isPending}
                  onSave={(next) => update.mutate(next)}
                  onDelete={() => remove.mutate(f.field_key)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Add new field */}
        <section>
          <SectionLabel icon={Plus}>Add a new field</SectionLabel>
          <div className="rounded-2xl border border-slate-200/70 bg-white/85 p-4 shadow-sm backdrop-blur">
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledInput
                label="Label"
                required
                placeholder="e.g. Learning outcomes"
                value={newField.label}
                onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                hint={`Key will be: ${slug(newField.label) || "-"}`}
              />
              <LabeledSelect
                label="Type"
                value={newField.field_type}
                onChange={(e) => setNewField({ ...newField, field_type: e.target.value })}
              >
                {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </LabeledSelect>
              <LabeledInput
                label="Section"
                hint="Optional group name"
                value={newField.section_name}
                onChange={(e) => setNewField({ ...newField, section_name: e.target.value })}
              />
              <label className="flex items-center gap-3 self-end rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded-md border-slate-300 text-brand focus:ring-brand/30"
                  checked={newField.is_required}
                  onChange={(e) => setNewField({ ...newField, is_required: e.target.checked })}
                />
                <span className="text-sm font-medium text-slate-800">Required</span>
              </label>
            </div>
            {err && <div className="mt-3"><Alert tone="red">{err}</Alert></div>}
            <button
              className="group mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-5 py-3 text-sm font-bold text-white shadow-[0_12px_28px_-14px_rgba(15,23,42,0.6)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!newField.label.trim() || add.isPending}
              onClick={() => { setErr(null); add.mutate(); }}
            >
              <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
              {add.isPending ? "Adding…" : "Add field"}
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────────────── */
export default function FormsPage() {
  const qc = useQueryClient();
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProject, setNewProject] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const templates = useQuery({
    queryKey: ["form-templates-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_form_templates");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const projects = useQuery({
    queryKey: ["forms-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,name,status").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; status: string }[];
    },
  });

  const setActive = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("set_form_template_active", { p_id: v.id, p_active: v.active });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-templates-list"] }),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!newName.trim() || !newProject) throw new Error("Name and project are required.");
      const { data, error } = await supabase.rpc("create_form_template", {
        p_project: newProject,
        p_name: newName.trim(),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["form-templates-list"] });
      setCreateOpen(false);
      setNewName("");
      setNewProject("");
      setCreateErr(null);
    },
    onError: (e) => setCreateErr(errMsg(e)),
  });

  const filtered = useMemo(() => {
    const all = templates.data ?? [];
    if (!projectFilter) return all;
    return all.filter((t) => t.project_id === projectFilter);
  }, [templates.data, projectFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, { projectName: string; templates: Template[] }>();
    for (const t of filtered) {
      const key = t.project_id ?? "__none__";
      const name = t.project_name ?? "Unassigned";
      if (!map.has(key)) map.set(key, { projectName: name, templates: [] });
      map.get(key)!.templates.push(t);
    }
    return [...map.entries()].sort((a, b) => a[1].projectName.localeCompare(b[1].projectName));
  }, [filtered]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (templates.isLoading) return <Skeleton rows={4} />;
  if (templates.error) return <ErrorState error={templates.error} retry={() => templates.refetch()} />;

  /* Keep the editor modal's template fresh after mutations */
  const liveEditing = editingTemplate
    ? templates.data?.find((t) => t.id === editingTemplate.id) ?? editingTemplate
    : null;

  return (
    <>
      <Ambient />

      <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="relative mb-6 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 right-0 h-56 w-[60%] rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,0.30), transparent 65%)" }}
          />
          <div className="relative flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-brand/5 ring-1 ring-inset ring-brand/20">
              <ScrollText className="h-5 w-5 text-brand" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <PageHeader
                title="Forms & requirements"
                subtitle="One observation template per project. Fields beyond the core set appear as “Additional project questions” in the observation form."
                actions={
                  <button
                    className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98]"
                    onClick={() => { setCreateErr(null); setCreateOpen(true); }}
                  >
                    <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
                    New form
                  </button>
                }
              />
            </div>
          </div>
        </div>

        {/* Project filter chips */}
        <section className="mb-6">
          <SectionLabel icon={FolderKanban}>Filter by project</SectionLabel>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setProjectFilter("")}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                projectFilter === ""
                  ? "bg-gradient-to-b from-brand to-brand-700 text-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.6)]"
                  : "bg-white/70 text-slate-700 ring-1 ring-inset ring-slate-200/70 hover:bg-white"
              }`}
            >
              All projects
            </button>
            {projects.data?.map((p) => (
              <button
                key={p.id}
                onClick={() => setProjectFilter(p.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  projectFilter === p.id
                    ? "bg-gradient-to-b from-brand to-brand-700 text-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.6)]"
                    : "bg-white/70 text-slate-700 ring-1 ring-inset ring-slate-200/70 hover:bg-white"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </section>

        {/* Templates grouped by project */}
        {grouped.length === 0 ? (
          <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-2 shadow-sm backdrop-blur">
            <EmptyState
              title="No form templates"
              icon={<ScrollText className="h-6 w-6" />}
              text="Create the first observation template for a project."
            />
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([projectKey, group]) => (
              <section key={projectKey}>
                <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-inset ring-brand/15">
                    <FolderKanban className="h-3.5 w-3.5 text-brand" aria-hidden />
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">{group.projectName}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {group.templates.length} template{group.templates.length === 1 ? "" : "s"}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-slate-300/70 via-slate-200/50 to-transparent" />
                </div>

                <ul className="space-y-2.5">
                  {group.templates.map((t) => {
                    const isOpen = expanded.has(t.id);
                    return (
                      <li key={t.id} className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/85 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.2)] backdrop-blur transition-all duration-200">
                        <div className="flex flex-wrap items-center gap-3 p-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-bold text-slate-900">{t.name}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600">v{t.version}</span>
                              <Badge tone={t.is_active ? "green" : "slate"}>{t.is_active ? "Active" : "Inactive"}</Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Hash className="h-3 w-3" /> {t.field_count} field{t.field_count === 1 ? "" : "s"}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span>{t.project_name ?? "Unassigned"}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => setEditingTemplate(t)}
                              className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-bold text-brand ring-1 ring-inset ring-brand/20 transition-all hover:bg-brand/15"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Manage fields
                            </button>
                            <button
                              onClick={() => setActive.mutate({ id: t.id, active: !t.is_active })}
                              disabled={setActive.isPending}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                                t.is_active
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100"
                                  : "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-200"
                              }`}
                            >
                              <Power className="h-3.5 w-3.5" />
                              {t.is_active ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              onClick={() => toggleExpand(t.id)}
                              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-inset ring-slate-200 transition-all hover:bg-slate-50"
                            >
                              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                              {isOpen ? "Hide" : "Show"}
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="border-t border-slate-200/70 bg-slate-50/60 px-4 py-3">
                            {t.fields.length === 0 ? (
                              <p className="text-xs text-slate-500">No fields yet. Click <strong>Manage fields</strong> to add some.</p>
                            ) : (
                              <ol className="space-y-1.5 text-sm">
                                {[...t.fields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((f) => (
                                  <li key={f.field_key} className="flex items-start gap-2">
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/50" aria-hidden />
                                    <span className="min-w-0">
                                      {f.section_name && <span className="text-xs text-slate-500">{f.section_name} · </span>}
                                      <span className="text-slate-800">{f.label}</span>
                                      {f.is_required && <span className="text-red-600"> *</span>}
                                      <span className="ml-1 text-xs text-slate-400">({f.field_type})</span>
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-6 px-1 text-xs text-slate-500">
          Document requirements are configured per project under <span className="font-semibold">Projects → Configuration</span>.
        </p>
      </div>

      {/* Create modal */}
      <Modal open={createOpen} title="New observation template" onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <LabeledInput
            label="Template name"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Classroom-based support observation"
          />
          <LabeledSelect
            label="Assign to project"
            required
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
          >
            <option value="">Select project…</option>
            {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </LabeledSelect>
          <Alert tone="blue">
            The template is created <strong>inactive</strong>. Add fields in the field editor, then activate it.
          </Alert>
          {createErr && <Alert tone="red">{createErr}</Alert>}
          <button
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-5 py-3.5 text-sm font-bold text-white shadow-[0_12px_28px_-14px_rgba(15,23,42,0.6)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!newName.trim() || !newProject || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : "Create template"}
          </button>
        </div>
      </Modal>

      {/* Field editor modal */}
      <FieldsEditor
        template={liveEditing}
        open={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
      />
    </>
  );
}