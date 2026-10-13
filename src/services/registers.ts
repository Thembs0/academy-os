import { supabase } from "@/lib/supabase/client";

export type RegisterType = "sba_learners" | "teacher_session" | "ordinary";
export type RosterSide = "teacher" | "learner";
export type EntryStatus = "present" | "late" | "absent";
export type SessionMode = "in_person" | "online";

export interface TeacherRoster {
  id: string;
  project_id: string;
  school_id: string | null;
  full_name: string;
  id_number: string | null;
  phone: string | null;
  email: string | null;
  subjects: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface LearnerRoster {
  id: string;
  project_id: string;
  school_id: string | null;
  full_name: string;
  id_number: string | null;
  phone: string | null;
  email: string | null;
  grade: string | null;
  category: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface Register {
  id: string;
  project_id: string;
  school_id: string | null;
  register_type: RegisterType;
  roster_side: RosterSide;
  session_mode: SessionMode;
  external_token: string | null;
  external_is_open: boolean;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  topic: string | null;
  notes: string | null;
  facilitator_id: string;
  evidence_document_id: string | null;
  status: "draft" | "submitted" | "verified" | "queried";
  created_at: string;
  school?: { name: string } | null;
  project?: { name: string } | null;
  facilitator?: { full_name: string } | null;
  deletion_status: "pending" | "approved" | "rejected" | null;
  deletion_requested_at: string | null;
  deletion_requested_by: string | null;
  deletion_reason: string | null;
  deletion_decision_note: string | null;
evidence_requested_at: string | null;
  evidence_requested_by: string | null;
  evidence_request_note: string | null;
}


export interface RegisterEntry {
  id: string;
  register_id: string;
  roster_entry_id: string;
  roster_side: RosterSide;
  status: EntryStatus;
  absence_reason: string | null;
  absence_document_id: string | null;
}

export interface EvidenceDoc {
  id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string | null;
  title: string | null;
}

export interface ExternalSignin {
  id: string;
  register_id: string;
  full_name: string;
  phone: string | null;
  note: string | null;
  signed_in_at: string;
}

/* ── Register type helpers ───────────────────────────────────────── */

export function registerTypesForProject(p: {
  project_type?: string | null;
  sba_enabled?: boolean | null;
}): RegisterType[] {
  const isSchoolBased = (p.project_type ?? "school_based") === "school_based";
  const hasSba = !!p.sba_enabled;
  const out: RegisterType[] = [];
  if (isSchoolBased) {
    out.push("teacher_session");
    if (hasSba) out.push("sba_learners");
  } else {
    out.push("ordinary");
  }
  return out;
}

export function registerTypeLabel(t: RegisterType): string {
  switch (t) {
    case "sba_learners":    return "SBA register (learners)";
    case "teacher_session": return "Teacher session register";
    case "ordinary":        return "Attendance register";
  }
}

export function rosterSideFor(t: RegisterType): RosterSide {
  return t === "teacher_session" ? "teacher" : "learner";
}

/* ── Rosters ─────────────────────────────────────────────────────── */

export async function listTeacherRoster(projectId: string, schoolId?: string | null) {
  let q = supabase
    .from("teacher_rosters")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("full_name");
  if (schoolId) q = q.eq("school_id", schoolId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TeacherRoster[];
}

export async function listLearnerRoster(projectId: string, schoolId?: string | null) {
  let q = supabase
    .from("learner_rosters")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("full_name");
  if (schoolId) q = q.eq("school_id", schoolId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LearnerRoster[];
}

export async function upsertTeacherRoster(
  row: Partial<TeacherRoster> & { project_id: string; full_name: string }
) {
  const { data, error } = await supabase
    .from("teacher_rosters")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data as TeacherRoster;
}

export async function upsertLearnerRoster(
  row: Partial<LearnerRoster> & { project_id: string; full_name: string }
) {
  const { data, error } = await supabase
    .from("learner_rosters")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data as LearnerRoster;
}

export async function deleteRosterEntry(side: RosterSide, id: string) {
  const table = side === "teacher" ? "teacher_rosters" : "learner_rosters";
  const { error } = await supabase.from(table).update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

/* ── Registers ───────────────────────────────────────────────────── */

export const REGISTER_SELECT = "*, school:schools(name), project:projects(name)";

async function attachFacilitatorNames(rows: Register[]): Promise<Register[]> {
  if (!rows.length) return rows;
  const ids = [...new Set(rows.map((r) => r.facilitator_id).filter(Boolean))];
  if (!ids.length) return rows;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((p: any) => [p.id, p.full_name as string]));
  return rows.map((r) => ({
    ...r,
    facilitator: { full_name: byId.get(r.facilitator_id) ?? "Unknown" },
  }));
}

export async function listRegisters(opts: {
  projectId?: string;
  facilitatorId?: string;
  fromDate?: string;
  toDate?: string;
  type?: RegisterType;
  limit?: number;
}) {
  let q = supabase
    .from("registers")
    .select(REGISTER_SELECT)
    .or("deletion_status.is.null,deletion_status.neq.approved")
    .order("session_date", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (opts.facilitatorId) q = q.eq("facilitator_id", opts.facilitatorId);
  if (opts.type) q = q.eq("register_type", opts.type);
  if (opts.fromDate) q = q.gte("session_date", opts.fromDate);
  if (opts.toDate) q = q.lte("session_date", opts.toDate);
  const { data, error } = await q;
  if (error) throw error;
  return attachFacilitatorNames((data ?? []) as unknown as Register[]);
}

export async function getRegister(id: string) {
  const { data, error } = await supabase
    .from("registers")
    .select(REGISTER_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  const [withName] = await attachFacilitatorNames([data as unknown as Register]);
  return withName;
}

export async function getRegisterEntries(registerId: string) {
  const { data, error } = await supabase
    .from("register_entries")
    .select("*")
    .eq("register_id", registerId);
  if (error) throw error;
  return (data ?? []) as RegisterEntry[];
}

export async function rosterByIds(side: RosterSide, ids: string[]) {
  if (!ids.length) return [] as (TeacherRoster | LearnerRoster)[];
  const table = side === "teacher" ? "teacher_rosters" : "learner_rosters";
  const { data, error } = await supabase.from(table).select("*").in("id", ids);
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function getEvidenceDocument(docId: string): Promise<EvidenceDoc | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, storage_bucket, storage_path, original_filename, mime_type, title")
    .eq("id", docId)
    .maybeSingle();
  if (error) throw error;
  return (data as EvidenceDoc) ?? null;
}

/* ── External link ──────────────────────────────────────────────── */

export async function setRegisterExternalLink(registerId: string, open: boolean) {
  const { data, error } = await supabase.rpc("set_register_external_link", {
    p_register: registerId,
    p_open: open,
  });
  if (error) throw error;
  return data as string;
}

export async function listExternalSignins(registerId: string) {
  const { data, error } = await supabase
    .from("register_external_signins")
    .select("*")
    .eq("register_id", registerId)
    .order("signed_in_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ExternalSignin[];
}

export function externalSigninUrl(token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/signin/${token}`;
}

/* ── Submit register ────────────────────────────────────────────── */

export async function submitRegister(payload: {
  projectId: string;
  schoolId: string | null;
  registerType: RegisterType;
  rosterSide: RosterSide;
  sessionMode: SessionMode;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  topic: string | null;
  notes: string | null;
  evidenceDocumentId: string | null;
  entries: {
    roster_entry_id: string;
    status: EntryStatus;
    absence_reason?: string | null;
    absence_document_id?: string | null;
  }[];
}) {
  const { data, error } = await supabase.rpc("submit_register", {
    p_project: payload.projectId,
    p_school: payload.schoolId,
    p_register_type: payload.registerType,
    p_roster_side: payload.rosterSide,
    p_session_mode: payload.sessionMode,
    p_session_date: payload.sessionDate,
    p_start_time: payload.startTime,
    p_end_time: payload.endTime,
    p_topic: payload.topic,
    p_notes: payload.notes,
    p_evidence_document: payload.evidenceDocumentId,
    p_entries: payload.entries,
  });
  if (error) throw error;
  return data as string;
}
export async function requestRegisterDeletion(registerId: string, reason: string) {
  const { error } = await supabase.rpc("request_register_deletion", {
    p_register: registerId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function cancelRegisterDeletion(registerId: string) {
  const { error } = await supabase.rpc("cancel_register_deletion", {
    p_register: registerId,
  });
  if (error) throw error;
}

export async function decideRegisterDeletion(registerId: string, approve: boolean, note: string | null) {
  const { error } = await supabase.rpc("decide_register_deletion", {
    p_register: registerId,
    p_approve: approve,
    p_note: note,
  });
  if (error) throw error;
}
export async function requestRegisterEvidence(registerId: string, note: string) {
  const { error } = await supabase.rpc("request_register_evidence", {
    p_register: registerId,
    p_note: note,
  });
  if (error) throw error;
}

export async function attachRegisterEvidence(registerId: string, documentId: string) {
  const { error } = await supabase.rpc("attach_register_evidence", {
    p_register: registerId,
    p_document: documentId,
  });
  if (error) throw error;
}
export async function reuploadRegisterEvidence(registerId: string, documentId: string) {
  const { error } = await supabase.rpc("reupload_register_evidence", {
    p_register: registerId,
    p_document: documentId,
  });
  if (error) throw error;
}
