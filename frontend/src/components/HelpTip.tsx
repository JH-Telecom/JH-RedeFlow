import { HelpCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// O que cada tela mostra e as regras dela. A chave e o caminho do menu (ou "detalhe" para o chamado).
export const PAGE_HELP: Record<string, string[]> = {
  "/": ["Fila em tempo real e indicadores do período escolhido.", "\"Agora\" ignora o período: mostra o que está ativo neste momento.", "Prazo JH: até 6h da abertura no prazo, de 6h a 9h fora do prazo, acima de 9h outlier."],
  "/chamados/abertos": ["Chamados ainda sem técnico, do que espera há mais tempo para o mais novo.", "Clique no título de uma coluna para mudar a ordem.", "A barra \"Na fila\" enche até 6h; vermelha passou do prazo.", "Exportar Excel leva todos os chamados com os filtros atuais."],
  "/chamados/atendimento": ["Chamados com técnico (Atribuído, Deslocamento ou Em campo).", "As abas mostram quantos chamados há em cada status com os filtros atuais.", "\"Última observação\" mostra há quanto tempo ninguém registra andamento."],
  "/chamados/finalizados": ["Chamados finalizados, cancelados ou a baixar, filtrados pela data de encerramento.", "\"Tempo total\" vai da abertura até a Data Fim e define se ficou no prazo (até 6h)."],
  "/repetidos": ["Endereços, OLTs e PONs com chamados repetidos, para achar a causa que volta."],
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
  detalhe: ["Dados do chamado, distribuição para técnico, encerramento e histórico de observações e auditoria."],
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
