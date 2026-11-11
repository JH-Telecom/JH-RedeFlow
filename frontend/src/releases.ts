// Novidades do sistema (modal "O que há de novo" e Meu perfil > Novidades).
// Para anunciar algo novo: acrescente uma versao NO TOPO da lista, com id novo (data AAAA-MM-DD; se sair mais de uma
// no mesmo dia, AAAA-MM-DD-2). Cada login ve o modal uma vez por versao.
// permission: so aparece para quem tem a permissao (ex.: "settings.view"). Sem permission, aparece para todos.

export type ReleaseIcon = "sparkles" | "bell" | "list" | "chrome" | "database" | "whatsapp" | "chart" | "user" | "shield" | "wrench";
export type ReleaseItem = { icon: ReleaseIcon; title: string; text: string; tag?: "Novo" | "Melhoria" | "Correção"; permission?: string };
export type Release = { id: string; label: string; items: ReleaseItem[] };

export const RELEASES: Release[] = [
  {
    id: "2026-11-11",
    label: "11/11",
    items: [
      { icon: "sparkles", tag: "Novo", title: "Chaves dos POPs", text: "Nova tela em Operação: quem está com cada chave de POP e desde quando, com foto da pessoa tirada na retirada e o histórico de retiradas e devoluções. Já começa com a situação da planilha." },
      { icon: "sparkles", tag: "Novo", title: "Atalhos: Esc volta e Enter salva", text: "Esc volta para a tela anterior (do chamado para a fila) e fecha janelas. Enter salva: nos campos do chamado e nas observações (Shift+Enter quebra a linha). Se houver algo não salvo, o sistema pergunta antes de sair." },
      { icon: "user", tag: "Melhoria", title: "Técnico do OFS prevalece", text: "Se o técnico do chamado for diferente do Recurso do OFS, a coleta troca pelo do OFS. Balde do OFS (CLUSTER_) e chamado encerrado não são alterados." },
      { icon: "chart", tag: "Novo", title: "Visão dos supervisores", text: "Nova tela em Indicadores: entrantes do mês e da semana (GIGA+ incluído), média por dia, TME, entrantes por região, por horário e por dia, com filtros de período, região e tipo." },
      { icon: "user", tag: "Melhoria", title: "Supervisor vê todos os chamados", text: "Enquanto os técnicos não são divididos entre os supervisores, o supervisor vê todos os chamados, não só os da própria equipe." },
      { icon: "user", tag: "Novo", title: "Técnico de apoio", text: "No detalhe do chamado tem o campo Técnico de apoio (opcional). Quando preenchido, a fila mostra \"Apoio: Nome\" embaixo do técnico, no lugar do supervisor." },
      { icon: "database", tag: "Novo", title: "Backup diário do banco no Google Drive", text: "Todo dia às 03:00 o sistema guarda uma cópia de todas as tabelas no Google Drive, por 90 dias. Configure em Configurações > Backup do banco.", permission: "settings.manage" },
      { icon: "whatsapp", tag: "Correção", title: "Menção (@) com o identificador", text: "Na extensão 1.9.4, mensagem que marca alguém com @ continua marcando depois que o *Cargo - Nome:* entra na frente, e um Enter só já envia. Atualize a extensão em Configurações e recarregue o WhatsApp Web." },
      { icon: "bell", tag: "Melhoria", title: "Sem acionamento repetido", text: "Card com a mesma OS de um chamado que já existe não vira acionamento de novo (o mesmo BDESK pode ser outro chamado e entra normalmente). E dois aceites ao mesmo tempo não criam mais dois chamados.", permission: "activations.view" },
      { icon: "wrench", tag: "Correção", title: "Ordem dos cards de backbone com \"OfficeTrack/OS\"", text: "Cards de backbone que trazem a ordem como \"OfficeTrack/OS:\" agora têm a ordem reconhecida, em vez de usar o número do ticket." },
    ],
  },
  {
    id: "2026-11-10",
    label: "10/11",
    items: [
      { icon: "bell", tag: "Novo", title: "Aviso de acionamento no canto da tela", text: "Acionamento novo aparece no canto inferior direito com os botões Aceitar e Recusar, sem precisar sair da tela em que você está.", permission: "activations.view" },
      { icon: "list", tag: "Melhoria", title: "Selos embaixo da ordem", text: "Risco de estourar o prazo, atrelada e reincidente agora ficam numa linha própria, logo abaixo do número da ordem na fila." },
      { icon: "wrench", tag: "Correção", title: "Regra do atrelado", text: "Um chamado só vira atrelado quando o outro ainda está aberto (ou pendente no OFS), usando a data do evento e o horário de São Paulo." },
      { icon: "user", tag: "Novo", title: "Técnico preenchido pelo OFS", text: "Chamado sem técnico que o OFS concluiu recebe o técnico do OFS (mesmo com o nome escrito um pouco diferente) e já é encerrado." },
      { icon: "list", tag: "Melhoria", title: "GIGA+ fica aberto até o OFS concluir", text: "Chamados GIGA+ continuam abertos, aceitando observações para os gestores, e só fecham quando o OFS concluir. Continuam fora dos indicadores." },
      { icon: "sparkles", tag: "Novo", title: "SN da ONU no chamado", text: "O número de série aparece no detalhe do chamado: vem do card (FIELD) ou a extensão procura o contrato no AutoISP. Deixe o AutoISP aberto e logado no computador da coleta." },
      { icon: "whatsapp", tag: "Novo", title: "Galeria de temas do WhatsApp", text: "Na extensão, em Temas > Da equipe: publique os seus temas e baixe os que os colegas criaram." },
      { icon: "whatsapp", tag: "Melhoria", title: "Cargo e nome nas mensagens", text: "O identificador do WhatsApp sai como *Cargo - Nome:* e o nome continua fixo mesmo se o login da extensão cair." },
      { icon: "chrome", tag: "Melhoria", title: "Coleta do OFS mais resistente", text: "Se o servidor estiver reiniciando, a extensão tenta enviar a coleta de novo sozinha, em vez de mostrar erro 502." },
      { icon: "database", tag: "Novo", title: "Uso do banco em Configurações", text: "Painel com o tráfego do banco no dia. Perto do limite, o sistema entra em modo econômico sozinho para não cair.", permission: "settings.manage" },
      { icon: "chart", tag: "Melhoria", title: "Sistema mais leve", text: "A fila e as buscas consultam bem menos o banco, então as telas respondem mais rápido." },
    ],
  },
  {
    id: "2026-11-09",
    label: "09/11",
    items: [
      { icon: "list", tag: "Novo", title: "Aba GIGA+ na fila", text: "Chamados atendidos pelo outro escritório têm o status GIGA+ e uma aba própria, separada de Todos." },
      { icon: "list", tag: "Novo", title: "Copiar ordem e BDESK com um clique", text: "Clique no número do chamado ou no BDESK na fila para copiar." },
      { icon: "list", tag: "Novo", title: "Observação direto da fila", text: "A fila mostra a última observação de cada chamado (autor e texto) e dá para escrever uma nova ali mesmo." },
      { icon: "chart", tag: "Melhoria", title: "Imagens para compartilhar", text: "Fontes maiores; listas com mais de 20 linhas viram partes numeradas, cada uma com seu botão de copiar. A lista de técnicos também vira imagem." },
      { icon: "wrench", tag: "Novo", title: "Corrigir data de fim sem reabrir", text: "Dá para ajustar a data de fim de um chamado fechado sem reabri-lo, e a sincronização com o OFS mantém a correção." },
      { icon: "bell", tag: "Novo", title: "Aviso de Casa Cliente no WhatsApp", text: "OLTs da lista avisam o grupo quando entra um acionamento de Casa Cliente, com link para acompanhar o chamado." },
      { icon: "chrome", tag: "Novo", title: "Extensão nova", text: "Popup com abas, ferramentas do WhatsApp e download/atualização da extensão direto em Configurações." },
      { icon: "list", tag: "Melhoria", title: "Listas de 100 em 100", text: "Toda lista e tabela mostra no máximo 100 linhas por página, para nada travar." },
      { icon: "shield", tag: "Novo", title: "Privacidade e termos", text: "Política de Privacidade, Termos de Uso e o botão Baixar meus dados em Meu perfil." },
    ],
  },
  {
    id: "2026-11-06",
    label: "06/11",
    items: [
      { icon: "user", tag: "Novo", title: "Meu perfil e Pessoas", text: "Foto, banner (aceita GIF), apelido, status e 7 temas de cor claros e escuros. A aba Pessoas mostra a equipe e quem está online." },
      { icon: "chart", tag: "Novo", title: "Relatórios", text: "Finalizados com atraso, produtividade por técnico e supervisor, motivos de fechamento, comparação de períodos, gargalos e relatório mensal em PDF." },
      { icon: "bell", tag: "Novo", title: "Alertas e menções", text: "Aviso antes do prazo, escalonamento automático, coleta do OFS parada e @menções que chegam no sininho." },
      { icon: "list", tag: "Novo", title: "Atalhos da fila", text: "/ para buscar, setas ou j/k para andar e Enter para abrir o chamado." },
      { icon: "wrench", tag: "Novo", title: "Checklist ao finalizar", text: "Cada tipo de chamado pede o seu checklist antes de finalizar. Técnicos têm a tela Meus chamados no celular." },
    ],
  },
];

export const LATEST_RELEASE_ID = RELEASES[0]?.id ?? "";
