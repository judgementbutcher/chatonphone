import { MessageSquare, MessageSquarePlus, Pencil, Trash2 } from 'lucide-react';
import type { Conversation } from '../domain/types';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

function formatConversationDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function ConversationList({ conversations, activeId, onSelect, onNew, onRename, onDelete }: Props) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-border px-4 pb-4 pt-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Conversations</p>
            <h2 className="mt-1 text-lg font-semibold tracking-normal">历史记录</h2>
          </div>
          <button
            type="button"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            onClick={onNew}
          >
            <MessageSquarePlus aria-hidden="true" size={17} strokeWidth={2.25} />
            新会话
          </button>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          {conversations.length > 0 ? `${conversations.length} 个本机会话` : '开始对话后会自动保存到本机。'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-thin" aria-label="会话列表">
        {conversations.length === 0 && (
          <div className="mt-8 rounded-lg border border-dashed border-border bg-muted/35 px-4 py-8 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-border bg-card">
              <MessageSquare aria-hidden="true" size={20} strokeWidth={2.15} className="text-primary" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">暂无会话</p>
          </div>
        )}

        <div className="space-y-2">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeId;

            return (
              <article
                className={`rounded-lg border bg-card transition ${
                  isActive ? 'border-primary/55 shadow-sm ring-2 ring-primary/10' : 'border-transparent hover:border-border hover:bg-muted/35'
                }`}
                key={conversation.id}
              >
                <button
                  type="button"
                  className="block w-full px-3 pb-2.5 pt-3 text-left"
                  aria-label={conversation.title}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => onSelect(conversation.id)}
                >
                  <span className={`block truncate text-sm font-semibold ${isActive ? 'text-primary' : 'text-foreground'}`}>
                    {conversation.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatConversationDate(conversation.updatedAt)}
                  </span>
                </button>

                <div className="flex items-center gap-2 border-t border-border/70 px-2.5 py-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10">
                    <Pencil aria-hidden="true" size={13} strokeWidth={2.15} className="shrink-0 text-muted-foreground" />
                    <input
                      aria-label={`重命名 ${conversation.title}`}
                      value={conversation.title}
                      onChange={(event) => onRename(conversation.id, event.target.value)}
                      className="min-w-0 flex-1 bg-transparent outline-none"
                    />
                  </label>

                  <button
                    type="button"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-destructive/25 bg-destructive/5 text-destructive transition hover:bg-destructive/12"
                    aria-label={`删除 ${conversation.title}`}
                    onClick={() => onDelete(conversation.id)}
                  >
                    <Trash2 aria-hidden="true" size={14} strokeWidth={2.25} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
