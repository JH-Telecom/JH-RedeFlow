import assert from 'node:assert/strict';
import test from 'node:test';
import { addRole, listRoles, updateRole } from '../src/store/users.js';

test('roles keep the menu tabs hidden for them', async () => {
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  process.env.SUPABASE_ANON_KEY = '';
  const role = await addRole({ name: 'Painel TV teste', description: 'Só a TV', permissions: ['dashboard.view'], hiddenTabs: ['/igp'] });
  assert.deepEqual(role.hiddenTabs, ['/igp']);
  const updated = await updateRole(role.id, { hiddenTabs: ['/igp', '/painel-diario'] });
  assert.deepEqual(updated?.hiddenTabs, ['/igp', '/painel-diario']);
  const listed = (await listRoles()).find((item) => item.id === role.id);
  assert.deepEqual(listed?.hiddenTabs, ['/igp', '/painel-diario']);
});
