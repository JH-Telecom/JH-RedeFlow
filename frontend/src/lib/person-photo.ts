// Foto tirada na retirada de chave: reduz para no maximo 720 px no lado maior, em JPEG, abaixo de ~400 KB.
const MAX_SIDE = 720;
const MAX_CHARS = 540_000;

function drawToJpeg(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível processar a foto.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.72, 0.62, 0.5]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_CHARS) return dataUrl;
  }
  throw new Error("A foto ficou grande demais. Tente outra.");
}

export async function photoFromFile(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem (foto).");
  if (file.size > 20 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 20 MB.");
  const bitmap = await createImageBitmap(file);
  try { return drawToJpeg(bitmap, bitmap.width, bitmap.height); } finally { bitmap.close(); }
}

export function photoFromVideo(video: HTMLVideoElement) {
  if (!video.videoWidth) throw new Error("A câmera ainda não está pronta.");
  return drawToJpeg(video, video.videoWidth, video.videoHeight);
}
