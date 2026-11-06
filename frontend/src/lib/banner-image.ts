// Banner do perfil: recorta a imagem em 7:2 (centro), o formato da faixa do topo de Meu perfil, e reduz para 1600x457 JPEG,
// baixando a qualidade se precisar para caber no limite do servidor (700 KB).
// GIF animado vai como esta: o canvas perderia a animacao. A faixa mostra o centro dele (cover).
export const BANNER_GIF_MAX_BYTES = 3 * 1024 * 1024;
function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o GIF."));
    reader.readAsDataURL(file);
  });
}

export async function resizeBannerImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
  if (file.type === "image/gif") {
    if (file.size > BANNER_GIF_MAX_BYTES) throw new Error("O GIF deve ter no máximo 3 MB. Reduza o tamanho ou a duração e tente de novo.");
    return await readAsDataUrl(file);
  }
  if (file.size > 15 * 1024 * 1024) throw new Error("A imagem original deve ter no máximo 15 MB.");
  const bitmap = await createImageBitmap(file);
  const targetRatio = 7 / 2;
  let sourceWidth = bitmap.width;
  let sourceHeight = Math.round(bitmap.width / targetRatio);
  if (sourceHeight > bitmap.height) { sourceHeight = bitmap.height; sourceWidth = Math.round(bitmap.height * targetRatio); }
  const sourceX = Math.round((bitmap.width - sourceWidth) / 2);
  const sourceY = Math.round((bitmap.height - sourceHeight) / 2);
  const width = Math.min(1600, sourceWidth);
  const height = Math.round(width / targetRatio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível processar esta imagem.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
  bitmap.close();
  for (const quality of [0.84, 0.74, 0.64, 0.54]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= 700_000) return dataUrl;
  }
  throw new Error("Não foi possível reduzir o banner para o tamanho permitido.");
}
