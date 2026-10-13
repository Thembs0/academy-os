import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MapPin, Phone, UserRound, GraduationCap, BookOpen } from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { Alert, LabeledInput, LabeledSelect, Modal } from "@/components/ui";
import { useProjects } from "@/hooks";
import type { School, Teacher } from "@/types/db";

const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];

/* ── Shared presentational helpers ─────────────────────────────────────── */

/** Section header inside modal forms - label + hairline. */
function FormSection({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-1 flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-inset ring-brand/15">
        <Icon className="h-3 w-3 text-brand" aria-hidden />
      </span>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</h3>
      <span className="h-px flex-1 bg-gradient-to-r from-slate-300/70 via-slate-200/50 to-transparent" />
    </div>
  );
}

/** Scrollable modal body with a soft fade mask and normalized input styling. */
function FormBody({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="
        relative -mx-5 max-h-[65vh] overflow-y-auto px-5 pb-2
        [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.300)_transparent]
        [&_input]:rounded-2xl [&_input]:border-slate-200 [&_input]:bg-white/70 [&_input]:px-4 [&_input]:py-3 [&_input]:text-sm [&_input]:shadow-sm [&_input]:transition-all [&_input]:duration-200
        [&_input:hover]:border-slate-300 [&_input:focus]:border-brand [&_input:focus]:bg-white [&_input:focus]:outline-none [&_input:focus]:ring-4 [&_input:focus]:ring-brand/15
        [&_select]:rounded-2xl [&_select]:border-slate-200 [&_select]:bg-white/70 [&_select]:px-4 [&_select]:py-3 [&_select]:text-sm [&_select]:shadow-sm [&_select]:transition-all [&_select]:duration-200
        [&_select:hover]:border-slate-300 [&_select:focus]:border-brand [&_select:focus]:bg-white [&_select:focus]:outline-none [&_select:focus]:ring-4 [&_select:focus]:ring-brand/15
        [&_textarea]:rounded-2xl [&_textarea]:border-slate-200 [&_textarea]:bg-white/70 [&_textarea]:px-4 [&_textarea]:py-3 [&_textarea]:text-sm [&_textarea]:shadow-sm [&_textarea]:transition-all [&_textarea]:duration-200
        [&_textarea:focus]:border-brand [&_textarea:focus]:bg-white [&_textarea:focus]:outline-none [&_textarea:focus]:ring-4 [&_textarea:focus]:ring-brand/15
      "
    >
      {children}
    </div>
  );
}

/** Sticky-feeling footer inside the modal - full-width gradient primary. */
function FormFooter({ busy, disabled, label, busyLabel }: { busy: boolean; disabled: boolean; label: string; busyLabel: string }) {
  return (
    <button
      type="submit"
      className="
        group relative mt-5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl
        bg-gradient-to-b from-brand to-brand-700 px-5 py-3.5 text-sm font-bold tracking-wide text-white
        shadow-[0_12px_28px_-14px_rgba(15,23,42,0.6)] ring-1 ring-inset ring-white/15
        transition-all duration-200 ease-out
        hover:-translate-y-0.5 hover:brightness-[1.04] hover:shadow-[0_18px_36px_-16px_rgba(15,23,42,0.65)]
        active:translate-y-0 active:scale-[0.985] active:brightness-[0.97]
        disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:brightness-100 disabled:hover:shadow-[0_12px_28px_-14px_rgba(15,23,42,0.6)]
      "
      disabled={disabled || busy}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
      {busy ? busyLabel : label}
    </button>
  );
}

/* ── School modal ─────────────────────────────────────────────────────── */

export function SchoolFormModal({ open, onClose, projectId, school }: { open: boolean; onClose: () => void; projectId?: string; school?: School | null }) {
  const qc = useQueryClient(); const projects = useProjects();
  const [pid, setPid] = useState(projectId ?? ""); const [err, setErr] = useState<string | null>(null);
  const blank = { name: "", school_code: "", province: "", district: "", municipality: "", address: "", contact_person: "", contact_phone: "", contact_email: "" };
  const [f, setF] = useState<Record<string, string>>(blank);
  useEffect(() => { if (open) { setErr(null); setPid(projectId ?? ""); setF(school ? Object.fromEntries(Object.keys(blank).map((k) => [k, (school as any)[k] ?? ""])) : blank); } /* eslint-disable-next-line */ }, [open, school, projectId]);
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("upsert_school", { p_project: pid, p_school: { ...f, id: school?.id } }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ predicate: (q) => ["schools", "school", "project-schools", "dashboard", "project-overview"].includes(q.queryKey[0] as string) }); onClose(); },
    onError: (e) => setErr(errMsg(e)),
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} title={school ? "Edit school" : "Add school"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        {!projectId && (
          <LabeledSelect label="Project" required value={pid} onChange={(e) => setPid(e.target.value)}>
            <option value="">Select project…</option>
            {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </LabeledSelect>
        )}

        <FormBody>
          <FormSection icon={Building2}>Identity</FormSection>
          <LabeledInput label="School name" required value={f.name} onChange={set("name")} />
          <LabeledInput label="School code / EMIS" value={f.school_code} onChange={set("school_code")} />

          <FormSection icon={MapPin}>Location</FormSection>
          <LabeledSelect label="Province" value={f.province} onChange={set("province")}>
            <option value="">-</option>
            {PROVINCES.map((p) => <option key={p}>{p}</option>)}
          </LabeledSelect>
          <LabeledInput label="District" value={f.district} onChange={set("district")} />
          <LabeledInput label="Municipality" value={f.municipality} onChange={set("municipality")} />
          <LabeledInput label="Address" value={f.address} onChange={set("address")} />

          <FormSection icon={Phone}>Contact</FormSection>
          <LabeledInput label="Contact person" value={f.contact_person} onChange={set("contact_person")} />
          <LabeledInput label="Contact phone" type="tel" value={f.contact_phone} onChange={set("contact_phone")} />
          <LabeledInput label="Contact email" type="email" value={f.contact_email} onChange={set("contact_email")} />
        </FormBody>

        {err && <div className="mt-4"><Alert tone="red">{err}</Alert></div>}
        <FormFooter
          busy={m.isPending}
          disabled={!f.name.trim() || !pid}
          label="Save school"
          busyLabel="Saving…"
        />
      </form>
    </Modal>
  );
}

/* ── Teacher modal ────────────────────────────────────────────────────── */

export function TeacherFormModal({ open, onClose, projectId, teacher, schoolId }: { open: boolean; onClose: () => void; projectId?: string; teacher?: Teacher | null; schoolId?: string }) {
  const qc = useQueryClient(); const projects = useProjects();
  const [pid, setPid] = useState(projectId ?? ""); const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ full_name: "", employee_or_teacher_number: "", email: "", phone: "", school_id: "", subjects: "", grade_levels: "" });
  useEffect(() => {
    if (!open) return; setErr(null); setPid(projectId ?? "");
    setF({ full_name: teacher?.full_name ?? "", employee_or_teacher_number: teacher?.employee_or_teacher_number ?? "", email: teacher?.email ?? "", phone: teacher?.phone ?? "",
      school_id: teacher?.school_id ?? schoolId ?? "", subjects: teacher?.subjects?.join(", ") ?? "", grade_levels: teacher?.grade_levels?.join(", ") ?? "" });
  }, [open, teacher, projectId, schoolId]);
  const schools = useQuery({
    queryKey: ["project-schools", pid], enabled: open && !!pid,
    queryFn: async () => { const { data, error } = await supabase.from("project_schools").select("school:schools(id,name)").eq("project_id", pid).eq("is_active", true); if (error) throw error; return ((data ?? []) as any[]).map((r) => r.school as { id: string; name: string }).sort((a, b) => a.name.localeCompare(b.name)); },
  });
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("upsert_teacher", { p_project: pid, p_teacher: { id: teacher?.id, full_name: f.full_name, employee_or_teacher_number: f.employee_or_teacher_number, email: f.email, phone: f.phone, school_id: f.school_id, subjects: list(f.subjects), grade_levels: list(f.grade_levels) } }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ predicate: (q) => ["teachers", "teacher", "project-teachers", "dashboard", "project-overview"].includes(q.queryKey[0] as string) }); onClose(); },
    onError: (e) => setErr(errMsg(e)),
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} title={teacher ? "Edit teacher" : "Add teacher"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        {!projectId && (
          <LabeledSelect label="Project" required value={pid} onChange={(e) => setPid(e.target.value)}>
            <option value="">Select project…</option>
            {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </LabeledSelect>
        )}

        <FormBody>
          <FormSection icon={GraduationCap}>Assignment</FormSection>
          <LabeledSelect label="School" required value={f.school_id} onChange={set("school_id")}>
            <option value="">Select school…</option>
            {schools.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </LabeledSelect>

          <FormSection icon={UserRound}>Identity</FormSection>
          <LabeledInput label="Full name" required value={f.full_name} onChange={set("full_name")} />
          <LabeledInput label="SACE number" hint="South African Council for Educators registration number" value={f.employee_or_teacher_number} onChange={set("employee_or_teacher_number")} />
          <FormSection icon={Phone}>Contact</FormSection>
          <LabeledInput label="Email" type="email" value={f.email} onChange={set("email")} />
          <LabeledInput label="Phone" type="tel" value={f.phone} onChange={set("phone")} />

          <FormSection icon={BookOpen}>Teaching</FormSection>
          <LabeledInput label="Subjects" hint="Comma separated" value={f.subjects} onChange={set("subjects")} />
          <LabeledInput label="Grades" hint="Comma separated" value={f.grade_levels} onChange={set("grade_levels")} />
        </FormBody>

        {err && <div className="mt-4"><Alert tone="red">{err}</Alert></div>}
        <FormFooter
          busy={m.isPending}
          disabled={!f.full_name.trim() || !f.school_id || !pid}
          label="Save teacher"
          busyLabel="Saving…"
        />
      </form>
    </Modal>
  );
}