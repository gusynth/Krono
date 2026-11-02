import { useEffect, useRef, useState } from 'react';
import { Sprout } from 'lucide-react';
import { desktopSnapshotSchema } from '../../../shared/contracts/desktop';
import { timerSnapshotSchema } from '../../../shared/contracts/timer';
import { needsGardenInvitation } from '../../../shared/domain/garden-invitation';
import { AppDialog } from '../../design/AppDialog';
import { useDesktop } from '../settings/useDesktop';

export function GardenInvitation({
  ready,
  available,
  visible,
  onEnabled,
}: {
  ready: boolean;
  available: boolean;
  visible: boolean;
  onEnabled: () => void;
}) {
  const desktop = useDesktop();
  const [resolved, setResolved] = useState(false);
  const eligible =
    !resolved && Boolean(desktop.value && needsGardenInvitation(desktop.value.preferences));
  const [timerSafe, setTimerSafe] = useState(false);
  const [otherDialog, setOtherDialog] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    const api = window.krono?.timer;
    if (!eligible || !ready || !api) return;
    let alive = true;
    let lastRevision = -1;
    const accept = (input: unknown) => {
      try {
        const value = timerSnapshotSchema.parse(input);
        if (!alive || value.revision < lastRevision) return;
        lastRevision = value.revision;
        setTimerSafe(value.state === 'idle' || value.state === 'awaiting-next');
      } catch {
        if (alive) setTimerSafe(false);
      }
    };
    const off = api.subscribe(accept);
    void api
      .read()
      .then(accept)
      .catch(() => {
        if (alive) setTimerSafe(false);
      });
    return () => {
      alive = false;
      off();
    };
  }, [eligible, ready]);

  useEffect(() => {
    if (!eligible) return;
    const inspect = () =>
      setOtherDialog(Boolean(document.querySelector('dialog[open]:not(.garden-invitation)')));
    const observer = new MutationObserver((changes) => {
      if (
        changes.some(
          (change) =>
            change.type === 'attributes' ||
            [...change.addedNodes, ...change.removedNodes].some(
              (node) =>
                node instanceof Element && (node.matches('dialog') || node.querySelector('dialog')),
            ),
        )
      )
        inspect();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    inspect();
    return () => observer.disconnect();
  }, [eligible]);

  async function choose(enabled: boolean) {
    const api = window.krono?.desktop;
    if (!api || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const current = desktopSnapshotSchema.parse(await api.read());
      // Outra janela/restauração pode ter registrado uma escolha enquanto o convite estava aberto.
      if (!needsGardenInvitation(current.preferences)) {
        setResolved(true);
        return;
      }
      const next = desktopSnapshotSchema.parse(
        await api.update({
          expectedRevision: current.preferences.revision,
          patch: {
            garden: {
              version: 1,
              introductionSeen: current.preferences.garden?.introductionSeen ?? false,
              enabled,
            },
          },
        }),
      );
      if (next.error || next.preferences.garden?.enabled !== enabled)
        throw new Error('GARDEN_CHOICE_NOT_SAVED');
      setResolved(true);
      if (enabled) onEnabled();
    } catch {
      setError(
        'Não foi possível salvar sua escolha. Tente novamente. Seu progresso foi preservado.',
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (!eligible || !ready || !available || !visible || !timerSafe || otherDialog || desktop.error)
    return null;
  return (
    <AppDialog
      title="Conheça o jardim de foco"
      className="garden-invitation"
      onCancel={() => {
        void choose(false);
      }}
    >
      <span className="garden-invitation-symbol" aria-hidden="true">
        <Sprout size={28} />
      </span>
      <p>Agora seus focos também podem cultivar um pequeno mundo.</p>
      <p>
        O tempo das sessões concluídas faz o personagem avançar por quatro capítulos. Você pode
        acompanhar o jardim pelo Perfil, inclusive enquanto uma sessão está em andamento.
      </p>
      <p className="garden-invitation-note">
        <span className="garden-beta">Beta</span> A arte, as animações e a progressão ainda estão em
        construção. Você pode ativar ou ocultar o jardim nos Ajustes, sem perder seu progresso.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <button
          data-dialog-cancel
          disabled={busy}
          onClick={() => {
            void choose(false);
          }}
        >
          Agora não
        </button>
        <button
          data-primary="true"
          disabled={busy}
          onClick={() => {
            void choose(true);
          }}
        >
          {busy ? 'Salvando…' : 'Quero experimentar'}
        </button>
      </div>
    </AppDialog>
  );
}
