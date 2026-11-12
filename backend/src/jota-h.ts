import { addDays, toOperationalDate } from './timezone.js';

// Jota H (12/11/2026): assistente de dados do RedeFlow. A pergunta em portugues vai para o Gemini junto com o prompt
// abaixo (estrutura das views do schema jota, sem nenhum dado); ele devolve so um JSON com o SELECT. O SELECT roda no
// banco pela funcao jota_consultar (papel jota_reader: so as views jota.*, somente leitura, 8 s, 200 linhas) e o
// resultado vai direto para o navegador. Adaptado do prompt do Jota H da JH Telecom (agendamentos) para a Rede.

export type JotaAnswer =
  | { kind: 'query'; titulo: string; sql: string; explicacao: string; sugestoes: string[] }
  | { kind: 'question'; texto: string; opcoes: string[] }
  | { kind: 'refused'; titulo: string; explicacao: string };
export type JotaContext = { pergunta: string; sql?: string };

export function jotaPrompt(today = toOperationalDate()) {
  const yesterday = addDays(today, -1);
  return `Banco PostgreSQL do JH RedeFlow (O&M de rede da JH Telecom: chamados de manutencao de rede de fibra, parceira da Giga+, Sao Paulo). Hoje e ${today} (America/Sao_Paulo). "Ontem" = ${yesterday}.
Datas sao timestamptz: para o dia de Sao Paulo use (coluna AT TIME ZONE 'America/Sao_Paulo')::date.
Views que voce pode consultar (SOMENTE estas, SOMENTE estas colunas; escreva o nome sem schema, ex.: FROM chamados):
- chamados: um por chamado (ordem) de rede. id, ordem (text: numero da ordem/OS do OFS), bdesk, office_track, cliente, tipo ('NOC ACESSO' | 'ACIONAMENTO FIELD' | 'NOC TX'), motivo (texto do acionamento), regiao (ex.: 'ITAIM PAULISTA','GUAIANASES 1','DIADEMA','GUARULHOS 2','SUZANO'... texto livre em maiusculas), cidade, bairro, endereco (do ponto de rede), olt, slot_pon, cluster ('C08' = SP, 'C09' = ABC, 'C11' = Alto Tiete, 'C12' = GRU; pode ser nulo), status ('Aberto' sem tecnico, 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo', 'Finalizado', 'Cancelado', 'Baixar', 'GIGA+' = atendido pelo outro escritorio, fica fora dos indicadores), status_ofs (texto do OFS: 'pendente','iniciado','concluído','não concluído','suspenso','cancelado'...), tecnico (nome), tecnico_apoio (nome), supervisor (nome), abertura (timestamptz em que o chamado entrou), evento (timestamptz do evento informado no card), atribuicao (timestamptz), fim (timestamptz da execucao / Data Fim do OFS), resultado, motivo_fechamento, submotivo_fechamento, tipo_cabo, motivo_cancelamento, atrelada_a (ordem do chamado ao qual esta atrelado).
- observacoes: anotacoes nos chamados. chamado_id, ordem, autor, texto, criado_em.
- historico: alteracoes dos chamados. chamado_id, ordem, autor ('Sistema' = automatico), acao, campo, valor_anterior, valor_novo, criado_em.
- acionamentos: cards recebidos no WhatsApp. id, origem, recebido_em, status ('Pendente','Aceito','Recusado'), decidido_em, decidido_por, motivo_recusa, ordem_criada.
- tecnicos: nome, matricula, regiao, turno, status_atual, situacao ('Trabalhando' | 'Demitido'), funcao ('Tecnico' | 'Auxiliar'), supervisor, status_dia (status do dia: 'Ativo','Folga','Falta','Ativar às 13:00','Interjornada','Atestado','Vindo na base','Ativar às 22:00','Saiu de rota','Frota','Férias'; nulo = nao informado), obs_status (observacao do status), status_atualizado_em.
- supervisores: nome, regiao, ativo.
- chaves_pop: chave de cada POP. pop, status ('Base' | 'Retirada' | 'A conferir'), com_quem, tipo_pessoa, desde, observacao. chaves_pop_movimentos: pop, acao ('Retirada','Devolucao','Ajuste'), pessoa, tipo_pessoa, quando, registrado_por, observacao.
- roteirizador: o que o roteirizador da madrugada fez. ordem, regiao, tecnico, resultado ('Movida','Teste','Pulada','Erro'), detalhe, modo_teste, quando.
Regras do negocio:
- Prazo (SLA): 6 horas da abertura ate o fim. Tempo de atendimento (TME) em horas = extract(epoch from (fim - abertura))/3600, so com fim preenchido. Dentro do prazo = fim - abertura <= interval '6 hours'.
- Entrantes = chamados por abertura no periodo. Finalizados = status 'Finalizado' por fim no periodo. Em aberto agora = status em ('Aberto','Atribuido','Atrelado','Deslocamento','Em campo').
- Indicadores (entrantes, finalizados, TME, prazo, ranking) NAO contam status 'GIGA+' nem 'Cancelado', a nao ser que a pergunta peca.
- Repetido/reincidente (mesma regra da aba Repetidos): outro chamado nao cancelado com o MESMO endereco + olt + slot_pon (comparando em maiusculas, sem espacos nas pontas; endereco vazio, 'S/N' ou '-' nao conta) aberto ate 30 dias ANTES dele.
- Nomes de pessoas: use ILIKE com % entre as partes (ex.: tecnico ILIKE '%joao%silva%'); troque letras acentuadas por _ (ex.: '%jo_o%'). Regiao: ILIKE tambem.
PERGUNTAR DE VOLTA: se faltar uma informacao essencial que muda o resultado (ex.: periodo em perguntas de total/ranking/comparacao sem data nenhuma; tecnico com nome ambiguo), NAO chute: devolva {"pergunta_ia":{"texto":"pergunta curta em portugues","opcoes":["opcao 1","opcao 2"]}} com 2 a 6 opcoes curtas (ex. de periodo: "Hoje","Ontem","Esta semana","Este mês","Mês passado"; a mais provavel primeiro). Pergunte UMA coisa por vez. Se o periodo/filtro ja estiver na pergunta (inclusive entre parenteses, vindo de uma resposta anterior), responda direto. CONFIRMAR: so quando a pergunta for complicada e tiver 2+ interpretacoes plausiveis, use pergunta_ia com texto "Entendi: <sua leitura em 1 frase>. Certo?" e opcoes ["Sim, pode calcular","Não, é outra coisa"]; nunca confirme se a pergunta terminar com "(pode calcular)".
DE ONDE VEM / DETALHAR: se pedirem as linhas do resultado anterior ("de onde vem esse numero", "liste as ordens"), refaca o SELECT anterior SEM agregar, listando as linhas com colunas legiveis, no maximo 50, com o MESMO filtro.
COMPARAR PERIODOS ("compare com o periodo anterior", "essa semana contra a passada"): UMA linha por item com as colunas "Período atual", "Período anterior" e "Variação" (atual menos anterior; em % use pontos percentuais). Semana x semana anterior, mes x mes anterior, hoje x ontem.
Responda SOMENTE um JSON: {"titulo": "frase curta", "sql": "SELECT ...", "explicacao": "como calculou, em 1 frase, portugues", "sugestoes": ["proxima pergunta 1","proxima pergunta 2","proxima pergunta 3"]} — sugestoes = 3 perguntas curtas e completas que a pessoa provavelmente faria a seguir.
Se nao der para responder com essas views, ou nao for sobre a operacao: {"titulo":"Não consigo responder","sql":"","explicacao":"motivo curto"}.
O SQL: so SELECT/WITH, sem ponto e virgula, sem comentarios, colunas com nomes legiveis em portugues com AS (ex.: AS "Técnico"), ordenado, no maximo 50 linhas (LIMIT 50) a nao ser que peçam mais (maximo 200).`;
}

export function buildJotaRequest(question: string, context: JotaContext[] = [], today?: string) {
  const previous = context.slice(-3).map((item, index) => `Pergunta anterior ${index + 1}: ${item.pergunta}${item.sql ? `\nSQL dela: ${item.sql}` : ''}`).join('\n');
  return `${jotaPrompt(today)}\n${previous ? `\nConversa ate aqui (so perguntas e SQL, sem dados):\n${previous}\n` : ''}\nPergunta: ${question}`;
}

// Defesa em profundidade: o banco ja so deixa ler as views jota.* (papel jota_reader, transacao somente leitura).
const BLOCKED = /\b(insert|update|delete|merge|upsert|drop|alter|create|grant|revoke|truncate|copy|call|do|execute|prepare|deallocate|vacuum|analyze|reindex|lock|listen|notify|unlisten|set|reset|refresh|comment|security|definer|owner|pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink|pg_terminate_backend|pg_cancel_backend|current_setting|set_config|into)\b/i;
export function validateJotaSql(sql: string): { ok: true; sql: string } | { ok: false; message: string } {
  const text = String(sql ?? '').trim().replace(/;\s*$/, '');
  if (!text) return { ok: false, message: 'A consulta veio vazia.' };
  if (text.length > 6000) return { ok: false, message: 'A consulta ficou grande demais.' };
  if (!/^(select|with)\s/i.test(text)) return { ok: false, message: 'O Jota H só faz consultas (SELECT).' };
  if (text.includes(';') || /--|\/\*/.test(text)) return { ok: false, message: 'A consulta tem mais de um comando ou comentário.' };
  if (/\b(public|auth|storage|pg_catalog|information_schema|extensions|vault)\s*\./i.test(text)) return { ok: false, message: 'O Jota H só lê as tabelas dele.' };
  const blocked = text.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""').match(BLOCKED);
  if (blocked) return { ok: false, message: `A consulta usa algo que o Jota H não pode usar (${blocked[0]}).` };
  return { ok: true, sql: text };
}

const asText = (value: unknown, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
export function parseJotaAnswer(raw: string): JotaAnswer | null {
  let data: Record<string, unknown>;
  try {
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    data = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw) as Record<string, unknown>;
  } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const ask = data.pergunta_ia as { texto?: unknown; opcoes?: unknown } | undefined;
  if (ask && typeof ask === 'object' && asText(ask.texto)) {
    const opcoes = Array.isArray(ask.opcoes) ? ask.opcoes.map((option) => asText(option, 80)).filter(Boolean).slice(0, 6) : [];
    return { kind: 'question', texto: asText(ask.texto), opcoes };
  }
  const sql = asText(data.sql, 6000);
  const titulo = asText(data.titulo, 160) || 'Resultado';
  const explicacao = asText(data.explicacao);
  if (!sql) return { kind: 'refused', titulo: titulo || 'Não consigo responder', explicacao: explicacao || 'Não deu para montar essa consulta.' };
  const sugestoes = Array.isArray(data.sugestoes) ? data.sugestoes.map((item) => asText(item, 160)).filter(Boolean).slice(0, 3) : [];
  return { kind: 'query', titulo, sql, explicacao, sugestoes };
}

export async function askJotaGemini(question: string, context: JotaContext[] = []): Promise<JotaAnswer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('O Jota H precisa da chave do Gemini (GEMINI_API_KEY) no servidor.');
  const body = JSON.stringify({ contents: [{ parts: [{ text: buildJotaRequest(question, context) }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } });
  // 12/11/2026: a cota gratuita do Gemini e por modelo e a chave e a mesma que le os cards do WhatsApp; quando o modelo
  // principal estoura (HTTP 429) ou esta fora (5xx), tenta os modelos reserva, que tem cota propria.
  let lastStatus = 0;
  for (const model of jotaModels()) {
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(25_000) });
    } catch { lastStatus = 0; continue; }
    if (response.ok) {
      const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const answer = parseJotaAnswer(payload.candidates?.[0]?.content?.parts?.[0]?.text || '');
      if (!answer) throw new Error('O Gemini respondeu num formato que não deu para ler. Tente perguntar de outro jeito.');
      return answer;
    }
    lastStatus = response.status;
    console.warn(`[Jota H] modelo ${model} respondeu HTTP ${response.status}`);
    if (response.status !== 429 && response.status !== 404 && response.status < 500) break; // erro da propria chamada: outro modelo nao resolve
  }
  if (lastStatus === 429) throw new Error('A cota de uso do Gemini acabou por agora (HTTP 429), inclusive nos modelos reserva. Ela volta sozinha (a diária zera de madrugada). Para não faltar, ative o faturamento da chave no Google AI Studio.');
  throw new Error(lastStatus ? `O Gemini não respondeu (HTTP ${lastStatus}). Tente de novo em instantes.` : 'Não consegui falar com o Gemini. Tente de novo em instantes.');
}

// Modelo principal + reservas (JOTA_H_FALLBACK_MODELS, separados por virgula), sem repetir.
export function jotaModels(env: NodeJS.ProcessEnv = process.env) {
  const primary = env.JOTA_H_MODEL || env.GEMINI_MODEL || 'gemini-2.5-flash';
  const fallbacks = (env.JOTA_H_FALLBACK_MODELS ?? 'gemini-2.5-flash-lite,gemini-2.0-flash,gemini-2.0-flash-lite').split(',').map((model) => model.trim()).filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}
