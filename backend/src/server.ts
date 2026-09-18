import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { addObservation, addSupervisor, addTechnician, addUser, getAuthUser, getCall, getRole, getUserByEmail, listAuditLogs, listCalls, listObservations, listPermissions, listRoles, listSupervisors, listTechnicians, listUsers, updateCall, validatePassword } from './store.js';
import type { AuthUser, CallStatus, PermissionCode } from './types.js';

const app = express();
const port = Number(process.env.PORT || 3333);
const jwtSecret = process.env.JWT_SECRET || 'local-demo-secret-change-me';
app.use(cors({ origin: ['http://localhost:5173'], credentials: true }));
app.use(express.json());

type AuthRequest = Request & { authUser?: AuthUser };
function auth(request: AuthRequest, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return response.status(401).json({ message: 'Sessao nao encontrada.' });
  try {
    const payload = jwt.verify(token, jwtSecret) as { sub: string };
    const user = listUsers().find((item) => item.id === payload.sub);
    if (!user || !user.active) return response.status(401).json({ message: 'Sessao invalida.' });
    request.authUser = getAuthUser(user);
    next();
  } catch { return response.status(401).json({ message: 'Sessao expirada ou invalida.' }); }
}
function requirePermission(permission: PermissionCode) {
  return (request: AuthRequest, response: Response, next: NextFunction) => {
    if (!request.authUser?.role.permissions.includes(permission)) return response.status(403).json({ message: 'Voce nao possui essa permissao.' });
    next();
  };
}

app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'jh-redeflow-api' }));
app.post('/api/auth/login', (request, response) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe e-mail e senha validos.' });
  const user = getUserByEmail(parsed.data.email);
  if (!user || !user.active || !validatePassword(user, parsed.data.password)) return response.status(401).json({ message: 'E-mail ou senha incorretos.' });
  const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '8h' });
  return response.json({ token, user: getAuthUser(user) });
});
app.get('/api/auth/me', auth, (request: AuthRequest, response) => response.json({ user: request.authUser }));
app.get('/api/users', auth, requirePermission('users.view'), (_request, response) => response.json({ users: listUsers() }));
app.post('/api/users', auth, requirePermission('users.create'), (request, response) => {
  const parsed = z.object({ name: z.string().min(2), email: z.string().email(), roleId: z.string(), password: z.string().min(8) }).safeParse(request.body);
  if (!parsed.success || !getRole(parsed.success ? parsed.data.roleId : '')) return response.status(400).json({ message: 'Dados de usuario invalidos.' });
  if (getUserByEmail(parsed.data.email)) return response.status(409).json({ message: 'Este e-mail ja esta cadastrado.' });
  return response.status(201).json({ user: addUser(parsed.data) });
});
app.get('/api/roles', auth, requirePermission('roles.view'), (_request, response) => response.json({ roles: listRoles(), permissions: listPermissions() }));
app.get('/api/tecnicos', auth, requirePermission('technicians.view'), (_request, response) => response.json({ technicians: listTechnicians() }));
app.post('/api/tecnicos', auth, requirePermission('technicians.create'), (request, response) => {
  const parsed = z.object({ name: z.string().min(2), registration: z.string().min(2), supervisorId: z.string().optional(), region: z.string().min(2), shift: z.string().min(2), currentStatus: z.enum(['Disponivel', 'Em campo', 'Indisponivel']).default('Disponivel'), active: z.boolean().default(true) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Dados de tecnico invalidos.' });
  return response.status(201).json({ technician: addTechnician(parsed.data) });
});
app.get('/api/supervisores', auth, requirePermission('supervisors.view'), (_request, response) => response.json({ supervisors: listSupervisors(), technicians: listTechnicians() }));
app.post('/api/supervisores', auth, requirePermission('supervisors.create'), (request, response) => {
  const parsed = z.object({ name: z.string().min(2), userId: z.string().optional(), region: z.string().min(2), active: z.boolean().default(true) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Dados de supervisor invalidos.' });
  return response.status(201).json({ supervisor: addSupervisor(parsed.data) });
});
app.get('/api/chamados', auth, requirePermission('calls.view'), (request, response) => {
  const status = request.query.status;
  const validStatuses: CallStatus[] = ['Aberto', 'Atribuido', 'Deslocamento', 'Em campo', 'Finalizado', 'Cancelado'];
  if (status && !validStatuses.includes(String(status) as CallStatus)) return response.status(400).json({ message: 'Status de chamado invalido.' });
  return response.json({ calls: listCalls(status as CallStatus | undefined) });
});
app.get('/api/chamados/:id', auth, requirePermission('calls.view'), (request, response) => {
  const call = getCall(String(request.params.id));
  if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  return response.json({ call });
});
app.patch('/api/chamados/:id', auth, requirePermission('calls.edit'), (request: AuthRequest, response) => {
  const parsed = z.object({ status: z.enum(['Aberto', 'Atribuido', 'Deslocamento', 'Em campo', 'Finalizado', 'Cancelado']).optional(), technicianId: z.string().optional(), notes: z.string().max(5000).optional() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Dados de chamado invalidos.' });
  const call = updateCall(String(request.params.id), parsed.data, request.authUser!);
  if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  return response.json({ call });
});
app.get('/api/chamados/:id/observacoes', auth, requirePermission('calls.view'), (request, response) => response.json({ observations: listObservations(String(request.params.id)) }));
app.post('/api/chamados/:id/observacoes', auth, requirePermission('calls.add_observation'), (request: AuthRequest, response) => {
  const parsed = z.object({ text: z.string().trim().min(1).max(5000) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'A observacao nao pode ficar vazia.' });
  if (!getCall(String(request.params.id))) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  return response.status(201).json({ observation: addObservation(String(request.params.id), request.authUser!, parsed.data.text) });
});
app.get('/api/chamados/:id/logs', auth, requirePermission('calls.view_logs'), (request, response) => response.json({ logs: listAuditLogs(String(request.params.id)) }));

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => response.status(500).json({ message: error.message || 'Erro interno.' }));
app.listen(port, () => console.log(`JH RedeFlow API running on http://localhost:${port}`));