import { ArrowDown, Bot, ChevronLeft, ChevronRight, Copy, FileText, Pencil, RefreshCw, User, Quote, Trash2, Save, Volume2, VolumeX, X as XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, FileAttachment, ImageAttachment, TextAttachment } from '../domain/types';
import CodeBlock from './CodeBlock';
import ImageLightbox from './ImageLightbox';

const STICK_TO_BOTTOM_THRESHOLD = 64;

interface Props {
  messages: ChatMessage[];
  onEditUserMessage?: (message: ChatMessage) => void;
  onRegenerate?: (message: ChatMessage) => void;
  isGenerating?: boolean;
  onDeleteMessage?: (id: string) => void;
  onUpdateMessageContent?: (id: string, text: string) => void;
  onQuoteMessage?: (text: string) => void;
  onRegenerateFromMessage?: (message: ChatMessage) => void;
  onSwitchVersion?: (messageId: string, versionIndex: number) => void;
  onOpenSettings?: () => void;
  onUsePrompt?: (text: string) => void;
  hasProviders?: boolean;
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

const STARTER_PROMPTS = [
  {
    title: '解释这段代码',
    prompt: '请帮我解释下面这段代码做了什么：\n\n```\n\n```'
  },
  {
    title: '翻译成英文',
    prompt: '请把下面这段文字翻译成自然的英文：\n\n'
  },
  {
    title: '总结要点',
    prompt: '请用三句话总结下面这段内容的要点：\n\n'
  },
  {
    title: '头脑风暴',
    prompt: '请围绕这个主题给我 5 个角度的灵感：'
  }
];

export default function MessageList({
  messages,
  onEditUserMessage,
  onRegenerate,
  isGenerating,
  onDeleteMessage,
  onUpdateMessageContent,
  onQuoteMessage,
  onRegenerateFromMessage,
  onSwitchVersion,
  onOpenSettings,
  onUsePrompt,
  hasProviders = true
}: Props) {
  const terminalMessage = messages[messages.length - 1];
  const regenerableAssistantMessageId = terminalMessage?.role === 'assistant' ? terminalMessage.id : null;
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [isStuckToBottom, setIsStuckToBottom] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [longPressMessageId, setLongPressMessageId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<Array<{ src: string; alt: string }>>([]);
  const [lightboxInitialIndex, setLightboxInitialIndex] = useState(0);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const lastMessageTextLength = terminalMessage?.text.length ?? 0;
  let codeBlockNumber = 0;

  // Text-to-speech via the Web Speech API. Feature-detected so the control
  // only appears where the browser supports it (and never in jsdom tests).
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  function handleToggleSpeak(message: ChatMessage) {
    if (!speechSupported) {
      return;
    }

    // Speaking the same message again stops it (toggle); speaking a different
    // one cancels the in-flight utterance first so they never overlap.
    window.speechSynthesis.cancel();

    if (speakingMessageId === message.id) {
      setSpeakingMessageId(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(message.text);
    utterance.onend = () => setSpeakingMessageId((current) => (current === message.id ? null : current));
    utterance.onerror = () => setSpeakingMessageId((current) => (current === message.id ? null : current));
    setSpeakingMessageId(message.id);
    window.speechSynthesis.speak(utterance);
  }

  // Stop any in-flight speech when the list unmounts so it doesn't keep
  // reading after the user navigates away.
  useEffect(() => {
    return () => {
      if (speechSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speechSupported]);

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    const container = scrollContainerRef.current;

    if (container && typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior });
      return;
    }

    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  }

  function handleScroll() {
    const container = scrollContainerRef.current;

    if (!container) {
      return;
    }

    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
    const stuck = distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD;

    stickToBottomRef.current = stuck;
    setIsStuckToBottom((current) => (current === stuck ? current : stuck));
  }

  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollToBottom(messages.length <= 1 ? 'auto' : 'smooth');
    }
  }, [messages.length, lastMessageTextLength, isGenerating]);

  function handleJumpToBottom() {
    stickToBottomRef.current = true;
    setIsStuckToBottom(true);
    scrollToBottom('smooth');
  }

  function handleEditStart(message: ChatMessage) {
    setEditingMessageId(message.id);
    setEditDraft(message.text);
  }

  function handleEditSave(messageId: string) {
    if (onUpdateMessageContent && editDraft.trim()) {
      onUpdateMessageContent(messageId, editDraft.trim());
    }
    setEditingMessageId(null);
    setEditDraft('');
  }

  function handleEditCancel() {
    setEditingMessageId(null);
    setEditDraft('');
  }

  function handleLongPressStart(messageId: string) {
    longPressTimerRef.current = setTimeout(() => {
      setLongPressMessageId(messageId);
    }, 500);
  }

  function handleLongPressEnd() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleImageClick(images: ImageAttachment[], clickedIndex: number) {
    setLightboxImages(images.map((img) => ({ src: img.previewUrl, alt: img.name })));
    setLightboxInitialIndex(clickedIndex);
    setLightboxOpen(true);
  }

  // Long-press surfaces the toolbar on touch devices. Desktop hover is handled
  // purely in CSS (group-hover) so it never triggers a React re-render — which
  // previously detached buttons mid-interaction and dropped clicks.
  const isLongPressed = (messageId: string) => longPressMessageId === messageId;

  return (
    <div className="relative min-h-0 flex-1">
      <section
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full min-h-0 overflow-y-auto px-3 py-6 sm:px-5 lg:px-8 scrollbar-thin"
        role="log"
        aria-label="消息列表"
      >
        {messages.length === 0 && (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-2 text-center">
            {!hasProviders ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)]">
                  <Bot aria-hidden="true" size={26} strokeWidth={2.1} className="text-primary" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold">还没配置 API</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  请先在设置中配置 API 密钥和模型，然后就可以开始对话了。
                </p>
                {onOpenSettings && (
                  <button
                    type="button"
                    className="primary-action mt-6 inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
                    onClick={onOpenSettings}
                  >
                    打开设置
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)]">
                  <Bot aria-hidden="true" size={26} strokeWidth={2.1} className="text-primary" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold">开始新的对话</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  输入问题、上传图片或文本文件，当前会话会自动保存在本机。
                </p>
                {onUsePrompt && (
                  <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
                    {STARTER_PROMPTS.map((prompt, index) => (
                      <button
                        key={index}
                        type="button"
                        className="glass-panel soft-action flex flex-col items-start gap-2 rounded-[1.1rem] p-4 text-left transition hover:scale-[1.02]"
                        onClick={() => onUsePrompt(prompt.prompt)}
                      >
                        <span className="text-sm font-semibold text-foreground">{prompt.title}</span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {prompt.prompt.split('\n')[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          {messages.map((message, messageIndex) => {
            const isUser = message.role === 'user';
            const imageAttachments = message.attachments.filter(isImageAttachment);
            const textAttachments = message.attachments.filter(isTextAttachment);
            const isEditing = editingMessageId === message.id;
            const isLastMessage = messageIndex === messages.length - 1;
            const isStreamingThisMessage = isGenerating && !isUser && isLastMessage;

            return (
              <article
                key={message.id}
                className={`group flex animate-fade-up gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                onTouchStart={() => handleLongPressStart(message.id)}
                onTouchEnd={handleLongPressEnd}
                onTouchMove={handleLongPressEnd}
                aria-live={isStreamingThisMessage ? 'polite' : undefined}
                aria-busy={isStreamingThisMessage}
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

                  {isEditing ? (
                    <div className="w-full space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className="tech-control min-h-[100px] w-full resize-y rounded-[1.1rem] px-4 py-3 text-sm outline-none"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="soft-action inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
                          onClick={() => handleEditSave(message.id)}
                        >
                          <Save aria-hidden="true" size={12} strokeWidth={2.25} />
                          保存
                        </button>
                        <button
                          type="button"
                          className="soft-action inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
                          onClick={handleEditCancel}
                        >
                          <XIcon aria-hidden="true" size={12} strokeWidth={2.25} />
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`relative w-full rounded-2xl px-4 py-3 ${
                          isUser
                            ? 'user-message-bubble'
                            : 'message-bubble assistant-message-bubble'
                        }`}
                      >
                        {!isUser && message.text.trim() === '' && isGenerating && isLastMessage ? (
                          <div className="flex items-center gap-3">
                            {isStreamingThisMessage && <span className="sr-only">AI 正在生成回复</span>}
                            <div className="loadingSpinner">
                              <div></div>
                              <div></div>
                              <div></div>
                            </div>
                            <span className="text-sm text-muted-foreground">正在思考...</span>
                          </div>
                        ) : (
                          <div className={`markdownBody ${isStreamingThisMessage ? 'typing-caret' : ''} ${isUser ? '[&_code]:border-primary/25 [&_code]:bg-primary/[0.12] [&_a]:text-primary' : ''}`}>
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
                                  return <CodeBlock blockNumber={codeBlockNumber}>{children}</CodeBlock>;
                                }
                              }}
                            >
                              {message.text || ' '}
                            </ReactMarkdown>
                          </div>
                        )}

                        {imageAttachments.length > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {imageAttachments.map((attachment, index) => (
                              <button
                                key={attachment.id}
                                type="button"
                                onClick={() => handleImageClick(imageAttachments, index)}
                                className="group relative overflow-hidden rounded-[0.9rem] shadow-[inset_0_0_0_1px_hsl(var(--hairline)/0.5),0_10px_24px_hsl(var(--foreground)/0.08)] transition hover:scale-[1.02]"
                              >
                                <img
                                  src={attachment.previewUrl}
                                  alt={attachment.name}
                                  className="max-h-72 w-auto object-contain"
                                />
                              </button>
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

                        {!isEditing && (
                          <div
                            className={`absolute bottom-full z-10 mb-1 flex gap-1 rounded-full border border-hairline/40 bg-background/95 p-1 shadow-lg backdrop-blur-sm transition-opacity duration-200 focus-within:opacity-100 focus-within:pointer-events-auto group-hover:opacity-100 group-hover:pointer-events-auto ${
                              isUser ? 'left-1' : 'right-1'
                            } ${
                              longPressMessageId === message.id ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                            }`}
                          >
                            {onQuoteMessage && (
                              <button
                                type="button"
                                className="soft-action inline-flex h-7 w-7 items-center justify-center rounded-full text-xs"
                                aria-label="引用消息"
                                onClick={() => onQuoteMessage(message.text)}
                              >
                                <Quote aria-hidden="true" size={14} strokeWidth={2.25} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="soft-action inline-flex h-7 w-7 items-center justify-center rounded-full text-xs"
                              aria-label={`复制消息 ${message.id}`}
                              onClick={() => {
                                void navigator.clipboard?.writeText(message.text);
                              }}
                            >
                              <Copy aria-hidden="true" size={14} strokeWidth={2.25} />
                            </button>
                            {onUpdateMessageContent && (
                              <button
                                type="button"
                                className="soft-action inline-flex h-7 w-7 items-center justify-center rounded-full text-xs"
                                aria-label="编辑消息"
                                onClick={() => handleEditStart(message)}
                              >
                                <Pencil aria-hidden="true" size={14} strokeWidth={2.25} />
                              </button>
                            )}
                            {onDeleteMessage && (
                              <button
                                type="button"
                                className="danger-action inline-flex h-7 w-7 items-center justify-center rounded-full text-xs"
                                aria-label="删除消息"
                                onClick={() => {
                                  if (window.confirm('确定要删除这条消息吗？')) {
                                    onDeleteMessage(message.id);
                                  }
                                }}
                              >
                                <Trash2 aria-hidden="true" size={14} strokeWidth={2.25} />
                              </button>
                            )}
                            {!isUser && onRegenerateFromMessage && (
                              <button
                                type="button"
                                className="soft-action inline-flex h-7 w-7 items-center justify-center rounded-full text-xs"
                                aria-label="重新生成"
                                onClick={() => onRegenerateFromMessage(message)}
                              >
                                <RefreshCw aria-hidden="true" size={14} strokeWidth={2.25} />
                              </button>
                            )}
                            {!isUser && speechSupported && message.text.trim() && (
                              <button
                                type="button"
                                className="soft-action inline-flex h-7 w-7 items-center justify-center rounded-full text-xs"
                                aria-label={speakingMessageId === message.id ? '停止朗读' : '朗读消息'}
                                onClick={() => handleToggleSpeak(message)}
                              >
                                {speakingMessageId === message.id ? (
                                  <VolumeX aria-hidden="true" size={14} strokeWidth={2.25} />
                                ) : (
                                  <Volume2 aria-hidden="true" size={14} strokeWidth={2.25} />
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className={`flex flex-wrap items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                        {!isUser && onSwitchVersion && message.versions && message.versions.length > 1 && (() => {
                          const versionCount = message.versions.length;
                          const activeIndex = message.activeVersionIndex ?? versionCount - 1;

                          return (
                            <div className="chip inline-flex h-8 items-center gap-1 rounded-full px-1.5 text-xs font-medium" aria-label="回答版本切换">
                              <button
                                type="button"
                                className="soft-action inline-flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-40"
                                aria-label="上一个版本"
                                disabled={activeIndex <= 0 || isGenerating}
                                onClick={() => onSwitchVersion(message.id, activeIndex - 1)}
                              >
                                <ChevronLeft aria-hidden="true" size={13} strokeWidth={2.4} />
                              </button>
                              <span className="min-w-[2.5rem] text-center tabular-nums text-muted-foreground" aria-live="polite">
                                {activeIndex + 1} / {versionCount}
                              </span>
                              <button
                                type="button"
                                className="soft-action inline-flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-40"
                                aria-label="下一个版本"
                                disabled={activeIndex >= versionCount - 1 || isGenerating}
                                onClick={() => onSwitchVersion(message.id, activeIndex + 1)}
                              >
                                <ChevronRight aria-hidden="true" size={13} strokeWidth={2.4} />
                              </button>
                            </div>
                          );
                        })()}
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
                      </div>
                    </>
                  )}
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

      {!isStuckToBottom && messages.length > 0 && (
        <button
          type="button"
          onClick={handleJumpToBottom}
          className="soft-action absolute bottom-3 left-1/2 z-10 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
          aria-label="跳转到最新消息"
        >
          <ArrowDown aria-hidden="true" size={14} strokeWidth={2.25} />
          新消息
        </button>
      )}

      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={lightboxImages}
        initialIndex={lightboxInitialIndex}
      />
    </div>
  );
}
