import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Profile, ProjectMember, ProjectRole } from "@/types/db";

export type Persona = "super_admin" | "hod" | "manager" | "facilitator" | "admin" | "me" | "viewer";
interface Ctx {
  loading: boolean; session: Session | null; profile: Profile | null; roles: string[]; permissions: Set<string>;
  memberships: ProjectMember[]; persona: Persona; aal: "aal1" | "aal2" | null; mfaRequired: boolean;
  hasRole: (...r: string[]) => boolean; can: (code: string) => boolean;
  projectRoles: (projectId: string) => ProjectRole[]; hasProjectRole: (projectId: string, ...r: ProjectRole[]) => boolean;
  isDeptWide: boolean; isFieldUser: boolean; isAdminUser: boolean;
  refresh: () => Promise<void>; signOut: () => Promise<void>; inactive: boolean;
}
const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error("useAuth outside AuthProvider"); return c; };

const PRIVILEGED = ["super_admin", "hod"];
const ENFORCE_MFA = (import.meta.env.VITE_ENFORCE_MFA as string | undefined) !== "false";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPerms] = useState<Set<string>>(new Set());
  const [memberships, setMemberships] = useState<ProjectMember[]>([]);
  const [aal, setAal] = useState<"aal1" | "aal2" | null>(null);

  const load = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setRoles([]); setPerms(new Set()); setMemberships([]); setAal(null); setLoading(false); return; }
    const uid = s.user.id;
    const [p, r, m, a] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("roles(id,name)").eq("user_id", uid),
      supabase.from("project_members").select("*, project:projects(id,name,project_code)").eq("user_id", uid).eq("is_active", true),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const roleRows = ((r.data ?? []) as any[]).map((x) => x.roles).filter(Boolean) as { id: string; name: string }[];
    setProfile((p.data as Profile) ?? null);
    setRoles(roleRows.map((x) => x.name));
    setMemberships((m.data as unknown as ProjectMember[]) ?? []);
    setAal((a.data?.currentLevel as "aal1" | "aal2") ?? null);
    if (roleRows.length) {
      const { data: rp } = await supabase.from("role_permissions").select("permissions(code)").in("role_id", roleRows.map((x) => x.id));
      setPerms(new Set(((rp ?? []) as any[]).map((x) => x.permissions?.code).filter(Boolean)));
    } else setPerms(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
  supabase.auth.getSession().then(({ data }) => { setSession(data.session); load(data.session); });
  const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setTimeout(() => load(s), 0); });

  // NEW: refresh permissions when the user comes back to the tab
  const onFocus = () => supabase.auth.getSession().then(({ data }) => load(data.session));
  window.addEventListener("focus", onFocus);

  return () => {
    sub.subscription.unsubscribe();
    window.removeEventListener("focus", onFocus);
  };
}, [load]);


  const value = useMemo<Ctx>(() => {
    const hasRole = (...r: string[]) => r.some((x) => roles.includes(x));
    const persona: Persona = hasRole("super_admin") ? "super_admin" : hasRole("hod") ? "hod"
      : hasRole("project_manager", "coordinator") ? "manager" : hasRole("facilitator", "senior_facilitator", "intern") ? "facilitator"
      : hasRole("admin", "senior_admin", "data_admin") ? "admin" : hasRole("me") ? "me" : "viewer";
    const projectRoles = (pid: string) => memberships.filter((m) => m.project_id === pid).map((m) => m.project_role);
    return {
      loading, session, profile, roles, permissions, memberships, persona, aal,
      mfaRequired: ENFORCE_MFA && roles.some((r) => PRIVILEGED.includes(r)) && aal !== "aal2",
      hasRole, can: (c) => permissions.has(c), projectRoles,
      hasProjectRole: (pid, ...r) => projectRoles(pid).some((x) => r.includes(x)),
      isDeptWide: hasRole("super_admin", "hod", "coordinator", "me", "data_admin"),
      isFieldUser: memberships.some((m) => ["facilitator", "senior_facilitator", "intern"].includes(m.project_role)) && permissions.has("field.submit"),
      isAdminUser: hasRole("admin", "senior_admin", "data_admin"),
      inactive: !!profile && !profile.is_active,
      refresh: async () => { const { data } = await supabase.auth.getSession(); await load(data.session); },
      signOut: async () => { await supabase.auth.signOut(); },
    };
  }, [loading, session, profile, roles, permissions, memberships, aal, load]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
