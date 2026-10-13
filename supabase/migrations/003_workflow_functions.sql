-- ORT SA STEM & IT ACADEMY - 003: workflow functions (all writes with business rules)

create or replace function public.obs_ref(p_ref bigint) returns text
language sql immutable as $$ select 'OBS-' || lpad(p_ref::text, 5, '0') $$;

create or replace function public._obs_status_change(p_obs uuid, p_from text, p_to text, p_note text)
returns void language sql security definer set search_path = public as $$
    insert into public.observation_status_history(observation_id, from_status, to_status, changed_by, note)
    values (p_obs, p_from, p_to, auth.uid(), p_note);
$$;

-- ---------- Observation workflow ----------

create or replace function public.submit_observation(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare o public.observations; new_status text; missing text[] := '{}';
begin
    select * into o from public.observations where id = p_id for update;
    if not found or o.facilitator_id is distinct from auth.uid() then
        raise exception 'Observation not found.'; end if;
    if o.status not in ('draft','queried') then
        raise exception 'Only drafts or queried observations can be submitted (current: %).', o.status; end if;

    if o.school_id is null then missing := missing || 'school'; end if;
    if o.teacher_id is null then missing := missing || 'teacher'; end if;
    if o.observed_at is null then missing := missing || 'date/time'; end if;
    if coalesce(trim(o.subject),'') = '' then missing := missing || 'subject'; end if;
    if coalesce(trim(o.grade),'') = '' then missing := missing || 'grade'; end if;
    if coalesce(trim(o.caps_topic),'') = '' then missing := missing || 'CAPS topic'; end if;
    if o.samr_level is null then missing := missing || 'SAMR level'; end if;
    if coalesce(trim(o.learning_outcomes),'') = '' then missing := missing || 'learning outcomes'; end if;
    if coalesce(trim(o.strength_1),'') = '' or coalesce(trim(o.strength_2),'') = ''
       or coalesce(trim(o.strength_3),'') = '' then missing := missing || 'three strengths'; end if;
    if coalesce(trim(o.development_area),'') = '' then missing := missing || 'development area'; end if;
    if coalesce(trim(o.practical_suggestion),'') = '' then missing := missing || 'practical suggestion'; end if;
    if coalesce(trim(o.agreed_action),'') = '' then missing := missing || 'agreed action'; end if;
    if cardinality(missing) > 0 then
        raise exception 'Required fields missing: %', array_to_string(missing, ', '); end if;

    new_status := case when o.status = 'queried' then 'resubmitted' else 'submitted' end;
    perform set_config('app.workflow', 'on', true);
    update public.observations set status = new_status, submitted_at = now() where id = p_id;

    if new_status = 'resubmitted' then
        update public.observation_queries set status = 'resolved', resolved_at = now()
        where observation_id = p_id and status = 'open';
        update public.observation_query_items i set is_resolved = true, resolved_by = auth.uid(), resolved_at = now()
        from public.observation_queries q where q.id = i.query_id and q.observation_id = p_id and not i.is_resolved;
    end if;

    perform public._obs_status_change(p_id, o.status, new_status, null);
    perform public.write_audit('observation.' || new_status, 'observations', p_id, o.project_id,
        jsonb_build_object('status', o.status), jsonb_build_object('status', new_status),
        jsonb_build_object('ref', public.obs_ref(o.ref_no)));
    perform public.notify_project_roles(o.project_id, array['manager'],
        case when new_status = 'resubmitted' then 'Observation resubmitted' else 'Observation submitted' end,
        public.obs_ref(o.ref_no) || ' is waiting for your review.', 'review_request', 'observation', p_id);
    return new_status;
end $$;

create or replace function public.start_review(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare o public.observations;
begin
    select * into o from public.observations where id = p_id for update;
    if not found then raise exception 'Observation not found.'; end if;
    if not public.can_review_project(o.project_id) then raise exception 'You are not permitted to review this observation.'; end if;
    if o.status not in ('submitted','resubmitted') then return o.status; end if;
    perform set_config('app.workflow', 'on', true);
    update public.observations set status = 'under_review', manager_id = auth.uid() where id = p_id;
    perform public._obs_status_change(p_id, o.status, 'under_review', null);
    perform public.write_audit('observation.under_review', 'observations', p_id, o.project_id,
        jsonb_build_object('status', o.status), jsonb_build_object('status', 'under_review'));
    return 'under_review';
end $$;

create or replace function public.query_observation(p_id uuid, p_text text, p_items jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.observations; qid uuid; it text;
begin
    select * into o from public.observations where id = p_id for update;
    if not found then raise exception 'Observation not found.'; end if;
    if not public.can_query_project(o.project_id) then raise exception 'You are not permitted to query this observation.'; end if;
    if o.status not in ('submitted','resubmitted','under_review') then
        raise exception 'Only observations awaiting review can be queried (current: %).', o.status; end if;
    if coalesce(trim(p_text),'') = '' and jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
        raise exception 'Provide a query message or at least one query item.'; end if;

    insert into public.observation_queries(observation_id, manager_id, query_text)
    values (p_id, auth.uid(), coalesce(nullif(trim(p_text),''), 'Please see the items below.')) returning id into qid;
    for it in select jsonb_array_elements_text(coalesce(p_items,'[]'::jsonb)) loop
        if trim(it) <> '' then
            insert into public.observation_query_items(query_id, item_text) values (qid, trim(it));
        end if;
    end loop;

    perform set_config('app.workflow', 'on', true);
    update public.observations set status = 'queried', manager_id = auth.uid() where id = p_id;
    perform public._obs_status_change(p_id, o.status, 'queried', p_text);
    perform public.write_audit('observation.queried', 'observations', p_id, o.project_id,
        jsonb_build_object('status', o.status), jsonb_build_object('status', 'queried'),
        jsonb_build_object('query_id', qid, 'ref', public.obs_ref(o.ref_no)));
    perform public.notify(o.facilitator_id, 'Changes requested',
        'Observation ' || public.obs_ref(o.ref_no) || ' requires changes.', 'query', 'observation', p_id);
    return qid;
end $$;

create or replace function public.approve_observation(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.observations;
begin
    select * into o from public.observations where id = p_id for update;
    if not found then raise exception 'Observation not found.'; end if;
    if not public.can_approve_project(o.project_id) then raise exception 'You are not permitted to approve this observation.'; end if;
    if o.status not in ('submitted','resubmitted','under_review') then
        raise exception 'Only observations awaiting review can be approved (current: %).', o.status; end if;
    if o.facilitator_id = auth.uid() then raise exception 'You cannot approve your own observation.'; end if;
    perform set_config('app.workflow', 'on', true);
    update public.observations set status = 'approved', approved_at = now(), approved_by = auth.uid(),
        manager_id = coalesce(manager_id, auth.uid()) where id = p_id;
    perform public._obs_status_change(p_id, o.status, 'approved', p_note);
    perform public.write_audit('observation.approved', 'observations', p_id, o.project_id,
        jsonb_build_object('status', o.status), jsonb_build_object('status', 'approved'),
        jsonb_build_object('ref', public.obs_ref(o.ref_no)));
    perform public.notify(o.facilitator_id, 'Observation approved',
        public.obs_ref(o.ref_no) || ' has been approved.', 'approval', 'observation', p_id);
end $$;

create or replace function public.resolve_query_item(p_item uuid, p_resolved boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
    update public.observation_query_items i set is_resolved = p_resolved,
        resolved_by = case when p_resolved then auth.uid() end,
        resolved_at = case when p_resolved then now() end
    from public.observation_queries q join public.observations o on o.id = q.observation_id
    where i.id = p_item and q.id = i.query_id and o.facilitator_id = auth.uid() and o.status = 'queried';
    if not found then raise exception 'Item not found or not editable.'; end if;
end $$;

-- ---------- Documents ----------

create or replace function public.set_document_status(p_doc uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d public.documents;
begin
    if p_status not in ('under_review','verified','queried','rejected','archived','superseded') then
        raise exception 'Invalid status.'; end if;
    select * into d from public.documents where id = p_doc for update;
    if not found or d.project_id is null then raise exception 'Document not found.'; end if;
    if not public.can_verify_documents(d.project_id) then raise exception 'You are not permitted to verify documents.'; end if;
    if p_status in ('queried','rejected') and coalesce(trim(p_note),'') = '' then
        raise exception 'A note is required when querying or rejecting a document.'; end if;
    perform set_config('app.workflow', 'on', true);
    update public.documents set status = p_status, verification_note = p_note,
        verified_by = case when p_status in ('verified','rejected','queried') then auth.uid() else verified_by end,
        verified_at = case when p_status in ('verified','rejected','queried') then now() else verified_at end
    where id = p_doc;
    if d.external_submission_id is not null then
        update public.external_submissions set
            status = case p_status when 'verified' then 'accepted' when 'queried' then 'queried'
                                   when 'rejected' then 'rejected' else 'under_review' end,
            reviewed_by = auth.uid(), reviewed_at = now()
        where id = d.external_submission_id;
    end if;
    perform public.write_audit('document.' || p_status, 'documents', p_doc, d.project_id,
        jsonb_build_object('status', d.status), jsonb_build_object('status', p_status),
        jsonb_build_object('title', d.title, 'note', p_note));
    if d.uploaded_by is not null and p_status in ('queried','rejected','verified') then
        perform public.notify(d.uploaded_by, 'Document ' || p_status, d.title || ' was marked ' || p_status || '.',
            'document', 'document', p_doc);
    end if;
end $$;

-- ---------- Schools / teachers (scoped writes) ----------

create or replace function public._can_edit_directory(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select public.has_role('super_admin')
        or (public.has_permission('schools.manage')
            and (public.has_any_role(array['hod','coordinator','data_admin'])
                 or cardinality(public.my_project_roles(p_project)) > 0));
$$;

create or replace function public.upsert_school(p_project uuid, p_school jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid := nullif(p_school->>'id','')::uuid;
begin
    if not public._can_edit_directory(p_project) then raise exception 'You are not permitted to manage schools in this project.'; end if;
    if coalesce(trim(p_school->>'name'),'') = '' then raise exception 'School name is required.'; end if;
    if sid is null then
        insert into public.schools(name, school_code, province, district, municipality, address,
                                   contact_person, contact_phone, contact_email)
        values (trim(p_school->>'name'), nullif(trim(p_school->>'school_code'),''), nullif(p_school->>'province',''),
                nullif(p_school->>'district',''), nullif(p_school->>'municipality',''), nullif(p_school->>'address',''),
                nullif(p_school->>'contact_person',''), nullif(p_school->>'contact_phone',''), nullif(p_school->>'contact_email',''))
        returning id into sid;
        insert into public.project_schools(project_id, school_id) values (p_project, sid) on conflict do nothing;
        perform public.write_audit('school.created', 'schools', sid, p_project, null, p_school);
    else
        if not exists (select 1 from public.project_schools where project_id = p_project and school_id = sid) then
            raise exception 'School is not linked to this project.'; end if;
        update public.schools set
            name = coalesce(nullif(trim(p_school->>'name'),''), name),
            school_code = nullif(trim(coalesce(p_school->>'school_code', school_code, '')),''),
            province = nullif(coalesce(p_school->>'province', province, ''),''),
            district = nullif(coalesce(p_school->>'district', district, ''),''),
            municipality = nullif(coalesce(p_school->>'municipality', municipality, ''),''),
            address = nullif(coalesce(p_school->>'address', address, ''),''),
            contact_person = nullif(coalesce(p_school->>'contact_person', contact_person, ''),''),
            contact_phone = nullif(coalesce(p_school->>'contact_phone', contact_phone, ''),''),
            contact_email = nullif(coalesce(p_school->>'contact_email', contact_email, ''),''),
            is_active = coalesce((p_school->>'is_active')::boolean, is_active)
        where id = sid;
        perform public.write_audit('school.updated', 'schools', sid, p_project, null, p_school);
    end if;
    return sid;
end $$;

create or replace function public.upsert_teacher(p_project uuid, p_teacher jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid := nullif(p_teacher->>'id','')::uuid; sid uuid := nullif(p_teacher->>'school_id','')::uuid;
begin
    if not public._can_edit_directory(p_project) then raise exception 'You are not permitted to manage teachers in this project.'; end if;
    if coalesce(trim(p_teacher->>'full_name'),'') = '' then raise exception 'Teacher name is required.'; end if;
    if sid is null or not exists (select 1 from public.project_schools where project_id = p_project and school_id = sid) then
        raise exception 'Choose a school that belongs to this project.'; end if;
    if tid is null then
        insert into public.teachers(school_id, employee_or_teacher_number, full_name, email, phone, grade_levels, subjects)
        values (sid, nullif(trim(p_teacher->>'employee_or_teacher_number'),''), trim(p_teacher->>'full_name'),
                nullif(p_teacher->>'email',''), nullif(p_teacher->>'phone',''),
                case when p_teacher ? 'grade_levels' then array(select jsonb_array_elements_text(p_teacher->'grade_levels')) end,
                case when p_teacher ? 'subjects' then array(select jsonb_array_elements_text(p_teacher->'subjects')) end)
        returning id into tid;
        insert into public.project_teachers(project_id, teacher_id) values (p_project, tid) on conflict do nothing;
        perform public.write_audit('teacher.created', 'teachers', tid, p_project, null, p_teacher);
    else
        if not exists (select 1 from public.project_teachers where project_id = p_project and teacher_id = tid) then
            raise exception 'Teacher is not linked to this project.'; end if;
        update public.teachers set school_id = sid,
            employee_or_teacher_number = nullif(trim(coalesce(p_teacher->>'employee_or_teacher_number', employee_or_teacher_number, '')),''),
            full_name = trim(p_teacher->>'full_name'),
            email = nullif(coalesce(p_teacher->>'email', email, ''),''),
            phone = nullif(coalesce(p_teacher->>'phone', phone, ''),''),
            grade_levels = case when p_teacher ? 'grade_levels' then array(select jsonb_array_elements_text(p_teacher->'grade_levels')) else grade_levels end,
            subjects = case when p_teacher ? 'subjects' then array(select jsonb_array_elements_text(p_teacher->'subjects')) else subjects end,
            is_active = coalesce((p_teacher->>'is_active')::boolean, is_active)
        where id = tid;
        perform public.write_audit('teacher.updated', 'teachers', tid, p_project, null, p_teacher);
    end if;
    return tid;
end $$;

create or replace function public.set_school_facilitators(p_project uuid, p_school uuid, p_users uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
    if not (public.can_manage_members(p_project) or public.my_project_roles(p_project) && array['admin','senior_admin']) then
        raise exception 'You are not permitted to assign facilitators.'; end if;
    update public.school_facilitators set is_active = false, end_date = current_date
    where project_id = p_project and school_id = p_school and is_active and not (user_id = any(coalesce(p_users,'{}')));
    insert into public.school_facilitators(project_id, school_id, user_id, assigned_by)
    select p_project, p_school, u, auth.uid()
    from unnest(coalesce(p_users,'{}')) u
    where exists (select 1 from public.project_members pm where pm.project_id = p_project and pm.user_id = u
                  and pm.is_active and pm.project_role in ('facilitator','senior_facilitator','intern'))
    on conflict do nothing;
end $$;

-- ---------- Project membership with history ----------

create or replace function public.replace_project_member(
    p_project uuid, p_old_user uuid, p_role text, p_new_user uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare nid uuid; pname text;
begin
    if not public.can_manage_members(p_project) then raise exception 'You are not permitted to change project members.'; end if;
    if p_old_user = p_new_user then raise exception 'Choose a different person.'; end if;
    update public.project_members set is_active = false, end_date = current_date
    where project_id = p_project and user_id = p_old_user and project_role = p_role and is_active;
    if not found then raise exception 'The person being replaced is not an active % on this project.', p_role; end if;
    update public.school_facilitators set is_active = false, end_date = current_date
    where project_id = p_project and user_id = p_old_user and is_active;
    insert into public.project_members(project_id, user_id, project_role, start_date, assigned_by)
    values (p_project, p_new_user, p_role, current_date, auth.uid()) returning id into nid;
    perform public.write_audit('project_member.replaced', 'project_members', nid, p_project,
        jsonb_build_object('user_id', p_old_user), jsonb_build_object('user_id', p_new_user, 'role', p_role),
        jsonb_build_object('note', p_note));
    select name into pname from public.projects where id = p_project;
    perform public.notify(p_new_user, 'Project assignment', 'You have been assigned to ' || pname || ' as ' || p_role || '.', 'assignment', 'project', p_project);
    return nid;
end $$;

-- ---------- External upload links ----------

create or replace function public.create_external_upload_link(
    p_project uuid, p_school uuid, p_teacher uuid, p_label text, p_purpose text,
    p_days integer default 14, p_max_uses integer default 5)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tok text; lid uuid;
begin
    if not (public.has_role('super_admin') or (public.has_permission('external_upload.manage')
            and (public.has_any_role(array['hod','coordinator']) or cardinality(public.my_project_roles(p_project)) > 0))) then
        raise exception 'You are not permitted to create upload links.'; end if;
    if p_teacher is not null and not exists (select 1 from public.project_teachers where project_id = p_project and teacher_id = p_teacher and is_active) then
        raise exception 'Teacher is not part of this project.'; end if;
    if p_school is not null and not exists (select 1 from public.project_schools where project_id = p_project and school_id = p_school and is_active) then
        raise exception 'School is not part of this project.'; end if;
    tok := encode(gen_random_bytes(32), 'hex');
    insert into public.external_upload_links(project_id, school_id, teacher_id, created_by, token_hash, label, purpose, expires_at, max_uses)
    values (p_project, p_school, p_teacher, auth.uid(), encode(digest(tok, 'sha256'), 'hex'), p_label, p_purpose,
            now() + make_interval(days => greatest(1, least(coalesce(p_days,14), 90))), greatest(1, least(coalesce(p_max_uses,5), 50)))
    returning id into lid;
    return jsonb_build_object('id', lid, 'token', tok);  -- plaintext token is shown ONCE and never stored
end $$;

create or replace function public.revoke_external_link(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l public.external_upload_links;
begin
    select * into l from public.external_upload_links where id = p_id;
    if not found then raise exception 'Link not found.'; end if;
    if not (public.has_any_role(array['super_admin','hod','coordinator']) or l.created_by = auth.uid()
            or public.my_project_roles(l.project_id) && array['manager','admin','senior_admin']) then
        raise exception 'You are not permitted to revoke this link.'; end if;
    update public.external_upload_links set is_active = false where id = p_id;
end $$;

-- ---------- Edge-function-only helpers (service_role) ----------

create or replace function public.external_notify_received(p_project uuid, p_submission uuid, p_doc_title text)
returns void language sql security definer set search_path = public as $$
    select public.notify_project_roles(p_project, array['admin','senior_admin','data_admin','manager'],
        'New external submission', 'New external document received: ' || p_doc_title, 'external_submission', 'external_submission', p_submission);
$$;
