import { Plus, Trash2, UserCog } from 'lucide-react';
import { nanoid } from 'nanoid';
import type { Persona } from '../domain/types';

interface Props {
  personas: Persona[];
  onChange: (personas: Persona[]) => void;
}

const inputClass = 'tech-control h-10 w-full rounded-full px-3.5 text-sm outline-none';

// Global persona library editor. Personas are reusable system-prompt presets
// that conversations bind to by id (see PersonaSelector). Editing here only
// mutates the library; bound conversations keep their snapshotted prompt until
// re-bound, so changes never silently alter existing conversations.
export default function PersonaManager({ personas, onChange }: Props) {
  function updatePersona(id: string, patch: Partial<Persona>) {
    onChange(personas.map((persona) => (persona.id === id ? { ...persona, ...patch } : persona)));
  }

  function addPersona() {
    onChange([
      ...personas,
      { id: `persona-${nanoid(8)}`, name: `角色 ${personas.length + 1}`, prompt: '' }
    ]);
  }

  function deletePersona(id: string) {
    onChange(personas.filter((persona) => persona.id !== id));
  }

  return (
    <fieldset className="soft-divider-top mt-7 space-y-4 pt-5">
      <legend className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <UserCog aria-hidden="true" size={16} strokeWidth={2.2} className="text-primary" />
        角色预设
      </legend>

      <p className="text-xs leading-5 text-muted-foreground">
        预设是可复用的系统提示词。在对话顶部为当前会话绑定一个角色，模型会以该设定开场。
      </p>

      {personas.length === 0 && (
        <p className="chip rounded-[1rem] px-3 py-2 text-sm text-muted-foreground">
          还没有角色预设，点击下方按钮新建一个。
        </p>
      )}

      <div className="space-y-3">
        {personas.map((persona) => (
          <div key={persona.id} className="tech-control space-y-2 rounded-[1.1rem] p-3">
            <div className="flex items-center gap-2">
              <input
                aria-label={`角色名称 ${persona.id}`}
                className={inputClass}
                value={persona.name}
                placeholder="角色名称"
                onChange={(event) => updatePersona(persona.id, { name: event.target.value })}
              />
              <button
                type="button"
                className="danger-action inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                aria-label={`删除角色 ${persona.name}`}
                onClick={() => deletePersona(persona.id)}
              >
                <Trash2 aria-hidden="true" size={16} strokeWidth={2.25} />
              </button>
            </div>
            <textarea
              aria-label={`角色提示词 ${persona.id}`}
              className="tech-control min-h-[88px] w-full resize-y rounded-[1.1rem] px-3.5 py-2.5 text-sm outline-none"
              value={persona.prompt}
              placeholder="例如：你是一名资深前端工程师，回答简洁、给出可运行示例。"
              onChange={(event) => updatePersona(persona.id, { prompt: event.target.value })}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        className="soft-action inline-flex h-10 w-full items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold"
        onClick={addPersona}
      >
        <Plus aria-hidden="true" size={16} strokeWidth={2.25} />
        新增角色
      </button>
    </fieldset>
  );
}
