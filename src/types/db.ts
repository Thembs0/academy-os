export type ObservationStatus = "draft" | "submitted" | "under_review" | "queried" | "resubmitted" | "approved" | "rejected" | "archived";
export type DocumentStatus = "uploaded" | "under_review" | "verified" | "queried" | "rejected" | "archived" | "superseded";
export type ProjectRole = "manager" | "coordinator" | "senior_facilitator" | "facilitator" | "senior_admin" | "admin" | "data_admin" | "me" | "intern" | "viewer";

export interface Profile { id: string; full_name: string; email: string | null; phone: string | null; job_title: string | null; employee_number: string | null; is_active: boolean; created_at: string }
export interface Project {
  id: string;
  name: string;
  project_code: string | null;
  description: string | null;
  status: "draft" | "active" | "paused" | "completed" | "archived";
  start_date: string | null;
  end_date: string | null;
  reporting_frequency: string | null;
  department_id: string;

  // Project classification (added by the project-type migration)
  project_type?: "school_based" | "venue_based" | "community_based" | "other" | null;
  session_frequency?: "daily" | "weekly" | "monthly" | "termly" | "custom" | null;
  sba_enabled?: boolean | null;
}
export interface ProjectMember { id: string; project_id: string; user_id: string; project_role: ProjectRole; start_date: string; end_date: string | null; is_active: boolean; profile?: Pick<Profile, "full_name" | "email"> | null; project?: Pick<Project, "id" | "name" | "project_code"> | null }
export interface School { id: string; name: string; school_code: string | null; province: string | null; district: string | null; municipality: string | null; address: string | null; contact_person: string | null; contact_phone: string | null; contact_email: string | null; is_active: boolean }
export interface Teacher { id: string; school_id: string; employee_or_teacher_number: string | null; full_name: string; email: string | null; phone: string | null; grade_levels: string[] | null; subjects: string[] | null; is_active: boolean; school?: Pick<School, "name"> | null }
export interface Observation {
  id: string; ref_no: number; project_id: string; form_template_id: string | null; facilitator_id: string; manager_id: string | null;
  school_id: string | null; teacher_id: string | null; observed_at: string | null; subject: string | null; grade: string | null; caps_topic: string | null;
  technology_tools: string | null; samr_level: "S" | "A" | "M" | "R" | null; learning_outcomes: string | null; evidence: string | null;
  strength_1: string | null; strength_2: string | null; strength_3: string | null; development_area: string | null; practical_suggestion: string | null;
  post_observation_conversation: string | null; agreed_action: string | null; next_observation_date: string | null;
  teacher_acknowledged: boolean; teacher_acknowledged_at: string | null; acknowledgement_method: string | null; acknowledgement_note: string | null;
  status: ObservationStatus; submitted_at: string | null; approved_at: string | null; approved_by: string | null; version: number;
  client_reference: string | null; created_at: string; updated_at: string;
  project?: { name: string } | null; school?: { name: string } | null; teacher?: { full_name: string } | null; facilitator?: { full_name: string } | null;
}
export interface DocumentType { id: string; project_id: string | null; name: string; allowed_extensions: string[] | null; max_size_mb: number; requires_verification: boolean }
export interface Notification { id: string; title: string; message: string; notification_type: string; entity_type: string | null; entity_id: string | null; is_read: boolean; created_at: string }
export interface OutstandingItem { kind: "missing_document" | "resubmission" | "awaiting_verification" | "overdue_action"; entity_type: string; entity_id: string; school_id: string | null; teacher_id: string | null; label: string; detail: string; due_date: string | null }
export interface HealthDim { score: number | null; detail: string }
export interface Health { overall: number | null; documentation: HealthDim; field_activity: HealthDim; data_completeness: HealthDim; approvals: HealthDim; reporting: HealthDim }
export interface ProjectCounts { schools: number; teachers: number; facilitators: number; administrators: number; observations_month: number; observations_total: number; pending: number; queried: number; approved: number; docs_awaiting: number; new_external: number; missing_documents: number; outstanding_total: number }
export interface ProjectReport { id: string; project_id: string; reporting_period_id: string | null; title: string; report_type: string; data_snapshot: Record<string, any>; narrative: string | null; status: string; approved_at: string | null; created_at: string; project?: { name: string } | null }
export interface QueryRow { id: string; query_text: string; status: string; created_at: string; manager_id: string; items: { id: string; item_text: string; is_resolved: boolean }[] }
export interface ExternalLink { id: string; project_id: string; school_id: string | null; teacher_id: string | null; label: string | null; purpose: string | null; expires_at: string | null; max_uses: number | null; use_count: number; is_active: boolean; created_at: string }
export interface DocumentRow {
  id: string;
  project_id: string | null;
  document_type_id: string | null;
  uploaded_by: string | null;
  school_id: string | null;
  teacher_id: string | null;
  observation_id: string | null;
  title: string;
  original_filename: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  checksum: string | null;
  status: DocumentStatus;
  verification_note: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  external_submission_id: string | null;

  // Deletion workflow
  deletion_status: "pending" | "approved" | "rejected" | null;
  deletion_requested_at: string | null;
  deletion_requested_by: string | null;
  deletion_reason: string | null;
  deletion_decided_at: string | null;
  deletion_decided_by: string | null;
  deletion_decision_note: string | null;

  // Joined / enriched fields
  project?: { name: string } | null;
  type?: { name: string; requires_verification: boolean | null } | null;
  uploader?: { full_name: string } | null;
  school?: { name: string } | null;
  teacher?: { full_name: string } | null;
}