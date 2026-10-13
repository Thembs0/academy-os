-- Local acceptance test of the RLS + workflow rules (run against a Postgres with the stub + migrations 001-004).
\set ON_ERROR_STOP 0
\set QUIET 1
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','sa@x'),('00000000-0000-0000-0000-00000000000b','pm@x'),
 ('00000000-0000-0000-0000-00000000000c','fac1@x'),('00000000-0000-0000-0000-00000000000d','fac2@x'),
 ('00000000-0000-0000-0000-00000000000e','adm@x'),('00000000-0000-0000-0000-00000000000f','hod@x'),
 ('00000000-0000-0000-0000-000000000010','other@x');
insert into user_roles(user_id, role_id) select u.id::uuid, r.id from (values
 ('00000000-0000-0000-0000-00000000000a','super_admin'),('00000000-0000-0000-0000-00000000000b','project_manager'),
 ('00000000-0000-0000-0000-00000000000c','facilitator'),('00000000-0000-0000-0000-00000000000d','facilitator'),
 ('00000000-0000-0000-0000-00000000000e','admin'),('00000000-0000-0000-0000-00000000000f','hod'),
 ('00000000-0000-0000-0000-000000000010','facilitator')) as u(id,rn) join roles r on r.name=u.rn
 on conflict do nothing;
-- (user_roles join above uses u.rn)
insert into project_members(project_id,user_id,project_role)
 select p.id, v.u::uuid, v.r from projects p, (values
 ('00000000-0000-0000-0000-00000000000b','manager'),('00000000-0000-0000-0000-00000000000c','facilitator'),
 ('00000000-0000-0000-0000-00000000000e','admin')) v(u,r) where p.project_code='TIC';
grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', u, false); end $$;
\echo '--- admin adds school + teacher'
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select upsert_school((select id from projects where project_code='TIC'), '{"name":"Test School","province":"GP","district":"D1"}') as school \gset
select upsert_teacher((select id from projects where project_code='TIC'), jsonb_build_object('full_name','Ms T','school_id',:'school')) as teacher \gset
\echo '--- facilitator creates draft, tries to self-approve (must fail)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
insert into observations(project_id,facilitator_id,school_id,teacher_id,observed_at,subject,grade,caps_topic,samr_level,learning_outcomes,strength_1,strength_2,strength_3,development_area,practical_suggestion,agreed_action,client_reference)
 select id,'00000000-0000-0000-0000-00000000000c',:'school',:'teacher',now(),'Maths','8','Algebra','A','ok','a','b','c','d','e','f','ref1' from projects where project_code='TIC' returning id \gset obs_
select id as obs from observations where client_reference='ref1' \gset
update observations set status='approved' where id=:'obs';
\echo '--- other facilitator cannot see draft (expect 0)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select count(*) from observations;
\echo '--- facilitator submits; manager queries; facilitator resubmits; manager approves'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select submit_observation(:'obs');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select count(*) as pm_notifs from notifications where user_id='00000000-0000-0000-0000-00000000000b';
select start_review(:'obs');
select query_observation(:'obs','Add photo','["Additional photo"]') is not null as queried;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select count(*) as fac_notifs from notifications where user_id='00000000-0000-0000-0000-00000000000c';
update observations set subject='Maths II' where id=:'obs';
select submit_observation(:'obs');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select approve_observation(:'obs');
\echo '--- HOD sees approved (expect 1)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select count(*) from observations;
\echo '--- unrelated facilitator sees nothing (expect 0)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select count(*) from observations; select count(*) from schools; select count(*) from projects;
\echo '--- replace facilitator; new one sees history; old facilitator_id intact'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select replace_project_member((select id from projects where project_code='TIC'),'00000000-0000-0000-0000-00000000000c','facilitator','00000000-0000-0000-0000-00000000000d') is not null as replaced;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select count(*) as new_fac_sees, (select full_name from profiles where id=o.facilitator_id) as original_facilitator from observations o group by o.facilitator_id;
\echo '--- old facilitator now sees only own'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select count(*) as old_fac_projects from projects;
\echo '--- external link + outstanding + report + health'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select (create_external_upload_link((select id from projects where project_code='TIC'),:'school',:'teacher','L','Teacher ID',7,3))->>'token' is not null as link_ok;
select kind,label,count(*) from outstanding_items((select id from projects where project_code='TIC')) group by 1,2 order by 1,2;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select generate_project_report((select id from projects where project_code='TIC'), current_date-30, current_date) is not null as report_ok;
select (project_health((select id from projects where project_code='TIC')))->>'overall' as health;
select jsonb_pretty((select data_snapshot->'observations' from project_reports limit 1));
select (dashboard_summary())->'totals'->>'approved' as dash_approved;
select analytics(current_date-30,current_date)->>'turnaround_days' as turnaround;
\echo '--- audit actions'
reset role;
select action,count(*) from audit_logs group by 1 order by 1;
\echo '--- direct status tamper by manager on observations (must fail: no update policy)'
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
update observations set status='archived'; select 'rows updated: ' || count(*) from observations where status='archived';
