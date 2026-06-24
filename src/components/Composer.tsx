import { FileText, ImagePlus, Send, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface SendPayload {
  text: string;
  files: File[];
}

interface Props {
  isGenerating: boolean;
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

export default function Composer({ isGenerating, draftText, onDraftTextChange, onSend, onStop }: Props) {
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

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
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
      <div className="border-t bg-card p-4 flex justify-center">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
          onClick={onStop}
        >
          <Square aria-hidden="true" size={16} fill="currentColor" strokeWidth={0} />
          停止
        </button>
      </div>
    );
  }

  return (
    <form
      className="border-t bg-card p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          const result = await onSend({ text: draftText, files: pendingFiles.map((pendingFile) => pendingFile.file) });

          if (result !== false) {
            onDraftTextChange('');
            clearPendingFiles();
          }
        } catch {
          // Keep the draft so the caller can surface the error without losing user input.
        }
      }}
    >
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
        <div className="mb-3 flex gap-2 overflow-x-auto pb-2" aria-label="待发送文件">
          {pendingFiles.map((pendingFile) => (
            <div key={pendingFile.id} className="relative flex-shrink-0">
              {pendingFile.previewUrl ? (
                <img
                  src={pendingFile.previewUrl}
                  alt={pendingFile.file.name}
                  className="h-20 w-20 rounded-md border object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-md border bg-muted" aria-hidden="true">
                  <FileText size={24} strokeWidth={2.1} />
                </div>
              )}
              <button
                type="button"
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-destructive text-xs font-semibold text-destructive-foreground hover:bg-destructive/90"
                aria-label={`移除文件 ${pendingFile.file.name}`}
                onClick={() => removePendingFile(pendingFile.id)}
              >
                ×
              </button>
              <p className="mt-1 w-20 truncate text-xs text-muted-foreground">{pendingFile.file.name}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          type="button"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border bg-background hover:bg-accent hover:text-accent-foreground"
          aria-label="添加文件"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus aria-hidden="true" size={20} strokeWidth={2.25} />
        </button>

        <div className="flex-1">
          <textarea
            ref={textareaRef}
            aria-label="消息内容"
            value={draftText}
            onChange={(event) => onDraftTextChange(event.target.value)}
            onKeyDown={(event) => {
              // Ctrl/Cmd + Enter to send
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                const form = event.currentTarget.form;
                if (form && (draftText.trim().length > 0 || pendingFiles.length > 0)) {
                  form.requestSubmit();
                }
              }
            }}
            rows={1}
            placeholder="输入消息"
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ maxHeight: '128px' }}
          />
        </div>

        <button
          type="submit"
          disabled={draftText.trim().length === 0 && pendingFiles.length === 0}
          className="inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          <Send aria-hidden="true" size={18} strokeWidth={2.35} />
          发送
        </button>
      </div>
    </form>
  );
}
