import { Check, Copy, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { copyImage, type ImageReadyDetail } from "../lib/report-image";

// Aviso depois de gerar uma imagem: mostra a miniatura, diz se ja foi copiada e oferece Copiar de novo
// e Compartilhar (no celular abre o menu do sistema, com WhatsApp). Lista com mais de 20 linhas vira varias
// imagens: o aviso traz um botao para copiar cada parte, na ordem. Some sozinho (12 s; 45 s com varias partes).
export function ImageReadyToast() {
  const [image, setImage] = useState<(ImageReadyDetail & { url: string }) | null>(null);
  const [copiedParts, setCopiedParts] = useState<number[]>([]);

  useEffect(() => {
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<ImageReadyDetail>).detail;
      setImage((current) => { if (current) URL.revokeObjectURL(current.url); return { ...detail, parts: detail.parts?.length ? detail.parts : [{ blob: detail.blob, fileName: detail.fileName }], url: URL.createObjectURL(detail.blob) }; });
      setCopiedParts(detail.copied ? [0] : []);
    };
    window.addEventListener("jh-redeflow:image-ready", onReady);
    return () => window.removeEventListener("jh-redeflow:image-ready", onReady);
  }, []);

  const many = (image?.parts.length ?? 0) > 1;
  useEffect(() => {
    if (!image) return;
    const timer = window.setTimeout(() => setImage(null), many ? 45_000 : 12_000);
    return () => window.clearTimeout(timer);
  }, [image, many, copiedParts]);

  if (!image) return null;
  const files = image.parts.map((part) => new File([part.blob], part.fileName, { type: "image/png" }));
  const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files });
  async function copyPart(index: number) {
    if (await copyImage(image!.parts[index].blob)) setCopiedParts((current) => (current.includes(index) ? current : [...current, index]));
  }
  const copied = copiedParts.includes(0);
  return (
    <div className="image-toast" role="status">
      <img src={image.url} alt="" />
      <div className="image-toast-text">
        <strong>{many ? `${image.parts.length} imagens baixadas` : copied ? "Imagem copiada e baixada" : "Imagem baixada"}</strong>
        <span>{many ? "A lista passou de 20 linhas e foi dividida. Copie uma parte por vez e cole na conversa do WhatsApp, na ordem." : copied ? "Cole na conversa do WhatsApp com Ctrl+V." : "Quer mandar no WhatsApp? Copie e cole na conversa (Ctrl+V)."}</span>
        <div className="image-toast-actions">
          {many
            ? image.parts.map((part, index) => (
              <button key={part.fileName} type="button" className={copiedParts.includes(index) ? "secondary-button compact" : "primary-button"} onClick={() => void copyPart(index)}>
                {copiedParts.includes(index) ? <Check size={14} /> : <Copy size={14} />} {copiedParts.includes(index) ? `Parte ${index + 1} copiada` : `Copiar parte ${index + 1}`}
              </button>
            ))
            : <button type="button" className="primary-button" onClick={() => void copyPart(0)}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiada" : "Copiar imagem"}</button>}
          {canShare && <button type="button" className="secondary-button compact" onClick={() => void navigator.share({ files, title: image.fileName }).catch(() => undefined)}><Share2 size={14} /> Compartilhar{many ? " todas" : ""}</button>}
        </div>
      </div>
      <button type="button" className="image-toast-close" onClick={() => setImage(null)} aria-label="Fechar aviso"><X size={15} /></button>
    </div>
  );
}
