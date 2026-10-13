import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { Alert, LabeledInput, LabeledSelect, Modal } from "@/components/ui";

export function LinkModal({ open, onClose, projectId, schoolId, teacherId }: { open: boolean; onClose: () => void; projectId: string; schoolId?: string; teacherId?: string }) {
  const qc = useQueryClient(); const [purpose, setPurpose] = useState("Teacher ID"); const [days, setDays] = useState(14); const [uses, setUses] = useState(3);
  const [sid, setSid] = useState(schoolId ?? ""); const [tid, setTid] = useState(teacherId ?? ""); const [url, setUrl] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) { setUrl(null); setErr(null); setCopied(false); setSid(schoolId ?? ""); setTid(teacherId ?? ""); } }, [open, schoolId, teacherId]);
  const types = useQuery({ queryKey: ["doc-types-all"], queryFn: async () => (await supabase.from("document_types").select("id,name").is("project_id", null).order("name")).data as { id: string; name: string }[] });
  const schools = useQuery({ queryKey: ["project-schools", projectId], enabled: open && !schoolId, queryFn: async () => { const { data } = await supabase.from("project_schools").select("school:schools(id,name)").eq("project_id", projectId).eq("is_active", true); return ((data ?? []) as any[]).map((r) => r.school as { id: string; name: string }); } });
  const teachers = useQuery({ queryKey: ["project-teachers", projectId, sid], enabled: open && !teacherId && !!sid, queryFn: async () => { const { data } = await supabase.from("teachers").select("id,full_name, project_teachers!inner(project_id)").eq("project_teachers.project_id", projectId).eq("school_id", sid).order("full_name"); return (data ?? []) as unknown as { id: string; full_name: string }[]; } });
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_external_upload_link", { p_project: projectId, p_school: sid || null, p_teacher: tid || null, p_label: null, p_purpose: purpose, p_days: days, p_max_uses: uses });
      if (error) throw error; return data as { id: string; token: string };
    },
    onSuccess: (r) => { setUrl(`${window.location.origin}/submit/${r.token}`); qc.invalidateQueries({ queryKey: ["ext-links"] }); }, onError: (e) => setErr(errMsg(e)),
  });
  const copy = async () => { if (!url) return; await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); };
  return (
    <Modal open={open} title="Create secure upload link" onClose={onClose}>
      {url ? (
        <div>
          <Alert tone="amber">Copy this link now - for security it cannot be shown again. Send it to the teacher by WhatsApp or email.</Alert>
          <input readOnly className="input mt-3 text-xs" value={url} aria-label="Upload link" onFocus={(e) => e.target.select()} />
          <button className="btn-primary mt-3 w-full" onClick={copy}>{copied ? <><Check className="h-4 w-4" />Copied</> : <><Copy className="h-4 w-4" />Copy link</>}</button>
          <p className="mt-2 text-xs text-slate-600">Expires in {days} day(s), usable {uses} time(s). You can revoke it any time.</p>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <LabeledSelect label="Document requested" value={purpose} onChange={(e) => setPurpose(e.target.value)}>{types.data?.map((t) => <option key={t.id}>{t.name}</option>)}</LabeledSelect>
          {!schoolId && <LabeledSelect label="School" value={sid} onChange={(e) => { setSid(e.target.value); setTid(""); }}><option value="">(any)</option>{schools.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</LabeledSelect>}
          {!teacherId && sid && <LabeledSelect label="Teacher" value={tid} onChange={(e) => setTid(e.target.value)}><option value="">(not specific)</option>{teachers.data?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</LabeledSelect>}
          <div className="grid grid-cols-2 gap-3"><LabeledInput label="Valid for (days)" type="number" min={1} max={90} value={days} onChange={(e) => setDays(+e.target.value)} /><LabeledInput label="Max uploads" type="number" min={1} max={50} value={uses} onChange={(e) => setUses(+e.target.value)} /></div>
          {err && <Alert tone="red">{err}</Alert>}
          <button className="btn-primary mt-3 w-full" disabled={m.isPending}>{m.isPending ? "Creating…" : "Create link"}</button>
        </form>)}
    </Modal>
  );
}
