// Dados da empresa exibidos na Politica de Privacidade e nos Termos de Uso (LGPD art. 9 e 41: identificar o
// controlador e o canal do encarregado). Campos vazios nao aparecem; preencher com os dados oficiais da JH Telecom.
export const COMPANY = {
  name: "JH Telecom",
  // Sistema de pessoa fisica: responsavel identificado por nome e contato (CPF nao e exigido e nao deve ser publicado).
  legalName: "Matheus Terra Farias",
  cnpj: "",
  address: "",
  privacyContactEmail: "planilhasjh@gmail.com",
  dpoName: "Matheus Terra Farias",
  // Data da ultima revisao dos textos legais (AAAA-MM-DD).
  legalRevision: "2026-11-09",
};

export const LEGAL_REVISION_LABEL = COMPANY.legalRevision.split("-").reverse().join("/");
