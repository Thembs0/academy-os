import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import ProjectSelect from "@/components/ProjectSelect";
import { PageHeader } from "@/components/ui";
import { DOC_STATUS } from "@/lib/constants";
import { useDebounce } from "@/hooks";
import { DocList } from "./DocList";
import UploadModal from "./UploadModal";
import { downloadCsv } from "@/utils/csv";
import type { DocumentType } from "@/types/db";

export default function DocumentsPage() {
  const a = useAuth(); const [sp, setSp] = useSearchParams(); const [term, setTerm] = useState(""); const dq = useDebounce(term); const [up, setUp] = useState(false);
  const project = sp.get("project") ?? ""; const status = sp.get("status") ?? ""; const type = sp.get("type") ?? "";
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n); };
  const types = useQuery({ queryKey: ["doc-types-all"], queryFn: async () => (await supabase.from("document_types").select("id,name").is("project_id", null).order("name")).data as DocumentType[] });
  const exportCsv = async () => {
    let r = supabase.from("documents").select("title,original_filename,status,created_at,project:projects(name),type:document_types(name),school:schools(name),teacher:teachers(full_name)").order("created_at", { ascending: false }).limit(5000);
    if (project) r = r.eq("project_id", project); if (status) r = r.eq("status", status);
    const { data } = await r; downloadCsv("documents.csv", ((data ?? []) as any[]).map((d) => ({ title: d.title, file: d.original_filename, type: d.type?.name, status: d.status, project: d.project?.name, school: d.school?.name, teacher: d.teacher?.full_name, uploaded: d.created_at })));
  };
  return (
    <>
      <PageHeader title="Documents" subtitle="Structured by project, school, teacher and type." actions={<>{a.persona !== "facilitator" && <button className="btn-secondary" onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</button>}{a.can("documents.upload") && <button className="btn-primary" onClick={() => setUp(true)}>Upload document</button>}</>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <div className="relative sm:col-span-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden /><input className="input pl-9" placeholder="Search title or file" aria-label="Search documents" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
        <ProjectSelect value={project} onChange={(v) => set("project", v)} />
        <select aria-label="Document type" className="input" value={type} onChange={(e) => set("type", e.target.value)}><option value="">All types</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select aria-label="Status" className="input" value={status} onChange={(e) => set("status", e.target.value)}><option value="">All statuses</option>{Object.entries(DOC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      </div>
      <DocList filter={{ project_id: project, status, document_type_id: type }} term={dq} projectId={undefined} showUpload={false} pageSize={15} />
      <UploadModal open={up} onClose={() => setUp(false)} projectId={project || undefined} />
    </>
  );
}
