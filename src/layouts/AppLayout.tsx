import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut, Menu, MoreHorizontal, Search, X } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { ConnectivityBanner } from "@/features/auth/SyncProvider";
import { supabase } from "@/lib/supabase/client";
import { navFor } from "./nav";
import { globalRoleLabel } from "@/lib/constants";

export function useUnread() {
  const { profile } = useAuth(); const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notif-unread"], enabled: !!profile, refetchInterval: 120000,
    queryFn: async () => (await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false)).count ?? 0,
  });
  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel("notif-" + profile.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["notif-unread"] }); qc.invalidateQueries({ queryKey: ["notifications"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, qc]);
  return q.data ?? 0;
}

function Brand({ light }: { light?: boolean }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-2">
      <img src="/icons/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
      <div className="leading-tight"><div className={`text-sm font-bold ${light ? "text-white" : "text-brand"}`}>STEM Academy</div><div className={`text-[11px] ${light ? "text-sky-200" : "text-slate-500"}`}>ORT SA</div></div>
    </Link>
  );
}

export default function AppLayout() {
  const auth = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const unread = useUnread(); const [more, setMore] = useState(false); const [q, setQ] = useState("");
  const items = navFor(auth.persona, auth.can);
  useEffect(() => setMore(false), [loc.pathname, loc.search]);
  const bottom = items.slice(0, 4);

  const link = (to: string) => to.includes("?") ? loc.pathname + loc.search === to : loc.pathname === to || (to !== "/dashboard" && loc.pathname.startsWith(to.split("?")[0] + "/"));
  const search = (e: React.FormEvent) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); };

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-brand-800 text-white lg:flex no-print">
        <div className="p-5"><Brand light /></div>
        <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {items.map((i) => (
            <Link
              key={i.to}
              to={i.to}
              aria-current={link(i.to) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${link(i.to) ? "bg-white/15 text-white" : "text-sky-100 hover:bg-white/10"}`}
            >
              <i.icon className="h-5 w-5" aria-hidden />
              {i.label}
              {i.to === "/notifications" && unread > 0 && (
                <span className="ml-auto rounded-full bg-sky px-2 text-xs font-bold text-brand-800">{unread}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-sm">
          <div className="truncate font-semibold">{auth.profile?.full_name}</div>
          <div className="truncate text-xs text-sky-200">{auth.roles.map(globalRoleLabel).join(", ")}</div>
          <button onClick={auth.signOut} className="mt-3 flex items-center gap-2 text-sky-100 hover:text-white">
            <LogOut className="h-4 w-4" />Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectivityBanner />

        <header
          className="sticky top-0 z-30 flex items-center gap-3 border-b bg-white px-4 py-2.5 no-print"
          style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
        >
          <div className="lg:hidden"><Brand /></div>
          <form onSubmit={search} role="search" className="relative ml-auto w-full max-w-md lg:ml-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="input pl-9"
              placeholder="Search schools, teachers, documents…"
              aria-label="Search"
            />
          </form>
          <Link
            to="/notifications"
            className="relative rounded-lg p-2.5 text-slate-600 hover:bg-slate-100"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 lg:px-8 lg:pb-10"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 88px)",
          }}
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      {/* ── Mobile bottom nav ─────────────────────────────────────────── */}
<nav
  aria-label="Primary"
  className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/60 bg-white/95 backdrop-blur-xl lg:hidden no-print"
  style={{
    paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)",
    paddingLeft: "env(safe-area-inset-left, 0px)",
    paddingRight: "env(safe-area-inset-right, 0px)",
  }}
>
  <div className="flex h-14 items-stretch">
    {bottom.map((i) => (
      <Link
        key={i.to}
        to={i.to}
        aria-current={link(i.to) ? "page" : undefined}
        className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold leading-none transition-colors ${
          link(i.to) ? "text-brand" : "text-slate-500"
        }`}
      >
        <i.icon className="h-5 w-5" aria-hidden />
        <span className="truncate px-1">{i.label.replace("My ", "")}</span>
        {i.to === "/notifications" && unread > 0 && (
          <span className="absolute right-1/4 top-1.5 h-2 w-2 rounded-full bg-red-600 ring-2 ring-white" aria-hidden />
        )}
      </Link>
    ))}
    <button
      type="button"
      onClick={() => setMore(true)}
      className="relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold leading-none text-slate-500 transition-colors hover:text-slate-700"
      aria-label="More navigation"
    >
      <MoreHorizontal className="h-5 w-5" aria-hidden />
      <span className="truncate px-1">More</span>
    </button>
  </div>
</nav>

{/* ── Mobile "More" slide-up menu ──────────────────────────────── */}
{more && (
  <div
    className="fixed inset-0 z-[100] flex items-end bg-slate-900/50 backdrop-blur-sm lg:hidden"
    onClick={() => setMore(false)}
    role="dialog"
    aria-modal="true"
    aria-label="More navigation"
  >
    <div
      onClick={(e) => e.stopPropagation()}
      className="relative w-full overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-[0_-20px_50px_-20px_rgba(15,23,42,0.35)]"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      {/* Drag handle */}
      <div aria-hidden className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-300" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <span className="text-sm font-bold tracking-tight text-slate-900">Menu</span>
        <button
          aria-label="Close menu"
          onClick={() => setMore(false)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 hover:text-slate-700 active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Grid of links */}
      <div className="max-h-[60vh] overflow-y-auto px-5 pb-2">
        <div className="grid grid-cols-2 gap-2">
          {items.slice(4).map((i) => (
            <Link
              key={i.to}
              to={i.to}
              onClick={() => setMore(false)}
              className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 transition-all hover:border-brand/40 hover:bg-brand/5 active:scale-[0.98]"
            >
              <i.icon className="h-5 w-5 shrink-0 text-brand" aria-hidden />
              <span className="truncate">{i.label}</span>
            </Link>
          ))}
          <button
            onClick={auth.signOut}
            className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-3.5 text-sm font-medium text-red-700 transition-all hover:bg-red-100 active:scale-[0.98]"
          >
            <LogOut className="h-5 w-5 shrink-0" aria-hidden />
            <span className="truncate">Sign out</span>
          </button>
        </div>
      </div>
    </div>
  </div>
)}

      <Menu className="hidden" />
    </div>
  );
}