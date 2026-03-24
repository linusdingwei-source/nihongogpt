import { MAX_COVER_IMAGE_BYTES } from '@/lib/cover-image-limit';

const MIME_OUT = 'image/jpeg';

/** 长边依次缩小，直到压进上限（仅用于封面等场景） */
const MAX_EDGES = [2048, 1600, 1280, 1024, 800, 640] as const;

async function decodeImage(
  file: File
): Promise<{ source: CanvasImageSource; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        cleanup: () => bitmap.close(),
      };
    } catch {
      /* HEIC 等可能失败，走 Image */
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ source: img, cleanup: () => {} });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片，请使用 JPEG、PNG 或 WebP'));
    };
    img.src = url;
  });
}

function intrinsicSize(source: CanvasImageSource): { w: number; h: number } {
  if (source instanceof ImageBitmap) {
    return { w: source.width, h: source.height };
  }
  const el = source as HTMLImageElement;
  return { w: el.naturalWidth, h: el.naturalHeight };
}

function drawScaledCanvas(
  source: CanvasImageSource,
  maxEdge: number
): HTMLCanvasElement {
  const { w, h } = intrinsicSize(source);
  if (w < 1 || h < 1) {
    throw new Error('图片尺寸无效');
  }

  let tw = w;
  let th = h;
  if (tw > maxEdge || th > maxEdge) {
    if (tw >= th) {
      th = Math.round((th * maxEdge) / tw);
      tw = maxEdge;
    } else {
      tw = Math.round((tw * maxEdge) / th);
      th = maxEdge;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('当前环境不支持图片压缩');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(source, 0, 0, tw, th);
  return canvas;
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), MIME_OUT, quality);
  });
}

/**
 * 超过 maxBytes 时用 Canvas 缩放 + JPEG 质量压缩，尽量压到上限以内再上传。
 * 已小于等于 maxBytes 时原样返回。
 */
export async function compressImageFileIfNeeded(
  file: File,
  maxBytes: number = MAX_COVER_IMAGE_BYTES
): Promise<File> {
  if (file.size <= maxBytes) {
    return file;
  }

  const { source, cleanup } = await decodeImage(file);
  try {
    const stem = file.name.replace(/\.[^./\\]+$/, '') || 'cover';

    for (const maxEdge of MAX_EDGES) {
      const canvas = drawScaledCanvas(source, maxEdge);
      for (let q = 0.9; q >= 0.45; q -= 0.05) {
        const blob = await canvasToJpegBlob(canvas, q);
        if (blob && blob.size <= maxBytes) {
          return new File([blob], `${stem}-cover.jpg`, { type: MIME_OUT });
        }
      }
    }

    throw new Error(
      `图片压缩后仍超过 ${maxBytes / (1024 * 1024)}MB，请换一张内容更简单的图`
    );
  } finally {
    cleanup();
  }
}
