import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import ProjectSelect from "@/components/ProjectSelect";
import { EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from "@/components/ui";
import { AUDIT_LABELS } from "@/lib/constants";
import { downloadCsv } from "@/utils/csv";
import { fmtDateTime } from "@/utils/format";

const PAGE = 25;
export default function AuditPage() {
  const [page, setPage] = useState(0); const [project, setProject] = useState(""); const [action, setAction] = useState(""); const [from, setFrom] = useState("");
  const q = useQuery({ queryKey: ["audit", page, project, action, from], queryFn: async () => {
    let r = supabase.from("audit_logs").select("*, actor:profiles!audit_logs_actor_id_fkey(full_name), project:projects(name)", { count: "exact" }).order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (project) r = r.eq("project_id", project); if (action) r = r.like("action", `${action}%`); if (from) r = r.gte("created_at", from);
    const { data, count, error } = await r; if (error) throw error; return { rows: data as any[], count: count ?? 0 };
  } });
  const exp = () => downloadCsv("audit-log.csv", (q.data?.rows ?? []).map((r) => ({ when: r.created_at, who: r.actor?.full_name ?? "System", action: r.action, project: r.project?.name, entity: r.entity_type, entity_id: r.entity_id })));
  return (<>
    <PageHeader title="Audit trail" subtitle="Who did what, and when. Records cannot be edited or deleted." actions={<button className="btn-secondary" onClick={exp}><Download className="h-4 w-4" />Export CSV</button>} />
    <div className="mb-4 grid gap-2 sm:grid-cols-3"><ProjectSelect value={project} onChange={(v) => { setProject(v); setPage(0); }} />
      <select aria-label="Action type" className="input" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }}><option value="">All actions</option>{["observation", "document", "project_member", "report", "user", "school", "teacher", "external_upload_links"].map((a) => <option key={a}>{a}</option>)}</select>
      <input aria-label="From date" type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></div>
    {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data?.rows.length ? <EmptyState title="No audit events" /> : (<>
      <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Project</th></tr></thead>
        <tbody className="divide-y">{q.data.rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap px-4 py-2.5">{fmtDateTime(r.created_at)}</td><td className="px-4 py-2.5">{r.actor?.full_name ?? "System"}</td><td className="px-4 py-2.5">{AUDIT_LABELS[r.action] ?? r.action}</td><td className="px-4 py-2.5">{r.project?.name ?? "-"}</td></tr>)}</tbody></table></div>
      <Pagination page={page} pageSize={PAGE} total={q.data.count} onPage={setPage} /></>)}
  </>);
}
