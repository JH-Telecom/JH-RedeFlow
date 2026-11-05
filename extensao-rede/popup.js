const $ = (id) => document.getElementById(id);
const PADRAO = { token: "", intervaloMin: 60, horaDiaAnterior: "07:00", alocacaoId: "", ativo: true, fechamentoMin: 10 };
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
  $("fechamentoStatus").textContent = texto + (prox?.fechamentos ? ` Próxima leitura às ${new Date(prox.fechamentos).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` : "");
}

function mostrarConta(sessao) {
  $("formLogin").hidden = Boolean(sessao);
  $("logado").hidden = !sessao;
  if (!sessao) return;
  $("usuarioNome").textContent = sessao.nome;
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
  if (area === "local" && (mudancas.ultimoEnvio || mudancas.captura || mudancas.ultimoFechamento)) mostrarStatus();
  if (area === "local" && mudancas.sessao) carregarConta();
});
carregar();
