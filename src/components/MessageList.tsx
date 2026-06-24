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

function formatMessageTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function MessageList({ messages, onEditUserMessage, onRegenerate }: Props) {
  const terminalMessage = messages[messages.length - 1];
  const regenerableAssistantMessageId = terminalMessage?.role === 'assistant' ? terminalMessage.id : null;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const previousMessagesLengthRef = useRef(messages.length);
  let codeBlockNumber = 0;

  useEffect(() => {
    if (messages.length > previousMessagesLengthRef.current && messagesEndRef.current) {
      if (typeof messagesEndRef.current.scrollIntoView === 'function') {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
    previousMessagesLengthRef.current = messages.length;
  }, [messages]);

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-3 py-6 sm:px-5 lg:px-8 scrollbar-thin" aria-label="消息列表">
      {messages.length === 0 && (
        <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-2 text-center">
          <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-[1.6rem] bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.16),0_18px_46px_hsl(var(--primary)/0.18)]">
            <span className="absolute inset-[-10px] rounded-[2rem] bg-primary/10 blur-xl" aria-hidden="true" />
            <Bot aria-hidden="true" size={31} strokeWidth={2.1} className="relative text-primary" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">开始新的对话</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            输入问题、上传图片或文本文件，当前会话会自动保存在本机。
          </p>
          <div className="mt-5 grid w-full max-w-md grid-cols-3 gap-2 text-xs text-muted-foreground">
            <span className="chip rounded-full px-3 py-2">提问</span>
            <span className="chip rounded-full px-3 py-2">整理文件</span>
            <span className="chip rounded-full px-3 py-2">生成内容</span>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          const imageAttachments = message.attachments.filter(isImageAttachment);
          const textAttachments = message.attachments.filter(isTextAttachment);

          return (
            <article
              key={message.id}
              className={`flex animate-fade-up gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.14),0_10px_24px_hsl(var(--primary)/0.11)]">
                  <Bot size={19} strokeWidth={2.2} className="text-primary" />
                </div>
              )}

              <div className={`min-w-0 max-w-[88%] sm:max-w-[78%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                <div className={`flex items-center gap-2 text-xs text-muted-foreground ${isUser ? 'flex-row-reverse' : ''}`}>
                  <span className="font-medium text-foreground">{isUser ? '你' : '助手'}</span>
                  <span>{formatMessageTime(message.createdAt)}</span>
                </div>

                <div
                  className={`w-full rounded-[1.25rem] px-4 py-3 ${
                    isUser
                      ? 'user-message-bubble'
                      : 'message-bubble assistant-message-bubble'
                  }`}
                >
                  <div className={`markdownBody ${isUser ? '[&_code]:border-white/25 [&_code]:bg-white/[0.12] [&_a]:text-primary-foreground' : ''}`}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                      components={{
                        table({ children }) {
                          return (
                            <div className="tableScroll">
                              <table>{children}</table>
                            </div>
                          );
                        },
                        pre({ children }) {
                          codeBlockNumber += 1;
                          const codeText = textFromNode(children).replace(/\n$/, '');

                          return (
                            <div className="my-3 overflow-hidden rounded-[1rem] bg-zinc-950 text-zinc-50 shadow-[0_16px_44px_rgb(0_0_0_/_0.24),inset_0_0_0_1px_rgb(63_63_70_/_0.82)]">
                              <div className="flex items-center justify-between bg-zinc-900/[0.88] px-3 py-2 shadow-[inset_0_-1px_0_rgb(63_63_70_/_0.7)]">
                                <span className="text-xs font-medium text-zinc-400">代码</span>
                                <button
                                  type="button"
                                  className="inline-flex h-7 items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 text-xs text-zinc-200 shadow-[inset_0_0_0_1px_rgb(113_113_122_/_0.55)] transition hover:bg-zinc-700"
                                  aria-label={`复制代码块 ${codeBlockNumber}`}
                                  onClick={() => {
                                    void navigator.clipboard?.writeText(codeText);
                                  }}
                                >
                                  <Copy aria-hidden="true" size={12} strokeWidth={2.25} />
                                  复制
                                </button>
                              </div>
                              <pre className="overflow-x-auto p-3 text-sm leading-6">{children}</pre>
                            </div>
                          );
                        }
                      }}
                    >
                      {message.text || ' '}
                    </ReactMarkdown>
                  </div>

                  {imageAttachments.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {imageAttachments.map((attachment) => (
                        <img
                          key={attachment.id}
                          src={attachment.previewUrl}
                          alt={attachment.name}
                          className="aspect-square w-full rounded-[0.9rem] object-cover shadow-[inset_0_0_0_1px_hsl(var(--hairline)/0.5),0_10px_24px_hsl(var(--foreground)/0.08)]"
                        />
                      ))}
                    </div>
                  )}

                  {textAttachments.length > 0 && (
                    <div className="mt-3 space-y-2" aria-label="消息文件">
                      {textAttachments.map((attachment) => (
                        <div
                          className={`messageFile flex min-w-0 items-center gap-2 rounded-full px-3 py-2 text-sm shadow-[inset_0_0_0_1px_hsl(var(--hairline)/0.45)] ${
                            isUser ? 'bg-white/[0.14]' : 'bg-muted/[0.52]'
                          }`}
                          key={attachment.id}
                        >
                          <FileText aria-hidden="true" size={16} strokeWidth={2.15} className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate font-medium">{attachment.name}</span>
                          <span className="shrink-0 text-xs opacity-75">{formatBytes(attachment.sizeBytes)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={`flex flex-wrap gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {isUser && onEditUserMessage && (
                    <button
                      type="button"
                      className="soft-action inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
                      aria-label={`编辑消息 ${message.id}`}
                      onClick={() => onEditUserMessage(message)}
                    >
                      <Pencil aria-hidden="true" size={12} strokeWidth={2.25} />
                      编辑
                    </button>
                  )}
                  {!isUser && message.id === regenerableAssistantMessageId && onRegenerate && (
                    <button
                      type="button"
                      className="soft-action inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
                      onClick={() => onRegenerate(message)}
                    >
                      <RefreshCw aria-hidden="true" size={12} strokeWidth={2.25} />
                      重新生成
                    </button>
                  )}
                  <button
                    type="button"
                    className="soft-action inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
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

              {isUser && (
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_12px_28px_hsl(var(--primary)/0.24)]">
                  <User size={18} strokeWidth={2.35} />
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
