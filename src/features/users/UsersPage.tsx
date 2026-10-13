import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserCog } from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { useProjects } from "@/hooks";
import { Alert, Badge, EmptyState, ErrorState, LabeledInput, LabeledSelect, Modal, PageHeader, Skeleton, Tabs } from "@/components/ui";
import { GLOBAL_ROLES, PROJECT_ROLES, globalRoleLabel } from "@/lib/constants";
import { fmtDate } from "@/utils/format";
import type { Profile } from "@/types/db";

interface UserRow extends Profile { user_roles: { roles: { id: string; name: string } }[] }
interface Req { id: string; full_name: string; email: string; phone: string | null; requested_reason: string | null; status: string; created_at: string }
async function callAdmin(body: object) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error || data?.error) { let m = data?.error; try { m = m ?? (await (error as any).context.json()).error; } catch { /* */ } throw new Error(m ?? "Request failed"); }
  return data;
}

function InviteModal({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: Req | null }) {
  const qc = useQueryClient(); const projects = useProjects(); const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [roles, setRoles] = useState<string[]>([]); const [pid, setPid] = useState(""); const [prole, setProle] = useState("facilitator"); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [synced, setSynced] = useState<string | null>(null);
  if (open && preset && synced !== preset.id) { setSynced(preset.id); setEmail(preset.email); setName(preset.full_name); }
  const m = useMutation({ mutationFn: () => callAdmin({ action: "invite", email, full_name: name, roles, assignments: pid ? [{ project_id: pid, project_role: prole }] : [], access_request_id: preset?.id }),
    onSuccess: () => { setOk(true); qc.invalidateQueries({ queryKey: ["users"] }); qc.invalidateQueries({ queryKey: ["access-requests"] }); }, onError: (e) => setErr(errMsg(e)) });
  const close = () => { setOk(false); setErr(null); setEmail(""); setName(""); setRoles([]); setPid(""); setSynced(null); onClose(); };
  return (
    <Modal open={open} title="Invite user" onClose={close} wide>
      {ok ? <div><Alert tone="green">Invitation sent to {email}. They'll set their own password from the email link.</Alert><button className="btn-primary mt-4 w-full" onClick={close}>Done</button></div> : (
        <form onSubmit={(e) => { e.preventDefault(); setErr(null); m.mutate(); }}>
          <LabeledInput label="Full name" required value={name} onChange={(e) => setName(e.target.value)} /><LabeledInput label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <fieldset className="mb-4"><legend className="label">Roles <span className="text-red-600">*</span></legend><div className="grid grid-cols-2 gap-1 sm:grid-cols-3">{GLOBAL_ROLES.map((r) => <label key={r} className="flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} />{globalRoleLabel(r)}</label>)}</div></fieldset>
          <div className="grid gap-3 sm:grid-cols-2"><LabeledSelect label="Assign to project (optional)" value={pid} onChange={(e) => setPid(e.target.value)}><option value="">-</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</LabeledSelect>
            {pid && <LabeledSelect label="Project role" value={prole} onChange={(e) => setProle(e.target.value)}>{PROJECT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</LabeledSelect>}</div>
          {err && <Alert tone="red">{err}</Alert>}<button className="btn-primary mt-2 w-full" disabled={m.isPending || !email || !name || !roles.length}>{m.isPending ? "Sending…" : "Send invitation"}</button>
        </form>)}
    </Modal>
  );
}

function RolesModal({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const qc = useQueryClient(); const [err, setErr] = useState<string | null>(null);
  const roles = useQuery({ queryKey: ["all-roles"], queryFn: async () => (await supabase.from("roles").select("id,name")).data as { id: string; name: string }[] });
  const has = (n: string) => user?.user_roles.some((r) => r.roles.name === n);
  const toggle = useMutation({ mutationFn: async (r: { id: string; name: string }) => { const q = has(r.name) ? supabase.from("user_roles").delete().eq("user_id", user!.id).eq("role_id", r.id) : supabase.from("user_roles").upsert({ user_id: user!.id, role_id: r.id }, { onConflict: "user_id,role_id", ignoreDuplicates: true }); const { error } = await q; if (error) throw error; }, onSuccess: () => { setErr(null); return qc.invalidateQueries({ queryKey: ["users"] }); }, onError: (e) => setErr(errMsg(e)) });
  return (<Modal open={!!user} title={`Roles - ${user?.full_name ?? ""}`} onClose={onClose}>
    <p className="mb-3 text-xs text-slate-600">Changes take effect the next time the user opens the app. Every change is audited.</p>
    <ul>{roles.data?.sort((a, b) => a.name.localeCompare(b.name)).map((r) => <li key={r.id}><label className="flex min-h-[44px] items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={!!has(r.name)} disabled={toggle.isPending} onChange={() => toggle.mutate(r)} />{globalRoleLabel(r.name)}</label></li>)}</ul>{err && <Alert tone="red">{err}</Alert>}</Modal>);
}

export default function UsersPage() {
  const a = useAuth(); const qc = useQueryClient(); const [tab, setTab] = useState<"users" | "requests">("users"); const [inv, setInv] = useState(false); const [preset, setPreset] = useState<Req | null>(null); const [roleUserId, setRoleUserId] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const canManage = a.can("users.manage");
  const users = useQuery({ queryKey: ["users"], queryFn: async () => { const { data, error } = await supabase.from("profiles").select("*, user_roles!user_roles_user_id_fkey(roles(id,name))").order("full_name"); if (error) throw error; return data as unknown as UserRow[]; } });
  const reqs = useQuery({ queryKey: ["access-requests"], enabled: canManage, queryFn: async () => (await supabase.from("access_requests").select("*").eq("status", "pending").order("created_at", { ascending: false })).data as Req[] });
  const active = useMutation({ mutationFn: (v: { id: string; active: boolean }) => callAdmin({ action: "set_active", user_id: v.id, active: v.active }), onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }), onError: (e) => setErr(errMsg(e)) });
  const reject = useMutation({ mutationFn: (id: string) => callAdmin({ action: "reject_request", access_request_id: id }), onSuccess: () => qc.invalidateQueries({ queryKey: ["access-requests"] }) });
  return (<>
    <PageHeader title="Users" actions={canManage && <button className="btn-primary" onClick={() => { setPreset(null); setInv(true); }}><Plus className="h-4 w-4" />Invite user</button>} />
    <Tabs tabs={[{ id: "users", label: "Users" }, ...(canManage ? [{ id: "requests" as const, label: "Access requests", badge: reqs.data?.length }] : [])]} value={tab} onChange={setTab} />
    {err && <Alert tone="red">{err}</Alert>}
    {tab === "users" && (users.isLoading ? <Skeleton /> : users.error ? <ErrorState error={users.error} retry={() => users.refetch()} /> : !users.data?.length ? <EmptyState title="No users" /> : (
      <ul className="space-y-2">{users.data.map((u) => <li key={u.id} className="card flex flex-wrap items-center justify-between gap-2 p-3"><div className="min-w-0"><div className="flex items-center gap-2 font-medium">{u.full_name}{!u.is_active && <Badge tone="slate">Deactivated</Badge>}</div><div className="truncate text-xs text-slate-600">{u.email} · {u.user_roles.map((r) => globalRoleLabel(r.roles.name)).join(", ") || "no role"} · since {fmtDate(u.created_at)}</div></div>
        {canManage && <div className="flex gap-1"><button className="btn-ghost !min-h-[40px]" onClick={() => setRoleUserId(u.id)}><UserCog className="h-4 w-4" />Roles</button>{u.id !== a.profile?.id && <button className={`btn-ghost !min-h-[40px] ${u.is_active ? "!text-red-700" : ""}`} disabled={active.isPending} onClick={() => confirm(u.is_active ? `Deactivate ${u.full_name}? They are signed out of project access; history is kept.` : `Reactivate ${u.full_name}?`) && active.mutate({ id: u.id, active: !u.is_active })}>{u.is_active ? "Deactivate" : "Reactivate"}</button>}</div>}</li>)}</ul>))}
    {tab === "requests" && (reqs.isLoading ? <Skeleton /> : !reqs.data?.length ? <EmptyState title="No pending requests" /> : <ul className="space-y-2">{reqs.data.map((r) => <li key={r.id} className="card p-3"><div className="font-medium">{r.full_name} <span className="text-xs font-normal text-slate-500">{r.email}{r.phone ? ` · ${r.phone}` : ""}</span></div>{r.requested_reason && <p className="mt-1 text-sm text-slate-700">{r.requested_reason}</p>}<div className="mt-2 flex gap-2"><button className="btn-primary !min-h-[40px]" onClick={() => { setPreset(r); setInv(true); }}>Approve & invite</button><button className="btn-secondary !min-h-[40px]" onClick={() => reject.mutate(r.id)}>Reject</button></div></li>)}</ul>)}
    <InviteModal open={inv} onClose={() => setInv(false)} preset={preset} /><RolesModal user={users.data?.find((x) => x.id === roleUserId) ?? null} onClose={() => setRoleUserId(null)} />
  </>);
}
