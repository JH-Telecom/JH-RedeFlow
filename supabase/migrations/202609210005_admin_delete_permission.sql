insert into public.permissions (code, description)
values ('calls.delete', 'Apagar chamados de teste')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'Administrador'
  and p.code = 'calls.delete'
on conflict do nothing;

update public.profiles
set role_id = (select id from public.roles where name = 'Administrador'),
    updated_at = now()
where lower(email) = lower('matheusterra0802@gmail.com');
