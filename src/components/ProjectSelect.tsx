import { useProjects } from "@/hooks";

export default function ProjectSelect({ value, onChange, all = true, label = "Project", className = "" }: { value: string; onChange: (v: string) => void; all?: boolean; label?: string; className?: string }) {
  const { data } = useProjects();
  return (
    <select aria-label={label} className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {all && <option value="">All projects</option>}
      {!all && <option value="" disabled>Select project…</option>}
      {data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}
