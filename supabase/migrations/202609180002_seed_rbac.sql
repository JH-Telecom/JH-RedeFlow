insert into public.permissions (code, description) values
  ('dashboard.view', 'Visualizar o dashboard operacional'),
  ('users.view', 'Visualizar usuarios'),
  ('users.create', 'Criar usuarios'),
  ('users.edit', 'Editar usuarios'),
  ('roles.view', 'Visualizar cargos'),
  ('roles.manage', 'Gerenciar cargos e permissoes'),
  ('technicians.view', 'Visualizar tecnicos'),
  ('technicians.create', 'Cadastrar tecnicos'),
  ('technicians.edit', 'Editar tecnicos'),
  ('supervisors.view', 'Visualizar supervisores'),
  ('supervisors.create', 'Cadastrar supervisores'),
  ('supervisors.edit', 'Editar supervisores'),
  ('calls.view', 'Visualizar chamados'),
  ('calls.create', 'Criar chamados'),
  ('calls.edit', 'Editar chamados'),
  ('calls.assign', 'Atribuir chamados'),
  ('calls.finish', 'Finalizar chamados'),
  ('calls.cancel', 'Cancelar chamados'),
  ('calls.view_logs', 'Visualizar auditoria de chamados'),
  ('calls.add_observation', 'Adicionar observacoes em chamados'),
  ('activations.view', 'Visualizar acionamentos'),
  ('activations.decide', 'Aceitar ou recusar acionamentos'),
  ('imports.view', 'Visualizar importacoes'),
  ('imports.create', 'Criar e confirmar importacoes'),
  ('settings.manage', 'Gerenciar configuracoes')
on conflict (code) do update set description = excluded.description;

insert into public.roles (name, description) values
  ('Administrador', 'Acesso administrativo completo'),
  ('Operador', 'Operacao de chamados e remanejamentos'),
  ('Supervisor', 'Visao restrita da propria equipe'),
  ('Mesario', 'Aceite e recusa de acionamentos'),
  ('Visualizacao', 'Consulta sem alteracao')
on conflict (name) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.name = 'Administrador'
on conflict do nothing;

update public.profiles
set role_id = (select id from public.roles where name = 'Administrador')
where email = 'matheusterra0802@gmail.com' and role_id is null;