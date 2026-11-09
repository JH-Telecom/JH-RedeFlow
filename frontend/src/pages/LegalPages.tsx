import { ArrowLeft } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import faviconUrl from "../../image/favicon.ico";
import { CopyrightNotice } from "../components/Copyright";
import { COMPANY, LEGAL_REVISION_LABEL } from "../lib/company";

// Politica de Privacidade e Termos de Uso. Abrem com ou sem login (/privacidade e /termos), para quem ainda vai
// entrar tambem poder ler. Texto pensado para um sistema interno; revisar com o juridico antes de considerar final.

function CompanyBlock() {
  const lines = [
    COMPANY.legalName ? `${COMPANY.legalName}${COMPANY.cnpj ? ` · CNPJ ${COMPANY.cnpj}` : ""}` : COMPANY.cnpj ? `${COMPANY.name} · CNPJ ${COMPANY.cnpj}` : COMPANY.name,
    COMPANY.address,
    COMPANY.dpoName ? `Encarregado pelo tratamento de dados (DPO): ${COMPANY.dpoName}` : "",
  ].filter(Boolean);
  return (
    <address className="legal-company">
      {lines.map((line) => <span key={line}>{line}</span>)}
      {COMPANY.privacyContactEmail
        ? <span>Contato sobre dados pessoais: <a href={`mailto:${COMPANY.privacyContactEmail}`}>{COMPANY.privacyContactEmail}</a></span>
        : <span>Contato sobre dados pessoais: fale com o administrador do sistema ou com o setor responsável pela proteção de dados da {COMPANY.name}.</span>}
    </address>
  );
}

export function LegalLayout({ title, intro, children, hideResponsible = false }: { title: string; intro: string; children: ReactNode; hideResponsible?: boolean }) {
  useEffect(() => { document.title = `${title} · ${COMPANY.name} - Rede`; }, [title]);
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link className="legal-brand" to="/"><img src={faviconUrl} alt="" /><span>{COMPANY.name} - Rede</span></Link>
        <Link className="secondary-button compact" to="/"><ArrowLeft size={15} aria-hidden="true" /> Voltar ao sistema</Link>
      </header>
      <main id="conteudo" className="legal-main" tabIndex={-1}>
        <article className="panel legal-article">
          <p className="section-kicker">DOCUMENTO · REVISADO EM {LEGAL_REVISION_LABEL}</p>
          <h1>{title}</h1>
          <p className="legal-intro">{intro}</p>
          {children}
          {!hideResponsible && <><h2>Quem é o responsável</h2><CompanyBlock /></>}
          <CopyrightNotice className="legal-links" />
        </article>
      </main>
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Política de Privacidade" intro={`Como o sistema Rede O&M da ${COMPANY.name} trata dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018, LGPD). O sistema é de uso interno: só entra quem tem conta criada pela empresa.`}>
      <h2>Que dados o sistema guarda</h2>
      <h3>De quem usa o sistema (colaboradores)</h3>
      <ul>
        <li>Nome, e-mail corporativo, cargo e permissões de acesso.</li>
        <li>Senha, guardada só de forma cifrada (hash). Ninguém, nem o administrador, consegue ver a senha.</li>
        <li>Opcionais, preenchidos pela própria pessoa: foto, banner, apelido, status e tema de cor.</li>
        <li>Registro de uso: se está online, último acesso e as alterações feitas em chamados (quem mudou, o quê e quando).</li>
        <li>Observações e fotos anexadas aos chamados.</li>
      </ul>
      <h3>De clientes atendidos nos chamados</h3>
      <ul>
        <li>Nome, número de contrato e endereço do local afetado (rua, número, bairro e cidade).</li>
        <li>Dados técnicos da rede ligados ao atendimento (OLT, porta, tipo de falha).</li>
        <li>Esses dados chegam pelos acionamentos do NOC (WhatsApp) e pela exportação do sistema de ordens (OFS). O sistema guarda só o necessário para atender o chamado.</li>
      </ul>
      <h3>De técnicos e supervisores</h3>
      <ul><li>Nome, supervisor, região de atuação e os chamados atendidos, usados para distribuir o trabalho e medir prazos.</li></ul>

      <h2>Para que os dados são usados</h2>
      <ul>
        <li>Abrir, distribuir, acompanhar e encerrar chamados de manutenção da rede.</li>
        <li>Calcular prazos, indicadores (IGP, SLA) e relatórios da operação.</li>
        <li>Avisar a equipe sobre prazos e escalonamentos (sino do sistema e grupos de trabalho no WhatsApp).</li>
        <li>Segurança e auditoria: controlar quem acessa o quê e registrar alterações.</li>
      </ul>
      <p>Os dados não são usados para publicidade, não são vendidos e não passam por decisões automatizadas que afetem direitos das pessoas. As sugestões de técnico e o risco de estouro de prazo são só apoio: quem decide é a equipe.</p>

      <h2>Bases legais (art. 7º da LGPD)</h2>
      <ul>
        <li><strong>Execução de contrato</strong>: contrato de trabalho dos colaboradores e contratos de serviço com os clientes atendidos.</li>
        <li><strong>Legítimo interesse</strong>: organizar a operação, medir desempenho, manter a segurança e o histórico de alterações.</li>
        <li><strong>Cumprimento de obrigação legal ou regulatória</strong> e <strong>exercício regular de direitos</strong>, quando for o caso.</li>
        <li>Foto, banner, apelido e status são opcionais. A própria pessoa pode removê-los quando quiser, em Meu perfil.</li>
      </ul>

      <h2>Com quem os dados são compartilhados</h2>
      <p>Só com fornecedores que operam o sistema em nome da empresa, sob contrato:</p>
      <ul>
        <li><strong>Supabase</strong>: banco de dados e arquivos.</li>
        <li><strong>Render</strong>: servidor da aplicação.</li>
        <li><strong>Vercel</strong>: hospedagem das telas.</li>
        <li><strong>WhatsApp (via WuzAPI)</strong>: recebimento dos acionamentos e envio de avisos para grupos internos.</li>
        <li><strong>Google Fonts</strong>: entrega as fontes das telas. Recebe só os dados técnicos da conexão (endereço IP e navegador), sem cookies.</li>
      </ul>
      <p>Esses serviços podem guardar dados em servidores fora do Brasil. A transferência segue o art. 33 da LGPD. Os dados não são compartilhados com terceiros para outras finalidades.</p>

      <h2>Cookies e armazenamento no navegador</h2>
      <p>O sistema <strong>não usa cookies de rastreamento, de publicidade ou de terceiros</strong>, nem ferramentas de análise de navegação. Guarda no próprio navegador apenas o essencial para funcionar:</p>
      <ul>
        <li>a sessão de login;</li>
        <li>tema claro ou escuro, tema de cor e menus recolhidos;</li>
        <li>filtros e página da fila de chamados;</li>
        <li>o registro de que você leu o aviso de armazenamento.</li>
      </ul>
      <p>Indicadores e relatórios ficam guardados só na memória da aba, para abrir mais rápido, e somem ao sair ou fechar a aba. Ao sair do sistema, a sessão é apagada do navegador.</p>

      <h2>Por quanto tempo</h2>
      <p>Os dados ficam guardados enquanto forem necessários para a operação, para o histórico e as auditorias da manutenção da rede, e pelos prazos legais aplicáveis. Contas de quem sai da empresa são desativadas. O histórico de alterações é mantido para auditoria.</p>

      <h2>Segurança</h2>
      <ul>
        <li>Acesso só com login, conexão cifrada (HTTPS) e permissões por cargo.</li>
        <li>Senhas cifradas, bloqueio após tentativas seguidas de login e registro de alterações.</li>
        <li>Cada pessoa vê apenas o que o seu cargo permite.</li>
      </ul>

      <h2>Seus direitos (art. 18 da LGPD)</h2>
      <ul>
        <li><strong>Confirmar e acessar</strong> os seus dados: em Meu perfil, use "Baixar meus dados".</li>
        <li><strong>Corrigir</strong> dados incompletos ou errados: em Meu perfil ou com o administrador.</li>
        <li>Pedir <strong>anonimização, bloqueio ou eliminação</strong> do que for desnecessário, e saber <strong>com quem os dados foram compartilhados</strong>.</li>
        <li>Remover a qualquer momento os dados opcionais (foto, banner, apelido e status).</li>
        <li>Fazer reclamação à Autoridade Nacional de Proteção de Dados (ANPD).</li>
      </ul>
      <p>Clientes atendidos podem exercer esses direitos pelos canais de atendimento da empresa contratante do serviço ou pelo contato abaixo.</p>
    </LegalLayout>
  );
}

export function TermsOfUsePage() {
  return (
    <LegalLayout title="Termos de Uso" intro={`Regras de uso do sistema Rede O&M, ferramenta interna da ${COMPANY.name} para a operação e manutenção da rede. Ao entrar no sistema, você concorda com estes termos.`}>
      <h2>Quem pode usar</h2>
      <p>Só colaboradores e prestadores autorizados, com conta criada pela empresa. O acesso termina quando o vínculo acaba ou quando a empresa decide.</p>

      <h2>Sua conta</h2>
      <ul>
        <li>O login e a senha são pessoais e intransferíveis. Não compartilhe nem anote em lugar visível.</li>
        <li>Tudo o que é feito com a sua conta fica registrado em seu nome.</li>
        <li>Suspeita de acesso indevido: troque a senha e avise o administrador.</li>
      </ul>

      <h2>Sigilo dos dados</h2>
      <ul>
        <li>Dados de clientes, endereços, contratos e indicadores são confidenciais e servem só para o trabalho.</li>
        <li>Não copie, exporte, fotografe ou envie esses dados para fora dos canais oficiais da empresa.</li>
        <li>Exportações em Excel ou PDF devem ser guardadas com cuidado e apagadas quando não forem mais necessárias.</li>
      </ul>

      <h2>O que você envia</h2>
      <ul>
        <li>Fotos de perfil, banners, observações e anexos devem ser seus ou de uso autorizado.</li>
        <li>Não envie conteúdo ofensivo, discriminatório, ilegal ou que viole direitos de imagem ou autorais de outras pessoas.</li>
        <li>Fotos de campo devem mostrar só o necessário para o atendimento. Evite rostos, placas de veículos e documentos de clientes.</li>
      </ul>

      <h2>Direitos autorais e propriedade intelectual</h2>
      <ul>
        <li>O software do sistema (código, telas, textos, layout e relatórios) é obra protegida pela Lei de Direitos Autorais (Lei 9.610/1998) e pela Lei de Software (Lei 9.609/1998). Os direitos são de <strong>{COMPANY.copyrightHolder}</strong>, e todos estão reservados.</li>
        <li>O acesso dá apenas o direito de usar o sistema no trabalho, enquanto a conta estiver ativa. Não transfere a propriedade nem dá licença para outros usos.</li>
        <li>Sem autorização por escrito, não é permitido copiar, reproduzir, modificar, distribuir, revender ou publicar o sistema ou partes dele. Também não é permitido fazer engenharia reversa ou criar sistemas derivados.</li>
        <li>A marca, o nome e a logo <strong>JH Telecom</strong> pertencem aos seus titulares e aparecem no sistema só para identificar a operação atendida.</li>
        <li>Os dados lançados (chamados, observações, fotos de campo) pertencem à operação. Fotos de perfil e banners continuam sendo de quem enviou. Ao enviar, a pessoa autoriza a exibição dentro do sistema.</li>
        <li>O sistema usa bibliotecas e fontes de código aberto, cada uma com a sua licença. A lista completa, com autores e textos das licenças, está em <Link to="/licencas">Licenças de terceiros</Link>.</li>
        <li>Suspeita de violação de direitos autorais (inclusive em imagens enviadas por usuários): avise pelo contato abaixo. O conteúdo será analisado e, se for o caso, removido.</li>
      </ul>

      <h2>Registro de atividades</h2>
      <p>Para segurança e auditoria, o sistema registra acessos e alterações: quem fez, o quê e quando. Esses registros podem ser consultados por quem tem permissão, conforme a Política de Privacidade.</p>

      <h2>Sobre as informações do sistema</h2>
      <p>Indicadores, prazos, sugestões de técnico e riscos são calculados a partir dos dados importados e lançados. Podem ficar desatualizados quando uma importação atrasa ou um dado é lançado errado. Servem como apoio à decisão e não substituem a conferência da equipe. O sistema pode passar por manutenção e atualizações.</p>

      <h2>Descumprimento</h2>
      <p>O uso fora destas regras pode levar ao bloqueio da conta e às medidas previstas nas normas internas e na legislação.</p>

      <h2>Mudanças nestes termos</h2>
      <p>Estes termos podem ser atualizados. A data da última revisão fica no topo da página. Vale a legislação brasileira.</p>
    </LegalLayout>
  );
}
