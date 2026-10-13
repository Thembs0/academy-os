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
      <nav
  aria-label="Primary"
  className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-white lg:hidden no-print"
  style={{
    // Pad the interior so tap targets sit above the home-indicator strip
    paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)",
    // Pad the sides so the two corner buttons aren't clipped by round corners
    paddingLeft: "env(safe-area-inset-left)",
    paddingRight: "env(safe-area-inset-right)",
  }}
>
  {bottom.map((i) => (
    <Link
      key={i.to}
      to={i.to}
      aria-current={link(i.to) ? "page" : undefined}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
        link(i.to) ? "text-brand" : "text-slate-500"
      }`}
    >
      <i.icon className="h-6 w-6" aria-hidden />
      {i.label.replace("My ", "")}
      {i.to === "/notifications" && unread > 0 && (
        <span className="absolute right-[28%] top-1 h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden />
      )}
    </Link>
  ))}
  <button
    onClick={() => setMore(true)}
    className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"
  >
    <MoreHorizontal className="h-6 w-6" aria-hidden />More
  </button>
</nav>

      {more && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 lg:hidden" onClick={() => setMore(false)}>
          <div
            role="dialog"
            aria-label="More navigation"
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">Menu</span>
              <button aria-label="Close" onClick={() => setMore(false)} className="p-2"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {items.slice(4).map((i) => (
                <Link key={i.to} to={i.to} className="flex min-h-[48px] items-center gap-3 rounded-lg border px-3 text-sm font-medium">
                  <i.icon className="h-5 w-5 text-brand" aria-hidden />{i.label}
                </Link>
              ))}
              <button onClick={auth.signOut} className="flex min-h-[48px] items-center gap-3 rounded-lg border px-3 text-sm font-medium text-red-700">
                <LogOut className="h-5 w-5" />Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <Menu className="hidden" />
    </div>
  );
}