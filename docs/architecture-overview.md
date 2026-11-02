# Organização do código

O Krono tem uma janela Electron, uma interface React e um banco SQLite local. O mini timer compacta a mesma janela e opera a mesma sessão.

| Diretório | Responsabilidade |
| --- | --- |
| `src/features` | Foco, hábitos, produção, perfil, ajustes, apresentação e jardim beta |
| `src/design` e `src/study` | Componentes compartilhados, navegação, aparência e estilos do aplicativo |
| `shared/contracts` | Validação das mensagens, preferências e snapshots |
| `shared/domain` | Regras puras de tempo, calendário, métricas e progressão |
| `electron/services` | Timer e serviços locais |
| `electron/storage` | Writer único do SQLite, consultas, backup e restauração |
| `electron/ipc` | Capacidades específicas validadas entre a interface e o main |
| `build` e `scripts` | Recursos e ferramentas de compilação/empacotamento |
| `tests` | Unitários, integração e cenários de interface |

## Tempo e dados

O main é a autoridade temporal. Segmentos ativos usam relógio monotônico; animações e atualizações da tela não concedem tempo. A conclusão salva resultado, crédito, contribuição ao hábito e evento na mesma transação. Pausa, interrupção e ausência offline não viram foco concluído.

O SQLite fica no diretório de dados do usuário, com um writer em worker dedicado. O renderer não acessa banco, arquivos ou registro diretamente. Context isolation e sandbox permanecem ativos; IPC valida origem, frame e payload.

Hábitos operam por datas civis e fusos preservados. Produção mantém o crédito nas datas dos segmentos; o contador de sessões usa o dia da conclusão. Backup é uma cópia consistente validada, não uma cópia ingênua de um banco aberto.

## Interface

O tema Original usa marrom mineral, marfim, títulos editoriais e controles discretos. Os temas opcionais compartilham os mesmos dados e comandos. Redução de movimento, efeitos e alto contraste têm prioridade sobre a decoração.

O Jardim de foco é opcional e está em beta. A experiência vem do total de foco concluído já confirmado no banco. O desenho é carregado sob demanda e sua animação para ao fechar, ocultar ou reduzir o movimento; não existe um segundo timer de produtividade ou saldo de XP gravado por frame.
