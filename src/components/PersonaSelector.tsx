import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, UserCog } from 'lucide-react';
import { useState } from 'react';
import type { Persona } from '../domain/types';

interface Props {
  personas: Persona[];
  selectedPersonaId: string | undefined;
  onChange: (personaId: string | undefined, prompt: string | undefined) => void;
  disabled?: boolean;
}

// Per-conversation persona binding. Selecting a preset snapshots its prompt onto
// the conversation so the model acts as that character; editing/deleting the
// global preset never silently changes existing conversations. "无" unbinds.
export default function PersonaSelector({ personas, selectedPersonaId, onChange, disabled = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedPersona = personas.find((persona) => persona.id === selectedPersonaId);
  const displayLabel = selectedPersona?.name ?? '无角色';

  function handleSelect(personaId: string | undefined) {
    const persona = personas.find((p) => p.id === personaId);
    onChange(personaId, persona?.prompt);
    setIsOpen(false);
  }

  if (personas.length === 0) {
    return (
      <div className="chip inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground">
        <UserCog aria-hidden="true" size={14} strokeWidth={2.15} />
        <span>无角色</span>
      </div>
    );
  }

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="chip inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium outline-none disabled:opacity-50"
          aria-label="选择角色"
        >
          <UserCog aria-hidden="true" size={14} strokeWidth={2.15} />
          <span className="min-w-0 truncate">{displayLabel}</span>
          <ChevronDown aria-hidden="true" size={12} strokeWidth={2.25} className="shrink-0 opacity-70" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="glass-panel-strong animate-pop-in z-50 max-h-[min(60vh,240px)] w-[min(92vw,200px)] overflow-hidden rounded-[1.1rem] p-2 shadow-[var(--shadow-elevated)]"
        >
          <div className="scrollbar-thin max-h-[min(50vh,200px)] overflow-y-auto">
            <DropdownMenu.Item
              onSelect={() => handleSelect(undefined)}
              className={`flex cursor-pointer items-center gap-2 rounded-[0.85rem] px-3 py-2 text-sm outline-none transition data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary ${
                !selectedPersonaId ? 'text-primary' : 'text-foreground'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">无角色</span>
              {!selectedPersonaId && <Check aria-hidden="true" size={14} strokeWidth={2.25} className="shrink-0" />}
            </DropdownMenu.Item>

            {personas.map((persona) => {
              const isSelected = persona.id === selectedPersonaId;

              return (
                <DropdownMenu.Item
                  key={persona.id}
                  onSelect={() => handleSelect(persona.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-[0.85rem] px-3 py-2 text-sm outline-none transition data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary ${
                    isSelected ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{persona.name}</span>
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
