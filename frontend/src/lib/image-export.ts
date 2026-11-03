export function getImageCaptureScale(width: number, height: number) {
  const maxPixels = 40_000_000;
  return Math.min(3, Math.sqrt(maxPixels / Math.max(1, width * height)));
}
