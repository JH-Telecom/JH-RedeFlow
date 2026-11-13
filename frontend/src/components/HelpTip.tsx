import { HelpCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// O que cada tela mostra e as regras dela. A chave e o caminho do menu (ou "detalhe" para o chamado).
export const PAGE_HELP: Record<string, string[]> = {
  "/": ["Fila em tempo real e indicadores do período escolhido.", "\"Agora\" ignora o período: mostra o que está ativo neste momento.", "Prazo JH: até 6h da abertura no prazo, de 6h a 9h fora do prazo, acima de 9h outlier."],
  "/chamados/abertos": ["Chamados ainda sem técnico, do que espera há mais tempo para o mais novo.", "Todo dia às 06:00 as ordens com o técnico de ontem voltam para cá. As alocadas a partir das 19h (turno da noite) continuam com o técnico.", "Clique no título de uma coluna para mudar a ordem.", "A barra \"Na fila\" enche até 6h; vermelha passou do prazo.", "Exportar Excel leva todos os chamados com os filtros atuais."],
  "/chamados/atendimento": ["Chamados com técnico (Atribuído, Deslocamento ou Em campo).", "As abas mostram quantos chamados há em cada status com os filtros atuais.", "\"Última observação\" mostra há quanto tempo ninguém registra andamento."],
  "/chamados/finalizados": ["Chamados finalizados, cancelados ou a baixar, filtrados pela data de encerramento.", "\"Tempo total\" vai da abertura até a Data Fim e define se ficou no prazo (até 6h)."],
  "/repetidos": ["Endereços, OLTs e PONs com chamados repetidos, para achar a causa que volta."],
  "/igp/pontuacao": ["O nosso controle do IGP ACESSO, com as regras da aba IGP ACESSO da Giga (pesos, metas, mínimos, condições dos grupos e faixa de bonificação).", "Importe o \"JH (NN).xlsx\" que a Giga manda (acumulado no mês). As ordens de rede passam a usar o cluster e o fechamento oficiais da Giga no IGP.", "Conciliação: ordens só na Giga (não chegaram no sistema), só no sistema (para contestar) e com fechamento diferente."],
  "/sem-regiao": ["Chamados com a região \"Não informada\" (normalmente a OLT ainda não tem região cadastrada). Escolha a região e clique em Salvar; vale também para chamado encerrado.", "\"Aplicar também aos outros da OLT\" corrige de uma vez todos os chamados sem região daquela OLT. Para quem gerencia as configurações, a OLT também fica cadastrada nessa região, e os próximos chamados dela já chegam com a região."],
  "/roteirizador": ["Das 00h às 06h a extensão do computador da coleta move no OFS os chamados sem técnico para o técnico de plantão da região.", "Preencha a escala (região x madrugada) e salve. Comece com o Modo teste ligado: o robô faz tudo no OFS e clica Ignorar, sem mover.", "\"O que o robô fez\" mostra cada ordem: Movida, Teste, Pulada (já estava com alguém ou não estava pendente) ou Erro."],
  "/rede/importar": ["Importe os arquivos .kml ou .kmz da rede. Cada arquivo mostra quantas CTOs, CEOs, POPs, outros elementos e cabos foram lidos; arquivo vazio ou inválido aparece como \"não lido\" e não impede os outros.", "Importar de novo o mesmo arquivo atualiza os dados dele sem duplicar. Se a mesma CTO estiver em dois arquivos, vale o importado por último.", "Na tabela POP → OLT, diga qual OLT atende cada POP. Para desativar um POP é preciso escrever o motivo na observação."],
  "/chaves": ["Quem está com cada chave de POP e desde quando. Laranja: retirada; verde: na base; cinza: a conferir.", "Registrar retirada: escolha a pessoa (técnico, supervisor ou outro nome), a hora e, se quiser, tire uma foto da pessoa com a chave.", "O ícone de relógio mostra o histórico de retiradas e devoluções de cada chave, com as fotos.", "Chave há 7 dias ou mais fora aparece em vermelho."],
  "/visao-supervisores": ["Entrantes são os chamados que chegaram (pela abertura), inclusive GIGA+; só o Cancelado fica de fora.", "Mês e semana contam até hoje; a média divide pelos dias corridos.", "TME: tempo médio da abertura até a Data Fim dos finalizados no período (GIGA+ entra quando o OFS concluir).", "Os filtros de região e tipo valem para todos os números da tela."],
  "/supervisor/ordens": ["Ordens da sua equipe: atribua, acompanhe e finalize os chamados dos seus técnicos."],
  "/acionamentos": ["Cards recebidos do grupo de acionamento no WhatsApp.", "Aceitar cria o chamado com a abertura no horário em que o card foi enviado; a Data/Hora do Evento fica guardada.", "Recusar exige um motivo."],
  "/painel-diario": ["Produção do dia a partir da base importada: ordens, técnicos e atividades."],
  "/igp": ["Indicadores do mês pela Data Fim dos chamados finalizados.", "Clusters: C.8 São Paulo, C.12 Guarulhos e C.11 Alto Tietê.", "Meta de 89% no prazo; mínimo de 85%."],
  "/relatorios": ["Escolha o relatório, o período e a área.", "Finalizados fora do prazo: Data Fim no período e mais de 6h entre abertura e fim; acima de 9h é outlier.", "Exportar Excel leva o relatório inteiro."],
  "/analise-prazo": ["Quem, onde e quando se perde prazo (mais de 6h entre abertura e Data Fim).", "Média de entrantes conta todos os chamados abertos no período.", "O estudo noturno compara aberturas entre 18h e 06h com o dia."],
  "/modo-tv": ["Painel para a TV da operação: troca de visão a cada 20 s e atualiza a cada minuto.", "Setas trocam a visão, espaço pausa, Esc sai."],
  "/tecnicos": ["Cadastro dos técnicos, vínculo e supervisor. Técnicos inativos não recebem chamados."],
  "/supervisores": ["Supervisores e as equipes de técnicos de cada um."],
  "/importacoes": ["Importa planilhas: chamados em aberto/em atendimento e histórico de finalizados.", "Nada é gravado antes da prévia e da confirmação; repetidos são ignorados pelos identificadores."],
  "/usuarios": ["Quem acessa o sistema. Online = sistema aberto e logado nos últimos 2 minutos."],
  "/cargos": ["Cargos e as permissões de cada um."],
  "/configuracoes": ["Preferências gerais; OLTs e regiões para administradores. Foto, banner, apelido e tema ficam em Meu perfil."],
  "/historico-alteracoes": ["Quem mudou o quê em cada chamado e quando, com o valor de antes e de depois. Filtre por período, pessoa, campo ou ordem e exporte em Excel."],
  "/mapa": ["Chamados ativos por região e bairro, com a cor do prazo (no prazo, vence em < 2h, fora, outlier). Clique num bairro para ver os chamados. Atualiza a cada minuto."],
  "/carga": ["Chamados ativos de cada técnico, o mais antigo e os finalizados de hoje. Livres primeiro, para ajudar a atribuir. Atualiza a cada minuto."],
  "/integracao-ofs": ["Semáforo da coleta do OFS (export, fechamentos, clusters, falhas) e a fila dos chamados concluídos no OFS que não finalizaram aqui, com o motivo. Atualiza a cada minuto."],
  "/pessoas": ["Todos veem quem faz parte do O&M e quem está online (atualiza a cada 30 s). Clique para ver foto, banner, cargo e e-mail. Aqui não dá para criar nem alterar ninguém."],
  "/perfil": ["Foto, banner, apelido e tema de cor. O apelido aparece só para você; o tema vale para o seu login em qualquer computador."],
  detalhe: ["Dados do chamado, distribuição para técnico, encerramento e histórico de observações e auditoria.", "Atalhos: Esc volta para a fila (num campo, o 1º Esc só sai do campo; se houver algo não salvo, o sistema pergunta). Enter num campo salva as alterações. Na observação, Enter salva e Shift+Enter quebra a linha."],
};

export function HelpTip({ lines, title }: { lines: string[]; title: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <span className="help-tip" ref={ref}>
      <button type="button" className="help-tip-button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={`Sobre a tela ${title}`} title="O que é esta tela?">
        <HelpCircle size={15} />
      </button>
      {open && (
        <span className="help-tip-popover" role="dialog" aria-label={`Sobre ${title}`}>
          <strong>{title}</strong>
          <ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul>
        </span>
      )}
    </span>
  );
}
