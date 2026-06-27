import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  id?: string;
  ariaLabel: string;
  models: string[];
  value: string;
  onChange: (model: string) => void;
  className?: string;
  // Above this count we render the searchable dropdown; below it we keep the
  // native <select> so mobile users get the OS-native picker for short lists.
  searchableThreshold?: number;
}

const DEFAULT_SEARCHABLE_THRESHOLD = 8;

export default function ModelSelector({
  id,
  ariaLabel,
  models,
  value,
  onChange,
  className = '',
  searchableThreshold = DEFAULT_SEARCHABLE_THRESHOLD
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const menuContentRef = useRef<HTMLDivElement | null>(null);

  const useSearchable = models.length >= searchableThreshold;

  const filteredModels = useMemo(() => {
    if (!useSearchable) {
      return models;
    }

    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return models;
    }

    return models.filter((model) => model.toLowerCase().includes(trimmed));
  }, [models, query, useSearchable]);

  // Reset query whenever the menu reopens so the previous filter doesn't
  // linger across sessions, and steal focus from the default first-item focus
  // so users can type a filter immediately.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      const focusTimer = window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(focusTimer);
    }
  }, [isOpen]);

  function focusFirstMenuItem() {
    const content = menuContentRef.current;
    if (!content) {
      return;
    }

    const firstItem = content.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  }

  if (!useSearchable) {
    return (
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`tech-control h-10 rounded-full px-3.5 text-sm outline-none ${className}`}
      >
        {models.map((model) => (
          <option key={model} value={model}>{model}</option>
        ))}
      </select>
    );
  }

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          id={id}
          type="button"
          aria-label={ariaLabel}
          className={`chip inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm outline-none ${className}`}
        >
          <span className="min-w-0 truncate">{value || '未选择模型'}</span>
          <ChevronDown aria-hidden="true" size={14} strokeWidth={2.25} className="shrink-0 opacity-70" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          ref={menuContentRef}
          align="start"
          sideOffset={6}
          className="glass-panel-strong animate-pop-in z-50 max-h-[min(60vh,360px)] w-[min(92vw,320px)] overflow-hidden rounded-[1.1rem] p-2 shadow-[var(--shadow-elevated)]"
        >
          <div className="tech-control mb-2 flex items-center gap-2 rounded-full px-3 py-1.5 text-sm">
            <Search aria-hidden="true" size={14} strokeWidth={2.15} className="shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              aria-label={`搜索${ariaLabel}`}
              placeholder="搜索模型"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Move focus to the first menu item so arrow-key navigation
                // and Enter selection work after typing a filter.
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  focusFirstMenuItem();
                }
                // Enter while the input still has focus picks the first match,
                // matching the common command-palette pattern.
                if (event.key === 'Enter' && filteredModels.length > 0) {
                  event.preventDefault();
                  onChange(filteredModels[0]);
                  setIsOpen(false);
                }
                // Stop typeahead and other Radix shortcuts from swallowing
                // ordinary character input.
                if (event.key.length === 1 || event.key === 'Backspace') {
                  event.stopPropagation();
                }
              }}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </div>

          <div className="scrollbar-thin max-h-[min(50vh,260px)] overflow-y-auto">
            {filteredModels.length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-muted-foreground">未找到匹配模型</p>
            )}
            {filteredModels.map((model) => {
              const isSelected = model === value;

              return (
                <DropdownMenu.Item
                  key={model}
                  onSelect={() => onChange(model)}
                  className={`flex cursor-pointer items-center gap-2 rounded-[0.85rem] px-3 py-2 text-sm outline-none transition data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary ${
                    isSelected ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{model}</span>
                  {isSelected && <Check aria-hidden="true" size={14} strokeWidth={2.25} className="shrink-0" />}
                </DropdownMenu.Item>
              );
            })}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
