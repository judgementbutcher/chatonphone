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
      <div className="composer composer-generating">
        <button type="button" className="stopButton" onClick={onStop}>
          <Square aria-hidden="true" size={16} fill="currentColor" strokeWidth={0} />
          停止
        </button>
      </div>
    );
  }

  return (
    <form
      className="composer"
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
        className="fileInput"
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
        <div className="attachmentPreview" aria-label="待发送文件">
          {pendingFiles.map((pendingFile) => (
            <figure key={pendingFile.id}>
              {pendingFile.previewUrl ? (
                <img src={pendingFile.previewUrl} alt={pendingFile.file.name} />
              ) : (
                <div className="filePreviewIcon" aria-hidden="true">
                  <FileText size={24} strokeWidth={2.1} />
                </div>
              )}
              <figcaption>{pendingFile.file.name}</figcaption>
              <button type="button" aria-label={`移除文件 ${pendingFile.file.name}`} onClick={() => removePendingFile(pendingFile.id)}>
                移除
              </button>
            </figure>
          ))}
        </div>
      )}
      <div className="composerDock">
        <button
          type="button"
          className="iconButton attachButton"
          aria-label="添加文件"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus aria-hidden="true" size={20} strokeWidth={2.25} />
        </button>
        <label className="composerInput">
          <span className="visuallyHidden">消息内容</span>
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
          />
        </label>
        <button
          type="submit"
          className="sendButton"
          disabled={draftText.trim().length === 0 && pendingFiles.length === 0}
        >
          <Send aria-hidden="true" size={18} strokeWidth={2.35} />
          发送
        </button>
      </div>
    </form>
  );
}
