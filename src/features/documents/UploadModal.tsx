import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, FileUp } from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { Alert, LabeledInput, LabeledSelect, Modal } from "@/components/ui";
import ProjectSelect from "@/components/ProjectSelect";
import { compressImage, uploadDocument, validateFile } from "@/lib/files";
import { DOC_ALLOWED_EXT } from "@/lib/constants";
import { fmtBytes } from "@/utils/format";
import type { DocumentType } from "@/types/db";

export default function UploadModal({ open, onClose, projectId, schoolId, teacherId, observationId }: { open: boolean; onClose: () => void; projectId?: string; schoolId?: string; teacherId?: string; observationId?: string }) {
  const qc = useQueryClient(); const [pid, setPid] = useState(projectId ?? ""); const [sid, setSid] = useState(schoolId ?? ""); const [tid, setTid] = useState(teacherId ?? "");
  const [typeId, setTypeId] = useState(""); const [title, setTitle] = useState(""); const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState<number | null>(null); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false);
  const ref = useRef<HTMLInputElement>(null); const cam = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setPid(projectId ?? ""); setSid(schoolId ?? ""); setTid(teacherId ?? ""); setFile(null); setTitle(""); setTypeId(""); setPct(null); setErr(null); setDone(false); } }, [open, projectId, schoolId, teacherId]);

  const types = useQuery({ queryKey: ["doc-types", pid], enabled: open, queryFn: async () => { const { data, error } = await supabase.from("document_types").select("*").or(`project_id.is.null${pid ? `,project_id.eq.${pid}` : ""}`).order("name"); if (error) throw error; return data as DocumentType[]; } });
  const schools = useQuery({ queryKey: ["project-schools", pid], enabled: open && !!pid, queryFn: async () => { const { data } = await supabase.from("project_schools").select("school:schools(id,name)").eq("project_id", pid).eq("is_active", true); return ((data ?? []) as any[]).map((r) => r.school as { id: string; name: string }).sort((a, b) => a.name.localeCompare(b.name)); } });
  const teachers = useQuery({ queryKey: ["project-teachers", pid, sid], enabled: open && !!pid && !!sid, queryFn: async () => { const { data } = await supabase.from("teachers").select("id,full_name, project_teachers!inner(project_id)").eq("project_teachers.project_id", pid).eq("school_id", sid).eq("is_active", true).order("full_name"); return (data ?? []) as unknown as { id: string; full_name: string }[]; } });
  const type = types.data?.find((t) => t.id === typeId);

  const pick = (f: File | null) => { setErr(null); if (!f) return setFile(null); const v = validateFile(f, type?.max_size_mb); if (v) { setErr(v); return; } setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, "")); };
  const submit = async () => {
    if (!file || !pid) return; setErr(null); setPct(0);
    try {
      const blob = await compressImage(file);
      await uploadDocument({ projectId: pid, file: blob, filename: file.name, mime: blob.type || file.type, title: title.trim() || file.name, typeId: typeId || null, schoolId: sid || null, teacherId: tid || null, observationId: observationId ?? null, onProgress: setPct });
      qc.invalidateQueries({ queryKey: ["documents"] }); qc.invalidateQueries({ queryKey: ["outstanding"] }); qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDone(true);
    } catch (e) { setErr(errMsg(e)); setPct(null); }
  };
  return (
    <Modal open={open} title="Upload document" onClose={onClose}>
      {done ? (<div className="text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden /><p className="mt-2 font-semibold">Uploaded successfully</p><p className="text-sm text-slate-600">It will appear as “Uploaded” until an administrator verifies it.</p><button className="btn-primary mt-4 w-full" onClick={onClose}>Done</button></div>) : (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {!projectId && <div className="mb-4"><label className="label">Project</label><ProjectSelect all={false} value={pid} onChange={(v) => { setPid(v); setSid(""); setTid(""); }} /></div>}
          <LabeledSelect label="Document type" required value={typeId} onChange={(e) => setTypeId(e.target.value)}><option value="">Select type…</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</LabeledSelect>
          {!observationId && <>
            <LabeledSelect label="School" value={sid} onChange={(e) => { setSid(e.target.value); setTid(""); }} disabled={!!schoolId}><option value="">(none)</option>{schools.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</LabeledSelect>
            {sid && <LabeledSelect label="Teacher" value={tid} onChange={(e) => setTid(e.target.value)} disabled={!!teacherId}><option value="">(none - school-level document)</option>{teachers.data?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</LabeledSelect>}</>}
          <LabeledInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" onClick={() => ref.current?.click()}><FileUp className="h-4 w-4" />Choose file</button>
            <button type="button" className="btn-secondary" onClick={() => cam.current?.click()}><Camera className="h-4 w-4" />Take photo</button>
          </div>
          <input ref={ref} type="file" hidden accept={DOC_ALLOWED_EXT.map((e) => "." + e).join(",")} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <input ref={cam} type="file" hidden accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {file && <div className="mb-3 rounded-lg border bg-slate-50 p-3 text-sm"><div className="font-medium">{file.name}</div><div className="text-xs text-slate-600">{file.type || "unknown type"} · {fmtBytes(file.size)}</div></div>}
          {pct !== null && <div aria-live="polite"><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-sky-600 transition-all" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-xs text-slate-600">Uploading… {pct}%</p></div>}
          {err && <Alert tone="red">{err}</Alert>}
          <button className="btn-primary mt-3 w-full" disabled={!file || !pid || !typeId || pct !== null}>{pct !== null ? "Uploading…" : "Upload"}</button>
        </form>)}
    </Modal>
  );
}
