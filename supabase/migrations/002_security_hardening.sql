-- ORT SA STEM & IT ACADEMY - 002: security hardening on top of 001_base_schema.sql
--
-- WHY THIS EXISTS
-- The base schema is a good foundation but several policies are too broad for the
-- rules in the build prompt. Examples fixed here:
--   * a facilitator could UPDATE observations.status / approved_by directly (self-approve)
--   * any project member could read other facilitators' DRAFT observations
--   * HOD/management could read non-approved records regardless of workflow state
--   * any facilitator could edit ANY school/teacher; project_schools/teachers had no scope check
--   * profiles of colleagues were unreadable, so names could not be shown
--   * documents could be self-verified by the uploader (status editable)
--   * storage reads were project-folder based, not tied to document visibility
-- Writes that need business logic move into SECURITY DEFINER functions (003).

-- ============================================================
-- 1. NEW COLUMNS / TABLES
-- ============================================================

alter table public.observations add column if not exists ref_no bigint generated always as identity;
alter table public.observations add column if not exists teacher_acknowledged boolean not null default false;
alter table public.observations add column if not exists teacher_acknowledged_at timestamptz;
alter table public.observations add column if not exists acknowledgement_method text
    check (acknowledgement_method is null or acknowledgement_method in ('in_person','verbal','phone','other'));
alter table public.observations add column if not exists acknowledgement_note text;

create unique index if not exists uq_observations_client_ref
    on public.observations(facilitator_id, client_reference) where client_reference is not null;

alter table public.documents add column if not exists external_submission_id uuid
    references public.external_submissions(id) on delete set null;
create index if not exists idx_documents_external on public.documents(external_submission_id);

alter table public.access_requests add column if not exists ip_hash text;
create index if not exists idx_access_requests_email on public.access_requests(lower(email), created_at desc);

-- Facilitator <-> school assignment, with history (never overwritten)
create table if not exists public.school_facilitators (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    school_id uuid not null references public.schools(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    start_date date not null default current_date,
    end_date date,
    is_active boolean not null default true,
    assigned_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);
create unique index if not exists uq_active_school_facilitator
    on public.school_facilitators(project_id, school_id, user_id) where is_active = true;
create index if not exists idx_school_facilitators_user on public.school_facilitators(user_id) where is_active = true;
alter table public.school_facilitators enable row level security;

create table if not exists public.system_settings (
    key text primary key,
    value jsonb not null,
    description text,
    updated_by uuid references public.profiles(id) on delete set null,
    updated_at timestamptz not null default now()
);
alter table public.system_settings enable row level security;

insert into public.system_settings(key, value, description) values
 ('external_link_default_days', '14'::jsonb, 'Default validity (days) of a new external upload link'),
 ('max_upload_mb', '20'::jsonb, 'Maximum size of a single uploaded file in MB'),
 ('audit_retention_months', '84'::jsonb, 'Months audit records are retained (informational; purge is a manual DBA task)'),
 ('document_retention_months', '84'::jsonb, 'Months documents are retained after project completion (informational)')
on conflict (key) do nothing;

-- Document types shared by all projects (project_id null)
insert into public.document_types(project_id, name, description, requires_verification, max_size_mb)
select null, v.name, v.descr, v.verify, 20
from (values
  ('Teacher ID','Copy of the teacher''s identity document',true),
  ('Register','Attendance register',true),
  ('MOU','Memorandum of understanding with the school',true),
  ('Learner Report','Learner progress / activity report',true),
  ('Attendance','Attendance record',false),
  ('Assessment','Assessment evidence',false),
  ('Photograph','Photographic evidence',false),
  ('Project Report','Project report',true),
  ('Supporting Document','Other supporting evidence',false),
  ('Other','Other document',false)
) as v(name, descr, verify)
where not exists (select 1 from public.document_types dt where dt.project_id is null and dt.name = v.name);

-- Default requirements for Tech in the Classroom
insert into public.document_requirements(project_id, document_type_id, name, applies_to, is_required, frequency)
select p.id, dt.id, v.name, v.applies_to, true, v.frequency
from public.projects p
cross join (values
  ('Teacher ID','Teacher ID','teacher','once'),
  ('MOU','MOU','school','once'),
  ('Register','Register','school','once'),
  ('Learner Report','Learner Report','teacher','monthly')
) as v(type_name, name, applies_to, frequency)
join public.document_types dt on dt.project_id is null and dt.name = v.type_name
where p.project_code = 'TIC'
  and not exists (select 1 from public.document_requirements r where r.project_id = p.id and r.name = v.name);

-- The base seed gives senior_facilitator NO permissions, which would lock senior facilitators out
-- of field work. Give them everything a facilitator has, plus report viewing.
insert into public.role_permissions(role_id, permission_id)
select sf.id, rp.permission_id
from public.roles sf
join public.roles f on f.name = 'facilitator'
join public.role_permissions rp on rp.role_id = f.id
where sf.name = 'senior_facilitator'
on conflict do nothing;

-- Storage: size + type limits enforced by Storage itself (defence in depth)
update storage.buckets set
    file_size_limit = 20971520,
    allowed_mime_types = array[
      'application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg','image/png','image/webp']
where id = 'project-files';

-- ============================================================
-- 2. HELPER FUNCTIONS
-- ============================================================

create or replace function public.has_permission(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1
        from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id
        join public.permissions p on p.id = rp.permission_id
        where ur.user_id = auth.uid() and p.code = p_code
    );
$$;

create or replace function public.my_project_roles(p_project uuid)
returns text[] language sql stable security definer set search_path = public as $$
    select coalesce(array_agg(distinct pm.project_role), '{}'::text[])
    from public.project_members pm
    where pm.project_id = p_project and pm.user_id = auth.uid() and pm.is_active = true;
$$;

create or replace function public.is_dept_wide()
returns boolean language sql stable security definer set search_path = public as $$
    select public.has_any_role(array['super_admin','hod','coordinator','me','data_admin']);
$$;

create or replace function public.can_access_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select public.is_dept_wide() or cardinality(public.my_project_roles(p_project)) > 0;
$$;

create or replace function public.visible_project_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
    select p.id from public.projects p
    where public.is_dept_wide()
       or exists (select 1 from public.project_members pm
                  where pm.project_id = p.id and pm.user_id = auth.uid() and pm.is_active = true);
$$;

-- Scope helpers used by workflow functions
create or replace function public.can_review_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select public.has_role('super_admin')
        or (public.has_permission('field.review')
            and (public.has_any_role(array['hod','coordinator'])
                 or public.my_project_roles(p_project) && array['manager','coordinator']));
$$;

create or replace function public.can_query_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select public.has_role('super_admin')
        or (public.has_permission('field.query')
            and (public.has_role('hod') or public.my_project_roles(p_project) && array['manager']));
$$;

create or replace function public.can_approve_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select public.has_role('super_admin')
        or (public.has_permission('field.approve')
            and (public.has_role('hod') or public.my_project_roles(p_project) && array['manager']));
$$;

create or replace function public.can_manage_members(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select public.has_any_role(array['super_admin','hod','coordinator'])
        or (public.has_permission('project_members.manage') and public.my_project_roles(p_project) && array['manager']);
$$;

create or replace function public.can_verify_documents(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select public.has_role('super_admin')
        or (public.has_permission('documents.verify')
            and (public.has_any_role(array['hod','coordinator','data_admin'])
                 or cardinality(public.my_project_roles(p_project)) > 0));
$$;

create or replace function public.shares_project_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.project_members a
        join public.project_members b on b.project_id = a.project_id
        where a.user_id = auth.uid() and a.is_active = true and b.user_id = p_user
    );
$$;

create or replace function public.can_view_observation(p_obs uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.observations o
        where o.id = p_obs and (
            o.facilitator_id = auth.uid()
            or public.has_role('super_admin')
            or (o.status <> 'draft' and (
                  public.has_any_role(array['coordinator','me','data_admin'])
                  or public.my_project_roles(o.project_id) &&
                     array['manager','coordinator','senior_facilitator','senior_admin','admin','data_admin','me']))
            or (o.status = 'approved' and (
                  public.has_role('hod') or cardinality(public.my_project_roles(o.project_id)) > 0))
        )
    );
$$;

-- Internal audit + notification writers (not callable by clients; see grants at end of 003)
create or replace function public.write_audit(
    p_action text, p_entity_type text, p_entity_id uuid, p_project uuid,
    p_old jsonb default null, p_new jsonb default null, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, project_id, old_values, new_values, metadata)
    values (auth.uid(), p_action, p_entity_type, p_entity_id, p_project, p_old, p_new, coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function public.notify(
    p_user uuid, p_title text, p_message text, p_type text,
    p_entity_type text default null, p_entity_id uuid default null)
returns void language sql security definer set search_path = public as $$
    insert into public.notifications(user_id, title, message, notification_type, entity_type, entity_id)
    select p_user, p_title, p_message, p_type, p_entity_type, p_entity_id
    where p_user is not null and p_user is distinct from auth.uid()
      and exists (select 1 from public.profiles where id = p_user and is_active);
$$;

create or replace function public.notify_project_roles(
    p_project uuid, p_roles text[], p_title text, p_message text, p_type text,
    p_entity_type text default null, p_entity_id uuid default null)
returns void language sql security definer set search_path = public as $$
    select public.notify(u.user_id, p_title, p_message, p_type, p_entity_type, p_entity_id)
    from (select distinct pm.user_id from public.project_members pm
          where pm.project_id = p_project and pm.is_active and pm.project_role = any(p_roles)) u;
$$;

-- ============================================================
-- 3. GUARD TRIGGERS (defence in depth: policies decide WHO, triggers decide WHAT)
-- ============================================================

create or replace function public.workflow_on() returns boolean language sql stable as $$
    select coalesce(current_setting('app.workflow', true), '') = 'on';
$$;

create or replace function public.observations_guard()
returns trigger language plpgsql as $$
begin
    if tg_op = 'UPDATE' then
        if new.facilitator_id <> old.facilitator_id then
            raise exception 'The facilitator of an observation can never be changed (audit rule).';
        end if;
        if new.project_id <> old.project_id then
            raise exception 'The project of an observation cannot be changed.';
        end if;
        if not public.workflow_on() then
            if new.status <> old.status or new.approved_at is distinct from old.approved_at
               or new.approved_by is distinct from old.approved_by
               or new.submitted_at is distinct from old.submitted_at
               or new.manager_id is distinct from old.manager_id then
                raise exception 'Workflow fields can only be changed through the workflow functions.';
            end if;
            if old.status not in ('draft','queried') then
                raise exception 'This observation is locked (status: %).', old.status;
            end if;
        end if;
        new.version := old.version + 1;
    end if;
    return new;
end $$;

drop trigger if exists trg_observations_guard on public.observations;
create trigger trg_observations_guard before update on public.observations
for each row execute function public.observations_guard();

create or replace function public.documents_guard()
returns trigger language plpgsql as $$
begin
    if tg_op = 'UPDATE' and not public.workflow_on() then
        raise exception 'Documents are immutable except through the document workflow functions.';
    end if;
    return new;
end $$;

drop trigger if exists trg_documents_guard on public.documents;
create trigger trg_documents_guard before update on public.documents
for each row execute function public.documents_guard();

create or replace function public.project_members_guard()
returns trigger language plpgsql as $$
begin
    if tg_op = 'UPDATE' then
        if new.project_id <> old.project_id or new.user_id <> old.user_id
           or new.project_role <> old.project_role or new.start_date <> old.start_date then
            raise exception 'Assignment history is immutable: end the assignment and create a new one.';
        end if;
        if old.is_active = false and new.is_active = true then
            raise exception 'An ended assignment cannot be reactivated; create a new assignment.';
        end if;
        if new.is_active = false and new.end_date is null then new.end_date := current_date; end if;
    end if;
    return new;
end $$;

drop trigger if exists trg_project_members_guard on public.project_members;
create trigger trg_project_members_guard before update on public.project_members
for each row execute function public.project_members_guard();

create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if auth.uid() is not null and not public.has_role('super_admin') then
        if new.is_active is distinct from old.is_active or new.email is distinct from old.email
           or new.employee_number is distinct from old.employee_number then
            raise exception 'Only a Super Admin can change activation, email or employee number.';
        end if;
    end if;
    return new;
end $$;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update on public.profiles
for each row execute function public.profiles_guard();

-- Generic audit trigger for configuration-type tables
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb; o jsonb; act text; pid uuid; eid uuid;
begin
    r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    o := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
    act := tg_table_name || '.' || lower(tg_op);
    if tg_table_name = 'project_members' then
        if tg_op = 'INSERT' then act := 'project_member.assigned';
        elsif tg_op = 'UPDATE' and (o->>'is_active') = 'true' and (r->>'is_active') = 'false' then act := 'project_member.ended';
        end if;
    elsif tg_table_name = 'user_roles' then
        eid := (r->>'user_id')::uuid;
        act := case when tg_op = 'DELETE' then 'user_role.removed' else 'user_role.assigned' end;
    end if;
    pid := case when tg_table_name = 'projects' then (r->>'id')::uuid else nullif(r->>'project_id','')::uuid end;
    eid := coalesce(eid, nullif(r->>'id','')::uuid);
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, project_id, old_values, new_values)
    values (auth.uid(), act, tg_table_name, eid, pid, o, case when tg_op = 'DELETE' then null else r end);
    return coalesce(new, old);
end $$;

do $$
declare t text;
begin
    foreach t in array array['projects','project_members','user_roles','school_facilitators',
                             'document_requirements','external_upload_links','project_reports','documents']
    loop
        execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
        if t = 'documents' then
            execute 'create trigger trg_audit_documents after insert on public.documents for each row execute function public.audit_row_change()';
        else
            execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_row_change()', t);
        end if;
    end loop;
end $$;

-- ============================================================
-- 4. POLICY REPLACEMENTS
-- ============================================================

-- Profiles: self, management, or someone I share a project with
drop policy if exists profiles_select_self_or_management on public.profiles;
drop policy if exists profiles_select_scoped on public.profiles;
create policy profiles_select_scoped on public.profiles for select to authenticated
using (id = auth.uid()
       or public.has_any_role(array['super_admin','hod','coordinator','me','data_admin'])
       or public.shares_project_with(id));

-- Roles & permissions: only super admin may change the matrix
drop policy if exists roles_manage_super_admin on public.roles;
drop policy if exists roles_manage_super_admin on public.roles;
create policy roles_manage_super_admin on public.roles for all to authenticated
using (public.has_role('super_admin')) with check (public.has_role('super_admin'));
drop policy if exists role_permissions_manage_super_admin on public.role_permissions;
drop policy if exists role_permissions_manage_super_admin on public.role_permissions;
create policy role_permissions_manage_super_admin on public.role_permissions for all to authenticated
using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

-- Projects: management writes already restricted to super_admin/hod in 001 (kept).

-- Project members: no hard deletes (history), scoped insert/update
drop policy if exists project_members_manage on public.project_members;
drop policy if exists project_members_select_permitted on public.project_members;
drop policy if exists project_members_select_scoped on public.project_members;
create policy project_members_select_scoped on public.project_members for select to authenticated
using (user_id = auth.uid() or public.can_access_project(project_id));
drop policy if exists project_members_insert_scoped on public.project_members;
create policy project_members_insert_scoped on public.project_members for insert to authenticated
with check (public.can_manage_members(project_id));
drop policy if exists project_members_update_scoped on public.project_members;
create policy project_members_update_scoped on public.project_members for update to authenticated
using (public.can_manage_members(project_id)) with check (public.can_manage_members(project_id));

-- Schools / teachers: reads stay as in 001; writes only via upsert_* functions
drop policy if exists schools_manage_permitted on public.schools;
drop policy if exists teachers_manage_permitted on public.teachers;
drop policy if exists project_schools_manage_permitted on public.project_schools;
drop policy if exists project_teachers_manage_permitted on public.project_teachers;

drop policy if exists school_facilitators_select on public.school_facilitators;
drop policy if exists school_facilitators_select on public.school_facilitators;
create policy school_facilitators_select on public.school_facilitators for select to authenticated
using (user_id = auth.uid() or public.can_access_project(project_id));

drop policy if exists system_settings_select on public.system_settings;
drop policy if exists system_settings_select on public.system_settings;
create policy system_settings_select on public.system_settings for select to authenticated using (true);
drop policy if exists system_settings_manage on public.system_settings;
drop policy if exists system_settings_manage on public.system_settings;
create policy system_settings_manage on public.system_settings for all to authenticated
using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

-- Organisation editable by super admin
drop policy if exists organizations_manage_super_admin on public.organizations;
drop policy if exists organizations_manage_super_admin on public.organizations;
create policy organizations_manage_super_admin on public.organizations for all to authenticated
using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

-- Observations
drop policy if exists observations_select_permitted on public.observations;
drop policy if exists observations_insert_facilitator on public.observations;
drop policy if exists observations_update_owner_or_reviewer on public.observations;

drop policy if exists observations_select_scoped on public.observations;
create policy observations_select_scoped on public.observations for select to authenticated
using (
    facilitator_id = auth.uid()
    or public.has_role('super_admin')
    or (status <> 'draft' and (
          public.has_any_role(array['coordinator','me','data_admin'])
          or public.my_project_roles(project_id) &&
             array['manager','coordinator','senior_facilitator','senior_admin','admin','data_admin','me']))
    or (status = 'approved' and (public.has_role('hod') or cardinality(public.my_project_roles(project_id)) > 0))
);

drop policy if exists observations_insert_own_draft on public.observations;
create policy observations_insert_own_draft on public.observations for insert to authenticated
with check (
    facilitator_id = auth.uid() and status = 'draft'
    and public.has_permission('field.submit')
    and public.my_project_roles(project_id) && array['facilitator','senior_facilitator','intern']
);

drop policy if exists observations_update_own on public.observations;
create policy observations_update_own on public.observations for update to authenticated
using (facilitator_id = auth.uid() and status in ('draft','queried'))
with check (facilitator_id = auth.uid());

-- Observation answers
drop policy if exists observation_answers_select_permitted on public.observation_answers;
drop policy if exists observation_answers_write_permitted on public.observation_answers;
drop policy if exists observation_answers_select_scoped on public.observation_answers;
create policy observation_answers_select_scoped on public.observation_answers for select to authenticated
using (public.can_view_observation(observation_id));
drop policy if exists observation_answers_write_own on public.observation_answers;
create policy observation_answers_write_own on public.observation_answers for all to authenticated
using (exists (select 1 from public.observations o where o.id = observation_id
               and o.facilitator_id = auth.uid() and o.status in ('draft','queried')))
with check (exists (select 1 from public.observations o where o.id = observation_id
               and o.facilitator_id = auth.uid() and o.status in ('draft','queried')));

-- Queries / items / history are written by workflow functions only
drop policy if exists observation_queries_select_permitted on public.observation_queries;
drop policy if exists observation_queries_manage_permitted on public.observation_queries;
drop policy if exists observation_queries_select_scoped on public.observation_queries;
create policy observation_queries_select_scoped on public.observation_queries for select to authenticated
using (public.can_view_observation(observation_id));

drop policy if exists observation_query_items_select_permitted on public.observation_query_items;
drop policy if exists observation_query_items_manage_permitted on public.observation_query_items;
drop policy if exists observation_query_items_select_scoped on public.observation_query_items;
create policy observation_query_items_select_scoped on public.observation_query_items for select to authenticated
using (exists (select 1 from public.observation_queries q
               where q.id = query_id and public.can_view_observation(q.observation_id)));

drop policy if exists observation_status_history_select_permitted on public.observation_status_history;
drop policy if exists observation_status_history_select_scoped on public.observation_status_history;
create policy observation_status_history_select_scoped on public.observation_status_history for select to authenticated
using (public.can_view_observation(observation_id));

-- Documents
drop policy if exists documents_select_permitted on public.documents;
drop policy if exists documents_insert_permitted on public.documents;
drop policy if exists documents_update_permitted on public.documents;

drop policy if exists documents_select_scoped on public.documents;
create policy documents_select_scoped on public.documents for select to authenticated
using (
    uploaded_by = auth.uid()
    or public.has_role('super_admin')
    or (observation_id is not null and public.can_view_observation(observation_id))
    or (observation_id is null and project_id is not null and (
          public.has_any_role(array['hod','coordinator','me','data_admin'])
          or cardinality(public.my_project_roles(project_id)) > 0))
);

drop policy if exists documents_insert_scoped on public.documents;
create policy documents_insert_scoped on public.documents for insert to authenticated
with check (
    uploaded_by = auth.uid() and status = 'uploaded' and project_id is not null
    and public.has_permission('documents.upload')
    and (public.has_role('super_admin') or cardinality(public.my_project_roles(project_id)) > 0)
    and (observation_id is null or exists (
          select 1 from public.observations o
          where o.id = observation_id and o.facilitator_id = auth.uid() and o.status in ('draft','queried')))
);

-- Field sessions: write only own
drop policy if exists field_sessions_write_permitted on public.field_sessions;
drop policy if exists field_sessions_write_own on public.field_sessions;
create policy field_sessions_write_own on public.field_sessions for all to authenticated
using (facilitator_id = auth.uid()) with check (
    facilitator_id = auth.uid() and public.my_project_roles(project_id) && array['facilitator','senior_facilitator','intern']);

-- Notifications: users mark their own as read; nothing can be inserted by clients
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Audit: add project managers for their own projects
drop policy if exists audit_logs_project_managers on public.audit_logs;
drop policy if exists audit_logs_project_managers on public.audit_logs;
create policy audit_logs_project_managers on public.audit_logs for select to authenticated
using (project_id is not null and public.my_project_roles(project_id) && array['manager']);

-- Access requests: super admin / hod review (select kept from 001); updates through admin-users function.

-- ============================================================
-- 5. STORAGE: object visibility follows document visibility
-- ============================================================

drop policy if exists project_files_select_permitted on storage.objects;
drop policy if exists project_files_insert_authenticated on storage.objects;
drop policy if exists project_files_update_owner on storage.objects;
drop policy if exists project_files_select_scoped on storage.objects;
drop policy if exists project_files_insert_scoped on storage.objects;

drop policy if exists project_files_select_scoped on storage.objects;
create policy project_files_select_scoped on storage.objects for select to authenticated
using (
    bucket_id = 'project-files'
    and (owner = auth.uid()
         or exists (select 1 from public.documents d
                    where d.storage_bucket = 'project-files' and d.storage_path = storage.objects.name))
);

drop policy if exists project_files_insert_scoped on storage.objects;
create policy project_files_insert_scoped on storage.objects for insert to authenticated
with check (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_permission('documents.upload')
    and (public.has_role('super_admin')
         or cardinality(public.my_project_roles(((storage.foldername(name))[1])::uuid)) > 0)
);
-- No update/delete policies: stored files are immutable (supersede instead of overwrite).

-- ============================================================
-- 6. REALTIME
-- ============================================================
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables
                       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
        alter publication supabase_realtime add table public.notifications;
    end if;
end $$;
