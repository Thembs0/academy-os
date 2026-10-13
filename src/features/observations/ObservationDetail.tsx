import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, MessageSquareWarning, Pencil, Printer, X } from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Alert, Badge, ErrorState, LabeledText, Modal, PageHeader, Skeleton } from "@/components/ui";
import { DocList } from "@/features/documents/DocList";
import { OBS_STATUS, SAMR } from "@/lib/constants";
import { OBS_SELECT } from "@/services/observations";
import { fmtDate, fmtDateTime, obsRef } from "@/utils/format";
import type { Observation, QueryRow } from "@/types/db";

const REQUEST_TYPES = ["Additional photo", "Additional document", "Clarification needed", "Correction needed"];
const AWAITING = ["submitted", "resubmitted", "under_review"];

function Sec({ title, children }: { title: string; children: React.ReactNode }) { return <section className="card mb-4 p-4"><h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2><div className="space-y-3 text-sm">{children}</div></section>; }
function Row({ k, v }: { k: string; v?: string | null }) { return <div><div className="text-xs font-semibold text-slate-500">{k}</div><div className="whitespace-pre-wrap">{v?.trim() ? v : "-"}</div></div>; }

export default function ObservationDetail() {
  const { id } = useParams(); const a = useAuth(); const nav = useNavigate(); const qc = useQueryClient();
  const [qOpen, setQOpen] = useState(false); const [aOpen, setAOpen] = useState(false); const [text, setText] = useState(""); const [items, setItems] = useState<string[]>([]); const [note, setNote] = useState(""); const [err, setErr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["observation", id],
    queryFn: async () => {
      const [o, h, qs] = await Promise.all([
        supabase.from("observations").select(OBS_SELECT).eq("id", id!).single(),
        supabase.from("observation_status_history").select("*, by:profiles!observation_status_history_changed_by_fkey(full_name)").eq("observation_id", id!).order("created_at"),
        supabase.from("observation_queries").select("*, items:observation_query_items(*)").eq("observation_id", id!).order("created_at", { ascending: false }),
      ]);
      if (o.error) throw o.error;
      return { o: o.data as unknown as Observation, history: (h.data ?? []) as any[], queries: (qs.data ?? []) as unknown as QueryRow[] };
    },
  });
  const o = q.data?.o;
  const pm = (...r: string[]) => !!o && a.hasProjectRole(o.project_id, ...(r as any));
  const canReview = !!o && (a.hasRole("super_admin", "hod", "coordinator") || pm("manager", "coordinator"));
  const canQuery = !!o && a.can("field.query") && (a.hasRole("super_admin", "hod") || pm("manager"));
  const canApprove = !!o && a.can("field.approve") && (a.hasRole("super_admin", "hod") || pm("manager")) && o.facilitator_id !== a.profile?.id;
  const awaiting = !!o && AWAITING.includes(o.status);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["observation", id] }); qc.invalidateQueries({ queryKey: ["observations"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const started = useRef(false);
  useEffect(() => { if (o && !started.current && canReview && ["submitted", "resubmitted"].includes(o.status) && o.facilitator_id !== a.profile?.id) { started.current = true; supabase.rpc("start_review", { p_id: o.id }).then(() => refresh()); } /* eslint-disable-next-line */ }, [o?.id, o?.status, canReview]);

  const approve = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("approve_observation", { p_id: id!, p_note: note.trim() || null }); if (error) throw error; }, onSuccess: () => { setAOpen(false); setNote(""); refresh(); }, onError: (e) => setErr(errMsg(e)) });
  const query = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("query_observation", { p_id: id!, p_text: text.trim(), p_items: items.filter((i) => i.trim()) }); if (error) throw error; }, onSuccess: () => { setQOpen(false); setText(""); setItems([]); refresh(); }, onError: (e) => setErr(errMsg(e)) });

  if (q.isLoading) return <Skeleton />;
  if (q.error || !o) return <ErrorState error={q.error ?? "Observation not found, or you don't have access to it."} />;
  const own = o.facilitator_id === a.profile?.id; const st = OBS_STATUS[o.status];
  const outstanding = q.data!.queries.find((x) => x.status === "open");
  return (
    <>
      <PageHeader back={<Link to="/observations" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 no-print"><ArrowLeft className="h-4 w-4" />Observations</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{obsRef(o.ref_no)} <Badge tone={st.tone}>{st.label}</Badge></span>}
        subtitle={`${o.project?.name ?? ""} · ${o.school?.name ?? "-"} · ${o.teacher?.full_name ?? "-"}`}
        actions={<>
          <button className="btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / PDF</button>
          {own && ["draft", "queried"].includes(o.status) && <button className="btn-primary" onClick={() => nav(`/observations/${o.id}/edit`)}><Pencil className="h-4 w-4" />Edit{o.status === "queried" ? " & resubmit" : ""}</button>}
          {awaiting && canQuery && <button className="btn-secondary" onClick={() => { setErr(null); setQOpen(true); }}><MessageSquareWarning className="h-4 w-4" />Query</button>}
          {awaiting && canApprove && <button className="btn-success" onClick={() => { setErr(null); setAOpen(true); }}><CheckCircle2 className="h-4 w-4" />Approve</button>}
        </>} />

      {o.status === "queried" && outstanding && own && <div className="mb-4"><Alert tone="amber"><strong>Changes requested:</strong> {outstanding.query_text}{outstanding.items.length > 0 && <ul className="mt-1 list-disc pl-5">{outstanding.items.map((i) => <li key={i.id}>{i.item_text}</li>)}</ul>}</Alert></div>}
      <Sec title="Observation details"><div className="grid gap-3 sm:grid-cols-2"><Row k="Facilitator" v={o.facilitator?.full_name} /><Row k="Date and time" v={fmtDateTime(o.observed_at)} /><Row k="Subject" v={o.subject} /><Row k="Grade" v={o.grade} /><Row k="CAPS topic" v={o.caps_topic} /><Row k="Submitted" v={fmtDateTime(o.submitted_at)} /></div></Sec>
      <Sec title="Technology integration"><Row k="Tools used" v={o.technology_tools} /><div><div className="text-xs font-semibold text-slate-500">SAMR level</div><div>{o.samr_level ? <><strong>{o.samr_level}</strong> - {SAMR[o.samr_level].name}</> : "-"}</div></div><Row k="Learning outcomes & evidence" v={o.learning_outcomes} /></Sec>
      <Sec title="Feedback"><Row k="Strength 1" v={o.strength_1} /><Row k="Strength 2" v={o.strength_2} /><Row k="Strength 3" v={o.strength_3} /><Row k="Area for development" v={o.development_area} /><Row k="Practical suggestion" v={o.practical_suggestion} /></Sec>
      <Sec title="Follow-up"><Row k="Post-observation conversation" v={o.post_observation_conversation} /><Row k="Agreed action" v={o.agreed_action} /><Row k="Next observation" v={o.next_observation_date ? fmtDate(o.next_observation_date) : null} />
        <Row k="Teacher acknowledgement" v={o.teacher_acknowledged ? `Acknowledged (${(o.acknowledgement_method ?? "").replace("_", " ") || "method not recorded"}), recorded by the facilitator${o.acknowledgement_note ? ` - ${o.acknowledgement_note}` : ""}` : "Not recorded"} /></Sec>
      <Sec title="Evidence">{o.evidence && <Row k="Notes" v={o.evidence} />}<div className="no-print"><DocList filter={{ observation_id: o.id }} showUpload={false} /></div></Sec>
      {q.data!.queries.length > 0 && <Sec title="Query history">{q.data!.queries.map((x) => <div key={x.id} className="rounded-lg border p-3"><div className="flex justify-between text-xs text-slate-500"><span>{fmtDateTime(x.created_at)}</span><Badge tone={x.status === "open" ? "amber" : "green"}>{x.status}</Badge></div><p className="mt-1">{x.query_text}</p>{x.items.length > 0 && <ul className="mt-1 space-y-0.5 text-xs">{x.items.map((i) => <li key={i.id}>{i.is_resolved ? "☑" : "☐"} {i.item_text}</li>)}</ul>}</div>)}</Sec>}
      <Sec title="Audit timeline"><ol className="space-y-2 border-l-2 border-slate-200 pl-4">{q.data!.history.map((h) => <li key={h.id}><div className="font-medium">{OBS_STATUS[h.to_status as keyof typeof OBS_STATUS]?.label ?? h.to_status}</div><div className="text-xs text-slate-500">{fmtDateTime(h.created_at)} · {h.by?.full_name ?? "System"}</div>{h.note && <div className="text-xs text-slate-700">{h.note}</div>}</li>)}{q.data!.history.length === 0 && <li className="text-slate-500">No workflow events yet.</li>}</ol></Sec>

      <Modal open={aOpen} title="Approve observation" onClose={() => setAOpen(false)}>
        <p className="mb-3 text-sm">Approving makes this record final and visible to the HOD and project reports. This is recorded in the audit trail.</p>
        <LabeledText label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />{err && <Alert tone="red">{err}</Alert>}
        <button className="btn-success mt-3 w-full" disabled={approve.isPending} onClick={() => { setErr(null); approve.mutate(); }}>{approve.isPending ? "Approving…" : "Confirm approval"}</button>
      </Modal>
      <Modal open={qOpen} title="Query observation" onClose={() => setQOpen(false)} wide>
        <LabeledText label="What needs to change?" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mb-2 flex flex-wrap gap-2">{REQUEST_TYPES.map((r) => <button key={r} type="button" className="rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50" onClick={() => setItems((x) => [...x, r + ": "])}>+ {r}</button>)}</div>
        <ul className="space-y-2">{items.map((it, i) => <li key={i} className="flex gap-2"><input className="input" aria-label={`Query item ${i + 1}`} value={it} onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} /><button className="p-2" aria-label="Remove item" onClick={() => setItems(items.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button></li>)}</ul>
        {err && <Alert tone="red">{err}</Alert>}
        <button className="btn-primary mt-3 w-full" disabled={query.isPending || (!text.trim() && !items.some((i) => i.trim()))} onClick={() => { setErr(null); query.mutate(); }}>{query.isPending ? "Sending…" : "Send query to facilitator"}</button>
      </Modal>
    </>
  );
}
