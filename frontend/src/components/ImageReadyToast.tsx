import { Check, Copy, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { copyImage, type ImageReadyDetail } from "../lib/report-image";

// Aviso depois de gerar uma imagem: mostra a miniatura, diz se ja foi copiada e oferece Copiar de novo
// e Compartilhar (no celular abre o menu do sistema, com WhatsApp). Some sozinho depois de 12 s.
export function ImageReadyToast() {
  const [image, setImage] = useState<(ImageReadyDetail & { url: string }) | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<ImageReadyDetail>).detail;
      setImage((current) => { if (current) URL.revokeObjectURL(current.url); return { ...detail, url: URL.createObjectURL(detail.blob) }; });
      setCopied(detail.copied);
    };
    window.addEventListener("jh-redeflow:image-ready", onReady);
    return () => window.removeEventListener("jh-redeflow:image-ready", onReady);
  }, []);

  useEffect(() => {
    if (!image) return;
    const timer = window.setTimeout(() => setImage(null), 12_000);
    return () => window.clearTimeout(timer);
  }, [image]);

  if (!image) return null;
  const file = new File([image.blob], image.fileName, { type: "image/png" });
  const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  return (
    <div className="image-toast" role="status">
      <img src={image.url} alt="" />
      <div className="image-toast-text">
        <strong>{copied ? "Imagem copiada e baixada" : "Imagem baixada"}</strong>
        <span>{copied ? "Cole na conversa do WhatsApp com Ctrl+V." : "Quer mandar no WhatsApp? Copie e cole na conversa (Ctrl+V)."}</span>
        <div className="image-toast-actions">
          <button type="button" className="primary-button" onClick={async () => setCopied(await copyImage(image.blob))}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiada" : "Copiar imagem"}</button>
          {canShare && <button type="button" className="secondary-button compact" onClick={() => void navigator.share({ files: [file], title: image.fileName }).catch(() => undefined)}><Share2 size={14} /> Compartilhar</button>}
        </div>
      </div>
      <button type="button" className="image-toast-close" onClick={() => setImage(null)} aria-label="Fechar aviso"><X size={15} /></button>
    </div>
  );
}
