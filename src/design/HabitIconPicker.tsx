import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  BookOpen,
  NotebookPen,
  Dumbbell,
  Footprints,
  Bike,
  Code2,
  Music,
  Languages,
  Paintbrush,
  Coffee,
  Droplets,
  Moon,
  Heart,
  Timer,
  Target,
  Sprout,
} from 'lucide-react';
import type { HabitIconId } from '../../shared/contracts/habit-icon';

export const habitIcons = [
  { id: 'book', label: 'Leitura', icon: BookOpen },
  { id: 'notebook', label: 'Estudo', icon: NotebookPen },
  { id: 'dumbbell', label: 'Treino', icon: Dumbbell },
  { id: 'walk', label: 'Caminhada', icon: Footprints },
  { id: 'bike', label: 'Bicicleta', icon: Bike },
  { id: 'code', label: 'Programação', icon: Code2 },
  { id: 'music', label: 'Música', icon: Music },
  { id: 'languages', label: 'Idiomas', icon: Languages },
  { id: 'brush', label: 'Arte', icon: Paintbrush },
  { id: 'coffee', label: 'Café', icon: Coffee },
  { id: 'water', label: 'Água', icon: Droplets },
  { id: 'moon', label: 'Sono', icon: Moon },
  { id: 'heart', label: 'Saúde', icon: Heart },
  { id: 'timer', label: 'Tempo', icon: Timer },
  { id: 'target', label: 'Objetivo', icon: Target },
  { id: 'leaf', label: 'Natureza', icon: Sprout },
] satisfies { id: HabitIconId; label: string; icon: typeof BookOpen }[];
export function HabitGlyph({ value, kind }: { value?: HabitIconId; kind: 'action' | 'time' }) {
  const Icon = habitIcons.find(
    (item) => item.id === (value ?? (kind === 'time' ? 'timer' : 'book')),
  )!.icon;
  return <Icon size={20} aria-hidden="true" />;
}
export function HabitIconPicker({
  value,
  onChange,
  disabled,
}: {
  value: HabitIconId;
  onChange: (value: HabitIconId) => void;
  disabled: boolean;
}) {
  const id = useId(),
    anchor = `--icon-${id.replace(/\W/g, '')}`,
    popup = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    if (open) popup.current?.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus();
  }, [open]);
  function keyboard(event: KeyboardEvent) {
    const buttons = Array.from(
        popup.current?.querySelectorAll<HTMLButtonElement>('[data-icon]') ?? [],
      ),
      index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % buttons.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + buttons.length) % buttons.length
          : event.key === 'ArrowDown'
            ? (index + 4) % buttons.length
            : event.key === 'ArrowUp'
              ? (index - 4 + buttons.length) % buttons.length
              : event.key === 'Home'
                ? index - (index % 4)
                : event.key === 'End'
                  ? index - (index % 4) + 3
                  : null;
    if (next !== null) {
      event.preventDefault();
      buttons[next]?.focus();
    }
  }
  return (
    <div className="habit-icon-field">
      <span>Ícone</span>
      <button
        ref={trigger}
        type="button"
        className="icon-picker-trigger"
        popoverTarget={id}
        disabled={disabled}
        aria-label="Escolher ícone do hábito"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        style={{ anchorName: anchor }}
      >
        <HabitGlyph value={value} kind="action" />
        <span>{habitIcons.find((item) => item.id === value)!.label}</span>
      </button>
      <div
        id={id}
        ref={popup}
        popover="auto"
        role="dialog"
        aria-label="Ícone do hábito"
        className="icon-popover"
        style={{ positionAnchor: anchor }}
        onToggle={(event) => setOpen((event.nativeEvent as ToggleEvent).newState === 'open')}
        onKeyDown={keyboard}
      >
        {open && (
          <>
            <h3>Ícone do hábito</h3>
            <div className="icon-picker-grid">
              {habitIcons.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  data-icon={id}
                  aria-label={label}
                  title={label}
                  aria-pressed={value === id}
                  onClick={() => {
                    if (!disabled) {
                      onChange(id);
                      popup.current?.hidePopover();
                      trigger.current?.focus();
                    }
                  }}
                >
                  <Icon size={21} aria-hidden="true" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
