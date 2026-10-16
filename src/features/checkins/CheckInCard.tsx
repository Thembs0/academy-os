// src/features/checkins/CheckInCard.tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Clock, LogIn, LogOut, ChevronRight, CheckCircle2 } from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Alert, Badge, Modal, LabeledSelect, LabeledInput, Spinner } from "@/components/ui";
import { fmtDate } from "@/utils/format";

/* ─────────────────────────────────────────────────────────────────────────
   Data hook - what's happening today, and what the current user can do
   ───────────────────────────────────────────────────────────────────────── */

interface CheckIn {
  id: string;
  user_id: string;
  project_id: string;
  school_id: string;
  check_in_date: string;
  start_time: string;
  end_time: string | null;
  expected_end: string | null;
  notes: string | null;
  school?: { name: string };
  profile?: { full_name: string };
  project?: { name: string };
}

function useTodayCheckIns() {
  const a = useAuth();
  const today = new Date().toLocaleDateString("en-CA");
  const canViewAll = a.can("check_ins.view.all");
  const uid = a.session?.user.id;

  return useQuery({
    queryKey: ["check-ins-today", today, canViewAll, uid],
    enabled: !!uid,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    queryFn: async () => {
      // Fetch today's check-ins AND any still-open one from any date.
      // The "or" clause: check_in_date = today OR end_time is null
      let r = supabase
        .from("facilitator_check_ins")
        .select("*, school:schools(name), project:projects(name)")
        .or(`check_in_date.eq.${today},end_time.is.null`)
        .order("start_time", { ascending: false });

      if (!canViewAll) r = r.eq("user_id", uid!);

      const { data, error } = await r;
      if (error) throw error;

      const rows = (data ?? []) as any[];
      if (rows.length > 0) {
        const userIds = [...new Set(rows.map((x) => x.user_id))];
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
        return rows.map((x) => ({ ...x, profile: { full_name: nameById.get(x.user_id) ?? "" } })) as CheckIn[];
      }
      return rows as CheckIn[];
    },
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Facilitator form - pick school, expected end
   ───────────────────────────────────────────────────────────────────────── */

function FacilitatorForm({ onClose }: { onClose: () => void }) {
  const a = useAuth();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState(a.memberships[0]?.project_id ?? "");
  const [schoolId, setSchoolId] = useState("");
  const [expected, setExpected] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 3);
    return d.toISOString().slice(0, 16);
  });
  const [err, setErr] = useState<string | null>(null);

  const schools = useQuery({
    queryKey: ["checkin-schools", projectId, a.profile?.id],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_facilitators")
        .select("school:schools(id,name)")
        .eq("project_id", projectId)
        .eq("user_id", a.profile!.id)
        .eq("is_active", true);
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((r) => r.school)
        .filter(Boolean)
        .sort((x: any, y: any) => x.name.localeCompare(y.name));
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!projectId || !schoolId) throw new Error("Pick a project and a school.");

      // Refuse if the user already has an open check-in
      const { data: open } = await supabase
        .from("facilitator_check_ins")
        .select("id")
        .eq("user_id", a.profile!.id)
        .is("end_time", null)
        .maybeSingle();
      if (open) throw new Error("You are already checked in. Check out first before starting a new session.");

        const { data, error } = await supabase
        .from("facilitator_check_ins")
        .insert({
          user_id: a.profile!.id,
          project_id: projectId,
          school_id: schoolId,
          check_in_date: new Date().toLocaleDateString("en-CA"),
          expected_end: expected ? new Date(expected).toISOString() : null,
        })
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Insert returned no row.");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["check-ins-today"] });
      await qc.refetchQueries({ queryKey: ["check-ins-today"] });
      onClose();
    },
    onError: (e) => setErr(errMsg(e)),
  });

  return (
    <div className="space-y-3">
      {a.memberships.length > 1 && (
        <LabeledSelect
          label="Project"
          value={projectId}
          onChange={(e) => { setProjectId(e.target.value); setSchoolId(""); }}
        >
          {a.memberships.map((m) => (
            <option key={m.project_id} value={m.project_id}>
              {m.project?.name ?? m.project_id}
            </option>
          ))}
        </LabeledSelect>
      )}
      <LabeledSelect
        label="School for today"
        required
        value={schoolId}
        onChange={(e) => setSchoolId(e.target.value)}
      >
        <option value="">Select school…</option>
        {schools.data?.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </LabeledSelect>
      <LabeledInput
        label="Expected finish time"
        type="datetime-local"
        value={expected}
        onChange={(e) => setExpected(e.target.value)}
      />
      {err && <Alert tone="red">{err}</Alert>}
      <button
        className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-5 py-3.5 text-sm font-bold text-white shadow-[0_12px_28px_-14px_rgba(15,23,42,0.6)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!schoolId || submit.isPending}
        onClick={() => { setErr(null); submit.mutate(); }}
      >
        <LogIn className="h-4 w-4" />
        {submit.isPending ? "Checking in…" : "Check in for today"}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Facilitator view - hero card
   ───────────────────────────────────────────────────────────────────────── */

function FacilitatorCard() {
  const { data, isLoading } = useTodayCheckIns();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);

  const openCheckIn = (data ?? []).find((c) => c.end_time === null) ?? null;
  const latest = data?.[0] ?? null;

  const checkOut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("facilitator_check_ins")
        .update({ end_time: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["check-ins-today"] }),
    onError: (e) => setErr(errMsg(e)),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Loading today…
      </div>
    );
  }

  const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";

  return (
    <>
      <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3.5 backdrop-blur">
        {openCheckIn ? (
          /* ── Currently on site ─────────────────────────────────── */
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 ring-1 ring-inset ring-brand/20">
                <span className="absolute inset-0 animate-ping rounded-2xl bg-brand/20" />
                <MapPin className="relative h-5 w-5 text-brand" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-900">
                  You're at {openCheckIn.school?.name}
                </div>
                <div className="text-xs text-slate-500">
                  <Clock className="mr-1 inline h-3 w-3" /> Since {fmtTime(openCheckIn.start_time)}
                  {openCheckIn.expected_end && ` · until ~${fmtTime(openCheckIn.expected_end)}`}
                </div>
                {openCheckIn.check_in_date !== new Date().toLocaleDateString("en-CA") && (
                  <div className="mt-1 text-[11px] font-medium text-amber-700">
                    Still open from{" "}
                    {new Date(openCheckIn.check_in_date).toLocaleDateString([], {
                      weekday: "long", day: "numeric", month: "short",
                    })}{" "}
                    — please check out.
                  </div>
                )}
              </div>
              <Badge tone="blue">On site</Badge>
            </div>
            {err && <Alert tone="red">{err}</Alert>}
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]"
              disabled={checkOut.isPending}
              onClick={() => { setErr(null); checkOut.mutate(openCheckIn.id); }}
            >
              <LogOut className="h-3.5 w-3.5" /> {checkOut.isPending ? "Checking out…" : "Check out"}
            </button>
          </div>
        ) : latest ? (
          /* ── Checked in earlier today, now closed ─────────────── */
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-inset ring-emerald-200">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-900">
                  You were at {latest.school?.name}
                </div>
                <div className="text-xs text-slate-500">
                  <Clock className="mr-1 inline h-3 w-3" /> {fmtTime(latest.start_time)} – {fmtTime(latest.end_time)}
                </div>
              </div>
              <Badge tone="slate">Completed</Badge>
            </div>
            <button
              onClick={() => setOpen(true)}
              className="group flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]"
            >
              <LogIn className="h-3.5 w-3.5" /> Check in again
            </button>
          </div>
        ) : (
          /* ── Not checked in at all today ───────────────────────── */
          <button
            onClick={() => setOpen(true)}
            className="group flex w-full items-center gap-3 text-left"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-brand/5 ring-1 ring-inset ring-brand/20">
              <LogIn className="h-5 w-5 text-brand" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900">Not checked in today</span>
              <span className="block text-xs text-slate-500">Tap to tell us where you are</span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        )}
      </div>

      <Modal open={open} title="Where are you today?" onClose={() => setOpen(false)}>
        <FacilitatorForm onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Oversight view - Admin / Manager / Coordinator
   ───────────────────────────────────────────────────────────────────────── */

function OversightList({ limit }: { limit?: number }) {
  const { data, isLoading } = useTodayCheckIns();
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Loading today…
      </div>
    );
  }

  const rows = limit ? (data ?? []).slice(0, limit) : (data ?? []);
  if (rows.length === 0) return <div className="text-xs text-slate-500">No check-ins recorded today.</div>;

  const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";

  const today = new Date().toLocaleDateString("en-CA");

  return (
    <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
      {rows.map((c) => {
        const isToday = c.check_in_date === today;
        const isOpen = !c.end_time;
        const dotClass = !isOpen
          ? "bg-slate-400"
          : isToday
          ? "bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.4)]"
          : "bg-amber-500 shadow-[0_0_8px_2px_rgba(245,158,11,0.4)]";
        const badgeTone = !isOpen ? "slate" : isToday ? "green" : "amber";
        const badgeLabel = !isOpen ? "Done" : isToday ? "On site" : "Stale";

        return (
          <li
            key={c.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2"
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-slate-800">
                {c.profile?.full_name}
              </div>
              <div className="truncate text-[11px] text-slate-500">
                <MapPin className="mr-1 inline h-3 w-3" /> {c.school?.name} · {fmtTime(c.start_time)} -{" "}
                {fmtTime(c.end_time ?? c.expected_end)}
              </div>
            </div>
            <Badge tone={badgeTone}>{badgeLabel}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   HOD view - pick a facilitator, see their status
   ───────────────────────────────────────────────────────────────────────── */

function HodPicker() {
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useTodayCheckIns();

  // One entry per facilitator, using their most recent check-in.
  // `data` is sorted by start_time desc, so the first-seen row per user wins.
  const facilitators = Array.from(
    (data ?? [])
      .reduce((map, c) => {
        if (!map.has(c.user_id)) {
          map.set(c.user_id, {
            id: c.user_id,
            name: c.profile?.full_name ?? "Unknown",
            checkIn: c,
          });
        }
        return map;
      }, new Map<string, { id: string; name: string; checkIn: CheckIn }>())
      .values()
  );
  const chosen = facilitators.find((f) => f.id === selected);

  if (facilitators.length === 0) {
    return <div className="text-xs text-slate-500">No check-ins today.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {facilitators.map((f) => (
          <button
            key={f.id}
            onClick={() => setSelected(f.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              selected === f.id
                ? "bg-gradient-to-b from-brand to-brand-700 text-white shadow-[0_4px_12px_-6px_rgba(15,23,42,0.5)]"
                : "bg-white/70 text-slate-700 ring-1 ring-inset ring-slate-200/70 hover:bg-white"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${f.checkIn.end_time ? "bg-slate-400" : "bg-emerald-500"}`} />
              {f.name}
            </span>
          </button>
        ))}
      </div>

      {chosen && (
        <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 text-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Today · {fmtDate(chosen.checkIn.check_in_date)}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-slate-800">
            <MapPin className="h-4 w-4 text-brand" />
            <span className="font-semibold">{chosen.checkIn.school?.name}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-600">
            <Clock className="h-3 w-3" />
            {new Date(chosen.checkIn.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {" - "}
            {chosen.checkIn.end_time
              ? new Date(chosen.checkIn.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : `~${new Date(chosen.checkIn.expected_end ?? chosen.checkIn.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            <Badge tone={chosen.checkIn.end_time ? "slate" : "green"}>
              {chosen.checkIn.end_time ? "Done" : "On site"}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Public component - the card that goes in the hero
   ───────────────────────────────────────────────────────────────────────── */
export function CheckInCard() {
  const a = useAuth();
  const isFacilitator = a.isFieldUser && a.can("check_ins.submit");
  const canViewAll = a.can("check_ins.view.all");
  const canViewAssigned = a.can("check_ins.view.assigned") && !canViewAll;

  if (isFacilitator) return <FacilitatorCard />;
  if (canViewAll) {
    if (a.persona === "hod") return <HodPicker />;
    return <OversightList limit={6} />;
  }
  if (canViewAssigned) return <OversightList limit={6} />;
  return null;
}