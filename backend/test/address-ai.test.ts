import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeAddressesWithAi, applyAddressAi, badAddress, badNeighborhood, confidentAiRegion, parseAddressAiResponse, regionExamples } from '../src/address-ai.js';
import { analyzeOperationalMessage } from '../src/integrations/wuzapi/semantic.js';
import { cleanStreet } from '../src/integrations/wuzapi/noc-consolidation.js';
import type { ActivationAnalysis } from '../src/types.js';

const CARD = `⚠️VALIDAR COM NOC ACESSO⚠️

- OLT: VIP-ITA-SPO-OHW-01
- SLOT/PON: 06/13, 06/12
- Tipo de falha: Total
- BDESK: 684117
- Tarefa OFS: 611040045660102

Endereços: 

SLOT/PON: 06/12

Serial: HWTCE6C441B0 || Contrato: 6227047 || Endereço: AVENIDA BENTO GIL DE OLIVEIRA, 375, JARDIM CAMARGO NOVO, SAO PAULO - SP, 08.121-190, CASA:FUNDOS, SEM

Serial: HWTC7E9103A6 || Contrato: 4577187 || Endereço: AVENIDA AVENIDA MONTE PIRAPIRAPUÃ, 319, JARDIM CAMARGO NOVO, SAO PAULO - SP, 08.120-560, -:-, S/R

Serial: HWTCC5A67CB0 || Contrato: 6116910 || Endereço: RUA RUA FRANCISCO VELASQUEZ, 58, ITAIM PAULISTA, SAO PAULO - SP, 08.120-550, CASA 1, AO LADO DA PRACA

SLOT/PON: 06/13

Serial: HWTCF789AFAF || Contrato: 6080147 || Endereço: RUA MONTE TAÓ, 11, JARDIM CAMARGO NOVO, SAO 
PAULO - SP, 08.120-570, SEM

Serial: HWTC5C472BB3 || Contrato: 4527682 || Endereço: RUA MONTE TAO, 53, JARDIM CAMARGO NOVO, SAO PAULO - SP, 08.120-570, NAO_INFORMADO

Serial: HWTC2A4C64AB || Contrato: 4564624 || Endereço: RUA MONTE TAO, 26, JARDIM CAMARGO NOVO, SAO PAULO - SP, 08.120-570, NAO_INFORMADO`;

test('one-line addresses (Serial || Contrato || Endereço): street, number, bairro, city and CEP without complement', () => {
  const analysis = analyzeOperationalMessage(CARD);
  const clients = analysis.clientes_afetados!;
  assert.equal(clients.length, 6);
  assert.equal(clients[4].endereco, 'RUA MONTE TAO, 53, JARDIM CAMARGO NOVO, SAO PAULO - SP, 08.120-570');
  assert.equal(clients[1].endereco, 'AVENIDA MONTE PIRAPIRAPUÃ, 319, JARDIM CAMARGO NOVO, SAO PAULO - SP, 08.120-560');
  assert.equal(clients[3].endereco, 'RUA MONTE TAÓ, 11, JARDIM CAMARGO NOVO, SAO PAULO - SP, 08.120-570'); // linha quebrada
  assert.equal(clients[0].complemento, 'CASA:FUNDOS');
  assert.equal(clients[2].bairro, 'ITAIM PAULISTA');
  assert.equal(analysis.bairro_principal, 'JARDIM CAMARGO NOVO');
  assert.match(analysis.endereco_principal!, /^RUA MONTE TA[OÓ], \d+, JARDIM CAMARGO NOVO, SAO PAULO - SP, 08\.120-570$/);
  assert.equal(cleanStreet('RUA AVENIDA BENTO GIL'), 'AVENIDA BENTO GIL');
});

test('bad neighborhood and address detection', () => {
  assert.equal(badNeighborhood('120'), true);
  assert.equal(badNeighborhood(''), true);
  assert.equal(badNeighborhood('JARDIM CAMARGO NOVO'), false);
  assert.equal(badAddress('SLOT, PON: 06, 12'), true);
  assert.equal(badAddress('RUA MONTE TAO, 53'), false);
});

test('AI answer: region only from the known list, confidence clamped, bad bairro dropped', () => {
  const regions = ['ITAIM PAULISTA', 'GUAIANASES 1'];
  assert.deepEqual(parseAddressAiResponse('{"bairro":"Jardim Camargo Novo","cidade":"São Paulo","endereco":"RUA X, 1","regiao":"itaim paulista","confianca":1.4,"motivo":"vizinho"}', regions),
    { bairro: 'JARDIM CAMARGO NOVO', cidade: 'SAO PAULO', endereco: 'RUA X, 1', regiao: 'ITAIM PAULISTA', confianca: 1, motivo: 'vizinho' });
  assert.equal(parseAddressAiResponse('{"regiao":"SUZANO 9","confianca":0.9}', regions)?.regiao, null);
  assert.equal(parseAddressAiResponse('{"bairro":"120","regiao":null}', regions)?.bairro, null);
  assert.equal(parseAddressAiResponse('nada', regions), null);
});

test('AI call: sends addresses, regions and examples; applies bairro only when the rules failed', async () => {
  let prompt = '';
  const fetcher = async (_url: string, init: RequestInit) => {
    prompt = JSON.parse(String(init.body)).contents[0].parts[0].text;
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"bairro":"JARDIM CAMARGO NOVO","cidade":"SAO PAULO","endereco":"RUA MONTE TAO, 53, JARDIM CAMARGO NOVO, SAO PAULO - SP, 08.120-570","regiao":"ITAIM PAULISTA","confianca":0.92,"motivo":"exemplos"}' }] } }] }) };
  };
  const examples = regionExamples([{ bairro: 'Jardim Camargo Novo', city: 'Sao Paulo', region: 'ITAIM PAULISTA' }, { bairro: 'Centro', city: 'Suzano', region: 'Nao informada' }], (region) => !region || /nao informada/i.test(region));
  const result = await analyzeAddressesWithAi({ addresses: ['RUA MONTE TAO, 53, JARDIM CAMARGO NOVO, SAO PAULO - SP'], bairro: '120', city: null, regions: ['ITAIM PAULISTA'], examples }, fetcher, { GEMINI_API_KEY: 'x' } as NodeJS.ProcessEnv);
  assert.match(prompt, /ITAIM PAULISTA/);
  assert.match(prompt, /JARDIM CAMARGO NOVO \| SAO PAULO -> ITAIM PAULISTA \(1\)/);
  assert.equal(examples.length, 1);
  const base = { bairro_principal: '120', endereco_principal: 'SLOT, PON: 06, 12' } as ActivationAnalysis;
  const applied = applyAddressAi(base, result);
  assert.equal(applied.bairro_principal, 'JARDIM CAMARGO NOVO');
  assert.equal(applied.endereco_principal, 'RUA MONTE TAO, 53, JARDIM CAMARGO NOVO, SAO PAULO - SP, 08.120-570');
  assert.equal(confidentAiRegion(applied), 'ITAIM PAULISTA');
  // Regras boas: a IA nao troca bairro nem endereco.
  const good = applyAddressAi({ bairro_principal: 'ITAIM PAULISTA', endereco_principal: 'RUA A, 1' } as ActivationAnalysis, result);
  assert.equal(good.bairro_principal, 'ITAIM PAULISTA');
  assert.equal(confidentAiRegion({ regiao_ia: { regiao: 'ITAIM PAULISTA', confianca: 0.6, motivo: '' } }), null);
  // Sem chave: nao chama nada.
  assert.equal(await analyzeAddressesWithAi({ addresses: ['x'], regions: [], examples: [] }, fetcher, {} as NodeJS.ProcessEnv), null);
});
