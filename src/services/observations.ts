import { supabase } from "@/lib/supabase/client";
import type { LocalDraft, ObsFormData } from "@/lib/offline";
import { deleteLocalDraft, listLocalDrafts, saveLocalDraft } from "@/lib/offline";
import { uploadDocument } from "@/lib/files";
import type { Observation } from "@/types/db";

export const OBS_SELECT =
  "*, project:projects(name), school:schools(name), teacher:teachers(full_name), facilitator:profiles!observations_facilitator_id_fkey(full_name)";

const CORE_KEYS = [
  "school_id", "teacher_id", "observed_at", "subject", "grade", "caps_topic",
  "technology_tools", "samr_level", "learning_outcomes", "evidence",
  "strength_1", "strength_2", "strength_3", "development_area", "practical_suggestion",
  "post_observation_conversation", "agreed_action", "next_observation_date",
  "teacher_acknowledged", "acknowledgement_method", "acknowledgement_note",
] as const;

export function toRow(d: ObsFormData) {
  const row: Record<string, unknown> = {};
  for (const k of CORE_KEYS) {
    const v = (d as any)[k];
    row[k] = v === "" ? null : v;
  }
  row.teacher_acknowledged_at = d.teacher_acknowledged ? new Date().toISOString() : null;
  return row;
}

export function fromRow(o: Observation): ObsFormData {
  return {
    school_id: o.school_id,
    teacher_id: o.teacher_id,
    observed_at: o.observed_at,
    subject: o.subject ?? "",
    grade: o.grade ?? "",
    caps_topic: o.caps_topic ?? "",
    technology_tools: o.technology_tools ?? "",
    samr_level: o.samr_level,
    learning_outcomes: o.learning_outcomes ?? "",
    evidence: o.evidence ?? "",
    strength_1: o.strength_1 ?? "",
    strength_2: o.strength_2 ?? "",
    strength_3: o.strength_3 ?? "",
    development_area: o.development_area ?? "",
    practical_suggestion: o.practical_suggestion ?? "",
    post_observation_conversation: o.post_observation_conversation ?? "",
    agreed_action: o.agreed_action ?? "",
    next_observation_date: o.next_observation_date,
    teacher_acknowledged: o.teacher_acknowledged,
    acknowledgement_method: o.acknowledgement_method,
    acknowledgement_note: o.acknowledgement_note ?? "",
    extra: {},
  };
}

let typeCache: Record<string, string> | null = null;
export async function documentTypeIds(): Promise<Record<string, string>> {
  if (typeCache) return typeCache!;
  const { data } = await supabase
    .from("document_types")
    .select("id,name")
    .is("project_id", null);
  typeCache = Object.fromEntries((data ?? []).map((t: any) => [t.name, t.id]));
  return typeCache!;
}

/**
 * Returns the single active observation template for a project, or null.
 * Deterministic - never returns more than one, always prefers the highest version.
 */
async function getActiveObservationTemplate(projectId: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("form_templates")
    .select("id")
    .eq("project_id", projectId)
    .eq("form_type", "observation")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Fetch the field definitions for the active observation template of a project.
 * Returns an empty array if there is no active template.
 */
export async function getActiveTemplateFields(projectId: string) {
  const tpl = await getActiveObservationTemplate(projectId);
  if (!tpl) return [] as { field_key: string; label: string; field_type: string; help_text: string | null; is_required: boolean; options: any; sort_order: number; section_name: string | null }[];

  const { data, error } = await supabase
    .from("form_fields")
    .select("field_key,label,field_type,help_text,is_required,options,sort_order,section_name")
    .eq("form_template_id", tpl.id)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as any[];
}

/** Make sure the draft exists on the server; returns its id. Never touches workflow fields. */
export async function pushObservation(d: LocalDraft): Promise<{ id: string; locked: boolean }> {
  const { data: existing } = await supabase
    .from("observations")
    .select("id,status")
    .eq("facilitator_id", d.userId)
    .eq("client_reference", d.clientRef)
    .maybeSingle();

  if (existing) {
    if (!["draft", "queried"].includes(existing.status)) return { id: existing.id, locked: true };
    const { error } = await supabase.from("observations").update(toRow(d.data)).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { id: existing.id, locked: false };
  }

  const tpl = await getActiveObservationTemplate(d.projectId);

  const { data, error } = await supabase
    .from("observations")
    .insert({
      ...toRow(d.data),
      project_id: d.projectId,
      facilitator_id: d.userId,
      client_reference: d.clientRef,
      status: "draft",
      form_template_id: tpl?.id ?? null,
      offline_created_at: new Date(d.updatedAt).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, locked: false };
}

/**
 * Persist the extra answers for an observation.
 * Only answers whose field_key belongs to the active observation template are written.
 * Fields from other templates, or from inactive templates, are dropped silently - which
 * is correct: they do not belong to this project's current form.
 */
export async function pushExtraAnswers(
  observationId: string,
  projectId: string,
  extra: Record<string, string>
): Promise<void> {
  const keysArr = Object.keys(extra);
  if (!keysArr.length) return;

  const tpl = await getActiveObservationTemplate(projectId);
  if (!tpl) return;

  const { data: fields, error: fieldsErr } = await supabase
    .from("form_fields")
    .select("field_key")
    .eq("form_template_id", tpl.id)
    .in("field_key", keysArr);
  if (fieldsErr) throw fieldsErr;

  const rows = ((fields ?? []) as any[]).map((f) => ({
    observation_id: observationId,
    form_template_id: tpl.id,
    field_key: f.field_key,
    answer_text: extra[f.field_key] ?? null,
  }));

  if (!rows.length) return;

  const { error } = await supabase
    .from("observation_answers")
    .upsert(rows, { onConflict: "observation_id,form_template_id,field_key" });
  if (error) throw new Error(error.message);
}

/** Full sync of one local draft: observation row -> evidence files -> optional submit. */
export async function syncDraft(
  d: LocalDraft,
  onProgress?: (fileId: string, pct: number) => void
): Promise<"synced" | "submitted" | "locked"> {
  const { id, locked } = await pushObservation(d);
  if (locked) {
    await deleteLocalDraft(d.clientRef);
    return "locked";
  }
  d.serverId = id;
  await pushExtraAnswers(id, d.projectId, d.data.extra);

  const types = await documentTypeIds();
  for (const f of d.files) {
    if (f.uploadedDocId) continue;
    f.uploadedDocId = await uploadDocument({
      projectId: d.projectId,
      file: f.blob,
      filename: f.name,
      mime: f.type,
      title: f.name,
      typeId: types[f.docTypeName] ?? null,
      schoolId: d.data.school_id,
      teacherId: d.data.teacher_id,
      observationId: id,
      onProgress: (p) => onProgress?.(f.id, p),
    });
    await saveLocalDraft({ ...d, dirty: true });
  }

  if (d.submitRequested) {
    const { error } = await supabase.rpc("submit_observation", { p_id: id });
    if (error) throw new Error(error.message);
    await deleteLocalDraft(d.clientRef);
    return "submitted";
  }

  await saveLocalDraft({ ...d, dirty: false, lastError: undefined });
  return "synced";
}

export async function pendingLocalCount(userId: string) {
  return (await listLocalDrafts(userId)).filter((d) => d.dirty || d.submitRequested).length;
}
/** Returns the id of the active observation template for a project, or null. */
export async function getActiveTemplateId(projectId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("form_templates")
    .select("id")
    .eq("project_id", projectId)
    .eq("form_type", "observation")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}