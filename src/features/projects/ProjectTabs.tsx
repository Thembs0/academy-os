import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Pencil, Plus, UserMinus, UserPlus, Users } from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { Alert, Badge, EmptyState, ErrorState, LabeledInput, LabeledSelect, Modal, Skeleton } from "@/components/ui";
import { PROJECT_ROLES, roleLabel, globalRoleLabel } from "@/lib/constants";
import { SchoolFormModal, TeacherFormModal } from "@/features/schools/forms";
import { LinkModal } from "@/features/external/LinkModal";
import { fmtDate } from "@/utils/format";
import type { ExternalLink, Project, ProjectMember, School, Teacher } from "@/types/db";
import { useAuth } from "@/features/auth/AuthProvider";

interface Assignable { id: string; full_name: string; email: string; roles: string[] }
const useAssignable = (pid: string, enabled: boolean) => useQuery({ queryKey: ["assignable", pid], enabled, queryFn: async () => { const { data, error } = await supabase.rpc("list_assignable_users", { p_project: pid }); if (error) throw error; return data as Assignable[]; } });

export function TeamTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient(); const [add, setAdd] = useState(false); const [rep, setRep] = useState<ProjectMember | null>(null); const [end, setEnd] = useState<ProjectMember | null>(null);
  const [user, setUser] = useState(""); const [role, setRole] = useState("facilitator"); const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["team", projectId], queryFn: async () => { const { data, error } = await supabase.from("project_members").select("*, profile:profiles!project_members_user_id_fkey(full_name,email)").eq("project_id", projectId).order("is_active", { ascending: false }).order("start_date", { ascending: false }); if (error) throw error; return data as unknown as ProjectMember[]; } });
  const users = useAssignable(projectId, canManage && (add || !!rep));
  const done = () => { qc.invalidateQueries({ queryKey: ["team", projectId] }); qc.invalidateQueries({ queryKey: ["project-overview", projectId] }); setAdd(false); setRep(null); setEnd(null); setUser(""); setErr(null); };
  const addM = useMutation({ mutationFn: async () => { const { data: u } = await supabase.auth.getUser(); const { error } = await supabase.from("project_members").insert({ project_id: projectId, user_id: user, project_role: role, assigned_by: u.user!.id }); if (error) throw error; }, onSuccess: done, onError: (e) => setErr(errMsg(e).includes("uq_active") ? "That person already holds this role on the project." : errMsg(e)) });
  const repM = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("replace_project_member", { p_project: projectId, p_old_user: rep!.user_id, p_role: rep!.project_role, p_new_user: user }); if (error) throw error; }, onSuccess: done, onError: (e) => setErr(errMsg(e)) });
  const endM = useMutation({ mutationFn: async () => { const { error } = await supabase.from("project_members").update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) }).eq("id", end!.id); if (error) throw error; }, onSuccess: done, onError: (e) => setErr(errMsg(e)) });
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const active = q.data!.filter((m) => m.is_active); const past = q.data!.filter((m) => !m.is_active);
  const row = (m: ProjectMember, isActive: boolean) => (
    <li key={m.id} className="card flex flex-wrap items-center justify-between gap-2 p-3"><div><div className="font-medium">{m.profile?.full_name}</div><div className="text-xs text-slate-600">{roleLabel(m.project_role)} · {fmtDate(m.start_date)} → {m.end_date ? fmtDate(m.end_date) : "present"}</div></div>
      {isActive && canManage ? <div className="flex gap-1"><button className="btn-ghost !min-h-[40px]" onClick={() => { setErr(null); setRep(m); }}><UserPlus className="h-4 w-4" />Replace</button><button className="btn-ghost !min-h-[40px] !text-red-700" onClick={() => { setErr(null); setEnd(m); }}><UserMinus className="h-4 w-4" />End</button></div> : <Badge tone={isActive ? "green" : "slate"}>{isActive ? "Active" : "Ended"}</Badge>}</li>);
  return (<>
    {canManage && <div className="mb-3"><button className="btn-primary" onClick={() => { setErr(null); setAdd(true); }}><Plus className="h-4 w-4" />Add member</button></div>}
    {active.length === 0 ? <EmptyState title="No team members yet" icon={<Users className="h-6 w-6" />} /> : <ul className="space-y-2">{active.map((m) => row(m, true))}</ul>}
    {past.length > 0 && <><h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Assignment history</h3><ul className="space-y-2 opacity-80">{past.map((m) => row(m, false))}</ul></>}
    <Modal open={add} title="Add team member" onClose={() => setAdd(false)}>
      <LabeledSelect label="Person" required value={user} onChange={(e) => setUser(e.target.value)}><option value="">Select…</option>{users.data?.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.roles.map(globalRoleLabel).join(", ") || "no role"})</option>)}</LabeledSelect>
      <LabeledSelect label="Role on this project" value={role} onChange={(e) => setRole(e.target.value)}>{PROJECT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</LabeledSelect>
      {err && <Alert tone="red">{err}</Alert>}<button className="btn-primary mt-3 w-full" disabled={!user || addM.isPending} onClick={() => addM.mutate()}>Add to project</button>
    </Modal>
    <Modal open={!!rep} title={`Replace ${rep?.profile?.full_name ?? ""}`} onClose={() => setRep(null)}>
      <Alert>The current assignment is closed today and a new one starts today. All past observations stay linked to the original facilitator, and the new person can see the project's history.</Alert>
      <div className="mt-3"><LabeledSelect label={`New ${rep ? roleLabel(rep.project_role) : ""}`} required value={user} onChange={(e) => setUser(e.target.value)}><option value="">Select…</option>{users.data?.filter((u) => u.id !== rep?.user_id).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</LabeledSelect></div>
      {err && <Alert tone="red">{err}</Alert>}<button className="btn-primary mt-3 w-full" disabled={!user || repM.isPending} onClick={() => repM.mutate()}>Confirm replacement</button>
    </Modal>
    <Modal open={!!end} title="End assignment" onClose={() => setEnd(null)}>
      <p className="text-sm">End <strong>{end?.profile?.full_name}</strong>'s {end ? roleLabel(end.project_role) : ""} assignment? They lose access to this project's data. History is kept.</p>
      {err && <Alert tone="red">{err}</Alert>}<button className="btn-danger mt-4 w-full" disabled={endM.isPending} onClick={() => endM.mutate()}>End assignment</button>
    </Modal>
  </>);
}

export function SchoolsTab({ projectId, canManage, canAssign }: { projectId: string; canManage: boolean; canAssign: boolean }) {
  const qc = useQueryClient(); const [add, setAdd] = useState(false); const [edit, setEdit] = useState<School | null>(null); const [asg, setAsg] = useState<School | null>(null); const [sel, setSel] = useState<string[]>([]); const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["project-schools-full", projectId], queryFn: async () => {
    const [s, f] = await Promise.all([supabase.from("project_schools").select("school:schools(*)").eq("project_id", projectId).eq("is_active", true), supabase.from("school_facilitators").select("school_id,user_id,profile:profiles!school_facilitators_user_id_fkey(full_name)").eq("project_id", projectId).eq("is_active", true)]);
    if (s.error) throw s.error; return { schools: ((s.data ?? []) as any[]).map((r) => r.school as School).sort((x, y) => x.name.localeCompare(y.name)), asg: (f.data ?? []) as any[] };
  } });
  const facs = useQuery({ queryKey: ["team-facs", projectId], enabled: !!asg, queryFn: async () => (await supabase.from("project_members").select("user_id,profile:profiles!project_members_user_id_fkey(full_name)").eq("project_id", projectId).eq("is_active", true).in("project_role", ["facilitator", "senior_facilitator", "intern"])).data as any[] });
  const save = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("set_school_facilitators", { p_project: projectId, p_school: asg!.id, p_users: sel }); if (error) throw error; }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-schools-full", projectId] }); setAsg(null); }, onError: (e) => setErr(errMsg(e)) });
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} />;
  return (<>
    {canManage && <div className="mb-3"><button className="btn-primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" />Add school</button></div>}
    {q.data!.schools.length === 0 ? <EmptyState title="No schools in this project" /> : <ul className="space-y-2">{q.data!.schools.map((s) => { const names = q.data!.asg.filter((x) => x.school_id === s.id).map((x) => x.profile?.full_name).filter(Boolean);
      return <li key={s.id} className="card flex flex-wrap items-center justify-between gap-2 p-3"><div><Link to={`/schools/${s.id}`} className="font-medium text-brand hover:underline">{s.name}</Link><div className="text-xs text-slate-600">{[s.district, s.province].filter(Boolean).join(", ")} · Facilitators: {names.length ? names.join(", ") : "none assigned"}</div></div>
        <div className="flex gap-1">{canAssign && <button className="btn-ghost !min-h-[40px]" onClick={() => { setSel(q.data!.asg.filter((x) => x.school_id === s.id).map((x) => x.user_id)); setErr(null); setAsg(s); }}><Users className="h-4 w-4" />Assign</button>}{canManage && <button className="btn-ghost !min-h-[40px]" onClick={() => setEdit(s)}><Pencil className="h-4 w-4" />Edit</button>}</div></li>; })}</ul>}
    <SchoolFormModal open={add} onClose={() => setAdd(false)} projectId={projectId} /><SchoolFormModal open={!!edit} onClose={() => setEdit(null)} projectId={projectId} school={edit} />
    <Modal open={!!asg} title={`Facilitators at ${asg?.name ?? ""}`} onClose={() => setAsg(null)}>
      {facs.data?.length === 0 && <Alert tone="amber">No facilitators are on this project's team yet.</Alert>}
      <ul className="space-y-2">{facs.data?.map((f: any) => <li key={f.user_id}><label className="flex min-h-[44px] items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={sel.includes(f.user_id)} onChange={(e) => setSel(e.target.checked ? [...sel, f.user_id] : sel.filter((x) => x !== f.user_id))} />{f.profile?.full_name}</label></li>)}</ul>
      {err && <Alert tone="red">{err}</Alert>}<button className="btn-primary mt-3 w-full" disabled={save.isPending} onClick={() => save.mutate()}>Save assignments</button>
    </Modal>
  </>);
}

export function TeachersTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [add, setAdd] = useState(false); const [edit, setEdit] = useState<Teacher | null>(null);
  const q = useQuery({ queryKey: ["project-teachers-full", projectId], queryFn: async () => { const { data, error } = await supabase.from("project_teachers").select("teacher:teachers(*, school:schools(name))").eq("project_id", projectId).eq("is_active", true); if (error) throw error; return ((data ?? []) as any[]).map((r) => r.teacher as Teacher).sort((a, b) => a.full_name.localeCompare(b.full_name)); } });
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} />;
  return (<>
    {canManage && <div className="mb-3"><button className="btn-primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" />Add teacher</button></div>}
    {q.data!.length === 0 ? <EmptyState title="No teachers in this project" /> : <ul className="grid gap-2 sm:grid-cols-2">{q.data!.map((t) => <li key={t.id} className="card flex items-center justify-between p-3"><div><Link to={`/teachers/${t.id}`} className="font-medium text-brand hover:underline">{t.full_name}</Link><div className="text-xs text-slate-600">{t.school?.name}</div></div>{canManage && <button className="btn-ghost !min-h-[40px]" onClick={() => setEdit(t)}><Pencil className="h-4 w-4" /></button>}</li>)}</ul>}
    <TeacherFormModal open={add} onClose={() => setAdd(false)} projectId={projectId} /><TeacherFormModal open={!!edit} onClose={() => setEdit(null)} projectId={projectId} teacher={edit} />
  </>);
}

export function LinksTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient(); const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["ext-links", projectId], queryFn: async () => { const { data, error } = await supabase.from("external_upload_links").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50); if (error) throw error; return data as ExternalLink[]; } });
  const revoke = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.rpc("revoke_external_link", { p_id: id }); if (error) throw error; }, onSuccess: () => qc.invalidateQueries({ queryKey: ["ext-links", projectId] }) });
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} />;
  const status = (l: ExternalLink) => !l.is_active ? ["Revoked", "slate"] : l.expires_at && new Date(l.expires_at) < new Date() ? ["Expired", "amber"] : l.max_uses != null && l.use_count >= l.max_uses ? ["Used up", "amber"] : ["Active", "green"];
  return (<>
    <div className="mb-3"><button className="btn-primary" onClick={() => setOpen(true)}><Link2 className="h-4 w-4" />New upload link</button></div>
    <Alert>External links let a teacher upload one document without an account. Links are random, expire, are use-limited and can be revoked. Uploaded files appear under Documents as “New external submission” for an administrator to verify.</Alert>
    <ul className="mt-3 space-y-2">{q.data!.map((l) => { const [t, tone] = status(l); return <li key={l.id} className="card flex items-center justify-between gap-2 p-3"><div><div className="font-medium">{l.purpose ?? "Document"}</div><div className="text-xs text-slate-600">Created {fmtDate(l.created_at)} · expires {fmtDate(l.expires_at)} · {l.use_count}/{l.max_uses ?? "∞"} used</div></div><div className="flex items-center gap-2"><Badge tone={tone as any}>{t}</Badge>{l.is_active && <button className="btn-ghost !min-h-[40px] !text-red-700" onClick={() => confirm("Revoke this link? It stops working immediately.") && revoke.mutate(l.id)}>Revoke</button>}</div></li>; })}</ul>
    <LinkModal open={open} onClose={() => setOpen(false)} projectId={projectId} />
  </>);
}

export function ConfigTab({ project, canEdit }: { project: Project; canEdit: boolean }) {  const a = useAuth();
  const qc = useQueryClient(); const [f, setF] = useState({ name: project.name, description: project.description ?? "", status: project.status, reporting_frequency: project.reporting_frequency ?? "monthly" }); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [rt, setRt] = useState({ type: "", applies: "teacher", freq: "once" });
  const save = useMutation({ mutationFn: async () => { const { error } = await supabase.from("projects").update({ name: f.name.trim(), description: f.description.trim() || null, status: f.status, reporting_frequency: f.reporting_frequency }).eq("id", project.id); if (error) throw error; }, onSuccess: () => { setMsg("Saved."); qc.invalidateQueries({ queryKey: ["projects"] }); qc.invalidateQueries({ queryKey: ["project-overview", project.id] }); }, onError: (e) => setErr(errMsg(e)) });
  const reqs = useQuery({ queryKey: ["doc-reqs", project.id], queryFn: async () => (await supabase.from("document_requirements").select("*, type:document_types(name)").eq("project_id", project.id).order("name")).data as any[] });
  const types = useQuery({ queryKey: ["doc-types-all"], queryFn: async () => (await supabase.from("document_types").select("id,name").is("project_id", null).order("name")).data as { id: string; name: string }[] });
  const periods = useQuery({ queryKey: ["periods", project.id], queryFn: async () => (await supabase.from("reporting_periods").select("*").eq("project_id", project.id).order("start_date", { ascending: false }).limit(12)).data as any[] });
  const addReq = useMutation({
  mutationFn: async () => {
    if (!rt.type) throw new Error("Pick a document type first.");
    const t = types.data?.find((x) => x.id === rt.type);
    if (!t) throw new Error("That document type no longer exists. Reload the page.");
    const { error } = await supabase.from("document_requirements").insert({
      project_id: project.id,
      document_type_id: t.id,
      name: t.name,
      applies_to: rt.applies,
      frequency: rt.freq,
      is_required: true,
    });
    if (error) throw error;
  },
  onSuccess: () => {
    setMsg("Requirement added.");
    qc.invalidateQueries({ queryKey: ["doc-reqs", project.id] });
    qc.invalidateQueries({ queryKey: ["project-overview", project.id] });
    setRt({ ...rt, type: "" });
  },
  onError: (e) => setErr(errMsg(e)),
});
  const delReq = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("document_requirements").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["doc-reqs", project.id] }); qc.invalidateQueries({ queryKey: ["project-overview", project.id] }); } });

  const canViewReq    = a.can("required_documents.view");
  const canConfigReq  = a.can("required_documents.configure");
  const canRequestDoc = a.can("documents.request");

  return (<div className="grid gap-5 lg:grid-cols-2">
    <section className="card p-4"><h2 className="mb-3 font-semibold">Project details</h2>
      <LabeledInput label="Name" value={f.name} disabled={!canEdit} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <LabeledInput label="Description" value={f.description} disabled={!canEdit} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <LabeledSelect label="Status" value={f.status} disabled={!canEdit} onChange={(e) => setF({ ...f, status: e.target.value as Project["status"] })}>{["draft", "active", "paused", "completed", "archived"].map((s) => <option key={s}>{s}</option>)}</LabeledSelect>
      <LabeledSelect label="Reporting frequency" value={f.reporting_frequency} disabled={!canEdit} onChange={(e) => setF({ ...f, reporting_frequency: e.target.value })}>{["weekly", "monthly", "termly", "quarterly", "custom"].map((s) => <option key={s}>{s}</option>)}</LabeledSelect>
      {msg && <Alert tone="green">{msg}</Alert>}{err && <Alert tone="red">{err}</Alert>}{canEdit ? <button className="btn-primary mt-2" disabled={save.isPending} onClick={() => { setMsg(null); setErr(null); save.mutate(); }}>Save changes</button> : <p className="text-xs text-slate-500">Only the Super Admin or HOD can edit project details.</p>}</section>

    {canViewReq && (
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Required documents</h2>
          {canRequestDoc && (
            <button className="btn-secondary" onClick={() => { /* open request-document flow */ }}>
              Request document
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-slate-600">These drive the “missing documents” counts and the documentation health score.</p>
        <ul className="mb-3 divide-y">
          {reqs.data?.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span>{r.name} <span className="text-xs text-slate-500">· per {r.applies_to} · {r.frequency}</span></span>
              {canConfigReq && <button className="text-xs font-semibold text-red-700" onClick={() => confirm(`Remove requirement "${r.name}"?`) && delReq.mutate(r.id)}>Remove</button>}
            </li>
          ))}
          {reqs.data?.length === 0 && <li className="py-2 text-sm text-slate-500">None configured.</li>}
        </ul>
        {canConfigReq && <div className="grid grid-cols-3 gap-2">
          <select aria-label="Document type" className="input" value={rt.type} onChange={(e) => setRt({ ...rt, type: e.target.value })}><option value="">Type…</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select aria-label="Applies to" className="input" value={rt.applies} onChange={(e) => setRt({ ...rt, applies: e.target.value })}><option value="teacher">per teacher</option><option value="school">per school</option></select>
          <select aria-label="Frequency" className="input" value={rt.freq} onChange={(e) => setRt({ ...rt, freq: e.target.value })}><option value="once">once</option><option value="monthly">monthly</option></select>
          <button className="btn-secondary col-span-3" disabled={!rt.type || addReq.isPending} onClick={() => addReq.mutate()}><Plus className="h-4 w-4" />Add requirement</button>
        </div>}
        <p className="mt-3 text-xs text-slate-500">“once” = one valid document ever; “monthly” = one in the current calendar month.</p>
      </section>
    )}

    <section className="card p-4 lg:col-span-2"><h2 className="mb-3 font-semibold">Reporting periods</h2>{periods.data?.length ? <ul className="divide-y text-sm">{periods.data.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.name}</span><span className="text-slate-600">{fmtDate(p.start_date)} - {fmtDate(p.end_date)} · {p.status}</span></li>)}</ul> : <p className="text-sm text-slate-600">Periods are created automatically when a report is generated.</p>}</section>
  </div>);
}
