import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink as OpenIcon, FileText, ImageIcon, Plus, ShieldCheck, Upload,
  Trash2, XCircle, RotateCcw, AlertTriangle, Clock,
} from "lucide-react";
import { supabase, signedUrl, errMsg } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  Alert, Badge, EmptyState, ErrorState, LabeledSelect, LabeledText,
  Modal, Pagination, Skeleton,
} from "@/components/ui";
import { DOC_STATUS } from "@/lib/constants";
import { fmtBytes, fmtDate, safeTerm } from "@/utils/format";
import type { DocumentRow } from "@/types/db";
import UploadModal from "./UploadModal";

const SELECT =
  "*, project:projects(name), type:document_types(name,requires_verification), " +
  "uploader:profiles!documents_uploaded_by_fkey(full_name), school:schools(name), teacher:teachers(full_name)";

export type DocFilter = Partial<{
  project_id: string; school_id: string; teacher_id: string;
  observation_id: string; status: string; document_type_id: string;
}>;

/* ── Thumbnail ──────────────────────────────────────────────────────── */
function Thumb({ d }: { d: DocumentRow }) {
  const isImg = d.mime_type?.startsWith("image/");
  const q = useQuery({
    queryKey: ["thumb", d.storage_path],
    enabled: !!isImg,
    staleTime: 60_000,
    queryFn: () => signedUrl(d.storage_path, 300),
  });
  if (isImg && q.data) {
    return <img src={q.data} alt={`Preview of ${d.title}`} loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />;
  }
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
      {isImg ? <ImageIcon className="h-6 w-6" aria-label="Image" /> : <FileText className="h-6 w-6" aria-label="Document" />}
    </div>
  );
}

/* ── Verify modal ───────────────────────────────────────────────────── */
export function VerifyModal({ doc, onClose }: { doc: DocumentRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState("verified");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_document_status", { p_doc: doc!.id, p_status: status, p_note: note.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["outstanding"] });
      setNote("");
      onClose();
    },
    onError: (e) => setErr(errMsg(e)),
  });
  return (
    <Modal open={!!doc} title="Review document" onClose={onClose}>
      <p className="mb-3 text-sm"><strong>{doc?.title}</strong></p>
      <LabeledSelect label="Decision" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="verified">Verify</option>
        <option value="queried">Query (ask for a correction)</option>
        <option value="rejected">Reject</option>
        <option value="under_review">Mark under review</option>
        <option value="archived">Archive</option>
        <option value="superseded">Mark superseded</option>
      </LabeledSelect>
      <LabeledText label="Note" required={status === "queried" || status === "rejected"} value={note} onChange={(e) => setNote(e.target.value)} hint="Required when querying or rejecting." />
      {err && <Alert tone="red">{err}</Alert>}
      <button
        className="btn-primary mt-3 w-full"
        disabled={m.isPending || ((status === "queried" || status === "rejected") && !note.trim())}
        onClick={() => { setErr(null); m.mutate(); }}
      >
        {m.isPending ? "Saving…" : "Save decision"}
      </button>
    </Modal>
  );
}

/* ── Request deletion modal ─────────────────────────────────────────── */
function RequestDeletionModal({ doc, onClose }: { doc: DocumentRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("request_document_deletion", { p_doc: doc!.id, p_reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      setReason(""); onClose();
    },
    onError: (e) => setErr(errMsg(e)),
  });
  return (
    <Modal open={!!doc} title="Request document deletion" onClose={onClose}>
      <p className="mb-3 text-sm">
        Request deletion of <strong>{doc?.title}</strong>? A super admin will review the request and either approve it
        (the file will be deleted) or reject it with a reason.
      </p>
      <LabeledText
        label="Reason for deletion"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        hint="Explain why this document should be removed."
      />
      {err && <Alert tone="red">{err}</Alert>}
      <button
        className="btn-primary mt-3 w-full"
        disabled={m.isPending || !reason.trim()}
        onClick={() => { setErr(null); m.mutate(); }}
      >
        {m.isPending ? "Submitting…" : "Submit request"}
      </button>
    </Modal>
  );
}

/* ── Decision modal (super_admin) ───────────────────────────────────── */
function DecisionModal({ doc, onClose }: { doc: DocumentRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [approve, setApprove] = useState(true);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("decide_document_deletion", {
        p_doc: doc!.id, p_approve: approve, p_note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["outstanding"] });
      setNote(""); onClose();
    },
    onError: (e) => setErr(errMsg(e)),
  });
  return (
    <Modal open={!!doc} title="Deletion decision" onClose={onClose}>
      <p className="mb-3 text-sm">
        Document: <strong>{doc?.title}</strong>
      </p>
      <div className="mb-3 rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3 text-sm text-amber-900">
        <div className="text-[11px] font-bold uppercase tracking-wider">Requested by</div>
        <div className="mt-0.5">{doc?.uploader?.full_name ?? "Unknown"}</div>
        {doc?.deletion_reason && (
          <>
            <div className="mt-2 text-[11px] font-bold uppercase tracking-wider">Reason</div>
            <div className="mt-0.5 whitespace-pre-wrap">{doc.deletion_reason}</div>
          </>
        )}
      </div>
      <LabeledSelect label="Decision" value={approve ? "approve" : "reject"} onChange={(e) => setApprove(e.target.value === "approve")}>
        <option value="approve">Approve - delete the document permanently</option>
        <option value="reject">Reject - keep the document</option>
      </LabeledSelect>
      <LabeledText
        label={approve ? "Note (optional)" : "Reason for rejection"}
        required={!approve}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        hint={approve ? "Optional. The requester will be notified." : "The requester will see this in their notification."}
      />
      {err && <Alert tone="red">{err}</Alert>}
      <button
        className={approve ? "btn-primary mt-3 w-full" : "btn-secondary mt-3 w-full"}
        disabled={m.isPending || (!approve && !note.trim())}
        onClick={() => { setErr(null); m.mutate(); }}
      >
        {m.isPending ? "Saving…" : approve ? "Approve and delete" : "Reject request"}
      </button>
    </Modal>
  );
}

/* ── Re-upload flow ─────────────────────────────────────────────────── */
function ReuploadButton({ doc, onDone }: { doc: DocumentRow; onDone: () => void }) {
  const a = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const path = doc.storage_path; // keep the same path so links stay stable
      const { error: upErr } = await supabase.storage
        .from(doc.storage_bucket)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { error: rpcErr } = await supabase.rpc("reupload_document", {
        p_doc: doc.id,
        p_storage_path: path,
        p_original_filename: file.name,
        p_mime_type: file.type,
        p_file_size_bytes: file.size,
      });
      if (rpcErr) throw rpcErr;

      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!a.can("documents.reupload")) return null;
  if (doc.uploaded_by !== a.profile?.id) return null;
  if (!["uploaded", "under_review", "queried"].includes(doc.status)) return null;
  if (doc.deletion_status) return null;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <button
        className="btn-ghost !min-h-[40px] !px-3"
        disabled={busy}
        onClick={() => { setErr(null); inputRef.current?.click(); }}
      >
        <RotateCcw className="h-4 w-4" /> {busy ? "Uploading…" : "Re-upload"}
      </button>
      {err && <div className="mt-1 text-xs text-red-700">{err}</div>}
    </>
  );
}

/* ── DocList ────────────────────────────────────────────────────────── */
export function DocList({
  filter, term, projectId, schoolId, teacherId, observationId,
  pageSize = 10, showUpload = true,
}: {
  filter: DocFilter; term?: string; projectId?: string; schoolId?: string;
  teacherId?: string; observationId?: string; pageSize?: number; showUpload?: boolean;
}) {
  const a = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [verify, setVerify] = useState<DocumentRow | null>(null);
  const [requestDel, setRequestDel] = useState<DocumentRow | null>(null);
  const [decide, setDecide] = useState<DocumentRow | null>(null);
  const [up, setUp] = useState(false);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["documents", filter, term, page, pageSize],
    queryFn: async () => {
      let r = supabase.from("documents").select(SELECT, { count: "exact" }).order("created_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
      for (const [k, v] of Object.entries(filter)) if (v) r = r.eq(k, v);
      const t = safeTerm(term ?? "");
      if (t) r = r.or(`title.ilike.%${t}%,original_filename.ilike.%${t}%`);
      const { data, count, error } = await r;
      if (error) throw error;
      return { rows: data as unknown as DocumentRow[], count: count ?? 0 };
    },
  });

  const open = async (d: DocumentRow) => {
    setOpenErr(null);
    try { window.open(await signedUrl(d.storage_path, 90), "_blank", "noopener"); }
    catch (e) { setOpenErr(errMsg(e)); }
  };

  const cancelRequest = useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase.rpc("cancel_document_deletion", { p_doc: docId });
      if (error) throw error;
    },
    onSuccess: () => { setCancelErr(null); qc.invalidateQueries({ queryKey: ["documents"] }); },
    onError: (e) => setCancelErr(errMsg(e)),
  });

  const canUpload = showUpload && !!projectId && a.can("documents.upload");
  const canRequestDelete = a.can("documents.request_delete");
  const canApproveDelete = a.can("documents.approve_delete");
  const canVerify = a.can("documents.verify");

  return (
    <div>
      {canUpload && (
        <div className="mb-3">
          <button className="btn-secondary" onClick={() => setUp(true)}>
            <Upload className="h-4 w-4" />Upload document
          </button>
        </div>
      )}
      {openErr && <Alert tone="red">{openErr}</Alert>}
      {cancelErr && <Alert tone="red">{cancelErr}</Alert>}
      {q.isLoading ? (
        <Skeleton rows={3} />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data?.rows.length ? (
        <EmptyState
          title="No documents"
          text="Nothing has been uploaded here yet."
          icon={<FileText className="h-6 w-6" />}
          action={canUpload && (
            <button className="btn-primary" onClick={() => setUp(true)}>
              <Plus className="h-4 w-4" />Upload document
            </button>
          )}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {q.data.rows.map((d) => {
              const pending = d.deletion_status === "pending";
              const rejected = d.deletion_status === "rejected";
              const myRequest = d.deletion_requested_by === a.profile?.id;
              const canVerifyThis = canVerify && !!d.project_id && !["verified", "archived", "superseded"].includes(d.status) && !pending;
              const canRequestThis = canRequestDelete && !pending && !rejected && d.status !== "archived";
              const canDecideThis = canApproveDelete && pending;
              const canCancelThis = myRequest && pending;

              return (
                <li key={d.id} className="card flex items-start gap-3 p-3">
                  <Thumb d={d} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{d.title}</span>
                      <Badge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Badge>
                      {d.external_submission_id && d.status === "uploaded" && <Badge tone="amber">New external submission</Badge>}
                      {pending && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-inset ring-amber-200">
                          <Clock className="h-2.5 w-2.5" /> Deletion pending
                        </span>
                      )}
                      {rejected && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 ring-1 ring-inset ring-slate-200">
                          <XCircle className="h-2.5 w-2.5" /> Deletion rejected
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600">
                      {[d.type?.name, d.project?.name, d.school?.name, d.teacher?.full_name].filter(Boolean).join(" · ")}
                    </div>
                    <div className="text-xs text-slate-500">
                      {d.original_filename} · {fmtBytes(d.file_size_bytes)} · {fmtDate(d.created_at)} · {d.uploader?.full_name ?? (d.external_submission_id ? "External teacher" : "-")}
                    </div>
                    {d.verification_note && <div className="mt-1 text-xs text-slate-700">Note: {d.verification_note}</div>}

                    {pending && (
                      <div className="mt-2 rounded-xl border border-amber-200/70 bg-amber-50/60 px-2.5 py-2 text-xs text-amber-900">
                        <div className="font-semibold">Deletion requested</div>
                        {d.deletion_reason && <div className="mt-0.5 whitespace-pre-wrap">{d.deletion_reason}</div>}
                      </div>
                    )}
                    {rejected && d.deletion_decision_note && (
                      <div className="mt-2 rounded-xl border border-slate-200/70 bg-slate-50/70 px-2.5 py-2 text-xs text-slate-700">
                        <div className="font-semibold">Rejected - reason given</div>
                        <div className="mt-0.5 whitespace-pre-wrap">{d.deletion_decision_note}</div>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-1">
                    <button className="btn-secondary !min-h-[40px] !px-3" onClick={() => open(d)} aria-label={`Open ${d.title}`}>
                      <OpenIcon className="h-4 w-4" />Open
                    </button>

                    {canVerifyThis && (
                      <button className="btn-ghost !min-h-[40px] !px-3" onClick={() => setVerify(d)}>
                        <ShieldCheck className="h-4 w-4" />Review
                      </button>
                    )}

                    {canRequestThis && (
                      <button className="btn-ghost !min-h-[40px] !px-3" onClick={() => setRequestDel(d)}>
                        <Trash2 className="h-4 w-4" />Request deletion
                      </button>
                    )}

                    {canCancelThis && (
                      <button
                        className="btn-ghost !min-h-[40px] !px-3"
                        disabled={cancelRequest.isPending}
                        onClick={() => cancelRequest.mutate(d.id)}
                      >
                        <RotateCcw className="h-4 w-4" />Cancel request
                      </button>
                    )}

                    {canDecideThis && (
                      <button className="btn-primary !min-h-[40px] !px-3" onClick={() => setDecide(d)}>
                        <AlertTriangle className="h-4 w-4" />Decide
                      </button>
                    )}

                    <ReuploadButton doc={d} onDone={() => qc.invalidateQueries({ queryKey: ["documents"] })} />
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={pageSize} total={q.data.count} onPage={setPage} />
        </>
      )}

      <VerifyModal doc={verify} onClose={() => setVerify(null)} />
      <RequestDeletionModal doc={requestDel} onClose={() => setRequestDel(null)} />
      <DecisionModal doc={decide} onClose={() => setDecide(null)} />
      {projectId && <UploadModal open={up} onClose={() => setUp(false)} projectId={projectId} schoolId={schoolId} teacherId={teacherId} observationId={observationId} />}
    </div>
  );
}