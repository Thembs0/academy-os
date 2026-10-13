import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {ClipboardList, Plus, Download, Filter, Calendar, School as SchoolIcon, UserRound, AlertTriangle, Users, GraduationCap, Wifi, MapPin, Clock,
} from "lucide-react";import { useAuth } from "@/features/auth/AuthProvider";
import { useProjects } from "@/hooks";
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { listRegisters, registerTypeLabel, type RegisterType } from "@/services/registers";
import { NewRegisterModal } from "./NewRegisterModal";
import { downloadCsv } from "@/utils/csv";
import { fmtDate } from "@/utils/format";

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "rgDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "rgDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes rgDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes rgDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

export default function RegistersPage() {
  const a = useAuth();
  const projects = useProjects();
  const isFacilitator = a.isFieldUser;
  const canViewAll = a.can("check_ins.view.all") || a.hasRole("super_admin", "hod", "admin", "senior_admin", "data_admin", "coordinator", "me");
  const canSubmit = a.isFieldUser || a.can("check_ins.submit");

  const [projectFilter, setProjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<RegisterType | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openNew, setOpenNew] = useState(false);

  const q = useQuery({
    queryKey: ["registers", { projectFilter, typeFilter, fromDate, toDate, facilitatorOnly: isFacilitator }],
    queryFn: () => listRegisters({
      projectId: projectFilter || undefined,
      facilitatorId: isFacilitator ? a.profile!.id : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      type: typeFilter || undefined,
    }),
  });

  const rows = q.data ?? [];

  const exportCsv = () => {
    downloadCsv(`registers_${Date.now()}.csv`, rows.map((r) => ({
      date: r.session_date,
      type: registerTypeLabel(r.register_type),
      project: r.project?.name ?? "",
      school: r.school?.name ?? "",
      facilitator: r.facilitator?.full_name ?? "",
      topic: r.topic ?? "",
      status: r.status,
      start: r.start_time ?? "",
      end: r.end_time ?? "",
    })));
  };

  return (
    <>
      <Ambient />
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">

        <div className="relative mb-6 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 right-0 h-56 w-[60%] rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,0.30), transparent 65%)" }}
          />
          <div className="relative">
            <PageHeader
              title={isFacilitator ? "My registers" : "Registers"}
              subtitle="Attendance records and signed evidence for every session."
              actions={
                <>
                  {rows.length > 0 && (
                    <button
                      className="group inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.98]"
                      onClick={exportCsv}
                    >
                      <Download className="h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:translate-y-0.5" />
                      Export CSV
                    </button>
                  )}
                  {canSubmit && (
                    <button
                      className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98]"
                      onClick={() => setOpenNew(true)}
                    >
                      <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
                      New register
                    </button>
                  )}
                </>
              }
            />
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 rounded-3xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {canViewAll && (
              <select
                className="h-11 rounded-2xl border border-slate-200 bg-white/70 px-3 text-sm shadow-sm focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
              >
                <option value="">All projects</option>
                {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <select
              className="h-11 rounded-2xl border border-slate-200 bg-white/70 px-3 text-sm shadow-sm focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as RegisterType | "")}
            >
              <option value="">All types</option>
              <option value="teacher_session">Teacher session</option>
              <option value="sba_learners">SBA (learners)</option>
              <option value="ordinary">Attendance</option>
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-11 rounded-2xl border border-slate-200 bg-white/70 px-3 text-sm shadow-sm focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-11 rounded-2xl border border-slate-200 bg-white/70 px-3 text-sm shadow-sm focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
          </div>
        </div>

        {/* List */}
        {q.isLoading ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-2 shadow-sm backdrop-blur">
            <EmptyState
              title="No registers yet"
              icon={<ClipboardList className="h-6 w-6" />}
              text={canSubmit ? "Tap New register to submit the first one." : "Nothing to show for these filters."}
              action={canSubmit && (
                <button
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98]"
                  onClick={() => setOpenNew(true)}
                >
                  <Plus className="h-4 w-4" /> New register
                </button>
              )}
            />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => {
  const isOnline = r.session_mode === "online";
  const Icon =
    r.register_type === "teacher_session" ? GraduationCap :
    r.register_type === "sba_learners" ? Users :
    Users;
  const startShort = r.start_time
    ? new Date(r.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const endShort = r.end_time
    ? new Date(r.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const timeLabel =
    startShort && endShort ? `${startShort} - ${endShort}` :
    startShort ? `from ${startShort}` :
    null;

  return (
    <li key={r.id}>
      <Link
        to={`/registers/${r.id}`}
        className={`
          group relative flex items-center gap-3.5 rounded-2xl border bg-white/85 p-3.5 pl-4 pr-4 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.2)] backdrop-blur
          transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_30px_-14px_rgba(56,189,248,0.45)] active:translate-y-0 active:scale-[0.995]
          border-l-4
          ${isOnline ? "border-sky-400/60 hover:border-sky-500" : "border-emerald-400/60 hover:border-emerald-500"}
        `}
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ${
          isOnline ? "bg-sky-50 ring-sky-200 text-sky-700" : "bg-emerald-50 ring-emerald-200 text-emerald-700"
        }`}>
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-slate-800">
              {registerTypeLabel(r.register_type)}
            </span>

            {isOnline ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-800 ring-1 ring-inset ring-sky-200">
                <Wifi className="h-2.5 w-2.5" aria-hidden /> Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 ring-1 ring-inset ring-emerald-200">
                <MapPin className="h-2.5 w-2.5" aria-hidden /> In person
              </span>
            )}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {fmtDate(r.session_date)}
            </span>
            {timeLabel && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {timeLabel}
              </span>
            )}
            {r.school?.name && (
              <span className="inline-flex items-center gap-1">
                <SchoolIcon className="h-3 w-3" /> {r.school.name}
              </span>
            )}
            {r.project?.name && (
              <span className="text-slate-400">{r.project.name}</span>
            )}
            {!isFacilitator && r.facilitator?.full_name && (
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3 w-3" /> {r.facilitator.full_name}
              </span>
            )}
          </span>
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {r.deletion_status === "pending" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-inset ring-amber-200">
              <AlertTriangle className="h-2.5 w-2.5" /> Deletion pending
            </span>
          )}
          <Badge tone={r.status === "submitted" ? "green" : r.status === "queried" ? "amber" : "slate"}>
            {r.status}
          </Badge>
        </div>
      </Link>
    </li>
  );
})}
          </ul>
        )}
      </div>

      <NewRegisterModal open={openNew} onClose={() => { setOpenNew(false); q.refetch(); }} />
    </>
  );
}