import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { safeTerm, obsRef } from "@/utils/format";

export default function SearchPage() {
  const [sp] = useSearchParams(); const term = safeTerm(sp.get("q") ?? "");
  const q = useQuery({ queryKey: ["search", term], enabled: term.length >= 2, queryFn: async () => {
    const like = `%${term}%`; const n = 8;
    const [p, s, t, d, o, u] = await Promise.all([
      supabase.from("projects").select("id,name").ilike("name", like).limit(n),
      supabase.from("schools").select("id,name,district").or(`name.ilike.${like},school_code.ilike.${like},district.ilike.${like}`).limit(n),
      supabase.from("teachers").select("id,full_name,school:schools(name)").or(`full_name.ilike.${like},employee_or_teacher_number.ilike.${like}`).limit(n),
      supabase.from("documents").select("id,title,project:projects(name)").or(`title.ilike.${like},original_filename.ilike.${like}`).limit(n),
      supabase.from("observations").select("id,ref_no,subject,teacher:teachers(full_name)").or(`subject.ilike.${like},caps_topic.ilike.${like}`).neq("status", "draft").limit(n),
      supabase.from("profiles").select("id,full_name,email").or(`full_name.ilike.${like},email.ilike.${like}`).limit(n),
    ]);
    return { p: p.data ?? [], s: s.data ?? [], t: (t.data ?? []) as any[], d: (d.data ?? []) as any[], o: (o.data ?? []) as any[], u: u.data ?? [] };
  } });
  const none = q.data && Object.values(q.data).every((a) => !a.length);
  const G = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="mb-5"><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2><ul className="space-y-1">{children}</ul></section>;
  const L = ({ to, a, b }: { to: string; a: string; b?: string | null }) => <li><Link to={to} className="card block p-3 hover:border-sky-600"><span className="font-medium">{a}</span>{b && <span className="block text-xs text-slate-500">{b}</span>}</Link></li>;
  return (<>
    <PageHeader title={`Search: “${sp.get("q") ?? ""}”`} subtitle="Only records you are permitted to see are searched." />
    {term.length < 2 ? <EmptyState title="Type at least 2 characters" /> : q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : none ? <EmptyState title="No results" text="Try a different spelling or fewer words." /> : q.data && (<>
      {q.data.p.length > 0 && <G title="Projects">{q.data.p.map((x: any) => <L key={x.id} to={`/projects/${x.id}`} a={x.name} />)}</G>}
      {q.data.s.length > 0 && <G title="Schools">{q.data.s.map((x: any) => <L key={x.id} to={`/schools/${x.id}`} a={x.name} b={x.district} />)}</G>}
      {q.data.t.length > 0 && <G title="Teachers">{q.data.t.map((x) => <L key={x.id} to={`/teachers/${x.id}`} a={x.full_name} b={x.school?.name} />)}</G>}
      {q.data.o.length > 0 && <G title="Observations">{q.data.o.map((x) => <L key={x.id} to={`/observations/${x.id}`} a={`${obsRef(x.ref_no)} · ${x.subject ?? ""}`} b={x.teacher?.full_name} />)}</G>}
      {q.data.d.length > 0 && <G title="Documents">{q.data.d.map((x) => <L key={x.id} to={`/documents?focus=${x.id}`} a={x.title} b={x.project?.name} />)}</G>}
      {q.data.u.length > 0 && <G title="People">{q.data.u.map((x: any) => <L key={x.id} to="#" a={x.full_name} b={x.email} />)}</G>}</>)}
  </>);
}
