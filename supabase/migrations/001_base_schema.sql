-- ORT SA STEM & IT ACADEMY
-- Departmental Project Management, Field Monitoring, Document Management,
-- Approval, Reporting and Audit System
-- Target: Supabase PostgreSQL
-- Generated: 2026-10-09
--
-- IMPORTANT:
-- 1. Run this in a new Supabase project/database.
-- 2. This schema is designed for the new STEM & IT Academy system.
-- 3. It does NOT reuse the ORTSA Alumni Impact database schema.
-- 4. Supabase Auth owns authentication credentials in auth.users.
-- 5. Application profile/role data lives in public.profiles and related tables.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. ORGANISATION / DEPARTMENT
-- ============================================================

create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    legal_name text,
    motto text,
    primary_color text not null default '#1E4589',
    accent_color text not null default '#56BBED',
    logo_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.departments (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    name text not null,
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, name)
);

-- ============================================================
-- 2. USERS / ROLES / PERMISSIONS
-- ============================================================

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null,
    email text,
    phone text,
    job_title text,
    employee_number text,
    avatar_path text,
    is_active boolean not null default true,
    last_seen_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.roles (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    description text,
    is_system_role boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.permissions (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    description text
);

create table if not exists public.role_permissions (
    role_id uuid not null references public.roles(id) on delete cascade,
    permission_id uuid not null references public.permissions(id) on delete cascade,
    primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
    user_id uuid not null references public.profiles(id) on delete cascade,
    role_id uuid not null references public.roles(id) on delete cascade,
    assigned_by uuid references public.profiles(id) on delete set null,
    assigned_at timestamptz not null default now(),
    primary key (user_id, role_id)
);

-- ============================================================
-- 3. PROJECTS / PROJECT MEMBERSHIP
-- ============================================================

create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    department_id uuid not null references public.departments(id) on delete restrict,
    name text not null,
    project_code text unique,
    description text,
    status text not null default 'active'
        check (status in ('draft','active','paused','completed','archived')),
    start_date date,
    end_date date,
    reporting_frequency text
        check (reporting_frequency is null or reporting_frequency in ('weekly','monthly','termly','quarterly','custom')),
    settings jsonb not null default '{}'::jsonb,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    project_role text not null
        check (project_role in ('manager','coordinator','senior_facilitator','facilitator','senior_admin','admin','data_admin','me','intern','viewer')),
    start_date date not null default current_date,
    end_date date,
    is_active boolean not null default true,
    assigned_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists uq_active_project_member
on public.project_members(project_id, user_id, project_role)
where is_active = true;

-- ============================================================
-- 4. SCHOOLS / TEACHERS
-- ============================================================

create table if not exists public.schools (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    school_code text,
    province text,
    district text,
    municipality text,
    address text,
    contact_person text,
    contact_phone text,
    contact_email text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_schools_name on public.schools(lower(name));

create table if not exists public.project_schools (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    school_id uuid not null references public.schools(id) on delete cascade,
    start_date date not null default current_date,
    end_date date,
    is_active boolean not null default true,
    notes text,
    unique(project_id, school_id)
);

create table if not exists public.teachers (
    id uuid primary key default gen_random_uuid(),
    school_id uuid not null references public.schools(id) on delete restrict,
    employee_or_teacher_number text,
    full_name text not null,
    email text,
    phone text,
    grade_levels text[],
    subjects text[],
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_teachers_school on public.teachers(school_id);
create index if not exists idx_teachers_name on public.teachers(lower(full_name));

create table if not exists public.project_teachers (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    assigned_at timestamptz not null default now(),
    ended_at timestamptz,
    is_active boolean not null default true,
    notes text,
    unique(project_id, teacher_id)
);

-- ============================================================
-- 5. FORM TEMPLATES / DYNAMIC PROJECT FORMS
-- ============================================================

create table if not exists public.form_templates (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    form_type text not null
        check (form_type in ('observation','session','visit','document_submission','assessment','other')),
    version integer not null default 1,
    description text,
    is_active boolean not null default true,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(project_id, name, version)
);

create table if not exists public.form_fields (
    id uuid primary key default gen_random_uuid(),
    form_template_id uuid not null references public.form_templates(id) on delete cascade,
    field_key text not null,
    label text not null,
    field_type text not null
        check (field_type in (
            'text','textarea','number','date','datetime','time',
            'select','multiselect','radio','checkbox','photo','file',
            'signature','teacher','school','user','samr'
        )),
    help_text text,
    is_required boolean not null default false,
    options jsonb not null default '[]'::jsonb,
    validation_rules jsonb not null default '{}'::jsonb,
    sort_order integer not null default 0,
    section_name text,
    created_at timestamptz not null default now(),
    unique(form_template_id, field_key)
);

-- ============================================================
-- 6. OBSERVATIONS / SUBMISSIONS / APPROVAL WORKFLOW
-- ============================================================

create table if not exists public.observations (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete restrict,
    form_template_id uuid references public.form_templates(id) on delete set null,
    facilitator_id uuid not null references public.profiles(id) on delete restrict,
    manager_id uuid references public.profiles(id) on delete set null,
    school_id uuid references public.schools(id) on delete set null,
    teacher_id uuid references public.teachers(id) on delete set null,
    observed_at timestamptz,
    subject text,
    grade text,
    caps_topic text,
    technology_tools text,
    samr_level text
        check (samr_level is null or samr_level in ('S','A','M','R')),
    learning_outcomes text,
    evidence text,
    strength_1 text,
    strength_2 text,
    strength_3 text,
    development_area text,
    practical_suggestion text,
    post_observation_conversation text,
    agreed_action text,
    next_observation_date date,
    status text not null default 'draft'
        check (status in ('draft','submitted','under_review','queried','resubmitted','approved','rejected','archived')),
    submitted_at timestamptz,
    approved_at timestamptz,
    approved_by uuid references public.profiles(id) on delete set null,
    version integer not null default 1,
    offline_created_at timestamptz,
    client_reference text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_observations_project_status
on public.observations(project_id, status);

create index if not exists idx_observations_facilitator
on public.observations(facilitator_id);

create index if not exists idx_observations_school_teacher
on public.observations(school_id, teacher_id);

create table if not exists public.observation_answers (
    id uuid primary key default gen_random_uuid(),
    observation_id uuid not null references public.observations(id) on delete cascade,
    form_field_id uuid not null references public.form_fields(id) on delete restrict,
    answer_text text,
    answer_json jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(observation_id, form_field_id)
);

create table if not exists public.observation_queries (
    id uuid primary key default gen_random_uuid(),
    observation_id uuid not null references public.observations(id) on delete cascade,
    manager_id uuid not null references public.profiles(id) on delete restrict,
    query_text text not null,
    status text not null default 'open'
        check (status in ('open','resolved','cancelled')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

create table if not exists public.observation_query_items (
    id uuid primary key default gen_random_uuid(),
    query_id uuid not null references public.observation_queries(id) on delete cascade,
    item_text text not null,
    is_resolved boolean not null default false,
    resolved_by uuid references public.profiles(id) on delete set null,
    resolved_at timestamptz
);

create table if not exists public.observation_status_history (
    id uuid primary key default gen_random_uuid(),
    observation_id uuid not null references public.observations(id) on delete cascade,
    from_status text,
    to_status text not null,
    changed_by uuid references public.profiles(id) on delete set null,
    note text,
    created_at timestamptz not null default now()
);

-- ============================================================
-- 7. DOCUMENT MANAGEMENT
-- ============================================================

create table if not exists public.document_types (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id) on delete cascade,
    name text not null,
    description text,
    allowed_extensions text[] default array['pdf','doc','docx','xls','xlsx','jpg','jpeg','png'],
    max_size_mb integer not null default 20,
    requires_verification boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.document_requirements (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    document_type_id uuid references public.document_types(id) on delete set null,
    name text not null,
    applies_to text not null
        check (applies_to in ('project','school','teacher','facilitator','administrator','observation','session','other')),
    is_required boolean not null default true,
    frequency text
        check (frequency is null or frequency in ('once','per_term','monthly','per_session','per_observation','custom')),
    created_at timestamptz not null default now()
);

create table if not exists public.documents (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id) on delete cascade,
    document_type_id uuid references public.document_types(id) on delete set null,
    uploaded_by uuid references public.profiles(id) on delete set null,
    school_id uuid references public.schools(id) on delete set null,
    teacher_id uuid references public.teachers(id) on delete set null,
    observation_id uuid references public.observations(id) on delete cascade,
    title text not null,
    original_filename text not null,
    storage_bucket text not null default 'project-files',
    storage_path text not null,
    mime_type text,
    file_size_bytes bigint,
    checksum text,
    status text not null default 'uploaded'
        check (status in ('uploaded','under_review','verified','queried','rejected','archived','superseded')),
    verification_note text,
    verified_by uuid references public.profiles(id) on delete set null,
    verified_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_documents_project on public.documents(project_id);
create index if not exists idx_documents_school_teacher on public.documents(school_id, teacher_id);
create index if not exists idx_documents_status on public.documents(status);

-- ============================================================
-- 8. EXTERNAL TEACHER SUBMISSIONS
-- ============================================================

create table if not exists public.external_upload_links (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    school_id uuid references public.schools(id) on delete set null,
    teacher_id uuid references public.teachers(id) on delete set null,
    created_by uuid references public.profiles(id) on delete set null,
    token_hash text not null unique,
    label text,
    purpose text,
    expires_at timestamptz,
    max_uses integer,
    use_count integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.external_submissions (
    id uuid primary key default gen_random_uuid(),
    upload_link_id uuid not null references public.external_upload_links(id) on delete restrict,
    project_id uuid not null references public.projects(id) on delete restrict,
    school_id uuid references public.schools(id) on delete set null,
    teacher_id uuid references public.teachers(id) on delete set null,
    submitter_name text,
    submitter_email text,
    submitter_phone text,
    comment text,
    status text not null default 'received'
        check (status in ('received','under_review','accepted','queried','rejected')),
    received_at timestamptz not null default now(),
    reviewed_by uuid references public.profiles(id) on delete set null,
    reviewed_at timestamptz
);

-- ============================================================
-- 9. SESSIONS / FIELD VISITS
-- ============================================================

create table if not exists public.field_sessions (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete restrict,
    facilitator_id uuid not null references public.profiles(id) on delete restrict,
    school_id uuid references public.schools(id) on delete set null,
    teacher_id uuid references public.teachers(id) on delete set null,
    session_type text not null default 'school_visit',
    title text,
    started_at timestamptz,
    ended_at timestamptz,
    notes text,
    status text not null default 'draft'
        check (status in ('draft','submitted','approved','cancelled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================
-- 10. REPORTING PERIODS / REPORTS
-- ============================================================

create table if not exists public.reporting_periods (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    period_type text not null
        check (period_type in ('weekly','monthly','termly','quarterly','annual','custom')),
    start_date date not null,
    end_date date not null,
    status text not null default 'open'
        check (status in ('open','closed','published','archived')),
    created_at timestamptz not null default now(),
    check (end_date >= start_date)
);

create table if not exists public.project_reports (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    reporting_period_id uuid references public.reporting_periods(id) on delete set null,
    generated_by uuid references public.profiles(id) on delete set null,
    title text not null,
    report_type text not null
        check (report_type in ('summary','monthly','termly','quarterly','annual','custom')),
    data_snapshot jsonb not null default '{}'::jsonb,
    narrative text,
    status text not null default 'draft'
        check (status in ('draft','generated','reviewed','approved','published','archived')),
    approved_by uuid references public.profiles(id) on delete set null,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================
-- 11. NOTIFICATIONS
-- ============================================================

create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    title text not null,
    message text not null,
    notification_type text not null default 'system',
    entity_type text,
    entity_id uuid,
    is_read boolean not null default false,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_unread
on public.notifications(user_id, is_read, created_at desc);

-- ============================================================
-- 12. AUDIT LOG
-- ============================================================

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid references public.profiles(id) on delete set null,
    action text not null,
    entity_type text,
    entity_id uuid,
    project_id uuid references public.projects(id) on delete set null,
    old_values jsonb,
    new_values jsonb,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_project_created
on public.audit_logs(project_id, created_at desc);

create index if not exists idx_audit_logs_entity
on public.audit_logs(entity_type, entity_id);

-- ============================================================
-- 13. INVITATIONS / ACCESS REQUESTS
-- ============================================================

create table if not exists public.access_invitations (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    full_name text,
    invited_role text,
    invited_by uuid references public.profiles(id) on delete set null,
    token_hash text not null unique,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.access_requests (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    email text not null,
    phone text,
    requested_reason text,
    requested_project_id uuid references public.projects(id) on delete set null,
    status text not null default 'pending'
        check (status in ('pending','approved','rejected')),
    reviewed_by uuid references public.profiles(id) on delete set null,
    reviewed_at timestamptz,
    created_at timestamptz not null default now()
);

-- ============================================================
-- 14. UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists trg_departments_updated_at on public.departments;
create trigger trg_departments_updated_at before update on public.departments
for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists trg_project_members_updated_at on public.project_members;
create trigger trg_project_members_updated_at before update on public.project_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_schools_updated_at on public.schools;
create trigger trg_schools_updated_at before update on public.schools
for each row execute function public.set_updated_at();

drop trigger if exists trg_teachers_updated_at on public.teachers;
create trigger trg_teachers_updated_at before update on public.teachers
for each row execute function public.set_updated_at();

drop trigger if exists trg_form_templates_updated_at on public.form_templates;
create trigger trg_form_templates_updated_at before update on public.form_templates
for each row execute function public.set_updated_at();

drop trigger if exists trg_observations_updated_at on public.observations;
create trigger trg_observations_updated_at before update on public.observations
for each row execute function public.set_updated_at();

drop trigger if exists trg_observation_answers_updated_at on public.observation_answers;
create trigger trg_observation_answers_updated_at before update on public.observation_answers
for each row execute function public.set_updated_at();

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists trg_field_sessions_updated_at on public.field_sessions;
create trigger trg_field_sessions_updated_at before update on public.field_sessions
for each row execute function public.set_updated_at();

drop trigger if exists trg_project_reports_updated_at on public.project_reports;
create trigger trg_project_reports_updated_at before update on public.project_reports
for each row execute function public.set_updated_at();

-- ============================================================
-- 15. PROFILE CREATION FROM SUPABASE AUTH
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name, email)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
        new.email
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- 16. ROLE / PERMISSION SEED DATA
-- ============================================================

insert into public.roles (name, description)
values
('super_admin','Complete system administration and configuration'),
('hod','Department-wide oversight, reporting and visibility'),
('coordinator','Cross-project coordination and monitoring'),
('project_manager','Management of assigned projects'),
('senior_facilitator','Senior field facilitation and monitoring'),
('facilitator','Field facilitation, observations and submissions'),
('senior_admin','Senior administrative operations'),
('admin','Administrative operations for assigned projects'),
('data_admin','Data and document administration'),
('me','Monitoring and evaluation'),
('intern','Restricted operational support'),
('viewer','Read-only access')
on conflict (name) do nothing;

insert into public.permissions (code, name, description)
values
('system.manage','Manage system configuration','Manage system-wide settings'),
('users.manage','Manage users','Invite, deactivate and manage users'),
('roles.manage','Manage roles','Assign roles and permissions'),
('projects.view','View projects','View permitted projects'),
('projects.manage','Manage projects','Create and update projects'),
('project_members.manage','Manage project members','Assign people to projects'),
('schools.manage','Manage schools','Create and update schools'),
('teachers.manage','Manage teachers','Create and update teacher records'),
('field.submit','Submit field work','Create and submit field records'),
('field.review','Review field work','Review field submissions'),
('field.query','Query field work','Request corrections'),
('field.approve','Approve field work','Approve submissions'),
('documents.upload','Upload documents','Upload project documents'),
('documents.view','View documents','View permitted documents'),
('documents.verify','Verify documents','Verify or reject documents'),
('reports.view','View reports','View reports'),
('reports.generate','Generate reports','Generate reports from system data'),
('reports.approve','Approve reports','Approve project/department reports'),
('analytics.view','View analytics','View dashboards and analytics'),
('notifications.manage','Manage notifications','Create/send system notifications'),
('audit.view','View audit log','View system audit history'),
('external_upload.manage','Manage external upload links','Create/revoke external upload links')
on conflict (code) do nothing;

-- Super admin gets every current permission.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.name = 'super_admin'
on conflict do nothing;

-- HOD: oversight, reports, analytics, projects and review.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
    'projects.view','projects.manage','project_members.manage',
    'schools.manage','teachers.manage','field.review','field.query',
    'field.approve','documents.view','documents.verify',
    'reports.view','reports.generate','reports.approve','analytics.view',
    'audit.view'
)
where r.name = 'hod'
on conflict do nothing;

-- Project manager permissions.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
    'projects.view','project_members.manage','schools.manage','teachers.manage',
    'field.review','field.query','field.approve',
    'documents.view','documents.verify',
    'reports.view','reports.generate','analytics.view',
    'external_upload.manage'
)
where r.name = 'project_manager'
on conflict do nothing;

-- Coordinator permissions.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
    'projects.view','project_members.manage','schools.manage','teachers.manage',
    'field.review','documents.view','documents.verify',
    'reports.view','reports.generate','analytics.view'
)
where r.name = 'coordinator'
on conflict do nothing;

-- Facilitator permissions.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
    'projects.view','schools.manage','teachers.manage',
    'field.submit','documents.upload','documents.view','reports.view'
)
where r.name = 'facilitator'
on conflict do nothing;

-- Admin permissions.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
    'projects.view','schools.manage','teachers.manage',
    'documents.upload','documents.view','documents.verify',
    'reports.view','external_upload.manage'
)
where r.name in ('admin','senior_admin')
on conflict do nothing;

-- Data/M&E permissions.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
    'projects.view','schools.manage','teachers.manage',
    'documents.view','documents.verify',
    'reports.view','reports.generate','analytics.view','audit.view'
)
where r.name = 'data_admin'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
    'projects.view','field.review','documents.view',
    'reports.view','reports.generate','analytics.view'
)
where r.name = 'me'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
    'projects.view','schools.manage','teachers.manage',
    'documents.upload','documents.view','field.submit'
)
where r.name = 'intern'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
    'projects.view','documents.view','reports.view'
)
where r.name = 'viewer'
on conflict do nothing;

-- ============================================================
-- 17. DEFAULT ORGANISATION / DEPARTMENT / PROJECT
-- ============================================================

insert into public.organizations(name, legal_name, motto, primary_color, accent_color)
values (
    'ORT SA',
    'Organisation for Rehabilitation through Training South Africa',
    'STEM & IT Academy',
    '#1E4589',
    '#56BBED'
)
on conflict do nothing;

insert into public.departments(organization_id, name, description)
select id, 'STEM & IT Academy',
       'Departmental project management, field monitoring, administration, data and reporting.'
from public.organizations
where name = 'ORT SA'
on conflict (organization_id, name) do nothing;

insert into public.projects(
    department_id,
    name,
    project_code,
    description,
    status,
    reporting_frequency
)
select
    d.id,
    'Tech in the Classroom',
    'TIC',
    'Technology-in-the-classroom teacher support, classroom observation, monitoring and reporting project.',
    'active',
    'monthly'
from public.departments d
join public.organizations o on o.id = d.organization_id
where o.name = 'ORT SA'
  and d.name = 'STEM & IT Academy'
on conflict (project_code) do nothing;

-- ============================================================
-- 18. TECH IN THE CLASSROOM OBSERVATION TEMPLATE
-- ============================================================

insert into public.form_templates(project_id, name, form_type, version, description)
select
    p.id,
    'Classroom Based Support Observation',
    'observation',
    1,
    'Digital version of the classroom support observation form used for reporting.'
from public.projects p
where p.project_code = 'TIC'
  and not exists (
      select 1 from public.form_templates ft
      where ft.project_id = p.id
        and ft.name = 'Classroom Based Support Observation'
        and ft.version = 1
  );

insert into public.form_fields(
    form_template_id, field_key, label, field_type,
    is_required, sort_order, section_name, help_text
)
select ft.id, v.field_key, v.label, v.field_type, v.is_required, v.sort_order, v.section_name, v.help_text
from public.form_templates ft
cross join (
    values
    ('observed_teacher','Observed Teacher','teacher',true,10,'Observation Details','Select the teacher being observed.'),
    ('school','School','school',true,20,'Observation Details','Select the school.'),
    ('facilitator','Facilitator','user',true,30,'Observation Details','Facilitator conducting the observation.'),
    ('observed_at','Date and Time of Observation','datetime',true,40,'Observation Details','Date and time the observation occurred.'),
    ('subject','Subject','text',true,50,'Lesson Context','Subject taught.'),
    ('grade','Grade','text',true,60,'Lesson Context','Grade observed.'),
    ('caps_topic','CAPS Topic','text',true,70,'Lesson Context','CAPS topic covered.'),
    ('technology_tools','Technology Tools Used in Lesson','textarea',false,80,'Technology Integration','Technology tools used.'),
    ('samr_level','SAMR Level Observed (S / A / M / R)','samr',true,90,'Technology Integration','Select the observed SAMR level.'),
    ('learning_outcomes','Learning Outcomes: Were they achieved? Evidence?','textarea',true,100,'Learning Outcomes','Describe evidence of learning outcomes.'),
    ('strength_1','Specific Strength 1','textarea',true,110,'Feedback','Be specific rather than general praise.'),
    ('strength_2','Specific Strength 2','textarea',true,120,'Feedback','Be specific rather than general praise.'),
    ('strength_3','Specific Strength 3','textarea',true,130,'Feedback','Be specific rather than general praise.'),
    ('development_area','Area for Development','textarea',true,140,'Feedback','Identify one specific development area.'),
    ('practical_suggestion','Practical Suggestion','textarea',true,150,'Feedback','Provide a practical suggestion.'),
    ('post_observation_conversation','Post-observation Conversation','textarea',false,160,'Follow-up','Record what the observed teacher said about the lesson.'),
    ('agreed_action','Agreed Action for Next Observation','textarea',true,170,'Follow-up','Record the agreed action.'),
    ('next_observation_date','Next Observation Date','date',false,180,'Follow-up','Date agreed for the next observation.')
) as v(field_key,label,field_type,is_required,sort_order,section_name,help_text)
where ft.name = 'Classroom Based Support Observation'
  and ft.version = 1
on conflict (form_template_id, field_key) do nothing;

-- ============================================================
-- 19. SUPABASE STORAGE BUCKET
-- ============================================================

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

-- ============================================================
-- 20. HELPER FUNCTIONS FOR RLS
-- ============================================================

create or replace function public.has_role(role_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = auth.uid()
          and r.name = role_name
    );
$$;

create or replace function public.has_any_role(role_names text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = auth.uid()
          and r.name = any(role_names)
    );
$$;

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select
        public.has_role('super_admin')
        or exists (
            select 1
            from public.project_members pm
            where pm.project_id = target_project_id
              and pm.user_id = auth.uid()
              and pm.is_active = true
        )
        or public.has_any_role(array['hod','coordinator']);
$$;

-- ============================================================
-- 21. ROW LEVEL SECURITY
-- ============================================================

alter table public.organizations enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.schools enable row level security;
alter table public.project_schools enable row level security;
alter table public.teachers enable row level security;
alter table public.project_teachers enable row level security;
alter table public.form_templates enable row level security;
alter table public.form_fields enable row level security;
alter table public.observations enable row level security;
alter table public.observation_answers enable row level security;
alter table public.observation_queries enable row level security;
alter table public.observation_query_items enable row level security;
alter table public.observation_status_history enable row level security;
alter table public.document_types enable row level security;
alter table public.document_requirements enable row level security;
alter table public.documents enable row level security;
alter table public.external_upload_links enable row level security;
alter table public.external_submissions enable row level security;
alter table public.field_sessions enable row level security;
alter table public.reporting_periods enable row level security;
alter table public.project_reports enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.access_invitations enable row level security;
alter table public.access_requests enable row level security;

-- Profiles
drop policy if exists profiles_select_self_or_management on public.profiles;
create policy profiles_select_self_or_management on public.profiles
for select to authenticated
using (
    id = auth.uid()
    or public.has_any_role(array['super_admin','hod','coordinator'])
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid() or public.has_role('super_admin'))
with check (id = auth.uid() or public.has_role('super_admin'));

-- Roles/permissions are readable to authenticated users; modification is super-admin only.
drop policy if exists roles_select_authenticated on public.roles;
create policy roles_select_authenticated on public.roles
for select to authenticated using (true);

drop policy if exists permissions_select_authenticated on public.permissions;
create policy permissions_select_authenticated on public.permissions
for select to authenticated using (true);

drop policy if exists role_permissions_select_authenticated on public.role_permissions;
create policy role_permissions_select_authenticated on public.role_permissions
for select to authenticated using (true);

drop policy if exists user_roles_select_management on public.user_roles;
create policy user_roles_select_management on public.user_roles
for select to authenticated
using (
    user_id = auth.uid()
    or public.has_any_role(array['super_admin','hod','coordinator'])
);

-- Projects
drop policy if exists projects_select_permitted on public.projects;
create policy projects_select_permitted on public.projects
for select to authenticated
using (public.is_project_member(id));

drop policy if exists projects_manage_admin on public.projects;
create policy projects_manage_admin on public.projects
for all to authenticated
using (public.has_any_role(array['super_admin','hod']))
with check (public.has_any_role(array['super_admin','hod']));

-- Project members
drop policy if exists project_members_select_permitted on public.project_members;
create policy project_members_select_permitted on public.project_members
for select to authenticated
using (
    public.has_role('super_admin')
    or user_id = auth.uid()
    or public.is_project_member(project_id)
);

drop policy if exists project_members_manage on public.project_members;
create policy project_members_manage on public.project_members
for all to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
    and public.is_project_member(project_id)
)
with check (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
);

-- Schools
drop policy if exists schools_select_permitted on public.schools;
create policy schools_select_permitted on public.schools
for select to authenticated
using (
    public.has_role('super_admin')
    or public.has_any_role(array['hod','coordinator','me','data_admin'])
    or exists (
        select 1 from public.project_schools ps
        join public.project_members pm on pm.project_id = ps.project_id
        where ps.school_id = schools.id
          and pm.user_id = auth.uid()
          and pm.is_active = true
    )
);

drop policy if exists schools_manage_permitted on public.schools;
create policy schools_manage_permitted on public.schools
for all to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager','facilitator','admin','senior_admin','data_admin'])
)
with check (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager','facilitator','admin','senior_admin','data_admin'])
);

-- Teachers
drop policy if exists teachers_select_permitted on public.teachers;
create policy teachers_select_permitted on public.teachers
for select to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','me','data_admin'])
    or exists (
        select 1
        from public.project_teachers pt
        join public.project_members pm on pm.project_id = pt.project_id
        where pt.teacher_id = teachers.id
          and pm.user_id = auth.uid()
          and pm.is_active = true
    )
);

drop policy if exists teachers_manage_permitted on public.teachers;
create policy teachers_manage_permitted on public.teachers
for all to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager','facilitator','admin','senior_admin','data_admin'])
)
with check (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager','facilitator','admin','senior_admin','data_admin'])
);

-- Observations
drop policy if exists observations_select_permitted on public.observations;
create policy observations_select_permitted on public.observations
for select to authenticated
using (
    facilitator_id = auth.uid()
    or public.is_project_member(project_id)
    or public.has_any_role(array['hod','coordinator','me','data_admin'])
);

drop policy if exists observations_insert_facilitator on public.observations;
create policy observations_insert_facilitator on public.observations
for insert to authenticated
with check (
    facilitator_id = auth.uid()
    and public.is_project_member(project_id)
);

drop policy if exists observations_update_owner_or_reviewer on public.observations;
create policy observations_update_owner_or_reviewer on public.observations
for update to authenticated
using (
    facilitator_id = auth.uid()
    or public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
)
with check (
    facilitator_id = auth.uid()
    or public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
);

-- Documents
drop policy if exists documents_select_permitted on public.documents;
create policy documents_select_permitted on public.documents
for select to authenticated
using (
    uploaded_by = auth.uid()
    or (project_id is not null and public.is_project_member(project_id))
    or public.has_any_role(array['super_admin','hod','coordinator','me','data_admin'])
);

drop policy if exists documents_insert_permitted on public.documents;
create policy documents_insert_permitted on public.documents
for insert to authenticated
with check (
    uploaded_by = auth.uid()
    and (
        project_id is null
        or public.is_project_member(project_id)
    )
);

drop policy if exists documents_update_permitted on public.documents;
create policy documents_update_permitted on public.documents
for update to authenticated
using (
    uploaded_by = auth.uid()
    or public.has_any_role(array['super_admin','hod','coordinator','project_manager','senior_admin','data_admin'])
)
with check (
    uploaded_by = auth.uid()
    or public.has_any_role(array['super_admin','hod','coordinator','project_manager','senior_admin','data_admin'])
);

-- Notifications
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (user_id = auth.uid() or public.has_role('super_admin'));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated
using (user_id = auth.uid() or public.has_role('super_admin'))
with check (user_id = auth.uid() or public.has_role('super_admin'));

-- Audit logs
drop policy if exists audit_logs_select_management on public.audit_logs;
create policy audit_logs_select_management on public.audit_logs
for select to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','me','data_admin'])
);

-- Access requests: public submission should be implemented through an Edge Function.
drop policy if exists access_requests_select_management on public.access_requests;
create policy access_requests_select_management on public.access_requests
for select to authenticated
using (public.has_any_role(array['super_admin','hod']));

-- Project/school relationships
drop policy if exists project_schools_select_permitted on public.project_schools;
create policy project_schools_select_permitted on public.project_schools
for select to authenticated
using (
    public.is_project_member(project_id)
    or public.has_any_role(array['hod','coordinator','me','data_admin'])
);

drop policy if exists project_schools_manage_permitted on public.project_schools;
create policy project_schools_manage_permitted on public.project_schools
for all to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager','admin','senior_admin','data_admin'])
    and public.is_project_member(project_id)
)
with check (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager','admin','senior_admin','data_admin'])
);

drop policy if exists project_teachers_select_permitted on public.project_teachers;
create policy project_teachers_select_permitted on public.project_teachers
for select to authenticated
using (
    public.is_project_member(project_id)
    or public.has_any_role(array['hod','coordinator','me','data_admin'])
);

drop policy if exists project_teachers_manage_permitted on public.project_teachers;
create policy project_teachers_manage_permitted on public.project_teachers
for all to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager','facilitator','admin','senior_admin','data_admin'])
    and public.is_project_member(project_id)
)
with check (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager','facilitator','admin','senior_admin','data_admin'])
);

-- Project form configuration
drop policy if exists form_templates_select_permitted on public.form_templates;
create policy form_templates_select_permitted on public.form_templates
for select to authenticated
using (
    public.is_project_member(project_id)
    or public.has_any_role(array['hod','coordinator','me','data_admin'])
);

drop policy if exists form_templates_manage_permitted on public.form_templates;
create policy form_templates_manage_permitted on public.form_templates
for all to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
    and public.is_project_member(project_id)
)
with check (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
);

drop policy if exists form_fields_select_permitted on public.form_fields;
create policy form_fields_select_permitted on public.form_fields
for select to authenticated
using (
    exists (
        select 1
        from public.form_templates ft
        where ft.id = form_fields.form_template_id
          and (
              public.is_project_member(ft.project_id)
              or public.has_any_role(array['hod','coordinator','me','data_admin'])
          )
    )
);

drop policy if exists form_fields_manage_permitted on public.form_fields;
create policy form_fields_manage_permitted on public.form_fields
for all to authenticated
using (
    exists (
        select 1
        from public.form_templates ft
        where ft.id = form_fields.form_template_id
          and public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
          and public.is_project_member(ft.project_id)
    )
)
with check (
    exists (
        select 1
        from public.form_templates ft
        where ft.id = form_fields.form_template_id
          and public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
    )
);

-- Observation child records
drop policy if exists observation_answers_select_permitted on public.observation_answers;
create policy observation_answers_select_permitted on public.observation_answers
for select to authenticated
using (
    exists (
        select 1 from public.observations o
        where o.id = observation_answers.observation_id
          and (
              o.facilitator_id = auth.uid()
              or public.is_project_member(o.project_id)
              or public.has_any_role(array['hod','coordinator','me','data_admin'])
          )
    )
);

drop policy if exists observation_answers_write_permitted on public.observation_answers;
create policy observation_answers_write_permitted on public.observation_answers
for all to authenticated
using (
    exists (
        select 1 from public.observations o
        where o.id = observation_answers.observation_id
          and (
              o.facilitator_id = auth.uid()
              or public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
          )
    )
)
with check (
    exists (
        select 1 from public.observations o
        where o.id = observation_answers.observation_id
          and (
              o.facilitator_id = auth.uid()
              or public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
          )
    )
);

drop policy if exists observation_queries_select_permitted on public.observation_queries;
create policy observation_queries_select_permitted on public.observation_queries
for select to authenticated
using (
    manager_id = auth.uid()
    or exists (
        select 1 from public.observations o
        where o.id = observation_queries.observation_id
          and (
              o.facilitator_id = auth.uid()
              or public.is_project_member(o.project_id)
              or public.has_any_role(array['hod','coordinator'])
          )
    )
);

drop policy if exists observation_queries_manage_permitted on public.observation_queries;
create policy observation_queries_manage_permitted on public.observation_queries
for all to authenticated
using (
    manager_id = auth.uid()
    or public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
)
with check (
    manager_id = auth.uid()
    or public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
);

drop policy if exists observation_query_items_select_permitted on public.observation_query_items;
create policy observation_query_items_select_permitted on public.observation_query_items
for select to authenticated
using (
    exists (
        select 1
        from public.observation_queries oq
        join public.observations o on o.id = oq.observation_id
        where oq.id = observation_query_items.query_id
          and (
              o.facilitator_id = auth.uid()
              or oq.manager_id = auth.uid()
              or public.has_any_role(array['super_admin','hod','coordinator'])
          )
    )
);

drop policy if exists observation_query_items_manage_permitted on public.observation_query_items;
create policy observation_query_items_manage_permitted on public.observation_query_items
for all to authenticated
using (
    exists (
        select 1
        from public.observation_queries oq
        where oq.id = observation_query_items.query_id
          and (
              oq.manager_id = auth.uid()
              or public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
          )
    )
)
with check (
    exists (
        select 1
        from public.observation_queries oq
        where oq.id = observation_query_items.query_id
          and (
              oq.manager_id = auth.uid()
              or public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
          )
    )
);

drop policy if exists observation_status_history_select_permitted on public.observation_status_history;
create policy observation_status_history_select_permitted on public.observation_status_history
for select to authenticated
using (
    exists (
        select 1 from public.observations o
        where o.id = observation_status_history.observation_id
          and (
              o.facilitator_id = auth.uid()
              or public.is_project_member(o.project_id)
              or public.has_any_role(array['hod','coordinator','me','data_admin'])
          )
    )
);

-- Document configuration
drop policy if exists document_types_select_permitted on public.document_types;
create policy document_types_select_permitted on public.document_types
for select to authenticated
using (
    project_id is null
    or public.is_project_member(project_id)
    or public.has_any_role(array['hod','coordinator','me','data_admin'])
);

drop policy if exists document_types_manage_permitted on public.document_types;
create policy document_types_manage_permitted on public.document_types
for all to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
    and (project_id is null or public.is_project_member(project_id))
)
with check (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
);

drop policy if exists document_requirements_select_permitted on public.document_requirements;
create policy document_requirements_select_permitted on public.document_requirements
for select to authenticated
using (
    public.is_project_member(project_id)
    or public.has_any_role(array['hod','coordinator','me','data_admin'])
);

drop policy if exists document_requirements_manage_permitted on public.document_requirements;
create policy document_requirements_manage_permitted on public.document_requirements
for all to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
    and public.is_project_member(project_id)
)
with check (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
);

-- Field sessions
drop policy if exists field_sessions_select_permitted on public.field_sessions;
create policy field_sessions_select_permitted on public.field_sessions
for select to authenticated
using (
    facilitator_id = auth.uid()
    or public.is_project_member(project_id)
    or public.has_any_role(array['hod','coordinator','me','data_admin'])
);

drop policy if exists field_sessions_write_permitted on public.field_sessions;
create policy field_sessions_write_permitted on public.field_sessions
for all to authenticated
using (
    facilitator_id = auth.uid()
    or public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
)
with check (
    facilitator_id = auth.uid()
    or public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
);

-- Reporting
drop policy if exists reporting_periods_select_permitted on public.reporting_periods;
create policy reporting_periods_select_permitted on public.reporting_periods
for select to authenticated
using (
    public.is_project_member(project_id)
    or public.has_any_role(array['hod','coordinator','me','data_admin'])
);

drop policy if exists reporting_periods_manage_permitted on public.reporting_periods;
create policy reporting_periods_manage_permitted on public.reporting_periods
for all to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
    and public.is_project_member(project_id)
)
with check (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
);

drop policy if exists project_reports_select_permitted on public.project_reports;
create policy project_reports_select_permitted on public.project_reports
for select to authenticated
using (
    public.is_project_member(project_id)
    or public.has_any_role(array['hod','coordinator','me','data_admin'])
);

drop policy if exists project_reports_manage_permitted on public.project_reports;
create policy project_reports_manage_permitted on public.project_reports
for all to authenticated
using (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
    and public.is_project_member(project_id)
)
with check (
    public.has_any_role(array['super_admin','hod','coordinator','project_manager'])
);

-- Organisation / department visibility
drop policy if exists organizations_select_authenticated on public.organizations;
create policy organizations_select_authenticated on public.organizations
for select to authenticated using (true);

drop policy if exists departments_select_authenticated on public.departments;
create policy departments_select_authenticated on public.departments
for select to authenticated using (true);

-- User-role management
drop policy if exists user_roles_manage_super_admin on public.user_roles;
create policy user_roles_manage_super_admin on public.user_roles
for all to authenticated
using (public.has_role('super_admin'))
with check (public.has_role('super_admin'));

-- Access invitations
drop policy if exists access_invitations_manage_super_admin on public.access_invitations;
create policy access_invitations_manage_super_admin on public.access_invitations
for all to authenticated
using (public.has_any_role(array['super_admin','hod']))
with check (public.has_any_role(array['super_admin','hod']));

-- External upload records are intended to be created/reviewed by the
-- application/Edge Function; authenticated management users may view them.
drop policy if exists external_upload_links_select_management on public.external_upload_links;
create policy external_upload_links_select_management on public.external_upload_links
for select to authenticated
using (
    public.is_project_member(project_id)
    or public.has_any_role(array['super_admin','hod','coordinator'])
);

drop policy if exists external_submissions_select_management on public.external_submissions;
create policy external_submissions_select_management on public.external_submissions
for select to authenticated
using (
    public.is_project_member(project_id)
    or public.has_any_role(array['super_admin','hod','coordinator','me','data_admin'])
);


-- ============================================================
-- 22. STORAGE SECURITY
-- ============================================================

drop policy if exists project_files_select_permitted on storage.objects;
create policy project_files_select_permitted
on storage.objects
for select to authenticated
using (
    bucket_id = 'project-files'
    and (
        public.has_role('super_admin')
        or public.has_any_role(array['hod','coordinator','me','data_admin'])
        or exists (
            select 1
            from public.project_members pm
            where pm.user_id = auth.uid()
              and pm.is_active = true
              and (storage.foldername(name))[1] = pm.project_id::text
        )
    )
);

drop policy if exists project_files_insert_authenticated on storage.objects;
create policy project_files_insert_authenticated
on storage.objects
for insert to authenticated
with check (
    bucket_id = 'project-files'
    and (
        public.has_role('super_admin')
        or (
            (storage.foldername(name))[1] is not null
            and public.is_project_member(((storage.foldername(name))[1])::uuid)
        )
    )
);

drop policy if exists project_files_update_owner on storage.objects;
create policy project_files_update_owner
on storage.objects
for update to authenticated
using (
    bucket_id = 'project-files'
    and (
        public.has_role('super_admin')
        or (
            (storage.foldername(name))[1] is not null
            and public.is_project_member(((storage.foldername(name))[1])::uuid)
        )
    )
)
with check (
    bucket_id = 'project-files'
    and (
        public.has_role('super_admin')
        or (
            (storage.foldername(name))[1] is not null
            and public.is_project_member(((storage.foldername(name))[1])::uuid)
        )
    )
);

-- ============================================================
-- 23. NOTES FOR APPLICATION LAYER
-- ============================================================
--
-- The application must:
-- - Never expose service_role keys in browser code.
-- - Use the Supabase anon/publishable key only in the frontend.
-- - Use server-side/Edge Functions for privileged operations.
-- - Generate signed URLs for private files.
-- - Validate file extensions AND MIME types AND file size.
-- - Scan uploaded files for malware before treating them as verified.
-- - Enforce MFA for super_admin and other privileged roles.
-- - Record approval/query/resubmission events in observation_status_history
--   and audit_logs.
-- - Never overwrite the historical facilitator on an old observation.
-- - End old project_members assignments and create new assignments when
--   staff change projects.
-- - Use soft deactivation rather than deleting operational records.
-- - Implement offline draft/sync behaviour in the PWA.
-- - Use Edge Functions for external upload token handling.
--
-- END OF SCHEMA
