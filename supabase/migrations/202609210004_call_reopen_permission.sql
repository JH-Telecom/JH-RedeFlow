insert into public.permissions (code, description)
values ('calls.reopen', 'Reabrir chamados encerrados')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name in ('Administrador', 'Operador')
  and p.code = 'calls.reopen'
on conflict do nothing;
