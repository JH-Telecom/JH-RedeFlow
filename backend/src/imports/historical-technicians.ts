// Cadastro automatico dos tecnicos que aparecem na planilha historica mas nao existem no sistema.
// Ficam inativos (nao aparecem para atribuicao) com matricula HIST-...; o usuario ativa em Tecnicos se ainda trabalham.
import { randomUUID } from 'node:crypto';
import { addTechnician, listTechnicians } from '../store.js';
import type { Call } from '../types.js';
import { findHistoricalTechnician } from './historical-activations.js';

export async function registerMissingHistoricalTechnicians(calls: Call[]) {
  const missingNames = [...new Set(calls.filter((call) => call.technicianName?.trim() && !call.technicianId).map((call) => call.technicianName!.trim()))];
  if (!missingNames.length) return [] as string[];
  const registered = await listTechnicians();
  const created: string[] = [];
  for (const name of missingNames) {
    let technician = findHistoricalTechnician(name, registered);
    if (!technician) {
      technician = await addTechnician({ name, registration: `HIST-${randomUUID().slice(0, 8).toUpperCase()}`, teamRole: 'Tecnico', region: '', shift: 'Nao informado', currentStatus: 'Indisponivel', active: false, employmentStatus: 'Trabalhando' });
      registered.push(technician);
      created.push(technician.name);
    }
    for (const call of calls) {
      if (!call.technicianId && call.technicianName?.trim() === name) {
        call.technicianId = technician.id;
        call.technicianName = technician.name;
      }
    }
  }
  return created;
}
