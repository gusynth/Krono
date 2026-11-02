import { BookOpen, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
export function HabitExample({
  done,
  onChange,
}: {
  done: boolean;
  onChange: (value: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="habit-example">
      <div className="example-main">
        <span className="example-glyph">
          <BookOpen size={21} strokeWidth={1.6} />
        </span>
        <div className="example-copy">
          <h3>Leitura</h3>
          <p>Ler um capítulo.</p>
          <span>Todos os dias</span>
        </div>
        <button
          className="example-check"
          aria-label={done ? 'Desfazer conclusão do exemplo' : 'Concluir hábito de exemplo'}
          aria-pressed={done}
          onClick={() => onChange(!done)}
        >
          {done ? <Check size={19} strokeWidth={2.5} /> : <span />}
        </button>
      </div>
      <div className="example-bottom">
        <span>{done ? 'Concluído' : 'Pendente'}</span>
        <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          Histórico e consistência <ChevronDown size={15} className={expanded ? 'rotated' : ''} />
        </button>
      </div>
      {expanded && (
        <p className="example-history">
          Nenhuma ocorrência registrada. O histórico ainda não está integrado.
        </p>
      )}
    </article>
  );
}
