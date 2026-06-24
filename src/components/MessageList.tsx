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
    <section className="messageList" aria-label="消息列表">
      {messages.length === 0 && (
        <div className="emptyState">
          <div className="emptyMark">
            <Bot aria-hidden="true" size={28} strokeWidth={2.15} />
          </div>
          <h2>开始新的对话</h2>
          <p>输入文字或添加文件。</p>
        </div>
      )}
      {messages.map((message) => {
        const imageAttachments = message.attachments.filter(isImageAttachment);
        const textAttachments = message.attachments.filter(isTextAttachment);

        return (
          <article key={message.id} className={`message message-${message.role}`}>
            <div className="messageAvatar" aria-hidden="true">
              {message.role === 'user' ? <User size={15} strokeWidth={2.4} /> : <Bot size={16} strokeWidth={2.3} />}
            </div>
            <div className="messageBubble">
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
                      <div className="codeBlock">
                        <button
                          type="button"
                          className="codeCopyButton"
                          aria-label={`复制代码块 ${codeBlockNumber}`}
                          onClick={() => {
                            void navigator.clipboard?.writeText(codeText);
                          }}
                        >
                          <Copy aria-hidden="true" size={14} strokeWidth={2.25} />
                          复制代码
                        </button>
                        <pre>{children}</pre>
                      </div>
                    );
                  }
                }}
              >
                {message.text || ' '}
              </ReactMarkdown>
              {imageAttachments.length > 0 && (
                <div className="messageImages">
                  {imageAttachments.map((attachment) => (
                    <img key={attachment.id} src={attachment.previewUrl} alt={attachment.name} />
                  ))}
                </div>
              )}
              {textAttachments.length > 0 && (
                <div className="messageFiles" aria-label="消息文件">
                  {textAttachments.map((attachment) => (
                    <div className="messageFile" key={attachment.id}>
                      <FileText aria-hidden="true" size={18} strokeWidth={2.15} />
                      <span className="messageFileName">{attachment.name}</span>
                      <span className="messageFileSize">{formatBytes(attachment.sizeBytes)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="messageActions">
                {message.role === 'user' && onEditUserMessage && (
                  <button
                    type="button"
                    className="ghostButton"
                    aria-label={`编辑消息 ${message.id}`}
                    onClick={() => onEditUserMessage(message)}
                  >
                    <Pencil aria-hidden="true" size={14} strokeWidth={2.25} />
                    编辑
                  </button>
                )}
                {message.role === 'assistant' && message.id === regenerableAssistantMessageId && onRegenerate && (
                  <button type="button" className="ghostButton" onClick={() => onRegenerate(message)}>
                    <RefreshCw aria-hidden="true" size={14} strokeWidth={2.25} />
                    重新生成
                  </button>
                )}
                <button
                  type="button"
                  className="ghostButton"
                  aria-label={`复制消息 ${message.id}`}
                  onClick={() => {
                    void navigator.clipboard?.writeText(message.text);
                  }}
                >
                  <Copy aria-hidden="true" size={14} strokeWidth={2.25} />
                  复制
                </button>
              </div>
            </div>
          </article>
        );
      })}
      <div ref={messagesEndRef} />
    </section>
  );
}
