CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  description varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(120) NOT NULL UNIQUE,
  description varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES roles(id),
  name varchar(160) NOT NULL,
  email varchar(255) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS users_active_idx ON users(active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role_id) WHERE deleted_at IS NULL;

INSERT INTO permissions (code, description) VALUES
  ('dashboard.view', 'Visualizar o dashboard operacional'),
  ('users.view', 'Visualizar usuarios'),
  ('users.create', 'Criar usuarios'),
  ('users.edit', 'Editar usuarios'),
  ('roles.view', 'Visualizar cargos'),
  ('roles.manage', 'Gerenciar cargos e permissoes'),
  ('settings.manage', 'Gerenciar configuracoes')
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (name, description) VALUES
  ('Administrador', 'Acesso administrativo da plataforma'),
  ('Operador', 'Operacao de chamados e remanejamentos'),
  ('Supervisor', 'Visao restrita da propria equipe'),
  ('Mesario', 'Aceite e recusa de acionamentos'),
  ('Visualizacao', 'Consulta sem alteracao')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS supervisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name varchar(160) NOT NULL,
  region varchar(100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id uuid REFERENCES supervisors(id) ON DELETE SET NULL,
  name varchar(160) NOT NULL,
  registration varchar(80) NOT NULL UNIQUE,
  region varchar(100),
  shift varchar(80),
  current_status varchar(40) NOT NULL DEFAULT 'Disponivel',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS supervisors_active_idx ON supervisors(active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS technicians_supervisor_idx ON technicians(supervisor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS technicians_region_idx ON technicians(region) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number varchar(100) NOT NULL,
  bdesk varchar(100),
  office_track varchar(100),
  client varchar(180),
  type varchar(100),
  reason varchar(255),
  region varchar(100),
  city varchar(100),
  olt varchar(120),
  slot_pon varchar(40),
  status varchar(40) NOT NULL DEFAULT 'Aberto',
  technician_id uuid REFERENCES technicians(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz,
  executed_at timestamptz,
  result varchar(255),
  cancellation_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calls_status_opened_idx ON calls(status, opened_at DESC);
CREATE INDEX IF NOT EXISTS calls_technician_idx ON calls(technician_id) WHERE technician_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS call_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id),
  action varchar(120) NOT NULL,
  field varchar(120) NOT NULL,
  previous_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_observations_call_idx ON call_observations(call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_logs_call_idx ON call_logs(call_id, created_at DESC);