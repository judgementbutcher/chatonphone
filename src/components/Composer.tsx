import { FileText, ImagePlus, Send, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface SendPayload {
  text: string;
  files: File[];
}

interface Props {
  isGenerating: boolean;
  disabled?: boolean;
  draftText: string;
  onDraftTextChange: (value: string) => void;
  onSend: (payload: SendPayload) => boolean | void | Promise<boolean | void>;
  onStop: () => void;
}

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
}

function createPreviewUrl(file: File) {
  if (!file.type.startsWith('image/')) {
    return '';
  }

  return URL.createObjectURL?.(file) ?? '';
}

function revokePreviewUrl(previewUrl: string) {
  if (previewUrl) {
    URL.revokeObjectURL?.(previewUrl);
  }
}

export default function Composer({ isGenerating, disabled = false, draftText, onDraftTextChange, onSend, onStop }: Props) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const pendingFilesRef = useRef<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    return () => {
      for (const pendingFile of pendingFilesRef.current) {
        revokePreviewUrl(pendingFile.previewUrl);
      }
    };
  }, []);

  function setTrackedPendingFiles(nextPendingFiles: PendingFile[]) {
    pendingFilesRef.current = nextPendingFiles;
    setPendingFiles(nextPendingFiles);
  }

  function clearPendingFiles() {
    for (const pendingFile of pendingFilesRef.current) {
      revokePreviewUrl(pendingFile.previewUrl);
    }

    setTrackedPendingFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [draftText]);

  function removePendingFile(id: string) {
    setPendingFiles((current) => {
      const removedFile = current.find((pendingFile) => pendingFile.id === id);

      if (removedFile) {
        revokePreviewUrl(removedFile.previewUrl);
      }

      const nextPendingFiles = current.filter((pendingFile) => pendingFile.id !== id);
      pendingFilesRef.current = nextPendingFiles;
      return nextPendingFiles;
    });
  }

  if (isGenerating) {
    return (
      <div className="soft-divider-top bg-card/[0.46] px-3 py-3 shadow-[0_-18px_48px_hsl(var(--foreground)/0.08)] backdrop-blur-2xl sm:px-5">
        <div className="mx-auto flex max-w-4xl justify-center">
          <button
            type="button"
            className="danger-action inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold"
            aria-label="停止"
            onClick={onStop}
          >
            <Square aria-hidden="true" size={15} fill="currentColor" strokeWidth={0} />
            停止
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="soft-divider-top bg-card/[0.52] px-3 py-3 shadow-[0_-18px_48px_hsl(var(--foreground)/0.08)] backdrop-blur-2xl sm:px-5"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          if (disabled) {
            return;
          }

          const result = await onSend({ text: draftText, files: pendingFiles.map((pendingFile) => pendingFile.file) });

          if (result !== false) {
            onDraftTextChange('');
            clearPendingFiles();
          }
        } catch {
          // Keep the draft when the caller surfaces a send error.
        }
      }}
    >
      <div className="mx-auto max-w-4xl">
        <input
          ref={fileInputRef}
          className="sr-only"
          aria-label="选择文件"
          type="file"
          accept="image/*,.txt,.md,.markdown,.json,.csv,.html,.htm,.css,.js,.jsx,.ts,.tsx,.xml,.yaml,.yml,.log,text/*,application/json"
          multiple
          onChange={(event) => {
            const selectedFiles = Array.from(event.target.files ?? []);
            for (const pendingFile of pendingFilesRef.current) {
              revokePreviewUrl(pendingFile.previewUrl);
            }
            setTrackedPendingFiles(selectedFiles.map((file) => ({
              id: `${file.name}-${file.size}-${file.lastModified}`,
              file,
              previewUrl: createPreviewUrl(file)
            })));
          }}
        />

        {pendingFiles.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin" aria-label="待发送文件">
            {pendingFiles.map((pendingFile) => (
              <div key={pendingFile.id} className="group relative flex w-[88px] shrink-0 animate-fade-up flex-col">
                {pendingFile.previewUrl ? (
                  <img
                    src={pendingFile.previewUrl}
                    alt={pendingFile.file.name}
                    className="h-16 w-16 rounded-[1rem] object-cover shadow-[inset_0_0_0_1px_hsl(var(--hairline)/0.52),0_10px_24px_hsl(var(--foreground)/0.08)]"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-[1rem] bg-muted/[0.66] shadow-[inset_0_0_0_1px_hsl(var(--hairline)/0.52),0_10px_24px_hsl(var(--foreground)/0.06)]" aria-hidden="true">
                    <FileText size={21} strokeWidth={2.1} className="text-primary" />
                  </div>
                )}
                <button
                  type="button"
                  className="danger-action absolute right-5 top-[-6px] inline-flex h-6 w-6 items-center justify-center rounded-full"
                  aria-label={`移除文件 ${pendingFile.file.name}`}
                  onClick={() => removePendingFile(pendingFile.id)}
                >
                  <X aria-hidden="true" size={13} strokeWidth={2.4} />
                </button>
                <p className="mt-1 w-16 truncate text-xs text-muted-foreground">{pendingFile.file.name}</p>
              </div>
            ))}
          </div>
        )}

        <div className="tech-control flex items-end gap-2 rounded-[1.35rem] p-2">
          <button
            type="button"
            className="soft-action inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground"
            aria-label="添加文件"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus aria-hidden="true" size={21} strokeWidth={2.25} />
          </button>

          <textarea
            ref={textareaRef}
            aria-label="消息内容"
            value={draftText}
            onChange={(event) => onDraftTextChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                const form = event.currentTarget.form;
                if (form && (draftText.trim().length > 0 || pendingFiles.length > 0)) {
                  form.requestSubmit();
                }
              }
            }}
            rows={1}
            placeholder="输入消息，Ctrl + Enter 发送"
            className="max-h-36 min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
          />

          <button
            type="submit"
            disabled={disabled || (draftText.trim().length === 0 && pendingFiles.length === 0)}
            className="primary-action inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold disabled:opacity-45 sm:px-4"
          >
            <Send aria-hidden="true" size={17} strokeWidth={2.35} />
            发送
          </button>
        </div>
      </div>
    </form>
  );
}
