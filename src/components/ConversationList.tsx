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
    <aside className="conversationList">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">会话</span>
          <h2>历史记录</h2>
        </div>
        <button type="button" className="primaryButton compactButton" onClick={onNew}>
          <MessageSquarePlus aria-hidden="true" size={17} strokeWidth={2.25} />
          新会话
        </button>
      </div>
      <div className="conversationStack" aria-label="会话列表">
        {conversations.length === 0 && (
          <div className="sideEmptyState">
            <p>还没有保存的会话</p>
          </div>
        )}
        {conversations.map((conversation) => (
          <div className="conversationItem" data-active={conversation.id === activeId} key={conversation.id}>
            <button
              type="button"
              className="conversationSelect"
              aria-current={conversation.id === activeId ? 'true' : undefined}
              onClick={() => onSelect(conversation.id)}
            >
              {conversation.title}
            </button>
            <label className="renameField">
              <span className="visuallyHidden">重命名 {conversation.title}</span>
              <Pencil aria-hidden="true" size={14} strokeWidth={2.25} />
              <input
                aria-label={`重命名 ${conversation.title}`}
                value={conversation.title}
                onChange={(event) => onRename(conversation.id, event.target.value)}
              />
            </label>
            <button
              type="button"
              className="iconButton dangerButton"
              aria-label={`删除 ${conversation.title}`}
              onClick={() => onDelete(conversation.id)}
            >
              <Trash2 aria-hidden="true" size={16} strokeWidth={2.25} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
