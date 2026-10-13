import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing, Bell, ClipboardCheck, FileText, FolderKanban, BookOpen,
  ShieldCheck, Sparkles, CheckCheck, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Notification } from "@/types/db";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { timeAgo } from "@/utils/format";

/* ── Ambient background ─────────────────────────────────────────────── */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "noDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "noDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes noDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes noDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

/* ── Link mapping (unchanged behaviour) ─────────────────────────────── */
export function linkFor(n: Pick<Notification, "entity_type" | "entity_id">): string | null {
  if (!n.entity_id) return null;
  switch (n.entity_type) {
    case "observation": return `/observations/${n.entity_id}`;
    case "project": return `/projects/${n.entity_id}`;
    case "document": return `/documents?focus=${n.entity_id}`;
    case "external_submission": return "/documents?status=uploaded";
    case "register": return `/registers/${n.entity_id}`;
    default: return null;
  }
}

/* ── Icon + tint by notification type ───────────────────────────────── */
function notifMeta(type: string | undefined | null) {
  switch (type) {
    case "observation_submitted":
    case "observation_approved":
    case "observation_queried":
      return { Icon: ClipboardCheck, tint: "bg-sky-50 text-sky-700 ring-sky-200", stripe: "border-sky-400" };
    case "document_uploaded":
    case "document_verified":
    case "document_queried":
      return { Icon: FileText, tint: "bg-violet-50 text-violet-700 ring-violet-200", stripe: "border-violet-400" };
    case "document_deletion_approved":
    case "register_deletion_approved":
      return { Icon: CheckCheck, tint: "bg-emerald-50 text-emerald-700 ring-emerald-200", stripe: "border-emerald-400" };
    case "document_deletion_rejected":
    case "register_deletion_rejected":
      return { Icon: AlertTriangle, tint: "bg-amber-50 text-amber-700 ring-amber-200", stripe: "border-amber-400" };
    case "report_generated":
    case "report_approved":
      return { Icon: BookOpen, tint: "bg-amber-50 text-amber-700 ring-amber-200", stripe: "border-amber-400" };
    case "project_assigned":
    case "project_member.assigned":
      return { Icon: FolderKanban, tint: "bg-emerald-50 text-emerald-700 ring-emerald-200", stripe: "border-emerald-400" };
    case "user_role.assigned":
      return { Icon: ShieldCheck, tint: "bg-red-50 text-red-700 ring-red-200", stripe: "border-red-400" };
    default:
      return { Icon: Sparkles, tint: "bg-slate-100 text-slate-600 ring-slate-200", stripe: "border-slate-300" };
  }
}

/* ── Page ───────────────────────────────────────────────────────────── */
export default function NotificationsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Notification[];
    },
  });

  const mark = useMutation({
    mutationFn: async (ids: string[] | "all") => {
      let r = supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("is_read", false);
      if (ids !== "all") r = r.in("id", ids);
      const { error } = await r;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
    },
  });

  const rows = q.data ?? [];
  const unread = rows.filter((n) => !n.is_read).length;

  const visible = useMemo(
    () => (filter === "unread" ? rows.filter((n) => !n.is_read) : rows),
    [rows, filter]
  );

  return (
    <>
      <Ambient />
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="relative mb-6 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 right-0 h-56 w-[60%] rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,0.30), transparent 65%)" }}
          />
          <div className="relative flex flex-wrap items-start gap-3">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-brand/5 ring-1 ring-inset ring-brand/20">
              <BellRing className="h-5 w-5 text-brand" aria-hidden />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-md">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">Notifications</h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {unread > 0
                  ? `${unread} unread ${unread === 1 ? "notification" : "notifications"}`
                  : "You're all caught up."}
              </p>
            </div>
            {unread > 0 && (
              <button
                className="group inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.98]"
                disabled={mark.isPending}
                onClick={() => mark.mutate("all")}
              >
                <CheckCheck className="h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:scale-110" />
                Mark all as read
              </button>
            )}
          </div>
        </div>

        {/* Filter chips */}
        {rows.length > 0 && (
          <div className="mb-4 flex gap-1.5 rounded-full bg-slate-100/70 p-1 ring-1 ring-inset ring-slate-200/60 backdrop-blur w-fit">
            {([
              ["all", `All ${rows.length}`],
              ["unread", `Unread ${unread}`],
            ] as const).map(([k, l]) => {
              const active = filter === k;
              return (
                <button
                  key={k}
                  onClick={() => setFilter(k as any)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.97] ${
                    active
                      ? "bg-gradient-to-b from-brand to-brand-700 text-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.6)] ring-1 ring-inset ring-white/15"
                      : "text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-sm"
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        )}

        {/* List */}
        {q.isLoading ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : visible.length === 0 ? (
          <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-2 shadow-sm backdrop-blur">
            <EmptyState
              title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
              icon={<Bell className="h-6 w-6" />}
              text={
                filter === "unread"
                  ? "You've read everything. Switch to All to see history."
                  : "You'll be notified here when something needs your attention - reviews, queries, approvals and new documents."
              }
            />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {visible.map((n) => {
              const { Icon, tint, stripe } = notifMeta(n.notification_type);
              const l = linkFor(n);
              return (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      if (!n.is_read) mark.mutate([n.id]);
                      if (l) nav(l);
                    }}
                    className={`
                      group flex w-full items-start gap-3.5 rounded-2xl border bg-white/85 p-3.5 pr-4 text-left shadow-[0_4px_14px_-8px_rgba(15,23,42,0.2)] backdrop-blur
                      transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_30px_-14px_rgba(56,189,248,0.45)] active:translate-y-0 active:scale-[0.995]
                      ${n.is_read ? "border-slate-200/70" : `border-l-4 ${stripe}`}
                    `}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ${tint} ${!n.is_read ? "shadow-sm" : ""}`}>
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={`truncate text-sm ${n.is_read ? "font-medium text-slate-700" : "font-semibold text-slate-900"}`}>
                          {n.title}
                        </span>
                        {!n.is_read && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-800 ring-1 ring-inset ring-sky-200">
                            New
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-slate-600">
                        {n.message}
                      </span>
                    </span>

                    <span className="shrink-0 pt-0.5 text-xs text-slate-500">
                      {timeAgo(n.created_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}