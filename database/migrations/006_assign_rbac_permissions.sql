INSERT INTO permissions (code, description) VALUES
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
  ('calls.delete', 'Apagar chamados de teste'),
  ('calls.reopen', 'Reabrir chamados encerrados'),
  ('calls.view_logs', 'Visualizar auditoria de chamados'),
  ('calls.add_observation', 'Adicionar observacoes em chamados'),
  ('activations.view', 'Visualizar acionamentos'),
  ('activations.decide', 'Aceitar ou recusar acionamentos'),
  ('imports.view', 'Visualizar importacoes'),
  ('imports.create', 'Criar e confirmar importacoes'),
  ('settings.manage', 'Gerenciar configuracoes')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO roles (name, description) VALUES
  ('Administrador', 'Acesso administrativo completo'),
  ('Operador', 'Operacao de chamados e remanejamentos'),
  ('Supervisor', 'Visao restrita da propria equipe'),
  ('Mesario', 'Aceite e recusa de acionamentos'),
  ('Visualizacao', 'Consulta sem alteracao')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

DELETE FROM role_permissions
WHERE role_id IN (SELECT id FROM roles WHERE name IN ('Administrador', 'Operador', 'Supervisor', 'Mesario', 'Visualizacao'));

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'Administrador';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN (VALUES
  ('dashboard.view'), ('calls.view'), ('calls.create'), ('calls.edit'), ('calls.assign'),
  ('calls.finish'), ('calls.cancel'), ('calls.reopen'), ('calls.view_logs'), ('calls.add_observation'),
  ('activations.view'), ('activations.decide'), ('imports.view'), ('imports.create'),
  ('technicians.view'), ('supervisors.view')
) AS allowed(code) ON TRUE
JOIN permissions p ON p.code = allowed.code
WHERE r.name = 'Operador';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN (VALUES ('dashboard.view'), ('calls.view'), ('technicians.view'), ('supervisors.view')) AS allowed(code) ON TRUE
JOIN permissions p ON p.code = allowed.code
WHERE r.name = 'Supervisor';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN (VALUES ('activations.view'), ('activations.decide')) AS allowed(code) ON TRUE
JOIN permissions p ON p.code = allowed.code
WHERE r.name = 'Mesario';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN (VALUES ('dashboard.view'), ('calls.view'), ('technicians.view'), ('supervisors.view')) AS allowed(code) ON TRUE
JOIN permissions p ON p.code = allowed.code
WHERE r.name = 'Visualizacao';