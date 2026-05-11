import imageCompression from "browser-image-compression";

export interface CompressedFile {
  file: Blob;
  thumbnail: Blob;
  originalSize: number;
  compressedSize: number;
  mimeType: string;
  extension: string;
}

/**
 * Compresión agresiva de imagen:
 * - Máximo 1280px lado mayor
 * - JPEG calidad ~70%
 */
export async function compressImage(input: Blob): Promise<CompressedFile> {
  const original = input as File;
  const compressed = await imageCompression(original as File, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1280,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.7,
  });

  const thumbnail = await imageCompression(original as File, {
    maxSizeMB: 0.1,
    maxWidthOrHeight: 400,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.6,
  });

  return {
    file: compressed,
    thumbnail,
    originalSize: input.size,
    compressedSize: compressed.size,
    mimeType: "image/jpeg",
    extension: "jpg",
  };
}

/**
 * Compresión agresiva para logos de cliente:
 * - Máximo 512px lado mayor
 * - JPEG calidad ~75%
 * - Objetivo < 150 KB
 */
export async function compressLogo(input: Blob): Promise<Blob> {
  return imageCompression(input as File, {
    maxSizeMB: 0.15,
    maxWidthOrHeight: 512,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.75,
  });
}

/**
 * Genera un thumbnail (frame) de un video.
 */
async function videoThumbnail(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(blob);

    video.onloadeddata = () => {
      video.currentTime = Math.min(1, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      const maxSide = 400;
      const ratio = video.videoWidth / video.videoHeight || 1;
      canvas.width = ratio >= 1 ? maxSide : Math.round(maxSide * ratio);
      canvas.height = ratio >= 1 ? Math.round(maxSide / ratio) : maxSide;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (b) => {
          URL.revokeObjectURL(video.src);
          if (b) resolve(b);
          else reject(new Error("Thumbnail failed"));
        },
        "image/jpeg",
        0.6,
      );
    };
    video.onerror = () => reject(new Error("Video load error"));
  });
}

/**
 * Compresión "agresiva" para video subido desde galería.
 * El navegador no puede transcodificar realmente sin librerías pesadas (ffmpeg.wasm).
 * Estrategia: subir tal cual, pero limitar tamaño y generar thumbnail.
 * Para captura en vivo usamos MediaRecorder con bitrate bajo (ver use-camera).
 */
export async function processVideo(input: Blob): Promise<CompressedFile> {
  const thumbnail = await videoThumbnail(input);
  return {
    file: input,
    thumbnail,
    originalSize: input.size,
    compressedSize: input.size,
    mimeType: input.type || "video/webm",
    extension: (input.type?.includes("webm") ? "webm" : "mp4"),
  };
}
