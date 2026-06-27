import { FileText, ImagePlus, Mic, Send, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// Minimal structural types for the Web Speech API (not in the DOM lib). Only
// the members we touch are declared; the runtime object is feature-detected.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const candidate = (window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  });

  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

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

function pendingFileKey(file: File) {
  return `${file.name}-${file.size}`;
}

export default function Composer({ isGenerating, disabled = false, draftText, onDraftTextChange, onSend, onStop }: Props) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const pendingFilesRef = useRef<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dragCounterRef = useRef(0);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // The draft text as it stood when dictation started; recognized speech is
  // appended onto this baseline so manual edits before dictation are preserved.
  const dictationBaseRef = useRef('');
  const draftTextRef = useRef(draftText);
  draftTextRef.current = draftText;

  const speechRecognitionSupported = getSpeechRecognitionConstructor() !== null;

  function stopDictation() {
    recognitionRef.current?.stop();
  }

  function startDictation() {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = navigator.language || 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    dictationBaseRef.current = draftTextRef.current.trim().length > 0 ? `${draftTextRef.current.trim()} ` : '';

    recognition.onresult = (event) => {
      let transcript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      onDraftTextChange(`${dictationBaseRef.current}${transcript}`);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  function handleToggleDictation() {
    if (isListening) {
      stopDictation();
    } else {
      startDictation();
    }
  }

  // Stop dictation on unmount so the mic doesn't stay live after navigation.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

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

  // Append new files to the pending list, deduping by name+size so re-picking
  // the same file is a no-op and only freshly added files get a new Object URL.
  function appendPendingFiles(incomingFiles: File[]) {
    if (incomingFiles.length === 0) {
      return;
    }

    const existingKeys = new Set(pendingFilesRef.current.map((pendingFile) => pendingFileKey(pendingFile.file)));
    const additions: PendingFile[] = [];

    for (const file of incomingFiles) {
      const key = pendingFileKey(file);

      if (existingKeys.has(key)) {
        continue;
      }

      existingKeys.add(key);
      additions.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        previewUrl: createPreviewUrl(file)
      });
    }

    if (additions.length === 0) {
      return;
    }

    setTrackedPendingFiles([...pendingFilesRef.current, ...additions]);
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

  const canSubmit = !disabled && !isGenerating && (draftText.trim().length > 0 || pendingFiles.length > 0);

  return (
    <form
      className="soft-divider-top relative bg-background/86 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-lg sm:px-5"
      data-dragover={isDragOver ? 'true' : undefined}
      onDragEnter={(event) => {
        if (event.dataTransfer?.types?.includes('Files')) {
          event.preventDefault();
          dragCounterRef.current += 1;
          setIsDragOver(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer?.types?.includes('Files')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDragLeave={(event) => {
        if (event.dataTransfer?.types?.includes('Files')) {
          dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
          if (dragCounterRef.current === 0) {
            setIsDragOver(false);
          }
        }
      }}
      onDrop={(event) => {
        if (!event.dataTransfer?.files?.length) {
          return;
        }

        event.preventDefault();
        dragCounterRef.current = 0;
        setIsDragOver(false);
        appendPendingFiles(Array.from(event.dataTransfer.files));
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          if (disabled || isGenerating) {
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
            // Append rather than replace so multiple picks accumulate.
            // Dedupe by name+size to prevent duplicate previews.
            const selectedFiles = Array.from(event.target.files ?? []);
            appendPendingFiles(selectedFiles);
            // Reset the input so the same file can be reselected if removed.
            event.target.value = '';
          }}
        />

        {pendingFiles.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin" aria-label="待发送文件">
            {pendingFiles.map((pendingFile) => (
              <div key={pendingFile.id} className="group relative flex w-[88px] shrink-0 animate-fade-up flex-col">
                {pendingFile.previewUrl ? (
                  <div className="relative h-16 w-16 overflow-hidden rounded-[1rem] bg-gradient-to-br from-muted/30 to-muted/10 shadow-[inset_0_0_0_1px_hsl(var(--hairline)/0.52),0_10px_24px_hsl(var(--foreground)/0.08)]">
                    <img
                      src={pendingFile.previewUrl}
                      alt={pendingFile.file.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
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

          {speechRecognitionSupported && (
            <button
              type="button"
              className={`soft-action inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                isListening ? 'text-accent' : 'text-muted-foreground'
              }`}
              aria-label={isListening ? '停止语音输入' : '语音输入'}
              aria-pressed={isListening}
              onClick={handleToggleDictation}
            >
              <Mic aria-hidden="true" size={20} strokeWidth={2.25} className={isListening ? 'animate-pulse' : undefined} />
            </button>
          )}

          <textarea
            ref={textareaRef}
            aria-label="消息内容"
            value={draftText}
            onChange={(event) => onDraftTextChange(event.target.value)}
            onKeyDown={(event) => {
              // Ctrl/Cmd + Enter always submits.
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                const form = event.currentTarget.form;
                if (form && canSubmit) {
                  form.requestSubmit();
                }
                return;
              }

              // Plain Enter submits, unless inside an IME composition or with Shift held.
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                const form = event.currentTarget.form;
                if (form && canSubmit) {
                  form.requestSubmit();
                }
              }
            }}
            onPaste={(event) => {
              const pastedFiles = Array.from(event.clipboardData?.files ?? []);
              if (pastedFiles.length === 0) {
                return;
              }

              // Prevent the browser from also inserting the file's filename as text.
              event.preventDefault();
              appendPendingFiles(pastedFiles);
            }}
            rows={1}
            placeholder="输入消息，Enter 发送，Shift + Enter 换行"
            className="max-h-36 min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
          />

          {isGenerating ? (
            <button
              type="button"
              className="danger-action inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold sm:px-4"
              aria-label="停止"
              onClick={onStop}
            >
              <Square aria-hidden="true" size={15} fill="currentColor" strokeWidth={0} />
              停止
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || (draftText.trim().length === 0 && pendingFiles.length === 0)}
              className="primary-action inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold disabled:opacity-45 sm:px-4"
            >
              <Send aria-hidden="true" size={17} strokeWidth={2.35} />
              发送
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
