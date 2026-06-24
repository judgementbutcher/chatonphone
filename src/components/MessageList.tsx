import { Bot, Copy, FileText, Pencil, RefreshCw, User } from 'lucide-react';
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, FileAttachment, ImageAttachment, TextAttachment } from '../domain/types';

interface Props {
  messages: ChatMessage[];
  onEditUserMessage?: (message: ChatMessage) => void;
  onRegenerate?: (message: ChatMessage) => void;
}

function textFromNode(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textFromNode).join('');
  }

  if (node && typeof node === 'object' && 'props' in node) {
    return textFromNode((node as { props?: { children?: unknown } }).props?.children);
  }

  return '';
}

function isTextAttachment(attachment: FileAttachment): attachment is TextAttachment {
  return attachment.kind === 'text';
}

function isImageAttachment(attachment: FileAttachment): attachment is ImageAttachment {
  return attachment.kind !== 'text';
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MessageList({ messages, onEditUserMessage, onRegenerate }: Props) {
  const terminalMessage = messages[messages.length - 1];
  const regenerableAssistantMessageId = terminalMessage?.role === 'assistant' ? terminalMessage.id : null;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const previousMessagesLengthRef = useRef(messages.length);
  let codeBlockNumber = 0;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > previousMessagesLengthRef.current && messagesEndRef.current) {
      // Check if scrollIntoView is available (it might not be in test environments)
      if (typeof messagesEndRef.current.scrollIntoView === 'function') {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
    previousMessagesLengthRef.current = messages.length;
  }, [messages]);

  return (
    <section className="flex-1 overflow-y-auto px-4 py-6" aria-label="消息列表">
      {messages.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center space-y-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot aria-hidden="true" size={32} strokeWidth={2.15} />
          </div>
          <h2 className="text-2xl font-bold">开始新的对话</h2>
          <p className="text-muted-foreground">输入文字或添加文件。</p>
        </div>
      )}

      <div className="mx-auto max-w-4xl space-y-6">
        {messages.map((message) => {
          const imageAttachments = message.attachments.filter(isImageAttachment);
          const textAttachments = message.attachments.filter(isTextAttachment);

          return (
            <article
              key={message.id}
              className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot size={18} strokeWidth={2.3} />
                </div>
              )}

              <div
                className={`max-w-[85%] space-y-3 rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'border bg-card'
                }`}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                  components={{
                    table({ children }) {
                      return (
                        <div className="overflow-x-auto rounded-md border">
                          <table className="w-full">{children}</table>
                        </div>
                      );
                    },
                    pre({ children }) {
                      codeBlockNumber += 1;
                      const codeText = textFromNode(children).replace(/\n$/, '');

                      return (
                        <div className="relative overflow-hidden rounded-lg border bg-slate-950 text-slate-50">
                          <button
                            type="button"
                            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                            aria-label={`复制代码块 ${codeBlockNumber}`}
                            onClick={() => {
                              void navigator.clipboard?.writeText(codeText);
                            }}
                          >
                            <Copy aria-hidden="true" size={12} strokeWidth={2.25} />
                            复制代码
                          </button>
                          <pre className="overflow-x-auto p-4 pt-12 text-sm">{children}</pre>
                        </div>
                      );
                    }
                  }}
                >
                  {message.text || ' '}
                </ReactMarkdown>

                {imageAttachments.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {imageAttachments.map((attachment) => (
                      <img
                        key={attachment.id}
                        src={attachment.previewUrl}
                        alt={attachment.name}
                        className="rounded-md border"
                      />
                    ))}
                  </div>
                )}

                {textAttachments.length > 0 && (
                  <div className="space-y-2" aria-label="消息文件">
                    {textAttachments.map((attachment) => (
                      <div
                        className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm"
                        key={attachment.id}
                      >
                        <FileText aria-hidden="true" size={16} strokeWidth={2.15} />
                        <span className="flex-1 truncate font-medium">{attachment.name}</span>
                        <span className="text-xs text-muted-foreground">{formatBytes(attachment.sizeBytes)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {message.role === 'user' && onEditUserMessage && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border bg-background/80 px-2 py-1 text-xs hover:bg-background"
                      aria-label={`编辑消息 ${message.id}`}
                      onClick={() => onEditUserMessage(message)}
                    >
                      <Pencil aria-hidden="true" size={12} strokeWidth={2.25} />
                      编辑
                    </button>
                  )}
                  {message.role === 'assistant' && message.id === regenerableAssistantMessageId && onRegenerate && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border bg-background/80 px-2 py-1 text-xs hover:bg-background"
                      onClick={() => onRegenerate(message)}
                    >
                      <RefreshCw aria-hidden="true" size={12} strokeWidth={2.25} />
                      重新生成
                    </button>
                  )}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border bg-background/80 px-2 py-1 text-xs hover:bg-background"
                    aria-label={`复制消息 ${message.id}`}
                    onClick={() => {
                      void navigator.clipboard?.writeText(message.text);
                    }}
                  >
                    <Copy aria-hidden="true" size={12} strokeWidth={2.25} />
                    复制
                  </button>
                </div>
              </div>

              {message.role === 'user' && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <User size={16} strokeWidth={2.4} />
                </div>
              )}
            </article>
          );
        })}
      </div>
      <div ref={messagesEndRef} />
    </section>
  );
}
