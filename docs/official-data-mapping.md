# Mapeamento da base oficial

Arquivo oficial confirmado: `Rede Externa Forms V2.xlsx`.

## Abas operacionais

| Aba | Linhas observadas | Uso identificado |
| --- | ---: | --- |
| ACIONAMENTOS FINALIZADOS | 3571 | Historico operacional, tempos, SLA e indicadores |
| ACIONAMENTOS EM CAMPO | 96 | Fila operacional atual de acionamentos |
| BASE OFS | 500 | Atividades externas, endereco, contrato e datas |
| BASE END | 9171 | Base externa de atividades e fechamento |
| BASE | 12770 | Ordem, tecnico, evento, equipamento, placa/PON e observacao |
| ACIONAMENTOS | 4887 | Mensagens estruturadas recebidas pelo fluxo WuzAPI |
| VALIDACAO_ACIONAMENTOS | 4885 | Aceite/recusa e payload extraido |
| Baixas Bot | 185 | Baixas tecnicas, materiais e fotos |
| Materiais Bot | 998 | Materiais usados por ordem |
| Pendentes Operacionais | 29 | Mensagens operacionais ainda pendentes |
| LOG SISTEMA | 1893 | Log legado da automacao Apps Script |
| CONFIG_MATERIAIS | 44 | Catalogo e limites de materiais |

## Campos prioritarios para `calls`

| Coluna oficial | Campo inicial no banco | Tipo | Editavel | Uso |
| --- | --- | --- | --- | --- |
| ORDEM / OFFICETRACK / Ordem de Servico | order_number / office_track | texto | sim | Identificacao |
| BDESK / Ticket | bdesk | texto | sim | Identificacao e busca |
| TECNICO | technician_id | relacao | sim | Atribuicao |
| DATA/HORA EVENTO | event_at | timestamp | sim | Operacao |
| DATA/HORA ACIONAMENTO | opened_at | timestamp | nao | SLA |
| TIPO DE EVENTO / Tipo de Atividade | type | texto | sim | Classificacao |
| TIPO DE FALHA / Motivo | reason | texto | sim | Finalizacao e filtros |
| AFETACAO / AFETACAO DIRETA | affected_count | numero/texto | sim | Indicadores |
| EQUIPAMENTO / OLT | olt | texto | sim | Rede |
| PLACA + PON / SLOT/PON | slot_pon | texto | sim | Rede |
| ENDERECO / Endereco | address | texto | sim | Atendimento |
| BAIRRO / CIDADE | neighborhood / city | texto | sim | Regiao |
| STATUS | status | enum | sim | Fluxo |
| DATA FIM / Data finalizacao + Fim | executed_at | timestamp | sim | Finalizacao e SLA |
| OBSERVACAO / OBSERVACOES | notes | texto | sim | Operacao e auditoria |
| INDICADOR GIGA / INDICADOR JH | indicators | configuravel | nao | Dashboards |
| TME GIGA / TME JH / TMP EX | service_times | derivado | nao | Dashboards |

## Observacoes de modelagem

- A planilha possui abas com cabecalhos em linhas diferentes e algumas colunas duplicadas ou auxiliares.
- `ACIONAMENTOS EM CAMPO` tem uma area inicial de metadados antes do cabecalho operacional; o importador deve permitir selecionar a linha de cabecalho.
- `BASE OFS` e `BASE END` compartilham campos, mas nao devem ser mescladas sem uma chave de origem.
- O campo de finalizacao deve combinar data e hora em um timestamp no banco, mantendo o mapeamento para as colunas externas.
- O modelo definitivo de `calls` deve ser aprovado antes de importar linhas para a tabela operacional.
- Dados da IA devem permanecer separados entre mensagem original, extraido e confirmado humanamente.
