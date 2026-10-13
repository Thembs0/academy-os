import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useMemo, Fragment } from "react";
import { ShieldCheck, AlertTriangle, Search, Lock, LayoutGrid, List, ChevronDown, UserCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Alert, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { globalRoleLabel } from "@/lib/constants";
import { useAuth } from "@/features/auth/AuthProvider";

/* ─────────────────────────────────────────────────────────────────────────
   Ambient background - consistent with the rest of the app.
   ───────────────────────────────────────────────────────────────────────── */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "rpDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "rpDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes rpDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes rpDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   iOS-style toggle - same semantics as a checkbox.
   ───────────────────────────────────────────────────────────────────────── */
function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return (
    <label className="group inline-flex cursor-pointer items-center justify-center">
      <span className="relative inline-flex h-6 w-10 items-center">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} aria-label={label} onChange={onChange} />
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full transition-colors duration-200 ${checked ? "bg-brand" : "bg-slate-300"} ${disabled ? "opacity-50" : "group-hover:brightness-[1.05]"} peer-focus-visible:ring-4 peer-focus-visible:ring-brand/25`}
        />
        <span
          aria-hidden
          className={`absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${checked ? "translate-x-[18px]" : "translate-x-0"}`}
        />
      </span>
    </label>
  );
}

function domainOf(code: string): string {
  const head = (code ?? "").split(".")[0] ?? "other";
  return head.replace(/_/g, " ") || "other";
}

/* ─────────────────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────────────────── */
export default function RolesPage() {
  const qc = useQueryClient();
  const a = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [mode, setMode] = useState<"byRole" | "matrix">("byRole");
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["matrix"],
    queryFn: async () => {
      const [r, p, rp] = await Promise.all([
        supabase.from("roles").select("id,name").order("name"),
        supabase.from("permissions").select("id,code,name").order("code"),
        supabase.from("role_permissions").select("role_id,permission_id"),
      ]);
      if (r.error) throw r.error;
      if (p.error) throw p.error;
      if (rp.error) throw rp.error;
      return {
        roles: (r.data ?? []) as { id: string; name: string }[],
        perms: (p.data ?? []) as { id: string; code: string; name: string }[],
        rp: new Set(((rp.data ?? []) as any[]).map((x) => `${x.role_id}|${x.permission_id}`)),
      };
    },
  });

  const toggle = useMutation({
    mutationFn: async (v: { role: string; perm: string; on: boolean }) => {
      const t = supabase.from("role_permissions");
      const { error } = v.on
        ? await t.delete().eq("role_id", v.role).eq("permission_id", v.perm)
        : await t.insert({ role_id: v.role, permission_id: v.perm });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["matrix"] }),
    onError: (e: any) => setErr(e.message),
  });

  /* Groups the filtered permissions by domain. */
  const groups = useMemo(() => {
    const perms = q.data?.perms ?? [];
    const t = term.trim().toLowerCase();
    const rows = perms.filter((p) => {
      const name = (p.name ?? "").toLowerCase();
      const code = (p.code ?? "").toLowerCase();
      return !t || name.includes(t) || code.includes(t);
    });
    const byDomain = new Map<string, typeof perms>();
    for (const p of rows) {
      const d = domainOf(p.code ?? "");
      if (!byDomain.has(d)) byDomain.set(d, []);
      byDomain.get(d)!.push(p);
    }
    return [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [q.data?.perms, term]);

  /* Auto-select the first role when entering "byRole" mode. */
  const roles = q.data?.roles ?? [];
  const firstNonSuper = roles.find((r) => r.name !== "super_admin")?.id ?? roles[0]?.id ?? null;
  const effectiveRoleId = selectedRoleId ?? firstNonSuper;
  const effectiveRole = roles.find((r) => r.id === effectiveRoleId) ?? null;

  /* Current user's global roles - used to tag the "You" column. */
  const myRoleNames = useMemo(() => new Set(a.roles), [a.roles]);

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const { rp } = q.data;

  const countFor = (roleId: string) =>
    (q.data.perms ?? []).filter((p) => rp.has(`${roleId}|${p.id}`)).length;

  const toggleCollapse = (domain: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain); else next.add(domain);
      return next;
    });
  };

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
          <div className="relative flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-brand/5 ring-1 ring-inset ring-brand/20">
              <ShieldCheck className="h-5 w-5 text-brand" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <PageHeader
                title="Roles & permissions"
                subtitle="What each role can do. Row-level data access is still enforced by project assignment in the database."
              />
            </div>
          </div>
        </div>

        <div className="mb-4">
          <Alert tone="amber">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <span>Be careful: changes apply to everyone holding the role. Super Admin cannot be restricted by this screen.</span>
            </div>
          </Alert>
        </div>

        {err && <div className="mb-4"><Alert tone="red">{err}</Alert></div>}

        {/* Controls bar: mode toggle + search */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-full bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
            <button
              onClick={() => setMode("byRole")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                mode === "byRole"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              By role
            </button>
            <button
              onClick={() => setMode("matrix")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                mode === "matrix"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Matrix
            </button>
          </div>

          <div className="group relative flex-1 sm:max-w-md">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors duration-200 group-focus-within:bg-brand/10 group-focus-within:text-brand"
            >
              <Search className="h-3.5 w-3.5" />
            </span>
            <input
              className="h-10 w-full rounded-2xl border border-slate-200 bg-white/75 pl-12 pr-4 text-sm shadow-sm backdrop-blur transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15"
              placeholder="Filter permissions…"
              aria-label="Filter permissions"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            MODE 1 - By role (no horizontal scrolling)
            ───────────────────────────────────────────────────────────── */}
        {mode === "byRole" && (
          <>
            {/* Role selector - horizontal pill strip */}
            <div className="mb-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {roles.map((r) => {
                const active = r.id === effectiveRoleId;
                const count = countFor(r.id);
                const youTag = myRoleNames.has(r.name);
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`group relative shrink-0 rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                      active
                        ? "border-brand bg-gradient-to-b from-brand/10 to-brand/5 shadow-[0_8px_20px_-12px_rgba(14,165,233,0.6)]"
                        : "border-slate-200/70 bg-white/70 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-white hover:shadow-sm active:translate-y-0"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${active ? "text-brand" : "text-slate-800"}`}>
                        {globalRoleLabel(r.name)}
                      </span>
                      {r.name === "super_admin" && (
                        <Lock className="h-3 w-3 text-slate-400" aria-hidden />
                      )}
                      {youTag && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-700">
                          <UserCircle2 className="h-2.5 w-2.5" /> You
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                      {count} granted
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected role content */}
            {!effectiveRole ? (
              <div className="rounded-3xl border border-slate-200/70 bg-white/75 p-6 text-center text-sm text-slate-600">
                No roles found.
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
                {/* Header card */}
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/70 bg-gradient-to-b from-white to-slate-50/60 px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-brand/5 ring-1 ring-inset ring-brand/20">
                      <ShieldCheck className="h-4 w-4 text-brand" aria-hidden />
                    </span>
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {globalRoleLabel(effectiveRole.name)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {countFor(effectiveRole.id)} of {q.data.perms.length} permissions granted
                      </div>
                    </div>
                  </div>
                  {effectiveRole.name === "super_admin" && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                </div>

                {/* Groups */}
                <div className="divide-y divide-slate-100">
                  {groups.length === 0 && (
                    <div className="px-5 py-10 text-center text-sm text-slate-500">
                      {term ? `No permissions match "${term}".` : "No permissions found."}
                    </div>
                  )}
                  {groups.map(([domain, rows]) => {
                    const isCollapsed = collapsed.has(domain);
                    const onCount = rows.filter((p) => rp.has(`${effectiveRole.id}|${p.id}`)).length;
                    return (
                      <section key={domain}>
                        <button
                          onClick={() => toggleCollapse(domain)}
                          className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50/60"
                        >
                          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`} />
                          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{domain}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {onCount}/{rows.length}
                          </span>
                          <span className="h-px flex-1 bg-gradient-to-r from-slate-300/70 via-slate-200/50 to-transparent" />
                        </button>
                        {!isCollapsed && (
                          <ul className="divide-y divide-slate-100">
                            {rows.map((p) => {
                              const on = rp.has(`${effectiveRole.id}|${p.id}`);
                              const locked = effectiveRole.name === "super_admin";
                              return (
                                <li key={p.id} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-brand/5">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-slate-800">{p.name}</div>
                                    <div className="mt-0.5 font-mono text-[11px] text-slate-400">{p.code}</div>
                                  </div>
                                  <Toggle
                                    checked={on}
                                    disabled={toggle.isPending || locked}
                                    onChange={() => !locked && toggle.mutate({ role: effectiveRole.id, perm: p.id, on })}
                                    label={`${globalRoleLabel(effectiveRole.name)} can ${p.name}`}
                                  />
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ─────────────────────────────────────────────────────────────
            MODE 2 - Matrix (advanced view, sticky header + first column)
            ───────────────────────────────────────────────────────────── */}
        {mode === "matrix" && (
          <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-20 bg-gradient-to-b from-white to-slate-50/90 backdrop-blur">
                  <tr className="border-b border-slate-200/70">
                    <th className="sticky left-0 z-30 min-w-[240px] bg-white/95 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 backdrop-blur">
                      Permission
                    </th>
                    {roles.map((r) => {
                      const youTag = myRoleNames.has(r.name);
                      return (
                        <th
                          key={r.id}
                          className={`px-3 py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] ${youTag ? "text-sky-700" : "text-slate-500"}`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className="truncate">{globalRoleLabel(r.name)}</span>
                            {r.name === "super_admin" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold tracking-wider text-slate-500">
                                <Lock className="h-2.5 w-2.5" aria-hidden /> LOCKED
                              </span>
                            )}
                            {youTag && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-bold tracking-wider text-sky-700">
                                <UserCircle2 className="h-2.5 w-2.5" /> YOU
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {groups.length === 0 && (
                    <tr>
                      <td colSpan={roles.length + 1} className="px-4 py-8 text-center text-sm text-slate-500">
                        {term ? `No permissions match "${term}".` : "No permissions found."}
                      </td>
                    </tr>
                  )}

                  {groups.map(([domain, rows]) => (
                    <Fragment key={domain}>
                      <tr className="bg-slate-50/70">
                        <td
                          colSpan={roles.length + 1}
                          className="sticky left-0 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500"
                        >
                          {domain}
                        </td>
                      </tr>
                      {rows.map((p) => (
                        <tr key={p.id} className="group border-b border-slate-100/80 transition-colors hover:bg-brand/5">
                          <td className="sticky left-0 z-10 min-w-[240px] bg-white px-4 py-3 group-hover:bg-brand/5">
                            <div className="font-medium text-slate-800">{p.name}</div>
                            <div className="mt-0.5 font-mono text-[11px] text-slate-400">{p.code}</div>
                          </td>
                          {roles.map((r) => {
                            const on = rp.has(`${r.id}|${p.id}`);
                            const locked = r.name === "super_admin";
                            return (
                              <td key={r.id} className="px-3 py-3 text-center">
                                <Toggle
                                  checked={on}
                                  disabled={toggle.isPending || locked}
                                  onChange={() => !locked && toggle.mutate({ role: r.id, perm: p.id, on })}
                                  label={`${globalRoleLabel(r.name)} can ${p.name}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-3 px-1 text-xs text-slate-500">
          Toggle a switch to grant or revoke a permission. Changes take effect on the next request - no logout required.
        </p>
      </div>
    </>
  );
}