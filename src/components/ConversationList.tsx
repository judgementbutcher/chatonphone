import { MessageSquarePlus, Pencil, Trash2 } from 'lucide-react';
import type { Conversation } from '../domain/types';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export default function ConversationList({ conversations, activeId, onSelect, onNew, onRename, onDelete }: Props) {
  return (
    <aside className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold uppercase text-muted-foreground">会话</span>
          <h2 className="text-xl font-bold">历史记录</h2>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={onNew}
        >
          <MessageSquarePlus aria-hidden="true" size={16} strokeWidth={2.25} />
          新会话
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto" aria-label="会话列表">
        {conversations.length === 0 && (
          <div className="flex min-h-[150px] items-center justify-center rounded-lg border border-dashed bg-muted/50 p-8 text-center">
            <p className="text-sm text-muted-foreground">还没有保存的会话</p>
          </div>
        )}

        {conversations.map((conversation) => (
          <div
            className={`group rounded-lg border bg-card p-3 transition-all hover:shadow-md ${
              conversation.id === activeId ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''
            }`}
            key={conversation.id}
          >
            <button
              type="button"
              className="mb-2 w-full truncate text-left font-medium transition-colors hover:text-primary"
              aria-current={conversation.id === activeId ? 'true' : undefined}
              onClick={() => onSelect(conversation.id)}
            >
              {conversation.title}
            </button>

            <div className="flex items-center gap-2">
              <label className="flex flex-1 items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs">
                <Pencil aria-hidden="true" size={12} strokeWidth={2.25} className="text-muted-foreground" />
                <input
                  aria-label={`重命名 ${conversation.title}`}
                  value={conversation.title}
                  onChange={(event) => onRename(conversation.id, event.target.value)}
                  className="flex-1 bg-transparent outline-none"
                />
              </label>

              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                aria-label={`删除 ${conversation.title}`}
                onClick={() => onDelete(conversation.id)}
              >
                <Trash2 aria-hidden="true" size={14} strokeWidth={2.25} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
