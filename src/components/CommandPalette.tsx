import * as Dialog from '@radix-ui/react-dialog';
import { Search, Plus, MessageSquare, Settings, Trash2, Download } from 'lucide-react';
import { useMemo, useState, useRef, useEffect } from 'react';
import type { Conversation, ProviderSettings } from '../domain/types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: Conversation[];
  activeConversationId: string;
  providers: ProviderSettings[];
  activeProviderId?: string;
  selectedModel: string;
  onCommand: (command: Command) => void;
}

export type Command =
  | { type: 'new' }
  | { type: 'jump-conversation'; payload: string }
  | { type: 'switch-model'; payload: string }
  | { type: 'open-settings' }
  | { type: 'clear-current' }
  | { type: 'export-current' };

interface CommandItem {
  id: string;
  label: string;
  command: Command;
  keywords: string[];
  // When present, a snippet of matched message text shown under the label.
  // Set only for full-text message hits so title/model matches stay compact.
  excerpt?: string;
}

// Build a one-line excerpt around the first occurrence of the query within a
// message body, with ellipses so the matched term stays visible in context.
function buildExcerpt(text: string, query: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const matchIndex = flat.toLowerCase().indexOf(query.toLowerCase());

  if (matchIndex === -1) {
    return flat.slice(0, 80);
  }

  const start = Math.max(0, matchIndex - 24);
  const end = Math.min(flat.length, matchIndex + query.length + 56);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < flat.length ? '…' : '';

  return `${prefix}${flat.slice(start, end)}${suffix}`;
}

function fuzzyMatch(query: string, target: string): { matches: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t.includes(q)) {
    const index = t.indexOf(q);
    return { matches: true, score: 100 - index };
  }

  let queryIndex = 0;
  let targetIndex = 0;
  let lastMatchIndex = -1;

  while (queryIndex < q.length && targetIndex < t.length) {
    if (q[queryIndex] === t[targetIndex]) {
      lastMatchIndex = targetIndex;
      queryIndex++;
    }
    targetIndex++;
  }

  if (queryIndex === q.length) {
    return { matches: true, score: 50 - (targetIndex - queryIndex) };
  }

  return { matches: false, score: 0 };
}

export default function CommandPalette({
  open,
  onOpenChange,
  conversations,
  activeConversationId,
  providers,
  activeProviderId,
  selectedModel,
  onCommand
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  const mode = useMemo(() => {
    if (query.startsWith('>')) {
      return 'command';
    }
    if (query.startsWith('#')) {
      return 'conversation';
    }
    return 'all';
  }, [query]);

  const searchQuery = useMemo(() => {
    if (mode === 'command') {
      return query.slice(1).trim();
    }
    if (mode === 'conversation') {
      return query.slice(1).trim();
    }
    return query.trim();
  }, [query, mode]);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: 'new',
        label: '新建会话',
        command: { type: 'new' },
        keywords: ['新建', '会话', 'new', 'conversation']
      },
      {
        id: 'settings',
        label: '打开设置',
        command: { type: 'open-settings' },
        keywords: ['设置', 'settings', '打开']
      },
      {
        id: 'clear',
        label: '清空当前会话',
        command: { type: 'clear-current' },
        keywords: ['清空', '删除', 'clear', 'delete']
      },
      {
        id: 'export',
        label: '导出当前会话为 JSON',
        command: { type: 'export-current' },
        keywords: ['导出', 'export', 'json']
      }
    ];

    if (mode !== 'command') {
      conversations.forEach((conv) => {
        items.push({
          id: `conv-${conv.id}`,
          label: `切换至会话：${conv.title}`,
          command: { type: 'jump-conversation', payload: conv.id },
          keywords: [conv.title, '会话', 'conversation']
        });
      });

      const activeProvider = providers.find((p) => p.id === activeProviderId);
      if (activeProvider) {
        activeProvider.models.forEach((model) => {
          items.push({
            id: `model-${model}`,
            label: `切换模型：${model}`,
            command: { type: 'switch-model', payload: model },
            keywords: [model, '模型', 'model']
          });
        });
      }
    }

    return items;
  }, [conversations, providers, activeProviderId, mode]);

  const filteredCommands = useMemo(() => {
    if (!searchQuery) {
      return commands;
    }

    const matched = commands
      .map((cmd) => {
        const labelMatch = fuzzyMatch(searchQuery, cmd.label);
        const keywordMatches = cmd.keywords.map((kw) => fuzzyMatch(searchQuery, kw));
        const bestKeywordMatch = keywordMatches.reduce(
          (best, current) => (current.score > best.score ? current : best),
          { matches: false, score: 0 }
        );

        const matches = labelMatch.matches || bestKeywordMatch.matches;
        const score = Math.max(labelMatch.score, bestKeywordMatch.score);

        return { cmd, matches, score };
      })
      .filter((item) => item.matches)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.cmd);

    // Full-text search over message bodies. Skipped in command mode (which only
    // surfaces actions) and for single-character queries to avoid noise. A
    // conversation already matched by title is excluded so it shows only once.
    if (mode === 'command' || searchQuery.length < 2) {
      return matched;
    }

    const titleMatchedConversationIds = new Set(
      matched
        .filter((item) => item.command.type === 'jump-conversation')
        .map((item) => (item.command as Extract<Command, { type: 'jump-conversation' }>).payload)
    );

    const needle = searchQuery.toLowerCase();
    const messageHits: CommandItem[] = [];

    for (const conv of conversations) {
      if (titleMatchedConversationIds.has(conv.id)) {
        continue;
      }

      const hit = conv.messages.find((message) => message.text.toLowerCase().includes(needle));

      if (hit) {
        messageHits.push({
          id: `msg-${conv.id}`,
          label: `${conv.title}`,
          command: { type: 'jump-conversation', payload: conv.id },
          keywords: [],
          excerpt: buildExcerpt(hit.text, searchQuery)
        });
      }
    }

    return [...matched, ...messageHits];
  }, [commands, searchQuery, mode, conversations]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        onCommand(selected.command);
        onOpenChange(false);
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-[100] bg-foreground/40 backdrop-blur-sm" />
        <Dialog.Content
          className="glass-panel-strong animate-dialog-in fixed left-1/2 top-[20vh] z-[101] max-h-[60vh] w-[min(92vw,480px)] -translate-x-1/2 overflow-hidden rounded-[1.2rem] p-0 shadow-[var(--shadow-elevated)]"
          onKeyDown={handleKeyDown}
        >
          <div className="tech-control flex items-center gap-2 border-0 border-b border-hairline/50 px-4 py-3">
            <Search aria-hidden="true" size={16} strokeWidth={2.15} className="shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              aria-label="命令搜索"
              placeholder="搜索命令、会话或模型..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="scrollbar-thin max-h-[calc(60vh-4rem)] overflow-y-auto p-2">
            {filteredCommands.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">未找到匹配的命令</p>
            )}
            {filteredCommands.map((cmd, index) => {
              const isSelected = index === selectedIndex;
              const Icon = getCommandIcon(cmd.command);

              return (
                <button
                  key={cmd.id}
                  type="button"
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-[0.9rem] px-3 py-2.5 text-left text-sm outline-none transition ${
                    isSelected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/30'
                  }`}
                  onClick={() => {
                    onCommand(cmd.command);
                    onOpenChange(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Icon aria-hidden="true" size={16} strokeWidth={2.15} className="mt-0.5 shrink-0 self-start" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="min-w-0 truncate">{cmd.label}</span>
                    {cmd.excerpt && (
                      <span className="min-w-0 truncate text-xs text-muted-foreground">{cmd.excerpt}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function getCommandIcon(command: Command) {
  switch (command.type) {
    case 'new':
      return Plus;
    case 'jump-conversation':
      return MessageSquare;
    case 'switch-model':
      return MessageSquare;
    case 'open-settings':
      return Settings;
    case 'clear-current':
      return Trash2;
    case 'export-current':
      return Download;
    default:
      return MessageSquare;
  }
}
