import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useProjects } from "@/hooks";
import ProjectSelect from "@/components/ProjectSelect";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { fmtDate } from "@/utils/format";
import type { OutstandingItem } from "@/types/db";

const KIND_TITLE: Record<string, (l: string) => string> = {
  missing_document: (l) => `Missing: ${l}`, resubmission: () => "Observations needing resubmission",
  awaiting_verification: () => "Documents awaiting verification", overdue_action: () => "Overdue follow-up observations",
};
function target(i: OutstandingItem): string {
  if (i.kind === "missing_document") return i.teacher_id ? `/teachers/${i.teacher_id}` : i.school_id ? `/schools/${i.school_id}` : "/documents";
  if (i.kind === "awaiting_verification") return `/documents?focus=${i.entity_id}`;
  return `/observations/${i.entity_id}`;
}

export function OutstandingPanel({ projectId }: { projectId?: string }) {
  const projects = useProjects(); const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["outstanding", projectId, projects.data?.map((p) => p.id).join()], enabled: !!projectId || !!projects.data,
    queryFn: async () => {
      const ids = projectId ? [projectId] : projects.data!.map((p) => p.id);
      const res = await Promise.all(ids.map(async (id) => { const { data, error } = await supabase.rpc("outstanding_items", { p_project: id }); if (error) throw error; return ((data ?? []) as OutstandingItem[]).map((x) => ({ ...x, project_id: id })); }));
      return res.flat() as (OutstandingItem & { project_id: string })[];
    },
  });
  if (q.isLoading || projects.isLoading) return <Skeleton rows={3} />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const groups = new Map<string, (OutstandingItem & { project_id: string })[]>();
  for (const i of q.data ?? []) { const k = `${i.kind}|${i.kind === "missing_document" ? i.label : ""}`; groups.set(k, [...(groups.get(k) ?? []), i]); }
  if (!groups.size) return <EmptyState title="Nothing outstanding" text="All required documents are in and no follow-ups are overdue." icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />} />;
  const order = ["missing_document", "resubmission", "awaiting_verification", "overdue_action"];
  const entries = [...groups.entries()].sort((a, b) => order.indexOf(a[0].split("|")[0]) - order.indexOf(b[0].split("|")[0]));
  const pname = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? "";
  return (
    <ul className="space-y-3">{entries.map(([key, items]) => {
      const [kind, label] = key.split("|"); const isOpen = open === key;
      return (
        <li key={key} className="card">
          <button className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
            {isOpen ? <ChevronDown className="h-5 w-5" aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}
            <span className="flex-1 font-semibold uppercase tracking-wide">{KIND_TITLE[kind](label)}</span>
            <span className="rounded-full bg-amber-100 px-3 py-0.5 text-sm font-bold text-amber-900">{items.length}</span>
          </button>
          {isOpen && <ul className="divide-y border-t">{items.slice(0, 200).map((i) => (
            <li key={i.entity_id + i.label}><Link to={target(i)} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50">
              <span><span className="font-medium">{kind === "missing_document" ? i.detail : i.label}</span><span className="block text-xs text-slate-500">{kind === "missing_document" ? "" : i.detail}{!projectId && ` ${pname(i.project_id)}`}{i.due_date ? ` · was due ${fmtDate(i.due_date)}` : ""}</span></span>
              <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden /></Link></li>))}</ul>}
        </li>);
    })}</ul>
  );
}

export default function OutstandingPage() {
  const [sp, setSp] = useSearchParams(); const project = sp.get("project") ?? "";
  return (<><PageHeader title="Outstanding items" subtitle="Tap a group to see the exact records that need action." actions={<div className="w-56"><ProjectSelect value={project} onChange={(v) => setSp(v ? { project: v } : {})} /></div>} /><OutstandingPanel projectId={project || undefined} /></>);
}
