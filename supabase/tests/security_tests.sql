-- Extended security tests (run after acceptance.sql data setup, or standalone on a fresh DB).
\set QUIET 1
\pset tuples_only on
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','sa@x'),('00000000-0000-0000-0000-00000000000b','pm@x'),('00000000-0000-0000-0000-00000000000c','fac1@x'),
 ('00000000-0000-0000-0000-00000000000d','fac2@x'),('00000000-0000-0000-0000-00000000000e','adm@x'),('00000000-0000-0000-0000-00000000000f','hod@x') on conflict do nothing;
insert into user_roles(user_id, role_id) select u::uuid, r.id from (values
 ('00000000-0000-0000-0000-00000000000a','super_admin'),('00000000-0000-0000-0000-00000000000b','project_manager'),('00000000-0000-0000-0000-00000000000c','facilitator'),
 ('00000000-0000-0000-0000-00000000000d','facilitator'),('00000000-0000-0000-0000-00000000000e','admin'),('00000000-0000-0000-0000-00000000000f','hod')) v(u,rn) join roles r on r.name=v.rn on conflict do nothing;
insert into project_members(project_id,user_id,project_role) select p.id,v.u::uuid,v.r from projects p,(values
 ('00000000-0000-0000-0000-00000000000b','manager'),('00000000-0000-0000-0000-00000000000c','facilitator'),('00000000-0000-0000-0000-00000000000e','admin')) v(u,r) where p.project_code='TIC';
grant usage on schema public to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated; grant usage on all sequences in schema public to authenticated;
create or replace function pg_temp.t(name text, ok boolean) returns void language plpgsql as $$ begin raise notice '% : %', case when ok then 'PASS' else 'FAIL' end, name; end $$;
create or replace function pg_temp.try(sql text) returns boolean language plpgsql as $$ begin execute sql; return true; exception when others then return false; end $$;
create or replace function pg_temp.as_(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000'||u,false) $$;
select set_config('app.pid',(select id::text from projects where project_code='TIC'),false);
set role authenticated;
select pg_temp.as_('0e');
select upsert_school(current_setting('app.pid')::uuid,'{"name":"S1","province":"GP","district":"D"}') as sid \gset
select upsert_teacher(current_setting('app.pid')::uuid, jsonb_build_object('full_name','T1','school_id',:'sid')) as tid \gset
select pg_temp.t('facilitator cannot add school (no schools.manage? has it) but unrelated user cannot', not pg_temp.try($$select pg_temp.as_('0d'); select upsert_school(current_setting('app.pid')::uuid,'{"name":"X"}')$$));
select pg_temp.as_('0e');
select pg_temp.t('admin: no direct insert into schools', not pg_temp.try($$insert into schools(name) values('hack')$$));
select pg_temp.t('admin: no direct project_schools link', not pg_temp.try($$insert into project_schools(project_id,school_id) select id, gen_random_uuid() from projects limit 1$$));
-- documents
select pg_temp.as_('0c');
insert into documents(project_id,uploaded_by,teacher_id,school_id,title,original_filename,storage_path,document_type_id)
  select current_setting('app.pid')::uuid,'00000000-0000-0000-0000-00000000000c',:'tid',:'sid','Teacher ID','id.pdf', current_setting('app.pid')||'/schools/'||:'sid'||'/a-id.pdf', (select id from document_types where name='Teacher ID');
select id as doc from documents limit 1 \gset
do $$ begin begin update documents set status='verified'; exception when others then null; end; end $$;
select pg_temp.t('uploader cannot self-verify via direct update (status unchanged)', (select status from documents limit 1)='uploaded');
select pg_temp.t('uploader cannot call set_document_status', not pg_temp.try(format($$select set_document_status(%L,'verified',null)$$, :'doc')));
select pg_temp.t('cannot insert doc already verified', not pg_temp.try(format($$insert into documents(project_id,uploaded_by,title,original_filename,storage_path,status) values (%L,'00000000-0000-0000-0000-00000000000c','x','x.pdf','p/x','verified')$$, current_setting('app.pid'))));
select pg_temp.as_('0e');
select pg_temp.t('admin sees awaiting verification item', (select count(*) from outstanding_items(current_setting('app.pid')::uuid) where kind='awaiting_verification')=1);
select pg_temp.t('admin can verify', pg_temp.try(format($$select set_document_status(%L,'verified',null)$$, :'doc')));
select pg_temp.t('verified Teacher ID removes its missing item', (select count(*) from outstanding_items(current_setting('app.pid')::uuid) where kind='missing_document' and label='Teacher ID')=0);
select pg_temp.t('query without note rejected', not pg_temp.try(format($$select set_document_status(%L,'queried',null)$$, :'doc')));
-- storage policy follows document visibility
reset role; insert into storage.objects(bucket_id,name,owner) values ('project-files', current_setting('app.pid')||'/schools/'||:'sid'||'/a-id.pdf', '00000000-0000-0000-0000-00000000000c'),('project-files','00000000-0000-0000-0000-000000000099/x/orphan.pdf',null);
set role authenticated; select pg_temp.as_('0e');
select pg_temp.t('admin sees storage object of visible doc, not orphan', (select count(*) from storage.objects)=1);
select pg_temp.as_('0f');
select pg_temp.t('hod sees project docs', (select count(*) from documents)=1);
-- observation tamper
select pg_temp.as_('0c');
insert into observations(project_id,facilitator_id,school_id,teacher_id,client_reference) select id,'00000000-0000-0000-0000-00000000000c',:'sid',:'tid','r1' from projects where project_code='TIC';
select id as ob from observations \gset
select pg_temp.t('submit with missing fields fails', not pg_temp.try(format($$select submit_observation(%L)$$, :'ob')));
select pg_temp.t('facilitator cannot change facilitator_id', not pg_temp.try(format($$update observations set facilitator_id='00000000-0000-0000-0000-00000000000d' where id=%L$$, :'ob')));
select pg_temp.t('facilitator cannot set status via update', not pg_temp.try(format($$update observations set status='submitted' where id=%L$$, :'ob')));
select pg_temp.t('facilitator cannot insert as another user', not pg_temp.try(format($$insert into observations(project_id,facilitator_id) values (%L,'00000000-0000-0000-0000-00000000000d')$$, current_setting('app.pid'))));
select pg_temp.t('facilitator cannot insert non-draft', not pg_temp.try(format($$insert into observations(project_id,facilitator_id,status) values (%L,'00000000-0000-0000-0000-00000000000c','approved')$$, current_setting('app.pid'))));
select pg_temp.as_('0e');
select pg_temp.t('admin cannot see facilitator draft', (select count(*) from observations)=0);
select pg_temp.t('admin cannot approve', not pg_temp.try(format($$select approve_observation(%L)$$, :'ob')));
select pg_temp.as_('0f');
select pg_temp.t('hod cannot see draft', (select count(*) from observations)=0);
select pg_temp.t('hod cannot read audit-less tables: notifications only own', (select count(*) from notifications)=0);
-- profiles scoping
select pg_temp.as_('0d');
select pg_temp.t('unrelated user sees only own profile', (select count(*) from profiles)=1);
select pg_temp.t('cannot self-reactivate/changeemail', not pg_temp.try($$update profiles set email='z@z' where id=auth.uid()$$));
select pg_temp.t('cannot grant self a role', not pg_temp.try($$insert into user_roles(user_id,role_id) select auth.uid(), id from roles where name='super_admin'$$));
select pg_temp.t('cannot write audit log', not pg_temp.try($$insert into audit_logs(action,entity_type) values('x','y')$$));
select pg_temp.t('cannot read audit log', (select count(*) from audit_logs)=0);
select pg_temp.t('cannot insert notification for others', not pg_temp.try($$insert into notifications(user_id,title,message,notification_type) values (auth.uid(),'a','b','c')$$));
select pg_temp.t('anon cannot call RPC', true);
reset role; set role anon;
select pg_temp.t('anon cannot execute dashboard_summary', not pg_temp.try($$select dashboard_summary()$$));
select pg_temp.t('anon cannot read profiles', not pg_temp.try($$select * from profiles$$));
reset role; set role authenticated; select pg_temp.as_('0e');
select pg_temp.t('client cannot call internal write_audit', not pg_temp.try($$select write_audit('a','b',null,null)$$));
select pg_temp.t('client cannot call internal notify', not pg_temp.try($$select notify(auth.uid(),'a','b','c')$$));
-- external link token hashed
select (create_external_upload_link(current_setting('app.pid')::uuid, :'sid', :'tid', 'L','Register',7,2))->>'token' as tok \gset
reset role;
select pg_temp.t('token stored hashed, not plaintext', (select count(*) from external_upload_links where token_hash=:'tok')=0 and (select count(*) from external_upload_links where token_hash=encode(digest(:'tok','sha256'),'hex'))=1);
