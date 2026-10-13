import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Calendar, Clock, MapPin, UserRound, FileImage, CheckCircle2, XCircle,
  Clock3, AlertTriangle, ExternalLink, Link2, Copy, Wifi, MapPinned,
  Trash2, RotateCcw, BellRing, Camera, FileUp,
} from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  Alert, Badge, ErrorState, LabeledSelect, LabeledText, Modal, Skeleton,
} from "@/components/ui";
import {
  getRegister, getRegisterEntries, rosterByIds, registerTypeLabel, getEvidenceDocument,
  listExternalSignins, setRegisterExternalLink, externalSigninUrl,
  requestRegisterDeletion, cancelRegisterDeletion, decideRegisterDeletion,
  requestRegisterEvidence, attachRegisterEvidence, reuploadRegisterEvidence,
  type EvidenceDoc,
} from "@/services/registers";
import { uploadDocument, compressImage } from "@/lib/files";
import { fmtDate } from "@/utils/format";

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "rdDrift 24s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes rdDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-3 px-1">
      {Icon && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-inset ring-brand/15">
          <Icon className="h-3.5 w-3.5 text-brand" aria-hidden />
        </span>
      )}
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-slate-300/80 via-slate-200/60 to-transparent" />
    </div>
  );
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";

/* ── Sign-in link panel ──────────────────────────────────────────── */
function SigninLinkPanel({
  registerId, token, isOpen, onChanged,
}: { registerId: string; token: string | null; isOpen: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = token ? externalSigninUrl(token) : null;

  const toggle = async (open: boolean) => {
    setBusy(true); setErr(null);
    try {
      await setRegisterExternalLink(registerId, open);
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {!token ? (
        <button
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98] disabled:opacity-60"
          disabled={busy}
          onClick={() => toggle(true)}
        >
          <Link2 className="h-4 w-4" /> {busy ? "Generating…" : "Generate sign-in link"}
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url ?? ""}
              className="flex-1 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-xs font-mono text-slate-800"
            />
            <button
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url ?? "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch { /* ignore */ }
              }}
            >
              {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Status:{" "}
              <strong className={isOpen ? "text-emerald-700" : "text-slate-600"}>
                {isOpen ? "Open" : "Closed"}
              </strong>
            </span>
            <button
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
              disabled={busy}
              onClick={() => toggle(!isOpen)}
            >
              {isOpen ? "Close sign-in" : "Reopen sign-in"}
            </button>
          </div>
        </>
      )}
      {err && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
    </div>
  );
}

/* ── Request deletion form ───────────────────────────────────────── */
function RequestDeletionForm({ registerId, onDone }: { registerId: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Explain why this register should be deleted. A super admin will review the request.
      </p>
      <LabeledText
        label="Reason"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {err && <Alert tone="red">{err}</Alert>}
      <button
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-red-500 to-red-700 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(239,68,68,0.6)] ring-1 ring-inset ring-white/15 transition-all hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!reason.trim() || busy}
        onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await requestRegisterDeletion(registerId, reason.trim());
            onDone();
          } catch (e: any) {
            setErr(errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Trash2 className="h-4 w-4" /> {busy ? "Submitting…" : "Submit request"}
      </button>
    </div>
  );
}

/* ── Attach evidence (facilitator) ────────────────────────────────── */
function AttachEvidencePanel({
  registerId, projectId, onDone,
}: { registerId: string; projectId: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pct, setPct] = useState(0);

  const handle = async (file: File | null) => {
    if (!file) return;
    setBusy(true); setErr(null); setPct(0);
    try {
      const blob = await compressImage(file);
      const docId = await uploadDocument({
        projectId,
        file: blob,
        filename: file.name,
        mime: blob.type || file.type,
        title: `Register evidence`,
        typeId: null,
        schoolId: null,
        teacherId: null,
        observationId: null,
        onProgress: (p) => setPct(p),
      });
      await attachRegisterEvidence(registerId, docId);
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Attach a photo or scan of the signed register. It can be uploaded now even if the register was
        already submitted.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-white disabled:opacity-60"
          disabled={busy}
          onClick={() => camRef.current?.click()}
        >
          <Camera className="h-4 w-4 text-brand" /> Take photo
        </button>
        <button
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-white disabled:opacity-60"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp className="h-4 w-4 text-brand" /> Choose file
        </button>
      </div>
      <input ref={camRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => handle(e.target.files?.[0] ?? null)} />
      <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => handle(e.target.files?.[0] ?? null)} />

      {busy && (
        <div className="rounded-2xl border border-slate-200 bg-white/85 p-3 text-sm">
          Uploading… {pct}%
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-gradient-to-r from-sky-500 to-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {err && <Alert tone="red">{err}</Alert>}
    </div>
  );
}

/* ── Re-upload evidence (facilitator, when already attached) ─────── */
function ReuploadEvidencePanel({
  registerId, projectId, onDone,
}: { registerId: string; projectId: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pct, setPct] = useState(0);

  const handle = async (file: File | null) => {
    if (!file) return;
    setBusy(true); setErr(null); setPct(0);
    try {
      const blob = await compressImage(file);
      const docId = await uploadDocument({
        projectId,
        file: blob,
        filename: file.name,
        mime: blob.type || file.type,
        title: `Register evidence`,
        typeId: null,
        schoolId: null,
        teacherId: null,
        observationId: null,
        onProgress: (p) => setPct(p),
      });
      await reuploadRegisterEvidence(registerId, docId);
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3 text-sm text-amber-900">
        Replacing will hide the previous file from this register. The old file stays in storage for
        audit but is no longer referenced here.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-white disabled:opacity-60"
          disabled={busy}
          onClick={() => camRef.current?.click()}
        >
          <Camera className="h-4 w-4 text-brand" /> Take photo
        </button>
        <button
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-white disabled:opacity-60"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp className="h-4 w-4 text-brand" /> Choose file
        </button>
      </div>
      <input ref={camRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => handle(e.target.files?.[0] ?? null)} />
      <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => handle(e.target.files?.[0] ?? null)} />

      {busy && (
        <div className="rounded-2xl border border-slate-200 bg-white/85 p-3 text-sm">
          Uploading… {pct}%
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-gradient-to-r from-sky-500 to-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {err && <Alert tone="red">{err}</Alert>}
    </div>
  );
}

/* ── Request evidence (admin) ─────────────────────────────────────── */
function RequestEvidenceForm({
  registerId, onDone,
}: { registerId: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        The facilitator will be notified to upload the signed register.
      </p>
      <LabeledText
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {err && <Alert tone="red">{err}</Alert>}
      <button
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await requestRegisterEvidence(registerId, note.trim());
            onDone();
          } catch (e: any) {
            setErr(errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <BellRing className="h-4 w-4" /> {busy ? "Sending…" : "Send request"}
      </button>
    </div>
  );
}

/* ── Decision form (super_admin) ──────────────────────────────────── */
function DecisionForm({
  registerId, reason, onDone,
}: { registerId: string; reason: string | null; onDone: () => void }) {
  const [approve, setApprove] = useState(true);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      {reason && (
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3 text-sm text-amber-900">
          <div className="text-[11px] font-bold uppercase tracking-wider">Reason</div>
          <div className="mt-0.5 whitespace-pre-wrap">{reason}</div>
        </div>
      )}

      <LabeledSelect
        label="Decision"
        value={approve ? "approve" : "reject"}
        onChange={(e) => setApprove(e.target.value === "approve")}
      >
        <option value="approve">Approve - hide the register</option>
        <option value="reject">Reject - keep the register visible</option>
      </LabeledSelect>

      <LabeledText
        label={approve ? "Note (optional)" : "Reason for rejection"}
        required={!approve}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        hint={approve ? "Optional. The facilitator will see this in their notification." : "The facilitator will see this in their notification."}
      />

      {err && <Alert tone="red">{err}</Alert>}

      <button
        className={approve
          ? "flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
          : "flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"}
        disabled={busy || (!approve && !note.trim())}
        onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await decideRegisterDeletion(registerId, approve, note.trim() || null);
            onDone();
          } catch (e: any) {
            setErr(errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : approve ? "Approve and hide" : "Reject request"}
      </button>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */
export default function RegisterDetail() {
  const { id } = useParams<{ id: string }>();
  const a = useAuth();

  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [evidenceDoc, setEvidenceDoc] = useState<EvidenceDoc | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const [requestDel, setRequestDel] = useState(false);
  const [decideDel, setDecideDel] = useState(false);
  const [attachEvidence, setAttachEvidence] = useState(false);
  const [requestEvidence, setRequestEvidence] = useState(false);
  const [reuploadEvidence, setReuploadEvidence] = useState(false);

  const q = useQuery({
    queryKey: ["register", id],
    enabled: !!id,
    queryFn: () => getRegister(id!),
  });

  const isOnline = q.data?.session_mode === "online";

  const entriesQ = useQuery({
    queryKey: ["register-entries", id],
    enabled: !!id && !isOnline,
    queryFn: () => getRegisterEntries(id!),
  });

  const rosterQ = useQuery({
    queryKey: ["register-roster", id, q.data?.roster_side, entriesQ.data],
    enabled: !isOnline && !!q.data && !!entriesQ.data,
    queryFn: async () => {
      const ids = (entriesQ.data ?? []).map((e) => e.roster_entry_id);
      return rosterByIds(q.data!.roster_side, ids);
    },
  });

  const signinsQ = useQuery({
    queryKey: ["register-signins", id],
    enabled: !!id && isOnline,
    queryFn: () => listExternalSignins(id!),
    refetchInterval: isOnline ? 15_000 : false,
    refetchOnWindowFocus: true,
  });

  const entriesWithNames = useMemo(() => {
    if (!entriesQ.data || !rosterQ.data) return [];
    const byId = new Map(rosterQ.data.map((r: any) => [r.id, r]));
    return entriesQ.data.map((e) => ({
      entry: e,
      person: byId.get(e.roster_entry_id) as any,
    }));
  }, [entriesQ.data, rosterQ.data]);

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0 };
    if (isOnline) {
      c.present = signinsQ.data?.length ?? 0;
    } else {
      (entriesQ.data ?? []).forEach((e) => { c[e.status] += 1; });
    }
    return c;
  }, [entriesQ.data, signinsQ.data, isOnline]);

  const loadEvidence = async () => {
    if (!q.data?.evidence_document_id) return;
    setEvidenceLoading(true); setEvidenceError(null);
    try {
      const doc = await getEvidenceDocument(q.data.evidence_document_id);
      if (!doc) throw new Error("Evidence document not found in the documents table.");
      setEvidenceDoc(doc);

      const { data, error } = await supabase.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, 300);
      if (error) throw new Error(error.message);

      setEvidenceUrl(data.signedUrl);
    } catch (e: any) {
      setEvidenceError(e?.message ?? String(e));
    } finally {
      setEvidenceLoading(false);
    }
  };

  if (q.isLoading) return <Skeleton rows={5} />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? "Register not found"} />;

  const r = q.data;
  const isOwner = a.profile?.id === r.facilitator_id;
  const canDecide = a.can("registers.approve_delete");
  const canRequestEvidence = canDecide;
  const canReupload =
    isOwner &&
    !!r.evidence_document_id &&
    ["submitted", "queried"].includes(r.status) &&
    !r.deletion_status;

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
          <div className="relative">
            {/* Action row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                to="/registers"
                className="group inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200/70 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-slate-900 hover:shadow-sm active:translate-y-0"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
                Registers
              </Link>

              <div className="flex flex-wrap gap-2">
                {isOwner && !r.evidence_document_id && (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand ring-1 ring-inset ring-brand/20 transition-all hover:-translate-y-0.5 hover:bg-brand/15 hover:shadow-sm active:translate-y-0"
                    onClick={() => setAttachEvidence(true)}
                  >
                    <Camera className="h-3.5 w-3.5" /> Attach evidence
                  </button>
                )}

                {canReupload && (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200/70 transition-all hover:-translate-y-0.5 hover:bg-white hover:text-slate-900 hover:shadow-sm active:translate-y-0"
                    onClick={() => setReuploadEvidence(true)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Re-upload evidence
                  </button>
                )}

                {canRequestEvidence && !r.evidence_document_id && !isOwner && (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200/70 transition-all hover:-translate-y-0.5 hover:bg-amber-100 hover:shadow-sm active:translate-y-0"
                    onClick={() => setRequestEvidence(true)}
                  >
                    <BellRing className="h-3.5 w-3.5" /> Request evidence
                  </button>
                )}

                {isOwner && !r.deletion_status && (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200/70 transition-all hover:-translate-y-0.5 hover:bg-red-100 hover:shadow-sm active:translate-y-0"
                    onClick={() => setRequestDel(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Request deletion
                  </button>
                )}

                {canDecide && r.deletion_status === "pending" && (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0"
                    onClick={() => setDecideDel(true)}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Decide
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                  {registerTypeLabel(r.register_type)}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={r.status === "submitted" ? "green" : r.status === "queried" ? "amber" : "slate"}>
                    {r.status}
                  </Badge>
                  {isOnline ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-800 ring-1 ring-inset ring-sky-200">
                      <Wifi className="h-3 w-3" /> Online
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800 ring-1 ring-inset ring-emerald-200">
                      <MapPinned className="h-3 w-3" /> In person
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200/70">
                    <Calendar className="h-3 w-3" /> {fmtDate(r.session_date)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 px-3 py-2">
                  <div className="text-lg font-extrabold text-emerald-700">{counts.present}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/80">
                    {isOnline ? "Signed in" : "Present"}
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 px-3 py-2">
                  <div className="text-lg font-extrabold text-amber-700">{counts.late}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700/80">Late</div>
                </div>
                <div className="rounded-2xl border border-red-200/70 bg-red-50/60 px-3 py-2">
                  <div className="text-lg font-extrabold text-red-700">{counts.absent}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-red-700/80">Absent</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Deletion pending banner */}
        {r.deletion_status === "pending" && (
          <div className="mb-5 rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 text-sm text-amber-900">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">Deletion request pending</div>
                {r.deletion_reason && <div className="mt-1 whitespace-pre-wrap">{r.deletion_reason}</div>}
              </div>
              {isOwner && (
                <button
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                  onClick={async () => {
                    try {
                      await cancelRegisterDeletion(r.id);
                      q.refetch();
                    } catch { /* handled by RLS or RPC */ }
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Cancel request
                </button>
              )}
            </div>
          </div>
        )}

        {/* Deletion rejected banner */}
        {r.deletion_status === "rejected" && (
          <div className="mb-5 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 text-sm text-slate-800">
            <div className="font-semibold">Deletion request rejected</div>
            {r.deletion_decision_note && (
              <div className="mt-1 whitespace-pre-wrap">{r.deletion_decision_note}</div>
            )}
          </div>
        )}

        {/* Evidence-requested banner */}
        {!r.evidence_document_id && r.evidence_requested_at && (
          <div className="mb-5 rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 text-sm text-amber-900">
            <div className="font-semibold">Evidence requested</div>
            <div className="mt-1">
              Your project manager has asked you to upload the signed register for this session.
            </div>
            {r.evidence_request_note && (
              <div className="mt-1 whitespace-pre-wrap">{r.evidence_request_note}</div>
            )}
            {isOwner && (
              <button
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                onClick={() => setAttachEvidence(true)}
              >
                <Camera className="h-3.5 w-3.5" /> Attach evidence
              </button>
            )}
          </div>
        )}

        {/* Context */}
        <section className="mb-7">
          <SectionLabel icon={MapPin}>Context</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Project</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{r.project?.name ?? "-"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">School</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{r.school?.name ?? "-"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Time</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-800">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                {fmtTime(r.start_time)} - {fmtTime(r.end_time)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Facilitator</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-800">
                <UserRound className="h-3.5 w-3.5 text-slate-400" />
                {r.facilitator?.full_name ?? "-"}
              </div>
            </div>
            {r.topic && (
              <div className="rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur sm:col-span-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Topic</div>
                <div className="mt-1 text-sm font-medium text-slate-800">{r.topic}</div>
              </div>
            )}
            {r.notes && (
              <div className="rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur sm:col-span-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Notes</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{r.notes}</div>
              </div>
            )}
          </div>
        </section>

        {/* Sign-in link */}
        {isOnline && (
          <section className="mb-7">
            <SectionLabel icon={Link2}>Sign-in link</SectionLabel>
            <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
              <SigninLinkPanel
                registerId={r.id}
                token={r.external_token}
                isOpen={r.external_is_open}
                onChanged={() => q.refetch()}
              />
            </div>
          </section>
        )}

        {/* Attendance — in-person */}
        {!isOnline && (
          <section className="mb-7">
            <SectionLabel icon={CheckCircle2}>
              {r.roster_side === "teacher" ? "Teacher attendance" : "Learner attendance"}
            </SectionLabel>
            {entriesWithNames.length === 0 ? (
              <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-sm text-slate-600">
                No entries recorded.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200/70 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/85 shadow-sm backdrop-blur">
                {entriesWithNames.map(({ entry, person }) => (
                  <li key={entry.id} className="flex items-start gap-3 p-3.5">
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${
                        entry.status === "present" ? "bg-emerald-50 ring-emerald-200 text-emerald-700"
                        : entry.status === "late" ? "bg-amber-50 ring-amber-200 text-amber-700"
                        : "bg-red-50 ring-red-200 text-red-700"
                      }`}
                    >
                      {entry.status === "present" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                       entry.status === "late" ? <Clock3 className="h-3.5 w-3.5" /> :
                       <XCircle className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">{person?.full_name ?? "Unknown"}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        {person?.id_number && <span>ID: {person.id_number}</span>}
                        {person?.phone && <span>Phone: {person.phone}</span>}
                        {person?.grade && <span>Grade: {person.grade}</span>}
                        {person?.category && <span>Category: {person.category}</span>}
                      </div>
                      {entry.status === "absent" && entry.absence_reason && (
                        <div className="mt-1.5 rounded-xl bg-red-50/60 px-2.5 py-1.5 text-xs text-red-900 ring-1 ring-inset ring-red-200/60">
                          Reason: {entry.absence_reason}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Attendance — online */}
        {isOnline && (
          <section className="mb-7">
            <SectionLabel icon={Wifi}>
              Online sign-ins · {signinsQ.data?.length ?? 0}
            </SectionLabel>
            {signinsQ.isLoading ? (
              <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-sm text-slate-600">
                Loading sign-ins…
              </div>
            ) : !signinsQ.data || signinsQ.data.length === 0 ? (
              <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-sm text-slate-600">
                No one has signed in yet. Share the link above with the participants.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200/70 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/85 shadow-sm backdrop-blur">
                {signinsQ.data.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 p-3.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-inset ring-emerald-200 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">{s.full_name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        {s.phone && <span>Phone: {s.phone}</span>}
                        <span>Signed in at {new Date(s.signed_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      {s.note && <div className="mt-1 text-xs text-slate-600">Note: {s.note}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Evidence */}
        <section className="mb-7">
          <SectionLabel icon={FileImage}>
            Evidence {isOnline ? "(optional)" : "(signed register)"}
          </SectionLabel>
          <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
            {!r.evidence_document_id ? (
              <div className="flex items-start gap-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  {isOnline
                    ? "No evidence file was attached (optional for online registers)."
                    : "No evidence file was attached."}
                </span>
              </div>
            ) : !evidenceUrl ? (
              <button
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98] disabled:opacity-60"
                disabled={evidenceLoading}
                onClick={loadEvidence}
              >
                <FileImage className="h-4 w-4" />
                {evidenceLoading ? "Loading…" : "View evidence"}
              </button>
            ) : (
              <div className="space-y-3">
                <img
                  src={evidenceUrl}
                  alt="Evidence"
                  className="max-h-[70vh] w-full rounded-2xl border border-slate-200 object-contain shadow-sm"
                />
                <div className="flex flex-wrap items-center gap-4">
                  <a
                    href={evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
                  >
                    Open in new tab <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  {canReupload && (
                    <button
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-brand"
                      onClick={() => setReuploadEvidence(true)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Re-upload evidence
                    </button>
                  )}
                </div>
                {evidenceDoc?.original_filename && (
                  <p className="text-xs text-slate-500">File: {evidenceDoc.original_filename}</p>
                )}
              </div>
            )}
            {evidenceError && (
              <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{evidenceError}</div>
            )}
          </div>
        </section>
      </div>

      {/* Modals */}
      <Modal open={requestDel} title="Request register deletion" onClose={() => setRequestDel(false)}>
        <RequestDeletionForm
          registerId={r.id}
          onDone={() => { setRequestDel(false); q.refetch(); }}
        />
      </Modal>

      <Modal open={decideDel} title="Deletion decision" onClose={() => setDecideDel(false)}>
        <DecisionForm
          registerId={r.id}
          reason={r.deletion_reason}
          onDone={() => { setDecideDel(false); q.refetch(); }}
        />
      </Modal>

      <Modal open={attachEvidence} title="Attach evidence" onClose={() => setAttachEvidence(false)}>
        <AttachEvidencePanel
          registerId={r.id}
          projectId={r.project_id}
          onDone={() => { setAttachEvidence(false); q.refetch(); }}
        />
      </Modal>

      <Modal open={reuploadEvidence} title="Re-upload evidence" onClose={() => setReuploadEvidence(false)}>
        <ReuploadEvidencePanel
          registerId={r.id}
          projectId={r.project_id}
          onDone={() => { setReuploadEvidence(false); q.refetch(); }}
        />
      </Modal>

      <Modal open={requestEvidence} title="Request evidence" onClose={() => setRequestEvidence(false)}>
        <RequestEvidenceForm
          registerId={r.id}
          onDone={() => { setRequestEvidence(false); q.refetch(); }}
        />
      </Modal>
    </>
  );
}