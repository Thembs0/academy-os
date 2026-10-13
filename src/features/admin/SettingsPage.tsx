import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, errMsg } from "@/lib/supabase/client";
import { Alert, ErrorState, LabeledInput, PageHeader, Skeleton } from "@/components/ui";

export default function SettingsPage() {
  const qc = useQueryClient(); const [msg, setMsg] = useState<{ t: "green" | "red"; m: string } | null>(null); const [edits, setEdits] = useState<Record<string, string>>({}); const [org, setOrg] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["settings"], queryFn: async () => { const [s, o] = await Promise.all([supabase.from("system_settings").select("*").order("key"), supabase.from("organizations").select("*").limit(1).single()]); if (s.error) throw s.error; return { settings: s.data!, org: o.data }; } });
  const save = useMutation({ mutationFn: async () => {
    for (const [k, v] of Object.entries(edits)) { let val: unknown = v; try { val = JSON.parse(v); } catch { /* keep string */ } const { error } = await supabase.from("system_settings").update({ value: val as any, updated_at: new Date().toISOString() }).eq("key", k); if (error) throw error; }
    if (org !== null && q.data?.org) { const { error } = await supabase.from("organizations").update({ name: org }).eq("id", q.data.org.id); if (error) throw error; }
  }, onSuccess: () => { setMsg({ t: "green", m: "Settings saved." }); setEdits({}); qc.invalidateQueries({ queryKey: ["settings"] }); }, onError: (e) => setMsg({ t: "red", m: errMsg(e) }) });
  if (q.isLoading) return <Skeleton />; if (q.error || !q.data) return <ErrorState error={q.error} />;
  return (<>
    <PageHeader title="Settings" />{msg && <div className="mb-4"><Alert tone={msg.t}>{msg.m}</Alert></div>}
    <section className="card mb-5 p-4"><h2 className="mb-3 font-semibold">Organisation</h2><LabeledInput label="Organisation name" value={org ?? q.data.org?.name ?? ""} onChange={(e) => setOrg(e.target.value)} /></section>
    <section className="card p-4"><h2 className="mb-1 font-semibold">System settings</h2><p className="mb-3 text-xs text-slate-600">Retention values are recorded policy; purging old data is a deliberate administrator task and is never automatic.</p>
      {q.data.settings.map((s: any) => <LabeledInput key={s.key} label={s.key} hint={s.description} value={edits[s.key] ?? JSON.stringify(s.value)} onChange={(e) => setEdits({ ...edits, [s.key]: e.target.value })} />)}
      <button className="btn-primary" disabled={save.isPending || (!Object.keys(edits).length && org === null)} onClick={() => { setMsg(null); save.mutate(); }}>Save settings</button></section>
  </>);
}
