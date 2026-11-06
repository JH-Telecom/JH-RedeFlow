import bcrypt from "bcryptjs";
import { changeSupabaseUserPassword, createSupabaseUser, deleteSupabaseUserAvatar, getSupabaseUserBanners, saveSupabaseUserBanner, getSupabaseUserAvatars, getSupabaseUserPreferences, saveSupabaseUserPreferences, getSupabaseRole, getSupabaseAdmin, getSupabaseUserAvatar, isSupabaseConfigured, listSupabaseRoles, listSupabaseUsers, saveSupabaseUserAvatar, updateSupabaseUser } from "../integrations/supabase/client.js";
import type { AuthUser, PermissionCode, Role, User } from "../types.js";
import { allPermissions, ensureDemoData, permissionDescriptions, roles, userAvatars, userBanners, userPreferences, users } from "./demo-data.js";

export function getRole(roleId: string): Role | undefined { return roles.find((role) => role.id === roleId); }

export async function getRoleById(roleId: string): Promise<Role | undefined> {
  if (isSupabaseConfigured()) {
    try {
      const supabaseRole = await getSupabaseRole(roleId) as Role | undefined;
      if (supabaseRole) return supabaseRole;
    } catch {
      // fall through to the built-in role catalog when Supabase is configured but unreachable
    }
  }
  return getRole(roleId);
}

export async function listRoles(): Promise<Role[]> {
  if (isSupabaseConfigured()) {
    try {
      return await listSupabaseRoles() as Role[];
    } catch {
      // use the local catalog while Supabase is temporarily unavailable
    }
  }
  return roles;
}

export function listPermissions() { return allPermissions.map((code) => ({ code, description: permissionDescriptions[code] })); }

export async function listUsers(): Promise<User[]> {
  ensureDemoData();
  if (isSupabaseConfigured()) return await listSupabaseUsers() as User[];
  return [...users.values()].map(({ passwordHash: _passwordHash, ...user }) => ({ ...user, role: getRole(user.roleId) }));
}

export function getUserByEmail(email: string) {
  ensureDemoData();
  return [...users.values()].find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export function getAuthUser(user: User): AuthUser {
  const { passwordHash: _passwordHash, ...safeUser } = user as User & { passwordHash?: string };
  const role = user.role ?? getRole(user.roleId) ?? { id: user.roleId, name: 'Sem cargo', description: '', permissions: [] as PermissionCode[] };
  return { ...safeUser, role };
}

export function validatePassword(user: User & { passwordHash: string }, password: string) { return bcrypt.compareSync(password, user.passwordHash); }

export async function addUser(input: { name: string; email: string; roleId: string; password: string }): Promise<User> {
  if (isSupabaseConfigured()) return await createSupabaseUser(input);
  const id = `user-${crypto.randomUUID()}`;
  const user = { id, name: input.name, email: input.email, roleId: input.roleId, active: true, createdAt: new Date().toISOString(), mustChangePassword: true, passwordHash: bcrypt.hashSync(input.password, 10) };
  users.set(id, user);
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function updateUser(id: string, input: { name?: string; email?: string; roleId?: string; active?: boolean; password?: string }): Promise<User | undefined> {
  if (isSupabaseConfigured()) return await updateSupabaseUser(id, input);
  const current = users.get(id);
  if (!current) return undefined;
  const updated = { ...current, ...input, passwordHash: input.password ? bcrypt.hashSync(input.password, 10) : current.passwordHash };
  if (input.password) updated.mustChangePassword = true;
  delete (updated as { password?: string }).password;
  users.set(id, updated);
  const { passwordHash: _passwordHash, ...safeUser } = updated;
  return { ...safeUser, role: getRole(updated.roleId) };
}

export async function getUserAvatar(userId: string): Promise<string | null> {
  if (isSupabaseConfigured()) return await getSupabaseUserAvatar(userId);
  ensureDemoData();
  return userAvatars.get(userId) || null;
}

export async function saveUserAvatar(userId: string, dataUrl: string): Promise<boolean> {
  if (isSupabaseConfigured()) return await saveSupabaseUserAvatar(userId, dataUrl);
  ensureDemoData();
  if (!users.has(userId)) return false;
  userAvatars.set(userId, dataUrl);
  return true;
}

export async function deleteUserAvatar(userId: string): Promise<void> {
  if (isSupabaseConfigured()) return await deleteSupabaseUserAvatar(userId);
  ensureDemoData();
  userAvatars.delete(userId);
}

export async function changeUserPassword(id: string, currentPassword: string, newPassword: string): Promise<{ user?: User; error?: 'invalid-current-password' | 'same-password' }> {
  if (isSupabaseConfigured()) return await changeSupabaseUserPassword(id, currentPassword, newPassword);
  const current = users.get(id);
  if (!current) return {};
  if (!validatePassword(current, currentPassword)) return { error: 'invalid-current-password' };
  if (validatePassword(current, newPassword)) return { error: 'same-password' };
  current.passwordHash = bcrypt.hashSync(newPassword, 10);
  current.mustChangePassword = false;
  return { user: getAuthUser(current) };
}

export async function deleteUser(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin()
      .from('profiles')
      .update({ active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);
    if (error) throw new Error(error.message || 'Nao foi possivel remover o usuario.');
    return true;
  }
  return users.delete(id);
}

export async function addRole(input: { name: string; description: string; permissions: PermissionCode[]; hiddenTabs?: string[] }): Promise<Role> {
  if (isSupabaseConfigured()) {
    try {
      const admin = getSupabaseAdmin();
      const { data: roleData, error: roleError } = await admin.from('roles').insert({ name: input.name, description: input.description, hidden_tabs: input.hiddenTabs ?? [] }).select('id, name, description').single();
      if (roleError || !roleData) throw new Error(roleError?.message || 'Nao foi possivel criar o cargo no Supabase.');

      if (input.permissions.length) {
        const { data: permissionRows, error: permissionError } = await admin.from('permissions').select('id, code').in('code', input.permissions);
        if (permissionError) throw new Error(permissionError.message || 'Nao foi possivel carregar as permissoes do cargo.');
        const permissionIds = permissionRows?.map((row) => row.id) || [];
        for (const permissionId of permissionIds) {
          const { error: linkError } = await admin.from('role_permissions').insert({ role_id: roleData.id, permission_id: permissionId }).select();
          if (linkError && !String(linkError.message).includes('duplicate key')) throw new Error(linkError.message || 'Nao foi possivel vincular a permissao ao cargo.');
        }
      }

      return { id: roleData.id, name: roleData.name, description: roleData.description || '', permissions: input.permissions, hiddenTabs: input.hiddenTabs ?? [] };
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Nao foi possivel criar o cargo no Supabase.';
        throw new Error(`Supabase indisponivel ao criar o cargo. ${message}`);
    }
  }

  const role: Role = { id: `role-${crypto.randomUUID()}`, name: input.name, description: input.description, permissions: input.permissions, hiddenTabs: input.hiddenTabs ?? [] };
  roles.push(role);
  return role;
}

export async function updateRole(id: string, input: { name?: string; description?: string; permissions?: PermissionCode[]; hiddenTabs?: string[] }): Promise<Role | undefined> {
  if (isSupabaseConfigured()) {
    try {
      const admin = getSupabaseAdmin();

      if (input.name !== undefined || input.description !== undefined || input.hiddenTabs !== undefined) {
        const updatePayload: Record<string, string | string[]> = {};
        if (input.name !== undefined) updatePayload.name = input.name;
        if (input.description !== undefined) updatePayload.description = input.description;
        if (input.hiddenTabs !== undefined) updatePayload.hidden_tabs = input.hiddenTabs;
        const { error: updateRoleError } = await admin.from('roles').update(updatePayload).eq('id', id).is('deleted_at', null);
        if (updateRoleError) throw new Error(updateRoleError.message || 'Nao foi possivel atualizar o cargo no Supabase.');
      }

      if (input.permissions) {
        const { error: deleteError } = await admin.from('role_permissions').delete().eq('role_id', id);
        if (deleteError) throw new Error(deleteError.message || 'Nao foi possivel limpar as permissoes do cargo.');

        if (input.permissions.length) {
          const { data: permissionRows, error: permissionError } = await admin.from('permissions').select('id, code').in('code', input.permissions);
          if (permissionError) throw new Error(permissionError.message || 'Nao foi possivel carregar as permissoes do cargo.');
          const permissionIds = permissionRows?.map((row) => row.id) || [];
          for (const permissionId of permissionIds) {
            const { error: linkError } = await admin.from('role_permissions').insert({ role_id: id, permission_id: permissionId });
            if (linkError && !String(linkError.message).includes('duplicate key')) throw new Error(linkError.message || 'Nao foi possivel vincular a permissao ao cargo.');
          }
        }
      }

      const refreshed = await getSupabaseRole(id);
      if (!refreshed) return undefined;
      return refreshed;
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Nao foi possivel atualizar o cargo no Supabase.';
        throw new Error(`Supabase indisponivel ao atualizar o cargo. ${message}`);
    }
  }

  const role = roles.find((item) => item.id === id);
  if (!role) return undefined;
  Object.assign(role, input);
  return role;
}

// Banner do perfil: imagem larga ao fundo das observacoes do usuario nos chamados.
export async function getUserBanners(userIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (isSupabaseConfigured()) return await getSupabaseUserBanners(ids);
  return Object.fromEntries(ids.filter((id) => userBanners.has(id)).map((id) => [id, userBanners.get(id)!]));
}

export async function saveUserBanner(userId: string, bannerDataUrl: string | null): Promise<void> {
  if (isSupabaseConfigured()) return await saveSupabaseUserBanner(userId, bannerDataUrl);
  if (bannerDataUrl) userBanners.set(userId, bannerDataUrl); else userBanners.delete(userId);
}

// Preferencias do perfil: apelido (aparece so para a propria pessoa, no lugar do nome) e tema de cor.
export type UserPreferences = { nickname: string | null; palette: string | null };
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  if (isSupabaseConfigured()) return await getSupabaseUserPreferences(userId);
  return userPreferences.get(userId) ?? { nickname: null, palette: null };
}

export async function saveUserPreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences> {
  if (isSupabaseConfigured()) await saveSupabaseUserPreferences(userId, preferences);
  else if (!preferences.nickname && !preferences.palette) userPreferences.delete(userId);
  else userPreferences.set(userId, preferences);
  return preferences;
}

// Fotos de varias pessoas (aba Pessoas, so leitura).
export async function getUserAvatars(userIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (isSupabaseConfigured()) return await getSupabaseUserAvatars(ids);
  ensureDemoData();
  return Object.fromEntries(ids.filter((id) => userAvatars.get(id)).map((id) => [id, userAvatars.get(id)!]));
}
