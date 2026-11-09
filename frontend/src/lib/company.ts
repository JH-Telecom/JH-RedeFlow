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
  // Direitos autorais do software (o sistema e de pessoa fisica). A marca e a logo JH Telecom sao de seus titulares.
  copyrightHolder: "Matheus Terra Farias",
  copyrightStartYear: 2026,
  // Data da ultima revisao dos textos legais (AAAA-MM-DD).
  legalRevision: "2026-11-09",
};

export const LEGAL_REVISION_LABEL = COMPANY.legalRevision.split("-").reverse().join("/");

export function copyrightYears(now = new Date()) {
  const current = now.getFullYear();
  return current > COMPANY.copyrightStartYear ? `${COMPANY.copyrightStartYear}–${current}` : String(COMPANY.copyrightStartYear);
}
