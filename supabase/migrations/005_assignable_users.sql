-- Managers need to find people to assign without being able to read every profile.
create or replace function public.list_assignable_users(p_project uuid)
returns table(id uuid, full_name text, email text, roles text[])
language plpgsql stable security definer set search_path = public as $$
begin
    if not (public.can_manage_members(p_project) or public.my_project_roles(p_project) && array['admin','senior_admin']) then
        raise exception 'Not permitted.'; end if;
    return query
    select p.id, p.full_name, p.email,
           coalesce((select array_agg(r.name order by r.name) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p.id), '{}')
    from public.profiles p where p.is_active order by p.full_name;
end $$;
revoke execute on function public.list_assignable_users(uuid) from public, anon;
grant execute on function public.list_assignable_users(uuid) to authenticated;
