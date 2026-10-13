import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Camera, CheckCircle2, ChevronLeft, ChevronRight, CloudOff, FileUp,
  Trash2, ClipboardList, CircleDot, Sparkles, ShieldCheck,
} from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { useSync } from "@/features/auth/SyncProvider";
import { Alert, EmptyState, ErrorState, LabeledInput, LabeledSelect, LabeledText, Spinner } from "@/components/ui";
import {
  cacheRef, emptyForm, getLocalDraft, getRef, saveLocalDraft, findLocalByServerId,
  type LocalDraft, type LocalFile, type ObsFormData, type RefData,
} from "@/lib/offline";
import { fromRow, OBS_SELECT, syncDraft, getActiveTemplateFields, getActiveTemplateId } from "@/services/observations";
import { compressImage, validateFile } from "@/lib/files";
import { DOC_ALLOWED_EXT, SAMR } from "@/lib/constants";
import { fmtBytes, toLocalInput, uuid } from "@/utils/format";
import type { Observation, QueryRow } from "@/types/db";

const STEPS = ["School & teacher", "Technology", "Strengths", "Development", "Follow-up", "Evidence", "Review"];

/** Field keys that belong to the core observation form - anything else is "additional project questions". */
const CORE = new Set([
  "observed_teacher", "school", "facilitator", "observed_at", "subject", "grade",
  "caps_topic", "technology_tools", "samr_level", "learning_outcomes",
  "strength_1", "strength_2", "strength_3", "development_area", "practical_suggestion",
  "post_observation_conversation", "agreed_action", "next_observation_date", "evidence",
]);

function stepErrors(d: ObsFormData, step: number): Record<string, string> {
  const e: Record<string, string> = {};
  const req = (k: keyof ObsFormData, msg: string) => {
    const v = d[k];
    if (v === null || v === "" || v === undefined) e[k as string] = msg;
  };
  if (step === 0) {
    req("school_id", "Choose a school");
    req("teacher_id", "Choose a teacher");
    req("observed_at", "Enter date and time");
    req("subject", "Enter the subject");
    req("grade", "Enter the grade");
    req("caps_topic", "Enter the CAPS topic");
  }
  if (step === 1) { req("samr_level", "Select a SAMR level"); req("learning_outcomes", "Describe the learning outcomes"); }
  if (step === 2) { req("strength_1", "Strength 1 is required"); req("strength_2", "Strength 2 is required"); req("strength_3", "Strength 3 is required"); }
  if (step === 3) { req("development_area", "Describe an area for development"); req("practical_suggestion", "Give a practical suggestion"); }
  if (step === 4) { req("agreed_action", "Record the agreed action"); }
  return e;
}

/* ── Ambient page background ─────────────────────────────────────────── */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "obsDrift 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "obsDrift2 28s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes obsDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @keyframes obsDrift2 { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(-70px,50px,0) scale(1.1);} 100%{transform:translate3d(40px,-30px,0) scale(1.05);} }
        @keyframes stepIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

/* ── Save-state pill ─────────────────────────────────────────────────── */
function SavePill({ state, online }: { state: "idle" | "device" | "synced" | "error"; online: boolean }) {
  const label =
    state === "synced" ? "Saved ✓"
    : state === "device" ? (online ? "Saving…" : "Saved on device")
    : state === "error" ? "Not synced"
    : "Draft";
  const tone =
    state === "error" ? { bg: "bg-red-50", ring: "ring-red-200", dot: "bg-red-500", text: "text-red-800", glow: "shadow-[0_0_0_3px_rgba(239,68,68,0.15)]" }
    : state === "synced" ? { bg: "bg-emerald-50", ring: "ring-emerald-200", dot: "bg-emerald-500", text: "text-emerald-800", glow: "shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" }
    : { bg: "bg-slate-100", ring: "ring-slate-200", dot: "bg-slate-400", text: "text-slate-700", glow: "" };
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset backdrop-blur transition-all duration-300 ${tone.bg} ${tone.ring} ${tone.text} ${tone.glow}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${state !== "idle" ? "animate-pulse" : ""}`} aria-hidden />
      {label}
    </span>
  );
}

export default function ObservationForm() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const a = useAuth();
  const { online, refreshPending, syncNow } = useSync();
  const uid = a.profile!.id;

  const fieldProjects = useMemo(
    () => a.memberships.filter((m) => ["facilitator", "senior_facilitator", "intern"].includes(m.project_role)),
    [a.memberships]
  );

  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [clientRef, setClientRef] = useState<string>("");
  const [serverId, setServerId] = useState<string | undefined>(id);
  const [projectId, setProjectId] = useState(
    sp.get("project") ?? (fieldProjects.length === 1 ? fieldProjects[0].project_id : "")
  );
  const [data, setData] = useState<ObsFormData>(emptyForm());
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [step, setStep] = useState(0);
  const [showErr, setShowErr] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "device" | "synced" | "error">("idle");
  const [prog, setProg] = useState<Record<string, number>>({});
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"submitted" | "queued" | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const touched = useRef(false);
  const syncing = useRef(false);
  const stateRef = useRef({ data, files, projectId, step, serverId, clientRef });
  stateRef.current = { data, files, projectId, step, serverId, clientRef };
  const fileIn = useRef<HTMLInputElement>(null);
  const camIn = useRef<HTMLInputElement>(null);

  // ---- load existing (server and/or local) ----
  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const { data: o, error } = await supabase
            .from("observations")
            .select(OBS_SELECT)
            .eq("id", id)
            .single();
          if (error) throw error;
          const obs = o as unknown as Observation;
          if (obs.facilitator_id !== uid || !["draft", "queried"].includes(obs.status))
            throw new Error("This observation can no longer be edited.");
          const local = await findLocalByServerId(uid, id);
          setProjectId(obs.project_id);
          setClientRef(obs.client_reference ?? local?.clientRef ?? uuid());
          if (local && local.updatedAt > new Date(obs.updated_at).getTime()) {
            setData(local.data); setFiles(local.files); setStep(local.step);
          } else {
            setData(fromRow(obs));
          }
        } else if (sp.get("ref")) {
          const l = await getLocalDraft(sp.get("ref")!);
          if (!l || l.userId !== uid) throw new Error("Draft not found on this device.");
          setClientRef(l.clientRef); setServerId(l.serverId); setProjectId(l.projectId);
          setData(l.data); setFiles(l.files); setStep(l.step);
        } else {
          setClientRef(uuid());
        }
        setReady(true);
      } catch (e) {
        setLoadErr(errMsg(e));
      }
    })();
    /* eslint-disable-next-line */
  }, [id]);

  // ---- reference data (schools/teachers) ----
  const ref = useQuery({
    queryKey: ["obs-ref", projectId, uid],
    enabled: !!projectId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RefData> => {
      try {
        const [s, t, asg] = await Promise.all([
          supabase.from("project_schools").select("school:schools(id,name)").eq("project_id", projectId).eq("is_active", true),
          supabase.from("project_teachers").select("teacher:teachers(id,full_name,school_id,is_active)").eq("project_id", projectId).eq("is_active", true),
          supabase.from("school_facilitators").select("school_id").eq("project_id", projectId).eq("user_id", uid).eq("is_active", true),
        ]);
        if (s.error || t.error) throw s.error ?? t.error;
        const r: RefData = {
          schools: ((s.data ?? []) as any[]).map((x) => x.school).filter(Boolean).sort((p: any, q: any) => p.name.localeCompare(q.name)),
          teachers: ((t.data ?? []) as any[]).map((x) => x.teacher).filter((x) => x?.is_active).sort((p: any, q: any) => p.full_name.localeCompare(q.full_name)),
          assigned: (asg.data ?? []).map((x: any) => x.school_id),
          at: Date.now(),
        };
        await cacheRef(uid, projectId, r);
        return r;
      } catch (e) {
        const c = await getRef(uid, projectId);
        if (c) return c;
        throw e;
      }
    },
  });

  // ---- additional project fields (from active template only) ----
  // 1. What's the active template id? (changes when admin activates/deactivates)
  const activeTemplateId = useQuery({
    queryKey: ["obs-active-template-id", projectId],
    enabled: !!projectId && online,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: () => getActiveTemplateId(projectId),
  });

  // 2. Fields for that specific template (key includes the template id, so it refetches when the id changes)
  const template = useQuery({
    queryKey: ["obs-extra-fields", projectId, activeTemplateId.data ?? "none"],
    enabled: !!projectId && online && activeTemplateId.isFetched,
    queryFn: async () => {
      const id = activeTemplateId.data;
      if (!id) return [];
      const rows = await getActiveTemplateFields(projectId);
      return (rows ?? []).filter((x) => !CORE.has(x.field_key));
    },
  });

  const queries = useQuery({
    queryKey: ["obs-open-queries", serverId],
    enabled: !!serverId && online,
    queryFn: async () => {
      const { data: q } = await supabase
        .from("observation_queries")
        .select("*, items:observation_query_items(*)")
        .eq("observation_id", serverId!)
        .eq("status", "open")
        .order("created_at", { ascending: false });
      return (q ?? []) as unknown as QueryRow[];
    },
  });

  const serverDocs = useQuery({
    queryKey: ["obs-docs", serverId],
    enabled: !!serverId && online,
    queryFn: async () =>
      (await supabase.from("documents").select("id,title,status").eq("observation_id", serverId!)).data ?? [],
  });

  // ---- autosave ----
  const persist = useCallback(
    async (submit = false): Promise<LocalDraft | null> => {
      const s = stateRef.current;
      if (!s.projectId || !s.clientRef) return null;
      const d: LocalDraft = {
        clientRef: s.clientRef,
        userId: uid,
        projectId: s.projectId,
        serverId: s.serverId,
        data: s.data,
        files: s.files,
        dirty: true,
        submitRequested: submit,
        updatedAt: Date.now(),
        step: s.step,
      };
      await saveLocalDraft(d);
      setSaveState("device");
      refreshPending();
      return d;
    },
    [uid, refreshPending]
  );

  const trySync = useCallback(
    async (submit = false) => {
      if (syncing.current || !navigator.onLine) return null;
      const d = await persist(submit);
      if (!d) return null;
      syncing.current = true;
      try {
        const r = await syncDraft(d, (fid, p) => setProg((x) => ({ ...x, [fid]: p })));
        setServerId(d.serverId);
        setFiles([...d.files]);
        setSaveState("synced");
        refreshPending();
        return r;
      } catch (e) {
        setSaveState("error");
        throw e;
      } finally {
        syncing.current = false;
      }
    },
    [persist, refreshPending]
  );

  useEffect(() => {
    if (!ready || !touched.current) return;
    const t1 = setTimeout(() => { persist(); }, 700);
    const t2 = setTimeout(() => { trySync().catch(() => {}); }, 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [data, files, projectId, step, ready, persist, trySync]);

  const upd = <K extends keyof ObsFormData>(k: K, v: ObsFormData[K]) => {
    touched.current = true;
    setData((d) => ({ ...d, [k]: v }));
  };
  const errs = stepErrors(data, step);
  const E = (k: string) => (showErr ? errs[k] ?? null : null);

  const schoolTeachers = useMemo(
    () => ref.data?.teachers.filter((t) => t.school_id === data.school_id) ?? [],
    [ref.data, data.school_id]
  );
  const schoolList = useMemo(() => {
    const s = ref.data?.schools ?? [];
    const asg = new Set(ref.data?.assigned ?? []);
    return [...s.filter((x) => asg.has(x.id)), ...s.filter((x) => !asg.has(x.id))];
  }, [ref.data]);
  const allErr = useMemo(
    () => [0, 1, 2, 3, 4].flatMap((s) => Object.keys(stepErrors(data, s))),
    [data]
  );

  const next = () => {
    if (Object.keys(errs).length) { setShowErr(true); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setShowErr(false); touched.current = true;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    setShowErr(false);
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0 });
  };

  const addFile = async (f: File | null, kind: "Photograph" | "Supporting Document") => {
    if (!f) return;
    setFileErr(null);
    const v = validateFile(f);
    if (v) return setFileErr(v);
    const blob = await compressImage(f);
    touched.current = true;
    setFiles((x) => [...x, {
      id: uuid(),
      name: f.name,
      type: blob.type || f.type,
      size: blob.size,
      blob,
      docTypeName: f.type.startsWith("image/") ? "Photograph" : kind,
    }]);
  };

  const submit = async () => {
    if (allErr.length) { setSubmitErr("Some required fields are still empty - go back and complete them."); return; }
    setSubmitting(true); setSubmitErr(null);
    try {
      if (!navigator.onLine) { await persist(true); refreshPending(); setResult("queued"); return; }
      const r = await trySync(true);
      if (r === "submitted") { syncNow(); setResult("submitted"); }
      else if (r === "locked") setResult("submitted");
      else { await persist(true); setResult("queued"); }
    } catch (e) {
      setSubmitErr(errMsg(e));
      await persist(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadErr) return <ErrorState error={loadErr} />;
  if (!ready) return <Spinner />;
  if (!fieldProjects.length)
    return (
      <EmptyState
        title="You aren't assigned to a project as a facilitator"
        text="Ask your project manager to add you to a project before you start an observation."
      />
    );

  /* ── Result screen ─────────────────────────────────────────────── */
  if (result) return (
    <>
      <Ambient />
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-8 text-center shadow-[0_20px_50px_-25px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
            style={{
              background: result === "submitted"
                ? "radial-gradient(circle, rgba(16,185,129,0.3), transparent 60%)"
                : "radial-gradient(circle, rgba(245,158,11,0.3), transparent 60%)",
            }}
          />
          <div className="relative">
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ring-8 ${result === "submitted" ? "bg-emerald-50 ring-emerald-100/70" : "bg-amber-50 ring-amber-100/70"}`}>
              {result === "submitted"
                ? <CheckCircle2 className="h-11 w-11 text-emerald-600" aria-hidden />
                : <CloudOff className="h-11 w-11 text-amber-600" aria-hidden />}
            </div>
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
              {result === "submitted" ? "Observation submitted" : "Saved - will submit when online"}
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
              {result === "submitted"
                ? "Your project manager has been notified and will review it."
                : "It's stored safely on this device and will be submitted automatically when you're back online."}
            </p>
            <div className="mt-7 flex flex-col gap-2.5">
              <Link
                to="/observations"
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-5 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985]"
              >
                View my submissions
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/70 px-5 py-3.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.985]"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );

    // Wait until we know the active template id - this is what decides whether observations are open.
  if (projectId && online && !activeTemplateId.isFetched && !activeTemplateId.isError) {
    return <Spinner />;
  }

  // Block the form entirely if the project has no active observation template.
  // Deactivating a template effectively disables observations for that project.
  const noActiveTemplate = !!projectId && activeTemplateId.isFetched && !activeTemplateId.data;

  if (noActiveTemplate) {
    return (
      <>
        <Ambient />
        <div className="mx-auto max-w-lg px-4 py-16">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/85 p-8 text-center shadow-[0_20px_50px_-25px_rgba(15,23,42,0.3)] backdrop-blur-xl">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
              style={{ background: "radial-gradient(circle, rgba(245,158,11,0.3), transparent 60%)" }}
            />
            <div className="relative">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 ring-8 ring-amber-100/70">
                <ClipboardList className="h-11 w-11 text-amber-600" aria-hidden />
              </div>
              <h1 className="mt-5 text-2xl font-extrabold tracking-tight">Observations are closed for this project</h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
                Your project manager has not enabled an observation template for this project yet.
                Contact them if you think this is a mistake.
              </p>
              <div className="mt-7 flex flex-col gap-2.5">
                <Link
                  to="/observations"
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-5 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985]"
                >
                  Back to observations
                </Link>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/70 px-5 py-3.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.985]"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const pName = a.memberships.find((m) => m.project_id === projectId)?.project?.name;
  const openQ = queries.data?.[0];
  const extraFields = template.data ?? [];

  return (
    <>
      <Ambient />
      <div className="mx-auto max-w-2xl px-4 pt-5 sm:px-6 lg:pb-24" style={{paddingBottom: "calc(env(safe-area-inset-bottom) + 160px)",}}>

        {/* ── Sticky glass header ─────────────────────────────────── */}
        <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200/60 bg-white/70 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-inset ring-brand/20">
                  <ClipboardList className="h-4 w-4 text-brand" aria-hidden />
                </span>
                <h1 className="truncate text-base font-extrabold tracking-tight">
                  {serverId && id ? "Edit observation" : "New observation"}
                </h1>
              </div>
              {pName && <p className="mt-0.5 truncate pl-9 text-xs text-slate-500">{pName}</p>}
            </div>
            <SavePill state={saveState} online={online} />
          </div>
        </div>

        {/* ── Progress ────────────────────────────────────────────── */}
        <div
          className="mb-5"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
        >
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    i < step ? "w-full bg-gradient-to-r from-brand to-sky-500"
                    : i === step ? "w-full bg-gradient-to-r from-brand to-sky-400 shadow-[0_0_8px_1px_rgba(56,189,248,0.6)]"
                    : "w-0"
                  }`}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-baseline gap-2 px-0.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
              Step {step + 1} of {STEPS.length}
            </span>
            <span className="text-sm font-semibold text-slate-700">{STEPS[step]}</span>
          </div>
        </div>

        {/* ── Query alert ─────────────────────────────────────────── */}
        {openQ && step === 0 && (
          <div className="mb-5">
            <Alert tone="amber">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Your manager asked for changes:</p>
                  <p className="mt-1 leading-relaxed">{openQ.query_text}</p>
                  {openQ.items.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {openQ.items.map((i) => (
                        <li key={i.id} className="flex items-start gap-2.5 rounded-lg bg-white/60 px-2.5 py-2 ring-1 ring-inset ring-amber-200/60">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-5 w-5 rounded-md border-slate-300 text-brand focus:ring-brand/30"
                            checked={i.is_resolved}
                            aria-label={i.item_text}
                            onChange={async (e) => {
                              await supabase.rpc("resolve_query_item", { p_item: i.id, p_resolved: e.target.checked });
                              queries.refetch();
                            }}
                          />
                          <span className="text-sm">{i.item_text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Alert>
          </div>
        )}

        {/* ── Step content ────────────────────────────────────────── */}
        <div
          key={step}
          className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-[0_15px_40px_-25px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6"
          style={{ animation: "stepIn 300ms cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-40 w-[120%] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,0.25), transparent 60%)" }}
          />
          <div className="relative space-y-0 [&_input]:rounded-2xl [&_input]:border-slate-200 [&_input]:bg-white/70 [&_input]:px-4 [&_input]:py-3 [&_input]:text-sm [&_input]:shadow-sm [&_input]:transition-all [&_input]:duration-200 [&_input]:focus:border-brand [&_input]:focus:bg-white [&_input]:focus:outline-none [&_input]:focus:ring-4 [&_input]:focus:ring-brand/15 [&_textarea]:rounded-2xl [&_textarea]:border-slate-200 [&_textarea]:bg-white/70 [&_textarea]:px-4 [&_textarea]:py-3 [&_textarea]:text-sm [&_textarea]:shadow-sm [&_textarea]:transition-all [&_textarea]:duration-200 [&_textarea]:focus:border-brand [&_textarea]:focus:bg-white [&_textarea]:focus:outline-none [&_textarea]:focus:ring-4 [&_textarea]:focus:ring-brand/15 [&_select]:rounded-2xl [&_select]:border-slate-200 [&_select]:bg-white/70 [&_select]:px-4 [&_select]:py-3 [&_select]:text-sm [&_select]:shadow-sm [&_select]:transition-all [&_select]:duration-200 [&_select]:focus:border-brand [&_select]:focus:bg-white [&_select]:focus:outline-none [&_select]:focus:ring-4 [&_select]:focus:ring-brand/15">

            {step === 0 && (<>
              {fieldProjects.length > 1 && !id && (
                <LabeledSelect label="Project" required value={projectId} onChange={(e) => { touched.current = true; setProjectId(e.target.value); setData({ ...data, school_id: null, teacher_id: null }); }}>
                  <option value="">Select project…</option>
                  {[...new Map(fieldProjects.map((m) => [m.project_id, m.project?.name])).entries()].map(([pid, n]) => (
                    <option key={pid} value={pid}>{n}</option>
                  ))}
                </LabeledSelect>
              )}
              {!projectId ? <Alert>Choose a project to continue.</Alert>
                : ref.isLoading ? <Spinner />
                : ref.error ? <Alert tone="red">Couldn't load schools. Connect once to download your project's school list for offline use.</Alert>
                : (<>
                  <LabeledSelect label="School" required value={data.school_id ?? ""} error={E("school_id")} onChange={(e) => { upd("school_id", e.target.value || null); upd("teacher_id", null); }}>
                    <option value="">Select school…</option>
                    {schoolList.map((s) => <option key={s.id} value={s.id}>{s.name}{ref.data?.assigned.includes(s.id) ? " ★" : ""}</option>)}
                  </LabeledSelect>
                  <LabeledSelect label="Teacher observed" required value={data.teacher_id ?? ""} error={E("teacher_id")} disabled={!data.school_id} onChange={(e) => upd("teacher_id", e.target.value || null)}>
                    <option value="">{data.school_id ? "Select teacher…" : "Choose a school first"}</option>
                    {schoolTeachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </LabeledSelect>
                  {data.school_id && schoolTeachers.length === 0 && <Alert tone="amber">No teachers are listed for this school yet. Ask an administrator to add them.</Alert>}
                </>)}
              <LabeledInput label="Date and time of observation" type="datetime-local" required value={toLocalInput(data.observed_at)} error={E("observed_at")} onChange={(e) => upd("observed_at", e.target.value ? new Date(e.target.value).toISOString() : null)} onFocus={() => { if (!data.observed_at) upd("observed_at", new Date().toISOString()); }} />
              <LabeledInput label="Subject" required value={data.subject} error={E("subject")} onChange={(e) => upd("subject", e.target.value)} />
              <LabeledInput label="Grade" required value={data.grade} error={E("grade")} onChange={(e) => upd("grade", e.target.value)} />
              <LabeledInput label="CAPS topic" required value={data.caps_topic} error={E("caps_topic")} onChange={(e) => upd("caps_topic", e.target.value)} />
            </>)}

            {step === 1 && (<>
              <LabeledText label="Technology tools used in the lesson" value={data.technology_tools} onChange={(e) => upd("technology_tools", e.target.value)} hint="Separate tools with commas - they're counted in reports." />
              <fieldset className="mb-4">
                <legend className="label">SAMR level observed <span className="text-red-600">*</span></legend>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(SAMR) as ("S" | "A" | "M" | "R")[]).map((k) => {
                    const active = data.samr_level === k;
                    return (
                      <label
                        key={k}
                        className={`group relative flex min-h-[104px] cursor-pointer flex-col justify-center overflow-hidden rounded-2xl border-2 p-4 transition-all duration-200 ${
                          active
                            ? "border-brand bg-gradient-to-br from-brand/10 to-sky-50 shadow-[0_10px_25px_-15px_rgba(14,165,233,0.7)] scale-[1.01]"
                            : "border-slate-200 bg-white/60 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brand/5 hover:shadow-md active:translate-y-0 active:scale-[0.99]"
                        }`}
                      >
                        <input type="radio" name="samr" className="sr-only" checked={active} onChange={() => upd("samr_level", k)} />
                        {active && (
                          <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white shadow-md" aria-hidden>
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </span>
                        )}
                        <span className={`text-3xl font-extrabold leading-none ${active ? "text-brand" : "text-slate-400 transition-colors group-hover:text-brand"}`}>{k}</span>
                        <span className="mt-1.5 text-sm font-bold text-slate-900">{SAMR[k].name}</span>
                        <span className="mt-0.5 text-xs leading-snug text-slate-600">{SAMR[k].hint}</span>
                      </label>
                    );
                  })}
                </div>
                {E("samr_level") && <p role="alert" className="mt-2 text-sm text-red-700">{E("samr_level")}</p>}
              </fieldset>
              <LabeledText label="Learning outcomes: were they achieved? What is the evidence?" required value={data.learning_outcomes} error={E("learning_outcomes")} onChange={(e) => upd("learning_outcomes", e.target.value)} />
            </>)}

            {step === 2 && (<>
              <p className="mb-3 text-sm text-slate-600">Be specific rather than offering general praise.</p>
              {(["strength_1", "strength_2", "strength_3"] as const).map((k, i) => (
                <LabeledText key={k} label={`Specific strength ${i + 1}`} required value={data[k]} error={E(k)} onChange={(e) => upd(k, e.target.value)} />
              ))}
            </>)}

            {step === 3 && (<>
              <LabeledText label="Area for development" required hint="Identify one specific area." value={data.development_area} error={E("development_area")} onChange={(e) => upd("development_area", e.target.value)} />
              <LabeledText label="Practical suggestion" required value={data.practical_suggestion} error={E("practical_suggestion")} onChange={(e) => upd("practical_suggestion", e.target.value)} />
            </>)}

            {step === 4 && (<>
              <LabeledText label="Post-observation conversation" hint="What did the teacher say about the lesson?" value={data.post_observation_conversation} onChange={(e) => upd("post_observation_conversation", e.target.value)} />
              <LabeledText label="Agreed action for next observation" required value={data.agreed_action} error={E("agreed_action")} onChange={(e) => upd("agreed_action", e.target.value)} />
              <LabeledInput label="Next observation date" type="date" value={data.next_observation_date ?? ""} onChange={(e) => upd("next_observation_date", e.target.value || null)} />
              <fieldset className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 shadow-inner">
                <legend className="px-2 text-sm font-bold text-slate-800">Teacher acknowledgement</legend>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 rounded-md border-slate-300 text-brand focus:ring-brand/30"
                    checked={data.teacher_acknowledged}
                    onChange={(e) => { upd("teacher_acknowledged", e.target.checked); if (!e.target.checked) upd("acknowledgement_method", null); }}
                  />
                  <span>
                    The teacher has received this feedback and agreed the follow-up action.
                    <span className="mt-0.5 block text-xs text-slate-500">You are recording this on the teacher's behalf.</span>
                  </span>
                </label>
                {data.teacher_acknowledged && (
                  <div className="mt-4">
                    <LabeledSelect label="How was it acknowledged?" value={data.acknowledgement_method ?? ""} onChange={(e) => upd("acknowledgement_method", e.target.value || null)}>
                      <option value="">Select…</option>
                      <option value="in_person">In person</option>
                      <option value="verbal">Verbally</option>
                      <option value="phone">By phone</option>
                      <option value="other">Other</option>
                    </LabeledSelect>
                    <LabeledInput label="Note (optional)" value={data.acknowledgement_note} onChange={(e) => upd("acknowledgement_note", e.target.value)} />
                  </div>
                )}
              </fieldset>

              {/* Additional project questions - only fields from the project's single active template */}
              {extraFields.length > 0 && (
                <div className="mt-5">
                  <div className="mb-3 flex items-center gap-2">
                    <CircleDot className="h-4 w-4 text-brand" aria-hidden />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Additional project questions</h3>
                  </div>
                  {extraFields.map((f: any) => (
                    f.field_type === "textarea"
                      ? <LabeledText
                          key={f.field_key}
                          label={f.label}
                          required={f.is_required}
                          hint={f.help_text ?? undefined}
                          value={data.extra[f.field_key] ?? ""}
                          onChange={(e) => { touched.current = true; setData({ ...data, extra: { ...data.extra, [f.field_key]: e.target.value } }); }}
                        />
                      : <LabeledInput
                          key={f.field_key}
                          label={f.label}
                          required={f.is_required}
                          hint={f.help_text ?? undefined}
                          type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                          value={data.extra[f.field_key] ?? ""}
                          onChange={(e) => { touched.current = true; setData({ ...data, extra: { ...data.extra, [f.field_key]: e.target.value } }); }}
                        />
                  ))}
                </div>
              )}
            </>)}

            {step === 5 && (<>
              <LabeledText label="Evidence notes (optional)" value={data.evidence} onChange={(e) => upd("evidence", e.target.value)} />
              <div className="mb-3 grid grid-cols-2 gap-2.5">
                <button type="button" className="group flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brand/5 hover:shadow-md active:translate-y-0 active:scale-[0.98]" onClick={() => camIn.current?.click()}>
                  <Camera className="h-4 w-4 text-brand transition-transform duration-200 group-hover:scale-110" /> Take photo
                </button>
                <button type="button" className="group flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brand/5 hover:shadow-md active:translate-y-0 active:scale-[0.98]" onClick={() => fileIn.current?.click()}>
                  <FileUp className="h-4 w-4 text-brand transition-transform duration-200 group-hover:scale-110" /> Add file
                </button>
              </div>
              <input ref={camIn} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { addFile(e.target.files?.[0] ?? null, "Photograph"); e.target.value = ""; }} />
              <input ref={fileIn} type="file" hidden accept={DOC_ALLOWED_EXT.map((x) => "." + x).join(",")} onChange={(e) => { addFile(e.target.files?.[0] ?? null, "Supporting Document"); e.target.value = ""; }} />
              {fileErr && <Alert tone="red">{fileErr}</Alert>}
              <ul className="mt-3 space-y-2.5">
                {(serverDocs.data ?? []).filter((d: any) => !files.some((f) => f.uploadedDocId === d.id)).map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-3.5 text-sm shadow-sm">
                    <span className="truncate font-medium">{d.title}</span>
                    <span className="ml-2 shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">Uploaded ✓</span>
                  </li>
                ))}
                {files.map((f) => (
                  <li key={f.id} className="rounded-2xl border border-slate-200/70 bg-white/85 p-3.5 text-sm shadow-sm backdrop-blur">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-slate-800">{f.name}</span>
                      {f.uploadedDocId
                        ? <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">Uploaded ✓</span>
                        : <button className="rounded-full p-1.5 text-red-600 transition-colors hover:bg-red-50" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>
                            <Trash2 className="h-4 w-4" />
                          </button>}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {fmtBytes(f.size)} {!f.uploadedDocId && (prog[f.id] != null ? `· uploading ${prog[f.id]}%` : online ? "· will upload automatically" : "· saved on device, uploads when online")}
                    </div>
                    {!f.uploadedDocId && prog[f.id] != null && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-brand transition-all" style={{ width: `${prog[f.id]}%` }} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {!online && (
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-3 text-xs text-amber-900">
                  <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>Offline: photos are kept on this phone and uploaded when your connection returns.</span>
                </div>
              )}
            </>)}

            {step === 6 && (
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-brand" aria-hidden />
                  <h2 className="text-base font-bold">Review before submitting</h2>
                </div>
                {allErr.length > 0 && <Alert tone="amber">{allErr.length} required field(s) are still empty. Go back to complete them.</Alert>}
                <div className="divide-y divide-slate-200/70 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/60">
                  {[["School", schoolList.find((s) => s.id === data.school_id)?.name], ["Teacher", ref.data?.teachers.find((t) => t.id === data.teacher_id)?.full_name], ["Subject / Grade", `${data.subject} · Grade ${data.grade}`], ["CAPS topic", data.caps_topic], ["SAMR", data.samr_level ? `${data.samr_level} - ${SAMR[data.samr_level].name}` : ""], ["Learning outcomes", data.learning_outcomes], ["Strengths", [data.strength_1, data.strength_2, data.strength_3].filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join("\n")], ["Development area", data.development_area], ["Suggestion", data.practical_suggestion], ["Agreed action", data.agreed_action], ["Evidence files", String(files.length + (serverDocs.data?.length ?? 0))]].map(([k, v]) => (
                    <div key={k as string} className="grid grid-cols-[120px_1fr] gap-3 px-4 py-3 sm:grid-cols-[140px_1fr]">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{k}</div>
                      <div className="whitespace-pre-wrap text-slate-800">{(v as string) || <span className="font-medium text-red-700">Missing</span>}</div>
                    </div>
                  ))}
                </div>
                {submitErr && <Alert tone="red">{submitErr}</Alert>}
                <button
                  className="group relative mt-2 flex w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-5 py-4 text-sm font-extrabold tracking-wide text-white shadow-[0_14px_30px_-14px_rgba(15,23,42,0.6)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  disabled={submitting || allErr.length > 0}
                  onClick={submit}
                >
                  {submitting && <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
                  {submitting ? "Submitting…" : online ? "SUBMIT OBSERVATION" : "SAVE & SUBMIT WHEN ONLINE"}
                </button>
                <p className="text-center text-xs text-slate-500">Once submitted you can't edit it unless your manager sends it back with a query.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Sticky bottom action bar ─────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-slate-200/60 bg-white/75 px-4 pb-3 pt-3 backdrop-blur-xl sm:static sm:bottom-auto sm:mt-5 sm:rounded-3xl sm:border sm:border-slate-200/70 sm:bg-white/75 sm:px-4 sm:py-3 sm:shadow-[0_15px_40px_-25px_rgba(15,23,42,0.35)]">          <div className="mx-auto flex max-w-2xl gap-2.5">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0 active:scale-[0.98]"
              onClick={step === 0 ? () => nav("/observations") : back}
            >
              <ChevronLeft className="h-4 w-4" />
              {step === 0 ? "Exit (saved)" : "Back"}
            </button>
            {step < STEPS.length - 1 && (
              <button
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-3.5 text-sm font-bold text-white shadow-[0_12px_28px_-14px_rgba(15,23,42,0.6)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98]"
                onClick={next}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}