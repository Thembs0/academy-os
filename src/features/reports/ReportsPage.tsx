import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CheckCircle2, Download, Plus, Printer, Sparkles } from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import ProjectSelect from "@/components/ProjectSelect";
import { Alert, Badge, EmptyState, ErrorState, LabeledInput, LabeledText, Modal, PageHeader, Skeleton, Stat } from "@/components/ui";
import { downloadCsv } from "@/utils/csv";
import { fmtDate, fmtDateTime } from "@/utils/format";
import type { ProjectReport } from "@/types/db";

/* AI narrative drafting is opt-in via an env flag.
   Set VITE_AI_REPORTS=true in .env.local and restart Vite to enable.
   Requires ANTHROPIC_API_KEY in Supabase Edge Function secrets. */
const AI_ENABLED = import.meta.env.VITE_AI_REPORTS === "true";

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const prevMonth = () => { const n = new Date(); return { s: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), e: iso(new Date(n.getFullYear(), n.getMonth(), 0)) }; };

function GenerateModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const qc = useQueryClient(); const pm = prevMonth(); const [pid, setPid] = useState(projectId); const [s, setS] = useState(pm.s); const [e, setE] = useState(pm.e); const [err, setErr] = useState<string | null>(null);
  const m = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("generate_project_report", { p_project: pid, p_start: s, p_end: e, p_title: null, p_period_type: "monthly" }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); onClose(); }, onError: (x) => setErr(errMsg(x)) });
  return (
    <Modal open={open} title="Generate report" onClose={onClose}>
      <div className="mb-4"><label className="label">Project</label><ProjectSelect all={false} value={pid} onChange={setPid} /></div>
      <div className="grid grid-cols-2 gap-3"><LabeledInput label="From" type="date" value={s} onChange={(x) => setS(x.target.value)} /><LabeledInput label="To" type="date" value={e} onChange={(x) => setE(x.target.value)} /></div>
      <p className="text-xs text-slate-600">The report is a snapshot built from submitted and approved records in this period. Qualitative sections use approved observations only.</p>
      {err && <Alert tone="red">{err}</Alert>}<button className="btn-primary mt-3 w-full" disabled={!pid || m.isPending} onClick={() => { setErr(null); m.mutate(); }}>{m.isPending ? "Generating…" : "Generate"}</button>
    </Modal>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) { return <section className="card mb-4 p-4"><h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>{children}</section>; }
function Freq({ rows, empty }: { rows: { text: string; count: number }[]; empty: string }) { return rows?.length ? <ul className="space-y-1 text-sm">{rows.map((r) => <li key={r.text} className="flex gap-3"><span className="w-8 shrink-0 text-right font-semibold tabular-nums">{r.count}×</span><span className="capitalize-first">{r.text}</span></li>)}</ul> : <p className="text-sm text-slate-500">{empty}</p>; }

function ReportView({ r, onBack }: { r: ProjectReport; onBack: () => void }) {
  const a = useAuth(); const qc = useQueryClient(); const d = r.data_snapshot as any; const [nar, setNar] = useState(r.narrative ?? ""); const [msg, setMsg] = useState<{ t: "green" | "red"; m: string } | null>(null);
  const canEdit = a.can("reports.generate") && a.persona !== "viewer";
  const approve = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("approve_report", { p_id: r.id }); if (error) throw error; }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); onBack(); }, onError: (e) => setMsg({ t: "red", m: errMsg(e) }) });
  const saveNar = useMutation({ mutationFn: async () => { const { error } = await supabase.from("project_reports").update({ narrative: nar }).eq("id", r.id); if (error) throw error; }, onSuccess: () => { setMsg({ t: "green", m: "Narrative saved." }); qc.invalidateQueries({ queryKey: ["reports"] }); }, onError: (e) => setMsg({ t: "red", m: errMsg(e) }) });
  const ai = useMutation({ mutationFn: async () => { const { data, error } = await supabase.functions.invoke("report-narrative", { body: { report_id: r.id } }); if (error || data?.error) { let m = data?.error; try { m = m ?? (await (error as any).context.json()).error; } catch { /* */ } throw new Error(m ?? "AI summary failed"); } return data.narrative as string; }, onSuccess: (t) => { setNar(t); setMsg({ t: "green", m: "AI draft generated from the report data. Please review before approving." }); }, onError: (e) => setMsg({ t: "red", m: errMsg(e) }) });
  const exportCsv = () => downloadCsv("report.csv", [
    ["Schools", d.schools], ["Schools observed", d.schools_observed], ["Teachers", d.teachers], ["Teachers observed", d.teachers_observed], ["Facilitators", d.facilitators], ["Sessions", d.sessions],
    ["Observations total", d.observations?.total], ["Approved", d.observations?.approved], ["Queried", d.observations?.queried], ["Pending", d.observations?.pending],
    ["Documents slots", d.document_completeness?.slots], ["Documents missing", d.document_completeness?.missing], ["SAMR S", d.samr?.S], ["SAMR A", d.samr?.A], ["SAMR M", d.samr?.M], ["SAMR R", d.samr?.R],
  ].map(([metric, value]) => ({ metric, value })));
  const o = d.observations ?? {}; const dc = d.document_completeness ?? {};
  return (<>
    <PageHeader back={<button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 no-print"><ArrowLeft className="h-4 w-4" />Reports</button>} title={r.title}
      subtitle={`Period ${fmtDate(d.period?.start)} - ${fmtDate(d.period?.end)} · generated ${fmtDateTime(d.generated_at)}`}
      actions={<><Badge tone={r.status === "approved" ? "green" : "blue"}>{r.status}</Badge><button className="btn-secondary" onClick={exportCsv}><Download className="h-4 w-4" />CSV</button><button className="btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / PDF</button>
        {a.can("reports.approve") && a.hasRole("hod", "super_admin") && r.status !== "approved" && <button className="btn-success" disabled={approve.isPending} onClick={() => approve.mutate()}><CheckCircle2 className="h-4 w-4" />Approve</button>}</>} />
    <p className="mb-4 text-xs text-slate-500">{d.source_note}</p>
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Schools" value={d.schools} hint={`${d.schools_observed} observed`} /><Stat label="Teachers" value={d.teachers} hint={`${d.teachers_observed} observed`} /><Stat label="Facilitators" value={d.facilitators} /><Stat label="Field sessions" value={d.sessions} /></div>
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Observations" value={o.total ?? 0} /><Stat label="Approved" value={o.approved ?? 0} tone="green" /><Stat label="Queried" value={o.queried ?? 0} tone="amber" /><Stat label="Pending" value={o.pending ?? 0} /></div>
    <Block title="Documentation completeness"><p className="text-sm">{dc.percent == null ? "No required documents are configured." : <><strong>{dc.percent}%</strong> complete - {dc.missing} of {dc.slots} required document slots missing at generation time.</>}</p>
      {d.outstanding?.length > 0 && <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{d.outstanding.map((x: any) => <li key={x.kind + x.label}>{x.kind === "missing_document" ? `Missing ${x.label}` : x.kind.replace(/_/g, " ")}: <strong>{x.count}</strong></li>)}</ul>}</Block>
    <Block title="SAMR distribution (approved observations)"><div className="grid grid-cols-4 gap-2 text-center">{["S", "A", "M", "R"].map((k) => <div key={k} className="rounded-lg bg-slate-50 p-3"><div className="text-2xl font-bold text-brand">{d.samr?.[k] ?? 0}</div><div className="text-xs text-slate-600">{k}</div></div>)}</div></Block>
    <Block title="Technology tools used"><Freq rows={d.tools} empty="No tools recorded in approved observations." /></Block>
    <Block title="Common strengths (identical wording counted together)"><Freq rows={d.strengths} empty="No approved observations in this period." /></Block>
    <Block title="Development areas"><Freq rows={d.development_areas} empty="No approved observations in this period." /></Block>
    <Block title="Agreed actions">{d.agreed_actions?.length ? <ul className="space-y-2 text-sm">{d.agreed_actions.map((x: any, i: number) => <li key={i}><span className="text-xs text-slate-500">{fmtDate(x.date)} · {x.teacher ?? "-"} · {x.school ?? "-"}</span><br />{x.text}</li>)}</ul> : <p className="text-sm text-slate-500">None recorded.</p>}</Block>
    <Block title="Management narrative">
      {msg && <Alert tone={msg.t}>{msg.m}</Alert>}
      <LabeledText label="Narrative" value={nar} onChange={(e) => setNar(e.target.value)} disabled={!canEdit} hint="Written by a person, or drafted by AI from the data above and then reviewed. AI drafts never add numbers that aren't in the report." />
      {canEdit && (
        <div className="flex flex-wrap gap-2 no-print">
          <button className="btn-secondary" disabled={saveNar.isPending} onClick={() => saveNar.mutate()}>Save narrative</button>
          {AI_ENABLED && (
            <button className="btn-ghost" disabled={ai.isPending} onClick={() => { setMsg(null); ai.mutate(); }}>
              <Sparkles className="h-4 w-4" />{ai.isPending ? "Drafting…" : "Draft with AI"}
            </button>
          )}
        </div>
      )}
    </Block>
  </>);
}

export default function ReportsPage() {
  const a = useAuth(); const [sp, setSp] = useSearchParams(); const project = sp.get("project") ?? ""; const [open, setOpen] = useState<ProjectReport | null>(null); const [gen, setGen] = useState(false);
  const q = useQuery({ queryKey: ["reports", project], queryFn: async () => { let r = supabase.from("project_reports").select("*, project:projects(name)").order("created_at", { ascending: false }).limit(100); if (project) r = r.eq("project_id", project); const { data, error } = await r; if (error) throw error; return data as unknown as ProjectReport[]; } });
  if (open) return <ReportView r={open} onBack={() => setOpen(null)} />;
  const canGen = a.can("reports.generate");
  return (<>
    <PageHeader title="Reports" subtitle="Generated from approved and submitted records." actions={<>{canGen && <button className="btn-primary" onClick={() => setGen(true)}><Plus className="h-4 w-4" />Generate report</button>}</>} />
    <div className="mb-4 sm:w-64"><ProjectSelect value={project} onChange={(v) => setSp(v ? { project: v } : {})} /></div>
    {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="No reports yet" icon={<BookOpen className="h-6 w-6" />} text={canGen ? "Generate the first report for a project and period." : "Reports will appear here once a manager generates them."} />
      : <ul className="space-y-2">{q.data.map((r) => <li key={r.id}><button onClick={() => setOpen(r)} className="card flex w-full items-center justify-between gap-3 p-4 text-left hover:border-sky-600"><span><span className="font-semibold">{r.title}</span><span className="block text-xs text-slate-500">{r.project?.name} · {fmtDateTime(r.created_at)}</span></span><Badge tone={r.status === "approved" ? "green" : "blue"}>{r.status}</Badge></button></li>)}</ul>}
    <GenerateModal open={gen} onClose={() => setGen(false)} projectId={project} />
  </>);
}