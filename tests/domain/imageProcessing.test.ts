import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileToAttachment, resizeDimensions, validateFileBatch } from '../../src/domain/imageProcessing';

function imageFile(name: string, size: number, type = 'image/jpeg') {
  return new File(['x'.repeat(size)], name, { type });
}

function installImagePipelineMocks(options: {
  naturalWidth: number;
  naturalHeight: number;
  dataUrl: string;
  hasContext?: boolean;
}) {
  const originalCreateElement = document.createElement.bind(document);

  class MockFileReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    readAsDataURL(file: File) {
      this.result = `data:${file.type};base64,b3JpZ2luYWw=`;
      this.onload?.();
    }
  }

  class MockImage {
    naturalWidth = options.naturalWidth;
    naturalHeight = options.naturalHeight;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      this.onload?.();
    }
  }

  const canvas = {
    width: 0,
    height: 0,
    drawImage: vi.fn(),
    toDataURL: vi.fn((type: string) => `data:${type};base64,${options.dataUrl}`),
    getContext: vi.fn(() => (options.hasContext === false ? null : { drawImage: canvas.drawImage }))
  };

  vi.stubGlobal('FileReader', MockFileReader);
  vi.stubGlobal('Image', MockImage);
  vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName === 'canvas') {
      return canvas as unknown as HTMLCanvasElement;
    }

    return originalCreateElement(tagName);
  });

  return canvas;
}

function installTextFileReaderMock() {
  class MockFileReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    readAsText(file: File) {
      this.result = file.name === 'notes.md' ? '# Notes\nUse this context.' : 'plain text';
      this.onload?.();
    }

    readAsDataURL(file: File) {
      this.result = `data:${file.type};base64,b3JpZ2luYWw=`;
      this.onload?.();
    }
  }

  vi.stubGlobal('FileReader', MockFileReader);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('validateFileBatch', () => {
  it('accepts up to six supported files', () => {
    const result = validateFileBatch([
      imageFile('1.jpg', 100),
      imageFile('2.jpg', 100),
      imageFile('3.jpg', 100),
      imageFile('4.jpg', 100),
      imageFile('notes.md', 100, 'text/markdown'),
      imageFile('data.json', 100, 'application/json')
    ]);

    expect(result).toEqual({ ok: true });
  });

  it('rejects more than six files', () => {
    const result = validateFileBatch([
      imageFile('1.jpg', 100),
      imageFile('2.jpg', 100),
      imageFile('3.jpg', 100),
      imageFile('4.jpg', 100),
      imageFile('5.jpg', 100),
      imageFile('6.jpg', 100),
      imageFile('7.jpg', 100)
    ]);

    expect(result).toEqual({
      ok: false,
      message: '一次最多选择 6 个文件。'
    });
  });

  it('rejects unsupported binary files', () => {
    expect(validateFileBatch([imageFile('archive.zip', 100, 'application/zip')])).toEqual({
      ok: false,
      message: '仅支持图片、文本、Markdown、JSON、CSV、HTML、CSS、JavaScript 和 TypeScript 文件。'
    });
  });

  it('rejects files larger than 5 MB', () => {
    expect(validateFileBatch([imageFile('huge.txt', 5 * 1024 * 1024 + 1, 'text/plain')])).toEqual({
      ok: false,
      message: '单个文件不能超过 5 MB。'
    });
  });
});

describe('resizeDimensions', () => {
  it('keeps smaller images unchanged', () => {
    expect(resizeDimensions(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it('scales large images within the max edge', () => {
    expect(resizeDimensions(4000, 2000, 1280)).toEqual({ width: 1280, height: 640 });
  });

  it('keeps scaled dimensions at least one pixel', () => {
    expect(resizeDimensions(1, 4000, 1280)).toEqual({ width: 1, height: 1280 });
  });
});

describe('fileToAttachment', () => {
  it('reads supported text files as text attachments', async () => {
    installTextFileReaderMock();

    const attachment = await fileToAttachment(imageFile('notes.md', 100, 'text/markdown'));

    expect(attachment).toMatchObject({
      name: 'notes.md',
      kind: 'text',
      mimeType: 'text/markdown',
      text: '# Notes\nUse this context.',
      sizeBytes: 100
    });
  });

  it('stores the output mime type and byte size after JPEG conversion', async () => {
    const canvas = installImagePipelineMocks({
      naturalWidth: 4000,
      naturalHeight: 2000,
      dataUrl: 'YWJjZA=='
    });

    const attachment = await fileToAttachment(imageFile('photo.webp', 100, 'image/webp'));

    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(640);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.82);
    expect(attachment).toMatchObject({
      name: 'photo.webp',
      kind: 'image',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,YWJjZA==',
      previewUrl: 'data:image/jpeg;base64,YWJjZA==',
      width: 1280,
      height: 640,
      sizeBytes: 4
    });
  });

  it('preserves PNG output without JPEG quality', async () => {
    const canvas = installImagePipelineMocks({
      naturalWidth: 320,
      naturalHeight: 240,
      dataUrl: 'YQ=='
    });

    const attachment = await fileToAttachment(imageFile('diagram.png', 100, 'image/png'));

    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(attachment).toMatchObject({
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,YQ==',
      width: 320,
      height: 240,
      sizeBytes: 1
    });
  });

  it('rejects browsers without a canvas 2d context', async () => {
    installImagePipelineMocks({
      naturalWidth: 320,
      naturalHeight: 240,
      dataUrl: 'YQ==',
      hasContext: false
    });

    await expect(fileToAttachment(imageFile('photo.jpg', 100))).rejects.toThrow('浏览器不支持图片压缩。');
  });

  it('rejects decoded images with invalid dimensions', async () => {
    installImagePipelineMocks({
      naturalWidth: 0,
      naturalHeight: 240,
      dataUrl: 'YQ=='
    });

    await expect(fileToAttachment(imageFile('photo.jpg', 100))).rejects.toThrow('图片读取失败。');
  });
});
