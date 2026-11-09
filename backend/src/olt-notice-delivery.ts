import { sendWhatsAppButtons, sendWhatsAppText, type WhatsAppConfig } from './integrations/wuzapi/sender.js';
import { buildOltNotice, OLT_NOTICE_BUTTON_TITLE, OLT_NOTICE_FOOTER } from './olt-notice.js';
import type { ActivationAnalysis } from './types.js';

// Primeiro tenta a mensagem com botao "Acompanhar chamado" (cta_url). Se a WuzAPI recusar, ou com
// WUZAPI_INFORMATIVO_BUTTONS=false, manda o texto com o link no final (como antes).
export async function deliverOltNotice(config: WhatsAppConfig, analysis: Partial<ActivationAnalysis>, originalMessage: string, link: string, env: NodeJS.ProcessEnv = process.env): Promise<'botao' | 'texto'> {
  if (env.WUZAPI_INFORMATIVO_BUTTONS?.trim().toLowerCase() !== 'false') {
    try {
      await sendWhatsAppButtons(config, { body: buildOltNotice(analysis, originalMessage), footer: OLT_NOTICE_FOOTER, buttons: [{ type: 'cta_url', title: OLT_NOTICE_BUTTON_TITLE, id: 'acompanhar_chamado', url: link }] });
      return 'botao';
    } catch (error) {
      console.warn(`[Informativo] botao recusado, mandando texto com link: ${error instanceof Error ? error.message : error}`);
    }
  }
  await sendWhatsAppText(config, buildOltNotice(analysis, originalMessage, link));
  return 'texto';
}
