import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { Spinner, NoAccess } from "@/components/ui";
import { isConfigured } from "@/lib/supabase/client";
import MfaGate from "./MfaGate";

export function RequireAuth({ children }: { children: ReactNode }) {
  const a = useAuth(); const loc = useLocation();
  if (!isConfigured) return <div className="p-8"><h1 className="text-lg font-bold">Not configured</h1><p className="mt-2 text-sm">Copy <code>.env.example</code> to <code>.env</code> and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</p></div>;
  if (a.loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (!a.session) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (a.inactive || !a.profile) return (
    <div className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-lg font-bold">Account unavailable</h1>
      <p className="mt-2 text-sm text-slate-600">{a.inactive ? "Your account has been deactivated." : "Your profile could not be loaded."} Contact the Super Admin.</p>
      <button className="btn-secondary mt-4" onClick={a.signOut}>Sign out</button></div></div>);
  if (a.roles.length === 0) return (
    <div className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-lg font-bold">Waiting for access</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-600">Your account exists but no role has been assigned yet. Ask the Super Admin to assign your role and projects.</p>
      <button className="btn-secondary mt-4" onClick={a.signOut}>Sign out</button></div></div>);
  if (a.mfaRequired) return <MfaGate />;
  return <>{children}</>;
}

/** UI-level convenience only. Real enforcement is RLS + server-side functions. */
export function RequireRole({ roles, perm, children }: { roles?: string[]; perm?: string; children: ReactNode }) {
  const a = useAuth();
  const ok = (!roles || a.hasRole(...roles)) && (!perm || a.can(perm));
  return ok ? <>{children}</> : <NoAccess />;
}
