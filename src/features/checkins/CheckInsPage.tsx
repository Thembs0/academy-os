import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Download, MapPin, Clock, CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton, Stat } from "@/components/ui";
import { downloadCsv } from "@/utils/csv";
import { fmtDate } from "@/utils/format";

interface Row {
  id: string;
  user_id: string;
  user_name: string | null;
  project_id: string | null;
  project_name: string | null;
  school_id: string | null;
  school_name: string | null;
  check_in_date: string;
  start_time: string;
  end_time: string | null;
  expected_end: string | null;
  notes: string | null;
}

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "ciDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "ciDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes ciDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes ciDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-3 px-1">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-slate-300/80 via-slate-200/60 to-transparent" />
    </div>
  );
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";

const durationHours = (start: string, end: string | null) => {
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return null;
  return Math.round((ms / 3_600_000) * 10) / 10;
};

export default function CheckInsPage() {
  const today = new Date().toLocaleDateString("en-CA");
  const sevenDaysAgo = new Date(Date.now() - 6 * 86_400_000).toLocaleDateString("en-CA");

  const [from, setFrom] = useState(sevenDaysAgo);
  const [to, setTo] = useState(today);
  const [project, setProject] = useState<string>("");
  const [quick, setQuick] = useState<"today" | "week" | "month" | "custom">("week");

  const projects = useQuery({
    queryKey: ["checkin-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const q = useQuery({
    queryKey: ["check-ins-list", from, to, project],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_check_ins", {
        p_from: from || null,
        p_to: to || null,
        p_project: project || null,
        p_user: null,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const setQuickRange = (v: typeof quick) => {
    setQuick(v);
    const t = new Date().toLocaleDateString("en-CA");
    if (v === "today") { setFrom(t); setTo(t); }
    else if (v === "week") {
      setFrom(new Date(Date.now() - 6 * 86_400_000).toLocaleDateString("en-CA"));
      setTo(t);
    } else if (v === "month") {
      setFrom(new Date(Date.now() - 29 * 86_400_000).toLocaleDateString("en-CA"));
      setTo(t);
    }
  };

  const rows = q.data ?? [];

  const stats = useMemo(() => {
    const onSiteNow = rows.filter((r) => !r.end_time && r.check_in_date === today).length;
    const completedToday = rows.filter((r) => r.end_time && r.check_in_date === today).length;
    const totalRows = rows.length;
    const avgHours = (() => {
      const closed = rows.filter((r) => r.end_time);
      if (closed.length === 0) return null;
      const total = closed.reduce((acc, r) => acc + (durationHours(r.start_time, r.end_time) ?? 0), 0);
      return Math.round((total / closed.length) * 10) / 10;
    })();
    return { onSiteNow, completedToday, totalRows, avgHours };
  }, [rows, today]);

  const exportCsv = () => {
    downloadCsv(
      `check-ins_${from}_to_${to}.csv`,
      rows.map((r) => ({
        date: r.check_in_date,
        facilitator: r.user_name ?? "",
        project: r.project_name ?? "",
        school: r.school_name ?? "",
        start: r.start_time,
        end: r.end_time ?? "",
        hours: durationHours(r.start_time, r.end_time) ?? "",
        status: r.end_time ? "Completed" : "On site",
        notes: r.notes ?? "",
      }))
    );
  };

  if (q.isLoading) return <Skeleton rows={5} />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;

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
          <div className="relative">
            <PageHeader
              title="Field activity"
              subtitle="Where facilitators are, day by day."
              actions={
                <button
                  className="group inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:opacity-50"
                  onClick={exportCsv}
                  disabled={rows.length === 0}
                >
                  <Download className="h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:translate-y-0.5" />
                  Export CSV
                </button>
              }
            />
          </div>
        </div>

        {/* Stats */}
        <section className="mb-6">
          <SectionLabel>Today at a glance</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="On site now" value={stats.onSiteNow} tone={stats.onSiteNow ? "green" : undefined} />
            <Stat label="Completed today" value={stats.completedToday} />
            <Stat label="Check-ins in range" value={stats.totalRows} />
            <Stat label="Avg hours per visit" value={stats.avgHours ?? "-"} />
          </div>
        </section>

        {/* Filters */}
        <section className="mb-6">
          <SectionLabel>Filters</SectionLabel>
          <div className="rounded-3xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-wrap gap-2">
              {[
                ["today", "Today"],
                ["week", "Last 7 days"],
                ["month", "Last 30 days"],
                ["custom", "Custom"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setQuickRange(k as typeof quick)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    quick === k
                      ? "bg-gradient-to-b from-brand to-brand-700 text-white shadow-[0_4px_12px_-6px_rgba(15,23,42,0.5)]"
                      : "bg-white/70 text-slate-700 ring-1 ring-inset ring-slate-200/70 hover:bg-white"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">From</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); setQuick("custom"); }}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white/70 px-3 text-sm shadow-sm transition-all focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">To</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setQuick("custom"); }}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white/70 px-3 text-sm shadow-sm transition-all focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Project</span>
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white/70 px-3 text-sm shadow-sm transition-all focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15"
                >
                  <option value="">All projects</option>
                  {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>
          </div>
        </section>

        {/* List */}
        <section>
          <SectionLabel>Records</SectionLabel>
          {rows.length === 0 ? (
            <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-2 shadow-sm backdrop-blur">
              <EmptyState
                title="No check-ins in this range"
                icon={<Calendar className="h-6 w-6" />}
                text="Try a wider date range or a different project."
              />
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl md:block">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200/70 bg-gradient-to-b from-white to-slate-50/90">
                    <tr className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Facilitator</th>
                      <th className="px-4 py-3 text-left">Project</th>
                      <th className="px-4 py-3 text-left">School</th>
                      <th className="px-4 py-3 text-left">Time</th>
                      <th className="px-4 py-3 text-left">Hours</th>
                      <th className="px-4 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.id} className="group transition-colors hover:bg-brand/5">
                        <td className="px-4 py-3 text-slate-700">{fmtDate(r.check_in_date)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{r.user_name ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{r.project_name ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{r.school_name ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {fmtTime(r.start_time)} - {fmtTime(r.end_time ?? r.expected_end)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 tabular-nums">
                          {durationHours(r.start_time, r.end_time) ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          {r.end_time
                            ? <Badge tone="slate"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>
                            : <Badge tone="green"><Circle className="h-3 w-3" /> On site</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className="space-y-2.5 md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-slate-200/70 bg-white/85 p-3.5 shadow-sm backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-900">{r.user_name ?? "Unknown"}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <MapPin className="h-3 w-3" /> <span className="truncate">{r.school_name ?? "-"}</span>
                        </div>
                      </div>
                      {r.end_time
                        ? <Badge tone="slate"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>
                        : <Badge tone="green"><Circle className="h-3 w-3" /> On site</Badge>}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtTime(r.start_time)} - {fmtTime(r.end_time ?? r.expected_end)}</span>
                      <span className="tabular-nums">{durationHours(r.start_time, r.end_time) ?? "-"}h</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">{fmtDate(r.check_in_date)} · {r.project_name ?? "-"}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}