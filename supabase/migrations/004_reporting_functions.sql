-- ORT SA STEM & IT ACADEMY - 004: outstanding items, project health, dashboards, reports, analytics
-- Every number is computed from real rows. Nothing is estimated.

-- ---------- Outstanding items ----------
-- kinds: missing_document | resubmission | awaiting_verification | overdue_action
create or replace function public._outstanding(p_project uuid)
returns table(kind text, entity_type text, entity_id uuid, school_id uuid, teacher_id uuid,
              label text, detail text, due_date date)
language sql stable security definer set search_path = public as $$
    -- teacher-level required documents (frequency 'monthly' = needs one in the current calendar month;
    -- every other frequency = at least one valid document ever)
    select 'missing_document'::text, 'teacher'::text, t.id, t.school_id, t.id,
           dr.name::text, (t.full_name || ' - ' || s.name)::text, null::date
    from public.document_requirements dr
    join public.project_teachers pt on pt.project_id = dr.project_id and pt.is_active
    join public.teachers t on t.id = pt.teacher_id and t.is_active
    join public.schools s on s.id = t.school_id
    where dr.project_id = p_project and dr.is_required and dr.applies_to = 'teacher'
      and not exists (
          select 1 from public.documents d
          where d.project_id = p_project and d.teacher_id = t.id and d.document_type_id = dr.document_type_id
            and d.status not in ('rejected','archived','superseded','queried')
            and (dr.frequency is distinct from 'monthly' or d.created_at >= date_trunc('month', now())))
    union all
    select 'missing_document', 'school', s.id, s.id, null, dr.name::text, s.name::text, null::date
    from public.document_requirements dr
    join public.project_schools ps on ps.project_id = dr.project_id and ps.is_active
    join public.schools s on s.id = ps.school_id and s.is_active
    where dr.project_id = p_project and dr.is_required and dr.applies_to = 'school'
      and not exists (
          select 1 from public.documents d
          where d.project_id = p_project and d.school_id = s.id and d.teacher_id is null
            and d.document_type_id = dr.document_type_id
            and d.status not in ('rejected','archived','superseded','queried')
            and (dr.frequency is distinct from 'monthly' or d.created_at >= date_trunc('month', now())))
    union all
    select 'resubmission', 'observation', o.id, o.school_id, o.teacher_id,
           public.obs_ref(o.ref_no)::text, coalesce(t.full_name, 'No teacher')::text, null::date
    from public.observations o left join public.teachers t on t.id = o.teacher_id
    where o.project_id = p_project and o.status = 'queried'
    union all
    select 'awaiting_verification', 'document', d.id, d.school_id, d.teacher_id,
           d.title::text, coalesce(dt.name, 'Document')::text, null::date
    from public.documents d left join public.document_types dt on dt.id = d.document_type_id
    where d.project_id = p_project and d.status in ('uploaded','under_review')
      and coalesce(dt.requires_verification, false)
    union all
    select 'overdue_action', 'observation', o.id, o.school_id, o.teacher_id,
           public.obs_ref(o.ref_no)::text, coalesce(t.full_name, 'No teacher')::text, o.next_observation_date
    from public.observations o left join public.teachers t on t.id = o.teacher_id
    where o.project_id = p_project and o.status = 'approved'
      and o.next_observation_date is not null and o.next_observation_date < current_date
      and not exists (
          select 1 from public.observations n
          where n.project_id = p_project and n.teacher_id = o.teacher_id and n.id <> o.id
            and n.status <> 'draft' and coalesce(n.observed_at, n.created_at)::date >= o.next_observation_date);
$$;

create or replace function public.outstanding_items(p_project uuid)
returns table(kind text, entity_type text, entity_id uuid, school_id uuid, teacher_id uuid,
              label text, detail text, due_date date)
language plpgsql stable security definer set search_path = public as $$
begin
    if not public.can_access_project(p_project) then raise exception 'Not permitted.'; end if;
    return query select * from public._outstanding(p_project) order by 1, 6, 7;
end $$;

-- ---------- Project health (explained, not invented) ----------
create or replace function public._project_health(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    slots int; missing int; doc_score numeric;
    facs int; active_facs int; act_score numeric;
    ent int; complete int; dc_score numeric;
    denom int; overdue int; ap_score numeric;
    pend int; covered int; rep_score numeric;
    scores numeric[]; overall numeric;
begin
    select coalesce(sum(case dr.applies_to
              when 'teacher' then (select count(*) from public.project_teachers pt join public.teachers t on t.id = pt.teacher_id
                                   where pt.project_id = p_project and pt.is_active and t.is_active)
              when 'school' then (select count(*) from public.project_schools ps join public.schools s on s.id = ps.school_id
                                  where ps.project_id = p_project and ps.is_active and s.is_active)
              else 0 end), 0)
      into slots from public.document_requirements dr
      where dr.project_id = p_project and dr.is_required and dr.applies_to in ('teacher','school');
    select count(*) into missing from public._outstanding(p_project) where kind = 'missing_document';
    doc_score := case when slots > 0 then round(100.0 * greatest(slots - missing, 0) / slots, 0) end;

    select count(distinct user_id) into facs from public.project_members
      where project_id = p_project and is_active and project_role in ('facilitator','senior_facilitator');
    select count(distinct o.facilitator_id) into active_facs from public.observations o
      join public.project_members pm on pm.user_id = o.facilitator_id and pm.project_id = p_project and pm.is_active
           and pm.project_role in ('facilitator','senior_facilitator')
      where o.project_id = p_project and o.status <> 'draft' and o.submitted_at >= now() - interval '30 days';
    act_score := case when facs > 0 then round(100.0 * active_facs / facs, 0) end;

    select (select count(*) from public.project_teachers pt join public.teachers t on t.id = pt.teacher_id
              where pt.project_id = p_project and pt.is_active and t.is_active)
         + (select count(*) from public.project_schools ps join public.schools s on s.id = ps.school_id
              where ps.project_id = p_project and ps.is_active and s.is_active) into ent;
    select (select count(*) from public.project_teachers pt join public.teachers t on t.id = pt.teacher_id
              where pt.project_id = p_project and pt.is_active and t.is_active
                and coalesce(t.employee_or_teacher_number,'') <> '' and (coalesce(t.email,'') <> '' or coalesce(t.phone,'') <> ''))
         + (select count(*) from public.project_schools ps join public.schools s on s.id = ps.school_id
              where ps.project_id = p_project and ps.is_active and s.is_active
                and coalesce(s.province,'') <> '' and coalesce(s.district,'') <> '') into complete;
    dc_score := case when ent > 0 then round(100.0 * complete / ent, 0) end;

    select count(*) into denom from public.observations o
      where o.project_id = p_project and o.status <> 'draft'
        and (o.submitted_at >= now() - interval '90 days' or o.status in ('submitted','under_review','resubmitted'));
    select count(*) into overdue from public.observations o
      where o.project_id = p_project and o.status in ('submitted','under_review','resubmitted')
        and o.submitted_at < now() - interval '7 days';
    ap_score := case when denom > 0 then round(100.0 * (denom - overdue) / denom, 0) end;

    select count(*) into pend from public.reporting_periods rp
      where rp.project_id = p_project and rp.end_date < current_date and rp.end_date >= current_date - 180;
    select count(*) into covered from public.reporting_periods rp
      where rp.project_id = p_project and rp.end_date < current_date and rp.end_date >= current_date - 180
        and exists (select 1 from public.project_reports r where r.reporting_period_id = rp.id
                    and r.status in ('generated','reviewed','approved','published'));
    rep_score := case when pend > 0 then round(100.0 * covered / pend, 0) end;

    scores := array_remove(array[doc_score, act_score, dc_score, ap_score, rep_score], null);
    overall := case when cardinality(scores) > 0 then round((select avg(x) from unnest(scores) x), 0) end;

    return jsonb_build_object(
      'overall', overall,
      'documentation', jsonb_build_object('score', doc_score, 'detail', format('%s of %s required document slots are filled.', greatest(slots - missing,0), slots)),
      'field_activity', jsonb_build_object('score', act_score, 'detail', format('%s of %s active facilitators submitted an observation in the last 30 days.', active_facs, facs)),
      'data_completeness', jsonb_build_object('score', dc_score, 'detail', format('%s of %s teacher/school records have the key fields (teacher number + contact; province + district).', complete, ent)),
      'approvals', jsonb_build_object('score', ap_score, 'detail', format('%s of %s recent submissions are not waiting longer than 7 days for review.', denom - overdue, denom)),
      'reporting', jsonb_build_object('score', rep_score, 'detail', format('%s of %s reporting periods that ended in the last 180 days have a generated report.', covered, pend)));
end $$;

create or replace function public.project_health(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if not public.can_access_project(p_project) then raise exception 'Not permitted.'; end if;
    return public._project_health(p_project);
end $$;

-- ---------- Counts ----------
create or replace function public._project_counts(p_project uuid)
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
      'schools', (select count(*) from public.project_schools where project_id = p_project and is_active),
      'teachers', (select count(*) from public.project_teachers where project_id = p_project and is_active),
      'facilitators', (select count(distinct user_id) from public.project_members where project_id = p_project and is_active and project_role in ('facilitator','senior_facilitator')),
      'administrators', (select count(distinct user_id) from public.project_members where project_id = p_project and is_active and project_role in ('admin','senior_admin','data_admin')),
      'observations_month', (select count(*) from public.observations where project_id = p_project and status <> 'draft' and submitted_at >= date_trunc('month', now())),
      'observations_total', (select count(*) from public.observations where project_id = p_project and status <> 'draft'),
      'pending', (select count(*) from public.observations where project_id = p_project and status in ('submitted','under_review','resubmitted')),
      'queried', (select count(*) from public.observations where project_id = p_project and status = 'queried'),
      'approved', (select count(*) from public.observations where project_id = p_project and status = 'approved'),
      'docs_awaiting', (select count(*) from public.documents where project_id = p_project and status in ('uploaded','under_review')),
      'new_external', (select count(*) from public.external_submissions where project_id = p_project and status = 'received'),
      'missing_documents', (select count(*) from public._outstanding(p_project) where kind = 'missing_document'),
      'outstanding_total', (select count(*) from public._outstanding(p_project)));
$$;

create or replace function public.project_overview(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
    if not public.can_access_project(p_project) then raise exception 'Not permitted.'; end if;
    select jsonb_build_object(
      'project', (select to_jsonb(p) from public.projects p where p.id = p_project),
      'counts', public._project_counts(p_project),
      'health', public._project_health(p_project),
      'outstanding_by_label', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'label', label, 'count', c) order by kind, label)
                                        from (select kind, label, count(*) c from public._outstanding(p_project) group by 1,2) x), '[]'::jsonb),
      'trend', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                  'submitted', (select count(*) from public.observations o where o.project_id = p_project and o.status <> 'draft' and date_trunc('month', o.submitted_at) = m),
                  'approved', (select count(*) from public.observations o where o.project_id = p_project and o.status = 'approved' and date_trunc('month', o.approved_at) = m),
                  'queried', (select count(distinct h.observation_id) from public.observation_status_history h join public.observations o on o.id = h.observation_id
                              where o.project_id = p_project and h.to_status = 'queried' and date_trunc('month', h.created_at) = m)) order by m)
                  from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m), '[]'::jsonb),
      'facilitator_activity', coalesce((select jsonb_agg(x order by (x->>'observations')::int desc) from (
                  select jsonb_build_object('user_id', pr.id, 'name', pr.full_name,
                         'observations', count(o.id), 'approved', count(o.id) filter (where o.status = 'approved')) x
                  from public.observations o join public.profiles pr on pr.id = o.facilitator_id
                  where o.project_id = p_project and o.status <> 'draft' and o.submitted_at >= now() - interval '90 days'
                  group by pr.id, pr.full_name limit 15) q), '[]'::jsonb)
    ) into res;
    return res;
end $$;

create or replace function public.dashboard_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare projs jsonb; tot jsonb; me jsonb;
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'code', p.project_code, 'status', p.status,
              'counts', public._project_counts(p.id), 'health', (public._project_health(p.id))->'overall') order by p.name), '[]'::jsonb)
      into projs from public.projects p where p.id in (select public.visible_project_ids());

    select jsonb_build_object(
      'projects', jsonb_array_length(projs),
      'active_projects', (select count(*) from jsonb_array_elements(projs) e where e->>'status' = 'active'),
      'schools', (select count(distinct ps.school_id) from public.project_schools ps where ps.is_active and ps.project_id in (select public.visible_project_ids())),
      'teachers', (select count(distinct pt.teacher_id) from public.project_teachers pt where pt.is_active and pt.project_id in (select public.visible_project_ids())),
      'facilitators', (select count(distinct pm.user_id) from public.project_members pm where pm.is_active and pm.project_role in ('facilitator','senior_facilitator') and pm.project_id in (select public.visible_project_ids())),
      'administrators', (select count(distinct pm.user_id) from public.project_members pm where pm.is_active and pm.project_role in ('admin','senior_admin','data_admin') and pm.project_id in (select public.visible_project_ids())),
      'observations', (select coalesce(sum((e->'counts'->>'observations_total')::int),0) from jsonb_array_elements(projs) e),
      'approved', (select coalesce(sum((e->'counts'->>'approved')::int),0) from jsonb_array_elements(projs) e),
      'pending', (select coalesce(sum((e->'counts'->>'pending')::int),0) from jsonb_array_elements(projs) e),
      'queried', (select coalesce(sum((e->'counts'->>'queried')::int),0) from jsonb_array_elements(projs) e),
      'missing_documents', (select coalesce(sum((e->'counts'->>'missing_documents')::int),0) from jsonb_array_elements(projs) e),
      'docs_awaiting', (select coalesce(sum((e->'counts'->>'docs_awaiting')::int),0) from jsonb_array_elements(projs) e),
      'new_external', (select coalesce(sum((e->'counts'->>'new_external')::int),0) from jsonb_array_elements(projs) e),
      'approved_this_week', (select count(*) from public.observations o where o.status = 'approved' and o.approved_at >= now() - interval '7 days' and o.project_id in (select public.visible_project_ids())),
      'overdue_reports', (select count(*) from public.reporting_periods rp where rp.end_date < current_date and rp.status = 'open'
                           and rp.project_id in (select public.visible_project_ids())
                           and not exists (select 1 from public.project_reports r where r.reporting_period_id = rp.id and r.status in ('generated','reviewed','approved','published')))
    ) into tot;

    select jsonb_build_object(
      'drafts', (select count(*) from public.observations where facilitator_id = auth.uid() and status = 'draft'),
      'pending', (select count(*) from public.observations where facilitator_id = auth.uid() and status in ('submitted','under_review','resubmitted')),
      'queried', (select count(*) from public.observations where facilitator_id = auth.uid() and status = 'queried'),
      'approved', (select count(*) from public.observations where facilitator_id = auth.uid() and status = 'approved'),
      'total', (select count(*) from public.observations where facilitator_id = auth.uid() and status <> 'draft'),
      'schools', (select count(distinct school_id) from public.school_facilitators where user_id = auth.uid() and is_active)
    ) into me;

    return jsonb_build_object('totals', tot, 'projects', projs, 'my', me);
end $$;

-- ---------- Reports ----------
create or replace function public._report_snapshot(p_project uuid, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare slots int; missing int;
begin
    select coalesce(sum(case dr.applies_to
              when 'teacher' then (select count(*) from public.project_teachers pt where pt.project_id = p_project and pt.is_active)
              when 'school' then (select count(*) from public.project_schools ps where ps.project_id = p_project and ps.is_active)
              else 0 end), 0) into slots
      from public.document_requirements dr where dr.project_id = p_project and dr.is_required and dr.applies_to in ('teacher','school');
    select count(*) into missing from public._outstanding(p_project) where kind = 'missing_document';

    return jsonb_build_object(
      'generated_at', now(),
      'source_note', 'Computed from approved and submitted records at generation time. Qualitative lists use approved observations only.',
      'period', jsonb_build_object('start', p_start, 'end', p_end),
      'project', (select jsonb_build_object('id', p.id, 'name', p.name, 'code', p.project_code) from public.projects p where p.id = p_project),
      'schools', (select count(*) from public.project_schools where project_id = p_project and is_active),
      'schools_observed', (select count(distinct school_id) from public.observations where project_id = p_project and status <> 'draft' and coalesce(observed_at, submitted_at)::date between p_start and p_end),
      'teachers', (select count(*) from public.project_teachers where project_id = p_project and is_active),
      'teachers_observed', (select count(distinct teacher_id) from public.observations where project_id = p_project and status <> 'draft' and coalesce(observed_at, submitted_at)::date between p_start and p_end),
      'facilitators', (select count(distinct user_id) from public.project_members where project_id = p_project and project_role in ('facilitator','senior_facilitator')
                        and start_date <= p_end and (end_date is null or end_date >= p_start)),
      'sessions', (select count(*) from public.field_sessions where project_id = p_project and status in ('submitted','approved') and coalesce(started_at, created_at)::date between p_start and p_end),
      'observations', (select jsonb_build_object(
            'total', count(*),
            'approved', count(*) filter (where status = 'approved'),
            'queried', count(*) filter (where status = 'queried'),
            'pending', count(*) filter (where status in ('submitted','under_review','resubmitted')),
            'rejected', count(*) filter (where status = 'rejected'))
          from public.observations where project_id = p_project and status <> 'draft' and coalesce(observed_at, submitted_at)::date between p_start and p_end),
      'document_completeness', jsonb_build_object('slots', slots, 'missing', missing,
            'percent', case when slots > 0 then round(100.0 * greatest(slots - missing, 0) / slots, 1) end),
      'samr', (select jsonb_build_object('S', count(*) filter (where samr_level = 'S'), 'A', count(*) filter (where samr_level = 'A'),
                                         'M', count(*) filter (where samr_level = 'M'), 'R', count(*) filter (where samr_level = 'R'))
               from public.observations where project_id = p_project and status = 'approved' and coalesce(observed_at, submitted_at)::date between p_start and p_end),
      'tools', coalesce((select jsonb_agg(jsonb_build_object('text', t, 'count', c) order by c desc, t) from (
                select lower(trim(x)) t, count(*) c from public.observations o,
                  lateral regexp_split_to_table(coalesce(o.technology_tools,''), '[,;\n]+') x
                where o.project_id = p_project and o.status = 'approved' and coalesce(o.observed_at, o.submitted_at)::date between p_start and p_end and trim(x) <> ''
                group by 1 order by 2 desc limit 20) q), '[]'::jsonb),
      'strengths', coalesce((select jsonb_agg(jsonb_build_object('text', t, 'count', c) order by c desc, t) from (
                select lower(trim(s)) t, count(*) c from public.observations o,
                  lateral unnest(array[o.strength_1, o.strength_2, o.strength_3]) s
                where o.project_id = p_project and o.status = 'approved' and coalesce(o.observed_at, o.submitted_at)::date between p_start and p_end and coalesce(trim(s),'') <> ''
                group by 1 order by 2 desc, 1 limit 15) q), '[]'::jsonb),
      'development_areas', coalesce((select jsonb_agg(jsonb_build_object('text', t, 'count', c) order by c desc, t) from (
                select lower(trim(development_area)) t, count(*) c from public.observations o
                where o.project_id = p_project and o.status = 'approved' and coalesce(o.observed_at, o.submitted_at)::date between p_start and p_end and coalesce(trim(development_area),'') <> ''
                group by 1 order by 2 desc, 1 limit 15) q), '[]'::jsonb),
      'agreed_actions', coalesce((select jsonb_agg(jsonb_build_object('text', o.agreed_action, 'teacher', t.full_name, 'school', s.name, 'date', coalesce(o.observed_at, o.submitted_at)::date) order by coalesce(o.observed_at, o.submitted_at))
                from (select * from public.observations o where o.project_id = p_project and o.status = 'approved'
                        and coalesce(o.observed_at, o.submitted_at)::date between p_start and p_end and coalesce(trim(o.agreed_action),'') <> ''
                      order by coalesce(o.observed_at, o.submitted_at) limit 50) o
                left join public.teachers t on t.id = o.teacher_id left join public.schools s on s.id = o.school_id), '[]'::jsonb),
      'outstanding', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'label', label, 'count', c) order by kind, label)
                from (select kind, label, count(*) c from public._outstanding(p_project) group by 1,2) x), '[]'::jsonb));
end $$;

create or replace function public.generate_project_report(
    p_project uuid, p_start date, p_end date, p_title text default null, p_period_type text default 'monthly')
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; rid uuid; pname text;
begin
    if not (public.has_role('super_admin') or (public.has_permission('reports.generate')
            and (public.has_any_role(array['hod','coordinator','me','data_admin']) or public.my_project_roles(p_project) && array['manager','coordinator','me','data_admin']))) then
        raise exception 'You are not permitted to generate reports for this project.'; end if;
    if p_end < p_start then raise exception 'End date is before start date.'; end if;
    select name into pname from public.projects where id = p_project;
    select id into pid from public.reporting_periods where project_id = p_project and start_date = p_start and end_date = p_end;
    if pid is null then
        insert into public.reporting_periods(project_id, name, period_type, start_date, end_date)
        values (p_project, to_char(p_start, 'YYYY-MM-DD') || ' to ' || to_char(p_end, 'YYYY-MM-DD'), p_period_type, p_start, p_end)
        returning id into pid;
    end if;
    insert into public.project_reports(project_id, reporting_period_id, generated_by, title, report_type, data_snapshot, status)
    values (p_project, pid, auth.uid(), coalesce(nullif(trim(p_title),''), pname || ' - ' || to_char(p_start,'YYYY-MM-DD') || ' to ' || to_char(p_end,'YYYY-MM-DD')),
            case when p_period_type in ('monthly','termly','quarterly') then p_period_type when p_period_type = 'annual' then 'annual' else 'custom' end,
            public._report_snapshot(p_project, p_start, p_end), 'generated')
    returning id into rid;
    perform public.write_audit('report.generated', 'project_reports', rid, p_project, null, jsonb_build_object('start', p_start, 'end', p_end));
    return rid;
end $$;

create or replace function public.approve_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.project_reports;
begin
    select * into r from public.project_reports where id = p_id;
    if not found then raise exception 'Report not found.'; end if;
    if not (public.has_role('super_admin') or (public.has_permission('reports.approve') and public.has_role('hod'))) then
        raise exception 'Only the HOD (or Super Admin) can approve reports.'; end if;
    update public.project_reports set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
    perform public.write_audit('report.approved', 'project_reports', p_id, r.project_id);
end $$;

-- ---------- Analytics ----------
create or replace function public.analytics(
    p_from date, p_to date, p_project uuid default null, p_facilitator uuid default null,
    p_school uuid default null, p_province text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
    if not public.has_permission('analytics.view') then raise exception 'Not permitted.'; end if;
    with scope as (
        select o.*, s.province
        from public.observations o left join public.schools s on s.id = o.school_id
        where o.status <> 'draft'
          and o.project_id in (select public.visible_project_ids())
          and (p_project is null or o.project_id = p_project)
          and (p_facilitator is null or o.facilitator_id = p_facilitator)
          and (p_school is null or o.school_id = p_school)
          and (p_province is null or s.province = p_province)
          and coalesce(o.submitted_at, o.created_at)::date between p_from and p_to
    )
    select jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(status, c) from (select status, count(*) c from scope group by 1) x), '{}'::jsonb),
      'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'submitted', sub, 'approved', apr) order by m)
                 from (select to_char(date_trunc('month', coalesce(submitted_at, created_at)), 'YYYY-MM') m, count(*) sub,
                              count(*) filter (where status = 'approved') apr from scope group by 1) x), '[]'::jsonb),
      'samr_trend', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'S', s, 'A', a, 'M', mm, 'R', r) order by m)
                 from (select to_char(date_trunc('month', coalesce(submitted_at, created_at)), 'YYYY-MM') m,
                              count(*) filter (where samr_level = 'S') s, count(*) filter (where samr_level = 'A') a,
                              count(*) filter (where samr_level = 'M') mm, count(*) filter (where samr_level = 'R') r
                       from scope where status = 'approved' group by 1) x), '[]'::jsonb),
      'turnaround_days', (select round(avg(extract(epoch from (approved_at - submitted_at)) / 86400)::numeric, 1) from scope where status = 'approved' and approved_at is not null),
      'facilitators', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'total', c, 'approved', a) order by c desc)
                 from (select pr.full_name n, count(*) c, count(*) filter (where sc.status = 'approved') a
                       from scope sc join public.profiles pr on pr.id = sc.facilitator_id group by pr.id, pr.full_name order by 2 desc limit 15) x), '[]'::jsonb),
      'projects', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'total', c, 'approved', a) order by c desc)
                 from (select p.name n, count(*) c, count(*) filter (where sc.status = 'approved') a
                       from scope sc join public.projects p on p.id = sc.project_id group by p.id, p.name) x), '[]'::jsonb),
      'documents_by_status', coalesce((select jsonb_object_agg(status, c) from (
                 select d.status, count(*) c from public.documents d
                 where d.project_id in (select public.visible_project_ids()) and (p_project is null or d.project_id = p_project)
                   and d.created_at::date between p_from and p_to group by 1) x), '{}'::jsonb),
      'outstanding_by_project', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'count', (select count(*) from public._outstanding(p.id))) order by p.name)
                 from public.projects p where p.id in (select public.visible_project_ids()) and (p_project is null or p.id = p_project)), '[]'::jsonb),
      'reporting', (select jsonb_build_object('periods_ended', count(*),
                 'with_report', count(*) filter (where exists (select 1 from public.project_reports r where r.reporting_period_id = rp.id and r.status in ('generated','reviewed','approved','published'))))
                 from public.reporting_periods rp where rp.end_date < current_date and rp.end_date between p_from and p_to
                 and rp.project_id in (select public.visible_project_ids()) and (p_project is null or rp.project_id = p_project))
    ) into res;
    return res;
end $$;

-- ============================================================
-- GRANTS: clients may call only the intended RPCs
-- ============================================================
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function
    public.write_audit(text, text, uuid, uuid, jsonb, jsonb, jsonb),
    public.notify(uuid, text, text, text, text, uuid),
    public.notify_project_roles(uuid, text[], text, text, text, text, uuid),
    public._obs_status_change(uuid, text, text, text),
    public._outstanding(uuid), public._project_health(uuid), public._project_counts(uuid),
    public._report_snapshot(uuid, date, date),
    public.external_notify_received(uuid, uuid, text)
from authenticated;
