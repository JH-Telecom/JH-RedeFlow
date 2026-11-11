import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';

// Chaves dos POPs (11/11/2026): situacao de cada chave (na base, retirada por alguem ou a conferir) e o historico
// de retiradas e devolucoes. A foto e tirada na retirada e fica no movimento; a lista vai sem foto (pouco trafego).
export type PopKeyStatus = 'Base' | 'Retirada' | 'A conferir';
export type HolderKind = 'Tecnico' | 'Supervisor' | 'Outro';
export type PopKey = { id: string; pop: string; status: PopKeyStatus; holderName: string | null; holderKind: HolderKind | null; holderId: string | null; takenAt: string | null; notes: string | null; currentMovementId: string | null; hasPhoto: boolean; updatedAt: string };
export type PopKeyMovement = { id: string; popKeyId: string; action: 'Retirada' | 'Devolucao' | 'Ajuste'; holderName: string | null; holderKind: string | null; holderId: string | null; hasPhoto: boolean; notes: string | null; happenedAt: string; userName: string | null };
type Actor = { id: string; name: string };

const MAX_PHOTO_CHARS = 600_000; // ~450 KB de imagem; a tela reduz antes de mandar
export function safePhoto(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_PHOTO_CHARS || !/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(value)) throw new Error('Foto invalida: use JPG, PNG ou WEBP de ate ~450 KB.');
  return value;
}

// Situacao inicial (planilha de 11/11/2026), so para o modo demonstracao. No banco ela vem da migracao.
const SEED: Array<[string, PopKeyStatus, string | null, string | null]> = [
  ['ARICANDUVA', 'Base', null, null], ['CAÇULA', 'Base', null, null], ['CAMBIO', 'Base', null, null], ['CIDADE TIRADENTES 1', 'Base', null, null],
  ['CIDADE TIRADENTES 2', 'Base', null, null], ['CIDADE TIRADENTES 3', 'Base', null, null], ['COLUMBIA', 'Base', null, null], ['CONQUISTA', 'Base', null, null],
  ['FERRAZ DE VASCONCELOS 1', 'Retirada', 'Rogério', '2026-09-10T12:00:00-03:00'], ['FERRAZ DE VASCONCELOS 2', 'A conferir', null, null], ['GIULIA', 'Base', null, null],
  ['GUAIANASES 1', 'Base', null, null], ['GUAIANASES 2', 'Base', null, null], ['GUARULHOS 1', 'Base', null, null], ['GUARULHOS 2', 'Base', null, null],
  ['GUARULHOS 3', 'Base', null, null], ['GUARULHOS 4', 'Base', null, null], ['GUARULHOS 5', 'Base', null, null], ['IGUATEMI', 'Base', null, null],
  ['ITAIM PAULISTA', 'Retirada', 'Adriano Jose', null], ['MOGI DAS CRUZES', 'Retirada', 'Everaldo', '2026-09-18T12:00:00-03:00'], ['PALMEIRAS', 'Retirada', 'Lucas', null],
  ['RIO GRANDE DA SERRA', 'Base', null, null], ['SANTA LUZIA', 'Base', null, null], ['SÃO MATEUS', 'Base', null, null], ['SÃO RAFAEL', 'Base', null, null],
  ['SERTÃOZINHO', 'Base', null, null], ['SUZANO 1', 'Retirada', 'Lucas', null], ['TURQUESA', 'Base', null, null], ['CAÇAPAVA', 'Base', null, null],
  ['PENHA', 'Retirada', 'Mauro GIGA', '2026-09-12T12:00:00-03:00'], ['SÃO MIGUEL PAULISTA', 'Base', null, null], ['TAUBATÉ 2', 'A conferir', null, null],
  ['SÃO JOSÉ DOS CAMPOS', 'A conferir', null, null], ['JACAREÍ', 'Base', null, null], ['TAUBATÉ 1', 'A conferir', null, null], ['VITÓRIA', 'Base', null, null],
  ['EVOLUTION \\ SAO BERNADO', 'Base', null, null], ['PIRAPORINHA', 'A conferir', null, null], ['SERRARIA', 'Base', null, null],
];
const memoryKeys: PopKey[] = [];
const memoryMovements: Array<PopKeyMovement & { photo: string | null }> = [];
function ensureMemory() {
  if (memoryKeys.length) return;
  SEED.forEach(([pop, status, holderName, takenAt]) => memoryKeys.push({ id: `key-${memoryKeys.length + 1}`, pop, status, holderName, holderKind: holderName ? 'Outro' : null, holderId: null, takenAt, notes: null, currentMovementId: null, hasPhoto: false, updatedAt: new Date().toISOString() }));
}

const KEY_COLUMNS = 'id, pop, status, holder_name, holder_kind, holder_id, taken_at, notes, current_movement_id, updated_at, sort_order';
type KeyRow = { id: string; pop: string; status: string; holder_name: string | null; holder_kind: string | null; holder_id: string | null; taken_at: string | null; notes: string | null; current_movement_id: string | null; updated_at: string };
const mapKey = (row: KeyRow, photoMovements: Set<string>): PopKey => ({ id: row.id, pop: row.pop, status: row.status as PopKeyStatus, holderName: row.holder_name, holderKind: row.holder_kind as HolderKind | null, holderId: row.holder_id, takenAt: row.taken_at, notes: row.notes, currentMovementId: row.current_movement_id, hasPhoto: Boolean(row.current_movement_id && photoMovements.has(row.current_movement_id)), updatedAt: row.updated_at });

export async function listPopKeys(): Promise<PopKey[]> {
  if (!isSupabaseConfigured()) { ensureMemory(); return memoryKeys.map((key) => ({ ...key })); }
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('pop_keys').select(KEY_COLUMNS).order('sort_order').order('pop');
  if (error) throw new Error(/pop_keys/.test(error.message) ? 'As tabelas de chaves ainda nao existem no banco (falta a migracao pop_keys).' : error.message);
  const movementIds = (data || []).map((row) => row.current_movement_id).filter(Boolean) as string[];
  const withPhoto = new Set<string>();
  if (movementIds.length) {
    const { data: rows, error: movementError } = await admin.from('pop_key_movements').select('id').in('id', movementIds).eq('has_photo', true);
    if (movementError) throw new Error(movementError.message);
    (rows || []).forEach((row) => withPhoto.add(row.id));
  }
  return (data || []).map((row) => mapKey(row as KeyRow, withPhoto));
}

async function getPopKey(id: string) {
  return (await listPopKeys()).find((key) => key.id === id);
}

async function insertMovement(movement: Omit<PopKeyMovement, 'id' | 'hasPhoto'> & { photo: string | null; userId: string | null }) {
  const id = randomUUID();
  if (!isSupabaseConfigured()) {
    memoryMovements.unshift({ id, popKeyId: movement.popKeyId, action: movement.action, holderName: movement.holderName, holderKind: movement.holderKind, holderId: movement.holderId, hasPhoto: Boolean(movement.photo), photo: movement.photo, notes: movement.notes, happenedAt: movement.happenedAt, userName: movement.userName });
    return id;
  }
  const { error } = await getSupabaseAdmin().from('pop_key_movements').insert({ id, pop_key_id: movement.popKeyId, action: movement.action, holder_name: movement.holderName, holder_kind: movement.holderKind, holder_id: movement.holderId, photo: movement.photo, notes: movement.notes, happened_at: movement.happenedAt, user_id: movement.userId, user_name: movement.userName });
  if (error) throw new Error(error.message);
  return id;
}

async function updateKey(id: string, changes: Partial<Pick<PopKey, 'status' | 'holderName' | 'holderKind' | 'holderId' | 'takenAt' | 'notes' | 'currentMovementId'>>) {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const key = memoryKeys.find((item) => item.id === id);
    if (key) Object.assign(key, changes, { updatedAt: now, hasPhoto: changes.currentMovementId !== undefined ? Boolean(memoryMovements.find((movement) => movement.id === changes.currentMovementId)?.photo) : key.hasPhoto });
    return;
  }
  const row: Record<string, unknown> = { updated_at: now };
  if (changes.status !== undefined) row.status = changes.status;
  if (changes.holderName !== undefined) row.holder_name = changes.holderName;
  if (changes.holderKind !== undefined) row.holder_kind = changes.holderKind;
  if (changes.holderId !== undefined) row.holder_id = changes.holderId;
  if (changes.takenAt !== undefined) row.taken_at = changes.takenAt;
  if (changes.notes !== undefined) row.notes = changes.notes;
  if (changes.currentMovementId !== undefined) row.current_movement_id = changes.currentMovementId;
  const { error } = await getSupabaseAdmin().from('pop_keys').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

export type TakeInput = { holderName: string; holderKind: HolderKind; holderId?: string | null; notes?: string | null; photo?: unknown; takenAt?: string };
export async function takePopKey(id: string, input: TakeInput, actor: Actor) {
  const key = await getPopKey(id);
  if (!key) return { status: 404 as const, message: 'Chave nao encontrada.' };
  if (key.status === 'Retirada') return { status: 409 as const, message: `A chave de ${key.pop} ja esta com ${key.holderName || 'alguem'}. Registre a devolucao antes.` };
  const photo = safePhoto(input.photo);
  const takenAt = input.takenAt || new Date().toISOString();
  const notes = input.notes?.trim() || null;
  const movementId = await insertMovement({ popKeyId: id, action: 'Retirada', holderName: input.holderName.trim(), holderKind: input.holderKind, holderId: input.holderId || null, photo, notes, happenedAt: takenAt, userName: actor.name, userId: isSupabaseConfigured() ? actor.id : null });
  await updateKey(id, { status: 'Retirada', holderName: input.holderName.trim(), holderKind: input.holderKind, holderId: input.holderId || null, takenAt, notes, currentMovementId: movementId });
  return { status: 200 as const, key: await getPopKey(id) };
}

export async function returnPopKey(id: string, input: { notes?: string | null; returnedAt?: string }, actor: Actor) {
  const key = await getPopKey(id);
  if (!key) return { status: 404 as const, message: 'Chave nao encontrada.' };
  if (key.status === 'Base') return { status: 409 as const, message: `A chave de ${key.pop} ja esta na base.` };
  await insertMovement({ popKeyId: id, action: key.status === 'Retirada' ? 'Devolucao' : 'Ajuste', holderName: key.holderName, holderKind: key.holderKind, holderId: key.holderId, photo: null, notes: input.notes?.trim() || (key.status === 'A conferir' ? 'Conferida: chave na base.' : null), happenedAt: input.returnedAt || new Date().toISOString(), userName: actor.name, userId: isSupabaseConfigured() ? actor.id : null });
  await updateKey(id, { status: 'Base', holderName: null, holderKind: null, holderId: null, takenAt: null, notes: null, currentMovementId: null });
  return { status: 200 as const, key: await getPopKey(id) };
}

export async function listPopKeyMovements(id: string): Promise<PopKeyMovement[]> {
  if (!isSupabaseConfigured()) return memoryMovements.filter((movement) => movement.popKeyId === id).slice(0, 100).map(({ photo: _photo, ...movement }) => movement);
  const { data, error } = await getSupabaseAdmin().from('pop_key_movements').select('id, pop_key_id, action, holder_name, holder_kind, holder_id, has_photo, notes, happened_at, user_name').eq('pop_key_id', id).order('happened_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({ id: row.id, popKeyId: row.pop_key_id, action: row.action, holderName: row.holder_name, holderKind: row.holder_kind, holderId: row.holder_id, hasPhoto: Boolean(row.has_photo), notes: row.notes, happenedAt: row.happened_at, userName: row.user_name }));
}

export async function getPopKeyPhoto(movementId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return memoryMovements.find((movement) => movement.id === movementId)?.photo || null;
  const { data, error } = await getSupabaseAdmin().from('pop_key_movements').select('photo').eq('id', movementId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.photo || null;
}

// POP novo (quem gerencia as configuracoes).
export async function addPopKey(pop: string) {
  const name = pop.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
  if (!name || name.length > 80) throw new Error('Informe o nome do POP (ate 80 caracteres).');
  const existing = await listPopKeys();
  if (existing.some((key) => key.pop.localeCompare(name, 'pt-BR', { sensitivity: 'accent' }) === 0)) throw new Error('Este POP ja esta cadastrado.');
  const sortOrder = existing.length + 1;
  if (!isSupabaseConfigured()) {
    memoryKeys.push({ id: `key-${randomUUID()}`, pop: name, status: 'Base', holderName: null, holderKind: null, holderId: null, takenAt: null, notes: null, currentMovementId: null, hasPhoto: false, updatedAt: new Date().toISOString() });
  } else {
    const { error } = await getSupabaseAdmin().from('pop_keys').insert({ pop: name, status: 'Base', sort_order: sortOrder });
    if (error) throw new Error(error.message);
  }
  return (await listPopKeys()).find((key) => key.pop === name);
}
