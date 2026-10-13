import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Alert, LabeledInput, LabeledText, Spinner } from "@/components/ui";
import { validateFile } from "@/lib/files";
import { fmtBytes, fmtDate } from "@/utils/format";

interface Ctx { project: string | null; school: string | null; teacher: string | null; purpose: string | null; expires_at: string | null; allowed_types: string[]; max_mb: number }
async function errorOf(error: any, data: any, fallback: string) {
  if (data?.error) return data.error as string;
  try { const j = await error?.context?.json?.(); if (j?.error) return j.error as string; } catch { /* ignore */ }
  return fallback;
}

/** Public, isolated page. Shows only project/school/teacher names that the link creator chose to attach. */
export default function ExternalSubmit() {
  const { token = "" } = useParams(); const [ctx, setCtx] = useState<Ctx | null>(null); const [bad, setBad] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false);
  useEffect(() => { (async () => {
    const { data, error } = await supabase.functions.invoke("external-upload", { body: { action: "context", token } });
    if (error || data?.error) setBad(await errorOf(error, data, "This link is invalid, expired or no longer active.")); else setCtx(data as Ctx);
    setLoading(false);
  })(); }, [token]);
  const pick = (f: File | null) => { setErr(null); if (f) { const v = validateFile(f, ctx?.max_mb); if (v) { setErr(v); setFile(null); return; } } setFile(f); };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!file) return; setBusy(true); setErr(null);
    const fd = new FormData(); fd.append("action", "submit"); fd.append("token", token); fd.append("file", file); fd.append("name", name); fd.append("email", email); fd.append("comment", comment);
    const { data, error } = await supabase.functions.invoke("external-upload", { body: fd });
    setBusy(false);
    if (error || data?.error) setErr(await errorOf(error, data, "Upload failed. Please try again.")); else setDone(true);
  };
  return (
    <div className="grid min-h-screen place-items-center bg-brand-50 p-4">
      <main className="w-full max-w-md">
        <div className="mb-4 text-center"><div className="text-sm font-bold tracking-widest text-brand">ORT SA · STEM &amp; IT ACADEMY</div><div className="text-xs text-slate-600">Secure document submission</div></div>
        <div className="card p-6">
          {loading ? <Spinner /> : bad ? (<div className="text-center"><ShieldAlert className="mx-auto h-10 w-10 text-amber-600" aria-hidden /><p className="mt-2 font-semibold">Link unavailable</p><p className="mt-1 text-sm text-slate-600">{bad}</p><p className="mt-3 text-xs text-slate-500">Please contact the person who sent you this link for a new one.</p></div>
          ) : done ? (<div className="text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden /><p className="mt-3 text-lg font-semibold">Your document has been submitted successfully.</p><p className="mt-1 text-sm text-slate-600">Thank you. You can close this page.</p></div>
          ) : ctx && (
            <form onSubmit={submit}>
              <dl className="mb-4 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                {ctx.project && <div className="flex gap-2"><dt className="w-20 text-slate-500">Project</dt><dd className="font-medium">{ctx.project}</dd></div>}
                {ctx.school && <div className="flex gap-2"><dt className="w-20 text-slate-500">School</dt><dd className="font-medium">{ctx.school}</dd></div>}
                {ctx.teacher && <div className="flex gap-2"><dt className="w-20 text-slate-500">Teacher</dt><dd className="font-medium">{ctx.teacher}</dd></div>}
                {ctx.purpose && <div className="flex gap-2"><dt className="w-20 text-slate-500">Requested</dt><dd className="font-medium">{ctx.purpose}</dd></div>}
              </dl>
              <div className="mb-4"><label htmlFor="f" className="label">Document <span className="text-red-600">*</span></label>
                <input id="f" type="file" className="input py-2" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                <p className="mt-1 text-xs text-slate-500">PDF, image, Word or Excel · up to {ctx.max_mb} MB{file ? ` · ${file.name} (${fmtBytes(file.size)})` : ""}</p></div>
              <LabeledInput label="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
              <LabeledInput label="Email or phone (optional)" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
              <LabeledText label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
              {err && <Alert tone="red">{err}</Alert>}
              <button className="btn-primary mt-3 w-full" disabled={!file || busy}>{busy ? "Uploading…" : "Submit"}</button>
              {ctx.expires_at && <p className="mt-3 text-center text-xs text-slate-500">This link expires on {fmtDate(ctx.expires_at)}.</p>}
            </form>)}
        </div>
      </main>
    </div>
  );
}
