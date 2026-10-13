import type { DocumentStatus, ObservationStatus, ProjectRole } from "@/types/db";

export type Tone = "slate" | "blue" | "green" | "amber" | "red";
export const OBS_STATUS: Record<ObservationStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "slate" }, submitted: { label: "Submitted", tone: "blue" }, under_review: { label: "Under review", tone: "blue" },
  queried: { label: "Queried", tone: "amber" }, resubmitted: { label: "Resubmitted", tone: "blue" }, approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" }, archived: { label: "Archived", tone: "slate" },
};
export const DOC_STATUS: Record<DocumentStatus, { label: string; tone: Tone }> = {
  uploaded: { label: "Uploaded", tone: "blue" }, under_review: { label: "Under review", tone: "blue" }, verified: { label: "Verified", tone: "green" },
  queried: { label: "Queried", tone: "amber" }, rejected: { label: "Rejected", tone: "red" }, archived: { label: "Archived", tone: "slate" }, superseded: { label: "Superseded", tone: "slate" },
};

export const PROJECT_ROLES: { value: ProjectRole; label: string }[] = [
  { value: "manager", label: "Project Manager" }, { value: "coordinator", label: "Coordinator" },
  { value: "senior_facilitator", label: "Senior Facilitator" }, { value: "facilitator", label: "Facilitator" },
  { value: "senior_admin", label: "Senior Admin" }, { value: "admin", label: "Admin" }, { value: "data_admin", label: "Data Admin" },
  { value: "me", label: "M&E" }, { value: "intern", label: "Intern" }, { value: "viewer", label: "Viewer" },
];
export const roleLabel = (v: string) => PROJECT_ROLES.find((r) => r.value === v)?.label ?? v.replace(/_/g, " ");

export const GLOBAL_ROLES = ["super_admin", "hod", "coordinator", "project_manager", "senior_facilitator", "facilitator", "senior_admin", "admin", "data_admin", "me", "intern", "viewer"];
export const globalRoleLabel = (v: string) =>
  ({ super_admin: "Super Admin", hod: "HOD", project_manager: "Project Manager", me: "M&E", data_admin: "Data Admin" } as Record<string, string>)[v] ??
  v.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export const SAMR: Record<string, { name: string; hint: string }> = {
  S: { name: "Substitution", hint: "Technology replaces a traditional tool with no functional change" },
  A: { name: "Augmentation", hint: "Technology replaces a tool and adds functional improvement" },
  M: { name: "Modification", hint: "Technology allows significant task redesign" },
  R: { name: "Redefinition", hint: "Technology enables tasks previously inconceivable" },
};

export const DOC_ALLOWED_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png", "webp"];
export const DOC_ALLOWED_MIME = [
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "image/jpeg", "image/png", "image/webp",
];
export const MAX_UPLOAD_MB = 20;

export const AUDIT_LABELS: Record<string, string> = {
  "observation.submitted": "Observation submitted", "observation.queried": "Observation queried", "observation.resubmitted": "Observation resubmitted",
  "observation.approved": "Observation approved", "observation.under_review": "Observation review started",
  "documents.insert": "Document uploaded", "document.verified": "Document verified", "document.rejected": "Document rejected", "document.queried": "Document queried",
  "project_member.assigned": "Project member assigned", "project_member.ended": "Project member removed", "project_member.replaced": "Project member replaced",
  "report.generated": "Report generated", "report.approved": "Report approved", "user.invited": "User invited", "user.deactivated": "User deactivated",
  "user.reactivated": "User reactivated", "user_role.assigned": "Role assigned", "user_role.removed": "Role removed", "school.created": "School created",
  "school.updated": "School updated", "teacher.created": "Teacher created", "teacher.updated": "Teacher updated", "projects.insert": "Project created", "projects.update": "Project updated",
  "external_upload_links.insert": "External upload link created", "external_upload_links.update": "External upload link changed",
};
