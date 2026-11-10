const $ = (id) => document.getElementById(id);
const PADRAO = { token: "", intervaloMin: 60, horaDiaAnterior: "07:00", alocacaoId: "", ativo: true, fechamentoMin: 10, clusterMin: 60 };
const fmtSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const hojeSP = () => fmtSP.format(new Date());
const somarDias = (iso, dias) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const diaBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const quando = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const enviar = (msg) => chrome.runtime.sendMessage(msg);

function descrever(r) {
  if (!r) return "";
  if (!r.ok) return `✗ ${diaBR(r.data)} — ${r.erro || "erro"}`;
  const partes = [`✓ ${diaBR(r.data)}`];
  if (r.atividades != null) partes.push(`${r.atividades} atividades de rede`);
  if (r.cruzados != null) partes.push(`${r.cruzados} chamados cruzados`);
  if (r.aviso) partes.push(`(chamados: ${r.aviso})`);
  return partes.join(" · ");
}

async function mostrarStatus() {
  const { ultimoEnvio, historico = [], captura } = await chrome.storage.local.get(["ultimoEnvio", "historico", "captura"]);
  const status = $("status");
  if (captura && Date.now() < captura.ate) { status.textContent = `⏳ Exportando ${diaBR(captura.data)} no OFS…`; status.className = "status"; }
  else if (ultimoEnvio) { status.textContent = `${quando(ultimoEnvio.quando)} · ${descrever(ultimoEnvio)}`; status.className = `status ${ultimoEnvio.ok ? "ok" : "erro"}`; }
  else { status.textContent = "Nenhum envio ainda."; status.className = "status"; }
  $("historico").innerHTML = "";
  for (const item of historico) {
    const li = document.createElement("li");
    li.className = item.ok ? "ok" : "erro";
    li.textContent = `${quando(item.quando)}${item.automatico ? " · auto" : ""} · ${descrever(item)}`;
    $("historico").appendChild(li);
  }
  const prox = await enviar({ tipo: "proximas" });
  const partes = [];
  if (prox?.hoje) partes.push(`hoje às ${new Date(prox.hoje).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
  if (prox?.ontem) partes.push(`dia anterior em ${quando(prox.ontem)}`);
  $("proximas").textContent = partes.length ? `Próximas exportações: ${partes.join(" · ")}` : "Nenhuma exportação automática agendada.";
  const { ultimoFechamento: f } = await chrome.storage.local.get("ultimoFechamento");
  const texto = !f ? "Fechamentos: nenhuma leitura ainda."
    : !f.ok ? `Fechamentos (${quando(f.quando)}): ✗ ${f.erro}`
    : f.lidos ? `Fechamentos (${quando(f.quando)}): ${f.lidos} lidos · ${f.atualizados} chamados atualizados${f.semConcluida ? ` · ${f.semConcluida} sem atividade concluída` : ""}${f.erros ? ` · ${f.erros} com erro` : ""}.`
    : `Fechamentos (${quando(f.quando)}): nada novo para ler${f.pendentes ? ` (${f.pendentes} aguardando nova tentativa)` : ""}.`;
  // Ordens que nao trouxeram fechamento na ultima leitura: vermelho = erro, amarelo = ainda sem atividade concluida.
  const falhas = Array.isArray(f?.falhas) ? f.falhas : [];
  $("fechamentoFalhas").hidden = !falhas.length;
  $("fechamentoFalhas").innerHTML = "";
  for (const falha of falhas) {
    const li = document.createElement("li");
    li.className = falha.tipo === "aviso" ? "aviso" : "erro";
    const ordem = document.createElement("strong");
    ordem.textContent = falha.ordem;
    li.append(ordem, ` — ${falha.motivo}`);
    li.title = "Clique para copiar a ordem";
    li.onclick = () => navigator.clipboard?.writeText(falha.ordem);
    $("fechamentoFalhas").appendChild(li);
  }
  const { ultimoCluster: c } = await chrome.storage.local.get("ultimoCluster");
  const resumoCluster = !c ? "Clusters: nenhuma leitura ainda."
    : c.erro ? `Clusters (${quando(c.quando)}): ✗ ${c.erro}`
    : `Clusters (${quando(c.quando)}): ` + (c.resultados || []).map((r) => `${String(r.balde).replace("CLUSTER_", "")} ${r.ok ? `${r.linhas} ordens` : `✗ ${r.erro}`}`).join(" · ");
  $("clusterStatus").textContent = resumoCluster + (prox?.clusters ? ` Próxima às ${new Date(prox.clusters).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` : "");
  const fins = Array.isArray(f?.finalizados) ? f.finalizados : [];
  const textoFins = fins.length ? ` ${fins.length} finalizado(s) automaticamente: ${fins.join(", ")}.` : "";
  $("fechamentoStatus").textContent = texto + textoFins + (prox?.fechamentos ? ` Próxima leitura às ${new Date(prox.fechamentos).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` : "");
}

function mostrarConta(sessao) {
  aplicarBloqueio(sessao);
  $("formLogin").hidden = Boolean(sessao);
  $("logado").hidden = !sessao;
  if (!sessao) return;
  $("usuarioNome").textContent = sessao.nome;
  $("usuarioCargo").textContent = sessao.cargo || "Entre de novo para ver o cargo";
  $("usuarioEmail").textContent = sessao.email;
  $("sessaoAte").textContent = sessao.expiraEm ? new Date(sessao.expiraEm).toLocaleDateString("pt-BR") : "—";
}

async function carregarConta() {
  mostrarConta(await enviar({ tipo: "sessao" }));
}

async function carregar() {
  $("versao").textContent = `v${chrome.runtime.getManifest().version}`;
  const cfg = { ...PADRAO, ...(await chrome.storage.sync.get(Object.keys(PADRAO))) };
  $("token").value = cfg.token;
  $("intervaloMin").value = String(cfg.intervaloMin);
  $("fechamentoMin").value = String(cfg.fechamentoMin);
  $("clusterMin").value = String(cfg.clusterMin);
  $("horaDiaAnterior").value = cfg.horaDiaAnterior;
  $("alocacaoId").value = cfg.alocacaoId;
  $("ativo").checked = cfg.ativo !== false;
  const ontem = somarDias(hojeSP(), -1);
  for (const id of ["dataEscolhida", "arquivoData"]) {
    $(id).max = hojeSP();
    $(id).min = somarDias(hojeSP(), -31);
  }
  $("dataEscolhida").value = ontem;
  carregarConta();
  $("arquivoData").value = hojeSP();
  mostrarStatus();
}

async function exportar(data, botao) {
  botao.disabled = true;
  $("acaoStatus").className = "hint";
  $("acaoStatus").textContent = `Exportando ${diaBR(data)} no OFS…`;
  const r = await enviar({ tipo: "exportar", data });
  botao.disabled = false;
  $("acaoStatus").textContent = r?.pendente ? "Exportação iniciada — o resultado aparece em Último envio." : r?.ok === false ? `✗ ${r.erro}` : "";
  $("acaoStatus").className = `hint ${r?.ok === false ? "erro" : ""}`;
  mostrarStatus();
}

$("exportarHoje").onclick = (e) => exportar(hojeSP(), e.currentTarget);
$("exportarOntem").onclick = (e) => exportar(somarDias(hojeSP(), -1), e.currentTarget);
$("exportarData").onclick = (e) => { if ($("dataEscolhida").value) exportar($("dataEscolhida").value, e.currentTarget); };

$("salvar").onclick = async () => {
  await chrome.storage.sync.set({
    token: $("token").value.trim(),
    intervaloMin: +$("intervaloMin").value || 0,
    fechamentoMin: +$("fechamentoMin").value || 0,
    clusterMin: +$("clusterMin").value || 0,
    horaDiaAnterior: $("horaDiaAnterior").value,
    alocacaoId: $("alocacaoId").value.trim(),
    ativo: $("ativo").checked,
  });
  $("configStatus").textContent = "Salvo.";
  $("configStatus").className = "hint ok";
  setTimeout(mostrarStatus, 300);
};

$("formLogin").onsubmit = async (e) => {
  e.preventDefault();
  $("entrar").disabled = true;
  $("contaStatus").className = "hint";
  $("contaStatus").textContent = "Entrando…";
  const r = await enviar({ tipo: "entrar", email: $("email").value, senha: $("senha").value });
  $("entrar").disabled = false;
  $("senha").value = "";
  $("contaStatus").textContent = r?.ok ? "" : `✗ ${r?.erro || "não foi possível entrar"}`;
  $("contaStatus").className = `hint ${r?.ok ? "ok" : "erro"}`;
  if (r?.ok) mostrarConta(r);
  mostrarStatus();
};

$("sair").onclick = async () => {
  await enviar({ tipo: "sair" });
  $("contaStatus").textContent = "Você saiu. A coleta automática fica parada até entrar de novo.";
  $("contaStatus").className = "hint";
  mostrarConta(null);
};

$("testarConexao").onclick = async () => {
  $("contaStatus").className = "hint";
  $("contaStatus").textContent = "Testando…";
  const r = await enviar({ tipo: "testarConexao" });
  $("contaStatus").textContent = r?.ok ? "✓ Conexão com o RedeFlow OK." : `✗ ${r?.erro || "falhou"}`;
  $("contaStatus").className = `hint ${r?.ok ? "ok" : "erro"}`;
  if (!r?.ok) carregarConta();
};

$("lerFechamentos").onclick = async (e) => {
  const botao = e.currentTarget;
  botao.disabled = true;
  $("fechamentoStatus").textContent = "Lendo fechamentos no OFS…";
  await enviar({ tipo: "fechamentos" });
  botao.disabled = false;
  mostrarStatus();
};

$("lerClusters").onclick = async (e) => {
  const botao = e.currentTarget;
  botao.disabled = true;
  $("clusterStatus").textContent = "Exportando os baldes de cluster no OFS…";
  await enviar({ tipo: "clusters" });
  botao.disabled = false;
  mostrarStatus();
};

$("arquivo").onchange = async (e) => {
  const arquivo = e.target.files[0];
  e.target.value = "";
  if (!arquivo) return;
  $("acaoStatus").textContent = `Enviando ${arquivo.name}…`;
  const r = await enviar({ tipo: "enviarArquivo", csv: await arquivo.text(), nome: arquivo.name, data: $("arquivoData").value || hojeSP() });
  $("acaoStatus").textContent = r?.ok ? `✓ ${arquivo.name} enviado.` : `✗ ${r?.erro || "falhou"}`;
  $("acaoStatus").className = `hint ${r?.ok ? "ok" : "erro"}`;
  mostrarStatus();
};

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && (mudancas.ultimoEnvio || mudancas.captura || mudancas.ultimoFechamento || mudancas.ultimoCluster)) mostrarStatus();
  if (area === "local" && mudancas.sessao) carregarConta();
});
carregar();

// ---------- WhatsApp Web: identificador do mesario e conversa sem contato ----------
async function carregarWhatsapp() {
  const { waIdentificador, sessao, nomeFixo } = await chrome.storage.local.get(["waIdentificador", "sessao", "nomeFixo"]);
  const cfg = { ativo: true, nome: "", escopo: "todas", ...(waIdentificador || {}) };
  $("waAtivo").checked = cfg.ativo !== false;
  $("waNome").value = cfg.nome || "";
  const automatico = sessao?.nome ? sessao.nome.split(/\s+/)[0] : nomeFixo;
  $("waNome").placeholder = automatico ? `em branco = ${automatico}` : "em branco = nome do login";
  $("waEscopo").value = cfg.escopo === "grupos" ? "grupos" : "todas";
}
$("waSalvar").onclick = async () => {
  const cfg = { ativo: $("waAtivo").checked, nome: $("waNome").value.trim().slice(0, 40), escopo: $("waEscopo").value };
  await chrome.storage.local.set({ waIdentificador: cfg });
  const { sessao, nomeFixo } = await chrome.storage.local.get(["sessao", "nomeFixo"]);
  const nome = cfg.nome || (sessao?.nome || "").split(/\s+/)[0] || nomeFixo;
  $("waStatus").textContent = !cfg.ativo ? "Identificador desligado." : nome ? `✓ Suas mensagens vão sair como *${nome}:*. Recarregue o WhatsApp Web se ele já estava aberto.` : "Entre com seu usuário ou escreva um nome.";
  $("waStatus").className = `hint ${cfg.ativo && nome ? "ok" : ""}`;
};
$("waAbrir").onclick = async () => {
  let numero = $("waNumero").value.replace(/\D/g, "");
  if (numero.length === 10 || numero.length === 11) numero = `55${numero}`;
  if (numero.length < 12) { $("waNumeroStatus").textContent = "Digite o número com DDD."; $("waNumeroStatus").className = "hint erro"; return; }
  const url = `https://web.whatsapp.com/send?phone=${numero}`;
  const [aba] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (aba) { await chrome.tabs.update(aba.id, { url, active: true }); await chrome.windows.update(aba.windowId, { focused: true }); }
  else await chrome.tabs.create({ url });
  $("waNumeroStatus").textContent = "";
};
carregarWhatsapp();

// ---------- visual 1.6: abas, avatar e previa do nome no WhatsApp ----------
function mostrarAba(nome) {
  document.querySelectorAll(".abas [data-aba]").forEach((botao) => botao.setAttribute("aria-selected", String(botao.dataset.aba === nome)));
  document.querySelectorAll("[data-painel]").forEach((painel) => { painel.hidden = painel.dataset.painel !== nome; });
  chrome.storage.local.set({ popupAba: nome });
}
document.querySelectorAll(".abas [data-aba]").forEach((botao) => { botao.onclick = () => mostrarAba(botao.dataset.aba); });
chrome.storage.local.get("popupAba").then(({ popupAba }) => { if (popupAba && document.querySelector(`[data-painel="${popupAba}"]`)) mostrarAba(popupAba); });

// Iniciais no avatar da conta (acompanha o nome mostrado).
new MutationObserver(() => {
  const nome = $("usuarioNome").textContent.trim();
  $("avatar").textContent = nome ? nome.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0].toUpperCase()).join("") : "JH";
}).observe($("usuarioNome"), { childList: true, characterData: true, subtree: true });

// Previa "*Nome:*" enquanto digita o nome.
async function atualizarPrevia() {
  const { sessao } = await chrome.storage.local.get("sessao");
  const nome = $("waNome").value.trim() || (sessao?.nome || "").split(/\s+/)[0] || "Seu nome";
  $("waPrevia").textContent = `*${nome}:*`;
}
$("waNome").addEventListener("input", atualizarPrevia);
atualizarPrevia();

// Abre a janela de temas dentro do WhatsApp Web (abre o WhatsApp se ainda nao estiver aberto).
$("waTemas").onclick = async () => {
  const status = $("waTemasStatus");
  const [aba] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (!aba) { await chrome.tabs.create({ url: "https://web.whatsapp.com/" }); status.textContent = "Abri o WhatsApp Web. Quando carregar, clique de novo para escolher o tema."; status.className = "hint"; return; }
  await chrome.tabs.update(aba.id, { active: true });
  await chrome.windows.update(aba.windowId, { focused: true });
  try {
    const resposta = await chrome.tabs.sendMessage(aba.id, { tipo: "waAbrirTemas" });
    status.textContent = resposta?.ok ? `Janela de temas aberta no WhatsApp (tema atual: ${resposta.atual}).` : "O WhatsApp ainda está carregando. Tente de novo em instantes.";
    status.className = `hint ${resposta?.ok ? "ok" : ""}`;
  } catch (_) {
    status.textContent = "Recarregue a aba do WhatsApp Web (a extensão foi atualizada) e tente de novo.";
    status.className = "hint erro";
  }
};

// Ajustes da extensao (coleta automatica e identificador do WhatsApp) so mudam com login de Administrador.
// Sem login ou com outro cargo: tudo aparece, mas travado, com o aviso.
function aplicarBloqueio(sessao) {
  const admin = sessao?.cargo === "Administrador";
  const areas = [document.querySelector('[data-painel="ajustes"] .card'), $("cardWhatsapp")];
  for (const area of areas) {
    if (!area) continue;
    area.classList.toggle("travado", !admin);
    area.querySelectorAll("input, select, button").forEach((campo) => { campo.disabled = !admin; });
    const aviso = area.querySelector("[data-bloqueio]");
    if (aviso) aviso.hidden = admin;
  }
}
