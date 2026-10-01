import 'dotenv/config';

const roster = [
  { technician: 'Adriano Jose de Melo', assistants: [] },
  { technician: 'Gabriel Oliveira', assistants: [] },
  { technician: 'Antonio Carlos de Lima Pinheiro', assistants: ['Matheus Henrique De Lima Souza'] },
  { technician: 'Francinaldo lima de Freitas', assistants: ['Vitor Rocha'] },
  { technician: 'José Everaldo Lopes Dos Santos', assistants: ['Michael Henrique de Oliveira Sarmento'] },
  { technician: 'Marcos Antônio Ramos dos santos', assistants: ['Vitor Rafael Matias de Bessa'] },
  { technician: 'Caíque da Silva Bento Aguiar', assistants: ['Kawã dos Santos ernardo', 'Lucas riquelme Barreto'] },
  { technician: 'Juvercino Santos Martins', assistants: ['Iago de Oliveira Ramos'] },
  { technician: 'Weverton José Domingos jacquet', assistants: ['Gilvone Junior Pereira De Santana'] },
  { technician: 'Guilherme Matias Chaves', assistants: ['Matias Barbosa Ferreira'] },
  { technician: 'Gustavo Henrique Teixeira Porto', assistants: ['Andre Pereira da Silva'] },
  { technician: 'Ricardo Mendes de Sousa', assistants: ['João chagas vieira'] },
  { technician: 'Rafael Rodrigo de Freitas Araujo', assistants: ['Juvenal Pereira da Silva Neto', 'Francisco Roberto'] },
  { technician: 'Jose Leidson da Silva Barbosa', assistants: ['Rodrigo Aureliano Barboza'] },
  { technician: 'Paulo Herculano', assistants: ['Francisco Roberto'] },
  { technician: 'Geraldo celestino da Silva Junior', assistants: ['Ryan Robert Manoel Da cunha'] },
  { technician: 'Rodrigo Henrique Cruz da Silva', assistants: ['Danilo Leonel De Carvalho'] },
  { technician: 'Kauan Felipe Ribeito Silva', assistants: ['Édson Luan Parras de Oliveira Alves'] },
  { technician: 'Rogério Alves Ferreira', assistants: ['Lucas Mendes da Costa'] },
  { technician: 'Wesley Ferreira da Silva', assistants: [] },
  { technician: 'Lucas Oliveira Santos', assistants: ['Paulo Vinicius Santos da Silva'] },
  { technician: 'Bruno Dias Gimenes', assistants: ['Silvio Andre Constâncio Pereira Junior'] },
  { technician: 'Alécio Quierione Brito', assistants: ['Erick Silva dos Santos'] },
  { technician: 'Robson Jose da Silva Oliveira', assistants: ['Micael Feitosa freita'] },
  { technician: 'Maicon Torres dos Santos', assistants: ['Guilherme Lopes Dias'] },
  { technician: 'Carlos Roberto Oliveira Filho', assistants: ['Nelson Quaitti leopoudo'] },
  { technician: 'Leandro da Silva Costa', assistants: [] },
];

const assistantCount = roster.reduce((total, item) => total + item.assistants.length, 0);
if (process.argv.includes('--dry-run')) {
  console.log(`Pronto para importar: ${roster.length} técnicos e ${assistantCount} auxiliares.`);
  console.log('Região: vazia | Turno: A definir | Auxiliares duplicados por vínculo de equipe.');
  process.exit(0);
}

const [{ isSupabaseConfigured }, { addTechnician, listTechnicians }, { getDatabaseClient }] = await Promise.all([
  import('../src/integrations/supabase/client.ts'),
  import('../src/store.ts'),
  import('../src/db.ts'),
]);

if (!isSupabaseConfigured() && process.env.DATABASE_URL) process.env.REDEFLOW_RUNTIME = 'local';
if (!isSupabaseConfigured() && !(process.env.REDEFLOW_RUNTIME === 'local' && process.env.DATABASE_URL)) {
  throw new Error('Sem banco persistente configurado. Configure Supabase ou DATABASE_URL antes da importação.');
}

function normalizeName(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

const isSupabase = isSupabaseConfigured();
let createdTechnicians = 0;
let createdAssistants = 0;
let skippedTechnicians = 0;
let skippedAssistants = 0;

try {
  const existing = await listTechnicians();
  const usedRegistrations = new Set(existing.map((item) => item.registration.trim().toLocaleUpperCase()));
  let nextTechnicianNumber = 1;
  let nextAssistantNumber = 1;

  function allocateRegistration(prefix) {
    const isTechnician = prefix === 'TEC';
    let registration;
    do {
      const number = isTechnician ? nextTechnicianNumber++ : nextAssistantNumber++;
      registration = `${prefix}-${String(number).padStart(3, '0')}`;
    } while (usedRegistrations.has(registration));
    usedRegistrations.add(registration);
    return registration;
  }

  async function findOrCreate(name, teamRole, leadTechnicianId) {
    const matching = existing.find((item) => item.teamRole === teamRole
      && normalizeName(item.name) === normalizeName(name)
      && (teamRole === 'Tecnico' || item.leadTechnicianId === leadTechnicianId));
    if (matching) return { item: matching, created: false };

    const item = await addTechnician({
      name,
      registration: allocateRegistration(teamRole === 'Tecnico' ? 'TEC' : 'AUX'),
      teamRole,
      ...(leadTechnicianId ? { leadTechnicianId } : {}),
      region: '',
      shift: 'A definir',
      currentStatus: 'Disponivel',
      active: true,
    });
    existing.push(item);
    return { item, created: true };
  }

  for (const row of roster) {
    const lead = await findOrCreate(row.technician, 'Tecnico');
    if (lead.created) createdTechnicians += 1;
    else skippedTechnicians += 1;

    for (const name of row.assistants) {
      const assistant = await findOrCreate(name, 'Auxiliar', lead.item.id);
      if (assistant.created) createdAssistants += 1;
      else skippedAssistants += 1;
    }
  }

  console.log(`Importação concluída: ${createdTechnicians} técnicos e ${createdAssistants} auxiliares criados; ${skippedTechnicians} técnicos e ${skippedAssistants} vínculos já existiam.`);
} finally {
  if (!isSupabase && process.env.DATABASE_URL) {
    const client = await getDatabaseClient();
    await client.end();
  }
}