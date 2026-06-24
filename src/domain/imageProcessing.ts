import { nanoid } from 'nanoid';
import type { FileAttachment, ImageAttachment, TextAttachment } from './types';

const MAX_FILES = 6;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;
const SUPPORTED_TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'html',
  'htm',
  'css',
  'js',
  'jsx',
  'ts',
  'tsx',
  'xml',
  'yaml',
  'yml',
  'log'
]);
const SUPPORTED_TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/javascript',
  'application/typescript',
  'application/xml',
  'application/x-yaml',
  'text/markdown'
]);

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function isImageFile(file: File) {
  return file.type.startsWith('image/');
}

export function isTextFile(file: File) {
  if (file.type.startsWith('text/') || SUPPORTED_TEXT_MIME_TYPES.has(file.type)) {
    return true;
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  return SUPPORTED_TEXT_EXTENSIONS.has(extension);
}

export function validateFileBatch(files: File[]): ValidationResult {
  if (files.length > MAX_FILES) {
    return { ok: false, message: '一次最多选择 6 个文件。' };
  }

  if (files.some((file) => file.size > MAX_FILE_BYTES)) {
    return { ok: false, message: '单个文件不能超过 5 MB。' };
  }

  if (files.some((file) => !isImageFile(file) && !isTextFile(file))) {
    return { ok: false, message: '仅支持图片、文本、Markdown、JSON、CSV、HTML、CSS、JavaScript 和 TypeScript 文件。' };
  }

  return { ok: true };
}

export const validateImageBatch = validateFileBatch;

export function resizeDimensions(width: number, height: number, maxEdge = MAX_EDGE) {
  const edge = Math.max(width, height);

  if (edge <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / edge;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片读取失败。'));
    image.src = dataUrl;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('文件读取失败。'));
    reader.readAsText(file);
  });
}

function getOutputMimeType(mimeType: string): 'image/jpeg' | 'image/png' {
  return mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
}

function canvasToDataUrl(canvas: HTMLCanvasElement, mimeType: string): string {
  const outputMimeType = getOutputMimeType(mimeType);

  if (outputMimeType === 'image/png') {
    return canvas.toDataURL(outputMimeType);
  }

  return canvas.toDataURL(outputMimeType, JPEG_QUALITY);
}

function dataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;

  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

async function fileToImageAttachment(file: File): Promise<ImageAttachment> {
  const originalDataUrl = await readAsDataUrl(file);
  const image = await loadImage(originalDataUrl);

  if (
    !Number.isFinite(image.naturalWidth) ||
    !Number.isFinite(image.naturalHeight) ||
    image.naturalWidth <= 0 ||
    image.naturalHeight <= 0
  ) {
    throw new Error('图片读取失败。');
  }

  const size = resizeDimensions(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('浏览器不支持图片压缩。');
  }

  context.drawImage(image, 0, 0, size.width, size.height);
  const outputMimeType = getOutputMimeType(file.type);
  const dataUrl = canvasToDataUrl(canvas, file.type);

  return {
    id: nanoid(),
    kind: 'image',
    name: file.name,
    mimeType: outputMimeType,
    dataUrl,
    previewUrl: dataUrl,
    width: size.width,
    height: size.height,
    sizeBytes: dataUrlByteLength(dataUrl)
  };
}

async function fileToTextAttachment(file: File): Promise<TextAttachment> {
  return {
    id: nanoid(),
    kind: 'text',
    name: file.name,
    mimeType: file.type || 'text/plain',
    text: await readAsText(file),
    sizeBytes: file.size
  };
}

export async function fileToAttachment(file: File): Promise<FileAttachment> {
  if (isImageFile(file)) {
    return fileToImageAttachment(file);
  }

  if (isTextFile(file)) {
    return fileToTextAttachment(file);
  }

  throw new Error('不支持的文件类型。');
}
