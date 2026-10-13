import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera, FileUp, CheckCircle2, XCircle, Clock3, UserPlus, Pencil, Trash2, Link2, Copy, Check,
} from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { useProjects } from "@/hooks";
import { Alert, LabeledInput, LabeledSelect, LabeledText, Modal, Spinner } from "@/components/ui";
import {
  listLearnerRoster, listTeacherRoster, registerTypesForProject, registerTypeLabel,
  rosterSideFor, submitRegister, upsertLearnerRoster, upsertTeacherRoster, deleteRosterEntry,
  setRegisterExternalLink, externalSigninUrl,
  type RegisterType, type EntryStatus, type RosterSide, type SessionMode,
} from "@/services/registers";
import { uploadDocument, compressImage, validateFile } from "@/lib/files";
import { DOC_ALLOWED_EXT } from "@/lib/constants";

interface Props { open: boolean; onClose: () => void; }

type Phase = "setup" | "roster" | "evidence";

interface PersonDraft {
  full_name: string;
  id_number: string;
  phone: string;
  grade: string;
  category: string;
}

const emptyDraft: PersonDraft = { full_name: "", id_number: "", phone: "", grade: "", category: "" };

export function NewRegisterModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const projects = useProjects();

  const [phase, setPhase] = useState<Phase>("setup");
  const [projectId, setProjectId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [regType, setRegType] = useState<RegisterType | "">("");
  const [sessionMode, setSessionMode] = useState<SessionMode>("in_person");
  const [sessionDate, setSessionDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [startTime, setStartTime] = useState(() => new Date().toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState("");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // After-submit link screen
  const [createdRegisterId, setCreatedRegisterId] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Attendance ticks (in-person only)
  const [entries, setEntries] = useState<Record<string, { status: EntryStatus; absence_reason?: string }>>({});

  // Add / edit person
  const [editingPersonId, setEditingPersonId] = useState<string | "new" | null>(null);
  const [personDraft, setPersonDraft] = useState<PersonDraft>(emptyDraft);
  const [deletingPersonId, setDeletingPersonId] = useState<string | null>(null);

  // Evidence
  const [evidenceDocId, setEvidenceDocId] = useState<string | null>(null);
  const [evidenceName, setEvidenceName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    setPhase("setup"); setProjectId(""); setSchoolId(""); setRegType("");
    setSessionMode("in_person");
    setSessionDate(new Date().toLocaleDateString("en-CA"));
    setStartTime(new Date().toISOString().slice(0, 16));
    setEndTime(""); setTopic(""); setNotes(""); setErr(null);
    setEntries({});
    setEditingPersonId(null); setPersonDraft(emptyDraft); setDeletingPersonId(null);
    setEvidenceDocId(null); setEvidenceName(null); setUploading(false); setUploadPct(0); setUploadErr(null);
    setCreatedRegisterId(null); setCreatedToken(null); setCopied(false);
  }, [open]);

  const project = useMemo(() => projects.data?.find((p) => p.id === projectId), [projects.data, projectId]);
  const availableTypes = useMemo(() => project ? registerTypesForProject(project) : [], [project]);
  const rosterSide: RosterSide | null = regType ? rosterSideFor(regType) : null;
  const isOnline = sessionMode === "online";

  const schools = useQuery({
    queryKey: ["register-schools", projectId],
    enabled: open && !!projectId && (project?.project_type ?? "school_based") === "school_based",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_schools")
        .select("school:schools(id,name)")
        .eq("project_id", projectId)
        .eq("is_active", true);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => r.school).filter(Boolean).sort((x: any, y: any) => x.name.localeCompare(y.name));
    },
  });

  const rosterQ = useQuery({
    queryKey: ["register-roster-list", projectId, schoolId, rosterSide],
    // Only fetch the roster in in-person mode
    enabled: open && !isOnline && !!projectId && !!rosterSide,
    queryFn: async () => {
      if (rosterSide === "teacher") return listTeacherRoster(projectId, schoolId || null);
      return listLearnerRoster(projectId, schoolId || null);
    },
  });

  useEffect(() => {
    if (!rosterQ.data || isOnline) return;
    setEntries((prev) => {
      const next = { ...prev };
      rosterQ.data.forEach((p: any) => {
        if (!next[p.id]) next[p.id] = { status: "present" };
      });
      return next;
    });
  }, [rosterQ.data, isOnline]);

  /* ── Save person ─────────────────────────────────────────────── */
  const savePerson = useMutation({
    mutationFn: async () => {
      if (!personDraft.full_name.trim()) throw new Error("Name is required.");
      const payload: any = {
        project_id: projectId,
        school_id: schoolId || null,
        full_name: personDraft.full_name.trim(),
        id_number: personDraft.id_number.trim() || null,
        phone: personDraft.phone.trim() || null,
      };
      if (rosterSide === "learner") {
        payload.grade = personDraft.grade.trim() || null;
        payload.category = personDraft.category.trim() || null;
      }
      if (editingPersonId && editingPersonId !== "new") {
        payload.id = editingPersonId;
      }
      if (rosterSide === "teacher") {
        await upsertTeacherRoster(payload);
      } else {
        await upsertLearnerRoster(payload);
      }
    },
    onSuccess: async () => {
      await rosterQ.refetch();
      setEditingPersonId(null);
      setPersonDraft(emptyDraft);
    },
    onError: (e) => setErr(errMsg(e)),
  });

  /* ── Delete person ───────────────────────────────────────────── */
  const removePerson = useMutation({
    mutationFn: async (id: string) => {
      if (!rosterSide) throw new Error("No roster selected.");
      await deleteRosterEntry(rosterSide, id);
    },
    onSuccess: async (_data, id) => {
      await rosterQ.refetch();
      setDeletingPersonId(null);
      setEntries((prev) => {
        const next = { ...prev };
        delete next[id as string];
        return next;
      });
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const startEdit = (p: any) => {
    setErr(null);
    setEditingPersonId(p.id);
    setPersonDraft({
      full_name: p.full_name ?? "",
      id_number: p.id_number ?? "",
      phone: p.phone ?? "",
      grade: p.grade ?? "",
      category: p.category ?? "",
    });
  };
  const startAdd = () => { setErr(null); setEditingPersonId("new"); setPersonDraft(emptyDraft); };
  const cancelPersonEdit = () => { setEditingPersonId(null); setPersonDraft(emptyDraft); };

  /* ── Upload evidence ─────────────────────────────────────────── */
  const uploadEvidence = async (file: File | null) => {
    if (!file) return;
    setUploadErr(null);
    const v = validateFile(file);
    if (v) { setUploadErr(v); return; }
    setUploading(true); setUploadPct(0);
    try {
      const blob = await compressImage(file);
      const docId = await uploadDocument({
        projectId,
        file: blob,
        filename: file.name,
        mime: blob.type || file.type,
        title: `Register evidence · ${sessionDate}`,
        typeId: null,
        schoolId: schoolId || null,
        teacherId: null,
        observationId: null,
        onProgress: (p) => setUploadPct(p),
      });
      setEvidenceDocId(docId);
      setEvidenceName(file.name);
    } catch (e) {
      setUploadErr(errMsg(e));
    } finally {
      setUploading(false);
    }
  };

  /* ── Submit register ─────────────────────────────────────────── */
  const submit = useMutation({
    mutationFn: async () => {
      if (!projectId || !regType || !rosterSide) throw new Error("Set up the register first.");
      if (!isOnline && !evidenceDocId) throw new Error("A signed register file is required.");

      return submitRegister({
        projectId,
        schoolId: schoolId || null,
        registerType: regType as RegisterType,
        rosterSide,
        sessionMode,
        sessionDate,
        startTime: startTime ? new Date(startTime).toISOString() : null,
        endTime: endTime ? new Date(endTime).toISOString() : null,
        topic: topic.trim() || null,
        notes: notes.trim() || null,
        evidenceDocumentId: evidenceDocId,   // may be null for online
        entries: isOnline ? [] : Object.entries(entries).map(([roster_entry_id, e]) => ({
          roster_entry_id,
          status: e.status,
          absence_reason: e.absence_reason ?? null,
        })),
      });
    },
    onSuccess: async (newId) => {
      qc.invalidateQueries({ queryKey: ["registers"] });

      if (isOnline) {
        // Open the external link immediately, then show the share screen
        try {
          const token = await setRegisterExternalLink(newId, true);
          setCreatedRegisterId(newId);
          setCreatedToken(token);
        } catch (e) {
          setErr(errMsg(e));
          // Even if the link failed to generate, keep the register
          setCreatedRegisterId(newId);
        }
      } else {
        onClose();
      }
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const setStatus = (id: string, status: EntryStatus) =>
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], status } }));
  const setReason = (id: string, reason: string) =>
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], absence_reason: reason } }));

  const canGoRoster = !!projectId && !!regType && (project?.project_type !== "school_based" || !!schoolId);

  if (!open) return null;

  /* ── Success screen: share the external link ─────────────────── */
  if (createdRegisterId) {
    const link = createdToken ? externalSigninUrl(createdToken) : null;
    return (
      <Modal open={open} title="Register created" onClose={onClose} wide>
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm text-emerald-900">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-semibold">Your online register is live.</p>
                <p className="mt-1">
                  Copy the link below and share it with participants. They can sign in from any device.
                  The link closes automatically when the session ends.
                </p>
              </div>
            </div>
          </div>

          {link ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={link}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-xs font-mono text-slate-800"
                />
                <button
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-3 text-sm font-bold text-white shadow-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch { /* ignore */ }
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Where to post this link</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  <li>Your WhatsApp group</li>
                  <li>Zoom / Teams / Google Meet chat</li>
                  <li>Email or SMS</li>
                </ul>
              </div>
            </>
          ) : (
            <Alert tone="amber">
              The register was created, but the link could not be generated. Open the register from the list and try
              "Open sign-in link" again.
            </Alert>
          )}

          <button
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} title="New register" onClose={onClose} wide>
      <div className="mb-4 flex gap-2">
        {((isOnline ? ["setup", "evidence"] : ["setup", "roster", "evidence"]) as Phase[]).map((p, i) => (
          <div key={p} className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs font-bold uppercase tracking-wider ${
            phase === p ? "bg-gradient-to-b from-brand to-brand-700 text-white shadow-sm" : "bg-slate-100 text-slate-500"
          }`}>
            {i + 1}. {p}
          </div>
        ))}
      </div>

      {err && <div className="mb-3"><Alert tone="red">{err}</Alert></div>}

      {/* Phase 1: Setup */}
      {phase === "setup" && (
        <div className="space-y-3">
          <LabeledSelect label="Project" required value={projectId} onChange={(e) => {
            const v = e.target.value;
            setProjectId(v);
            const p = projects.data?.find((x) => x.id === v);
            const types = p ? registerTypesForProject(p) : [];
            setRegType(types[0] ?? "");
            setSchoolId("");
          }}>
            <option value="">Select project…</option>
            {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </LabeledSelect>

          {(project?.project_type ?? "school_based") === "school_based" && (
            <LabeledSelect label="School" required value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
              <option value="">Select school…</option>
              {schools.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </LabeledSelect>
          )}

          {projectId && availableTypes.length > 0 && (
            <LabeledSelect label="Register type" required value={regType} onChange={(e) => setRegType(e.target.value as RegisterType)}>
              {availableTypes.map((t) => <option key={t} value={t}>{registerTypeLabel(t)}</option>)}
            </LabeledSelect>
          )}

          {/* Session mode */}
          <div>
            <div className="label">Session mode <span className="text-red-600">*</span></div>
            <div className="grid grid-cols-2 gap-2">
              {(["in_person", "online"] as const).map((m) => (
                <label
                  key={m}
                  className={`group relative flex min-h-[80px] cursor-pointer flex-col justify-center rounded-2xl border-2 p-3.5 transition-all ${
                    sessionMode === m
                      ? "border-brand bg-gradient-to-br from-brand/10 to-sky-50 shadow-[0_10px_25px_-15px_rgba(14,165,233,0.7)]"
                      : "border-slate-200 bg-white/60 hover:border-brand/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="session_mode"
                    className="sr-only"
                    checked={sessionMode === m}
                    onChange={() => setSessionMode(m)}
                  />
                  <span className={`text-sm font-bold ${sessionMode === m ? "text-brand" : "text-slate-800"}`}>
                    {m === "in_person" ? "In person" : "Online"}
                  </span>
                  <span className="mt-0.5 text-[11px] leading-snug text-slate-500">
                    {m === "in_person"
                      ? "Tick attendees from the roster"
                      : "Share a link; attendees sign themselves in"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <LabeledInput label="Date" type="date" required value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
            <LabeledInput label="Start" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <LabeledInput label="End" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>

          <LabeledInput label="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <LabeledText label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

          <button
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-5 py-3.5 text-sm font-bold text-white shadow-[0_12px_28px_-14px_rgba(15,23,42,0.6)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canGoRoster}
            onClick={() => setPhase(isOnline ? "evidence" : "roster")}
          >
            Next{isOnline ? " · Evidence (optional)" : " · Take attendance"}
          </button>
        </div>
      )}

      {/* Phase 2: Roster (in-person only) */}
      {phase === "roster" && !isOnline && (
        <div className="space-y-3">
          {rosterQ.isLoading ? <Spinner label="Loading roster" /> : (
            <>
              {(!rosterQ.data || rosterQ.data.length === 0) && editingPersonId !== "new" && (
                <Alert tone="amber">No names on this roster yet. Add the first one below.</Alert>
              )}

              {rosterQ.data && rosterQ.data.length > 0 && (
                <ul className="space-y-2">
                  {rosterQ.data.map((p: any) => {
                    const isEditing = editingPersonId === p.id;
                    const isDeleting = deletingPersonId === p.id;
                    const e = entries[p.id] ?? { status: "present" as EntryStatus };

                    if (isEditing) {
                      return (
                        <li key={p.id} className="rounded-2xl border-2 border-brand/40 bg-white/90 p-3 space-y-2">
                          <div className="text-xs font-bold uppercase tracking-wider text-brand">Editing {p.full_name}</div>
                          <LabeledInput label="Full name" required value={personDraft.full_name} onChange={(ev) => setPersonDraft({ ...personDraft, full_name: ev.target.value })} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <LabeledInput label="ID number (optional)" value={personDraft.id_number} onChange={(ev) => setPersonDraft({ ...personDraft, id_number: ev.target.value })} />
                            <LabeledInput label="Phone (optional)" value={personDraft.phone} onChange={(ev) => setPersonDraft({ ...personDraft, phone: ev.target.value })} />
                            {rosterSide === "learner" && (
                              <>
                                <LabeledInput label="Grade (optional)" value={personDraft.grade} onChange={(ev) => setPersonDraft({ ...personDraft, grade: ev.target.value })} />
                                <LabeledInput label="Category (optional)" hint="e.g. learner, youth, business" value={personDraft.category} onChange={(ev) => setPersonDraft({ ...personDraft, category: ev.target.value })} />
                              </>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700" onClick={cancelPersonEdit}>Cancel</button>
                            <button
                              className="flex-1 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                              disabled={savePerson.isPending || !personDraft.full_name.trim()}
                              onClick={() => savePerson.mutate()}
                            >
                              {savePerson.isPending ? "Saving…" : "Save changes"}
                            </button>
                          </div>
                        </li>
                      );
                    }

                    if (isDeleting) {
                      return (
                        <li key={p.id} className="rounded-2xl border-2 border-red-300 bg-red-50/70 p-3 space-y-2">
                          <div className="text-sm text-red-900">
                            Remove <strong>{p.full_name}</strong> from the roster? They won't appear in future registers. Past registers are unaffected.
                          </div>
                          <div className="flex gap-2">
                            <button className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700" onClick={() => setDeletingPersonId(null)}>Cancel</button>
                            <button
                              className="flex-1 rounded-2xl bg-gradient-to-b from-red-500 to-red-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                              disabled={removePerson.isPending}
                              onClick={() => removePerson.mutate(p.id)}
                            >
                              {removePerson.isPending ? "Removing…" : "Remove from roster"}
                            </button>
                          </div>
                        </li>
                      );
                    }

                    return (
                      <li key={p.id} className="rounded-2xl border border-slate-200/70 bg-white/85 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-800">{p.full_name}</div>
                            <div className="text-xs text-slate-500">
                              {p.id_number ? `ID ${p.id_number}` : ""} {p.phone ? `· ${p.phone}` : ""} {p.grade ? `· Gr ${p.grade}` : ""} {p.category ? `· ${p.category}` : ""}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {(["present","late","absent"] as EntryStatus[]).map((s) => (
                              <button
                                key={s}
                                onClick={() => setStatus(p.id, s)}
                                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                                  e.status === s
                                    ? s === "present" ? "bg-emerald-500 text-white" : s === "late" ? "bg-amber-500 text-white" : "bg-red-500 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                              >
                                {s === "present" ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : s === "late" ? <Clock3 className="mr-1 inline h-3 w-3" /> : <XCircle className="mr-1 inline h-3 w-3" />}
                                {s}
                              </button>
                            ))}
                            <button
                              onClick={() => startEdit(p)}
                              className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                              aria-label={`Edit ${p.full_name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setErr(null); setDeletingPersonId(p.id); }}
                              className="rounded-full p-1.5 text-red-600 transition-colors hover:bg-red-50"
                              aria-label={`Remove ${p.full_name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {e.status === "absent" && (
                          <input
                            type="text"
                            placeholder="Reason (optional - manager can add later)"
                            value={e.absence_reason ?? ""}
                            onChange={(ev) => setReason(p.id, ev.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {editingPersonId === "new" ? (
                <div className="rounded-2xl border border-brand/30 bg-brand/5 p-3 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-brand">Add a new person to the roster</div>
                  <LabeledInput label="Full name" required value={personDraft.full_name} onChange={(e) => setPersonDraft({ ...personDraft, full_name: e.target.value })} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <LabeledInput label="ID number (optional)" value={personDraft.id_number} onChange={(e) => setPersonDraft({ ...personDraft, id_number: e.target.value })} />
                    <LabeledInput label="Phone (optional)" value={personDraft.phone} onChange={(e) => setPersonDraft({ ...personDraft, phone: e.target.value })} />
                    {rosterSide === "learner" && (
                      <>
                        <LabeledInput label="Grade (optional)" value={personDraft.grade} onChange={(e) => setPersonDraft({ ...personDraft, grade: e.target.value })} />
                        <LabeledInput label="Category (optional)" hint="e.g. learner, youth, business" value={personDraft.category} onChange={(e) => setPersonDraft({ ...personDraft, category: e.target.value })} />
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700" onClick={cancelPersonEdit}>Cancel</button>
                    <button
                      className="flex-1 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                      disabled={savePerson.isPending || !personDraft.full_name.trim()}
                      onClick={() => savePerson.mutate()}
                    >
                      {savePerson.isPending ? "Adding…" : "Add to roster"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-brand ring-1 ring-inset ring-brand/20 hover:bg-brand/15"
                  onClick={startAdd}
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add person
                </button>
              )}

              <div className="flex gap-2">
                <button className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700" onClick={() => setPhase("setup")}>Back</button>
                <button
                  className="flex-1 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985]"
                  disabled={(rosterQ.data?.length ?? 0) === 0}
                  onClick={() => setPhase("evidence")}
                >
                  Next · Upload evidence
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Phase 3: Evidence */}
      {phase === "evidence" && (
        <div className="space-y-3">
          {isOnline ? (
            <Alert tone="blue">
              Evidence is <strong>optional</strong> for online sessions. If your platform (Zoom, Teams, Google Meet)
              gives you an attendance list or a screenshot, you can upload it here. The online sign-in list is
              captured automatically and counts as evidence too.
            </Alert>
          ) : (
            <Alert tone="blue">
              Upload a photo or scan of the physical register signed by the attendees.
              This is <strong>required</strong> before the register can be submitted.
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-white" onClick={() => camRef.current?.click()}>
              <Camera className="h-4 w-4 text-brand" /> Take photo
            </button>
            <button className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-white" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4 text-brand" /> Choose file
            </button>
          </div>
          <input ref={camRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => uploadEvidence(e.target.files?.[0] ?? null)} />
          <input ref={fileRef} type="file" hidden accept={DOC_ALLOWED_EXT.map((x) => "." + x).join(",")} onChange={(e) => uploadEvidence(e.target.files?.[0] ?? null)} />

          {uploading && (
            <div className="rounded-2xl border border-slate-200 bg-white/85 p-3 text-sm">
              Uploading… {uploadPct}%
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-gradient-to-r from-sky-500 to-brand transition-all" style={{ width: `${uploadPct}%` }} />
              </div>
            </div>
          )}

          {evidenceDocId && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="h-4 w-4" /> {evidenceName} - uploaded
            </div>
          )}

          {uploadErr && <Alert tone="red">{uploadErr}</Alert>}

          {isOnline && (
            <div className="rounded-2xl border border-sky-200/70 bg-sky-50/60 p-3 text-xs text-sky-900">
              <div className="flex items-start gap-2">
                <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  After you submit, you'll get a shareable link to post in your WhatsApp group, Zoom chat, or anywhere
                  else. Participants sign in from that link. The link closes automatically when the session ends.
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700" onClick={() => setPhase(isOnline ? "setup" : "roster")}>Back</button>
            <button
              className="flex-1 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={(isOnline ? false : !evidenceDocId) || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Submitting…" : isOnline ? "Create register & get link" : "Save & submit register"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}