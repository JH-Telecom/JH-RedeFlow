# JH RedeFlow – Coletor OFS

Extensão do Chrome da Rede, separada da extensão do JH Agendamentos. Ela exporta as atividades do OFS
(`alloha.fs.ocs.oraclecloud.com`) usando o login já aberto no Chrome e envia o CSV ao JH RedeFlow
(`POST /api/integrations/ofs/export`), que atualiza:

- o **Painel diário** do dia exportado;
- o **Status OFS**, endereço, bairro, cidade, região, OLT e Data Fim dos chamados que cruzam pela Ordem de Serviço
  (hoje também substitui a base D-0; dias anteriores só atualizam os chamados).

## O que ela faz

- **Hoje:** exporta a cada 1 hora (configurável: 15 min, 30 min, 1 h, 2 h ou desligado).
- **Dia anterior:** exporta todo dia no horário escolhido (padrão 07:00) e devolve a tela do OFS para hoje.
- **Qualquer dia dos últimos 31:** botão no popup.
- **Envio manual:** se o automático falhar, exporte no OFS e selecione o CSV no popup.
- Só captura o download que ela mesma pediu (janela de 90 s); exportações feitas à mão no OFS baixam normalmente.
- Avisa por notificação depois de 3 falhas seguidas e mostra o histórico dos últimos envios.
- **Fechamentos (v1.2):** a cada 10 minutos (pode ser 30 min ou desligado), pergunta ao RedeFlow quais chamados já
  terminaram e ainda estão sem o fechamento do OFS (`GET /api/integrations/ofs/fechamentos/pendentes`). Entram os
  Finalizados, os Baixar e os concluídos no OFS, dos últimos 10 dias. Para cada um:
  - numa **aba própria do OFS** (fixada e em segundo plano), pesquisa a ordem e abre a atividade **concluída**;
  - se a ordem tiver mais de uma atividade (por exemplo, uma suspensa e uma concluída), usa a concluída mais recente;
  - lê o **Motivo de Fechamento** (propriedade 725), o **Submotivo** (916) e o **Tipo do Cabo** (1062) e envia
    (`POST /api/integrations/ofs/fechamentos`).

  Só lê: nada é alterado no OFS. São até 12 atividades por ciclo, e a mesma ordem só é tentada de novo depois de 1 h.
  A exportação nunca usa essa aba fixada.

## Instalação

1. Publicar o pacote (`extensao-rede`, compactado com `manifest.json` na raiz) na Chrome Web Store, ou, para teste,
   `chrome://extensions` → Modo do desenvolvedor → **Carregar sem compactação** → pasta `extensao-rede`.
2. No popup, em **Conta do JH RedeFlow**: entrar com o **e-mail e a senha do sistema** → **Testar conexão**.
   O perfil precisa da permissão de Importações. A sessão vale 30 dias e só serve para enviar o export do OFS;
   a senha não fica guardada. Quando vencer (ou o usuário for desativado), a extensão mostra "!" e pede login de novo.
   O token de máquina (`OFS_INGEST_TOKEN`) continua aceito em **Avançado**, como alternativa.
3. Deixar uma aba do OFS aberta e logada (Console de Alocação) nesta máquina.
4. Em **Avançado**, informar o `data-id` da alocação da Rede na árvore do OFS para não depender da alocação selecionada.

## Convivência com a extensão do JH Agendamentos

As duas podem ficar instaladas. Se o Coletor da extensão do Agendamentos estiver ligado, ele também lê os exports que
esta extensão dispara (e rejeita os de dias anteriores, por não serem de hoje); isso não afeta o envio ao RedeFlow.

## Limitações

- Depende da tela do OFS (seletor de data, árvore de alocação, Ações → Exportar). Se a Oracle mudar o layout, a
  automação para e a extensão avisa.
- Precisa de um Chrome aberto e logado no OFS.
