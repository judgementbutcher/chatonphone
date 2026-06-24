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
      <div className="soft-divider-bottom px-4 pb-4 pt-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">Conversations</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">历史记录</h2>
          </div>
          <button
            type="button"
            className="primary-action inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-semibold"
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
          <div className="glass-panel mt-8 rounded-[1.3rem] px-4 py-8 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.16)]">
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
                className={`group overflow-hidden rounded-[1.15rem] transition duration-200 ${
                  isActive
                    ? 'bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.28),0_14px_36px_hsl(var(--primary)/0.12)]'
                    : 'bg-card/[0.22] hover:bg-card/[0.56] hover:shadow-[inset_0_0_0_1px_hsl(var(--hairline)/0.42),0_12px_30px_hsl(var(--foreground)/0.055)]'
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

                <div className="soft-divider-top flex items-center gap-2 px-2.5 py-2 opacity-80 transition group-hover:opacity-100">
                  <label className="tech-control flex min-w-0 flex-1 items-center gap-2 rounded-full px-2.5 py-1.5 text-xs">
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
                    className="danger-action inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
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
