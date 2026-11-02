# Componentes de terceiros

Krono utiliza Electron, React, TypeScript, Vite, SQLite/better-sqlite3, Motion, Lucide e Zod. Cada componente mantém sua licença original; a licença MIT do código do Krono não substitui essas licenças.

- **Inter Variable:** SIL Open Font License 1.1. Arquivos locais em `src/design/fonts` e `build/setup`; licença em [public/licenses/Inter.txt](public/licenses/Inter.txt). Não é instalada no sistema.
- **Bibliotecas distribuídas:** cópias dos avisos em [public/licenses/dependencies](public/licenses/dependencies), incluídas no pacote do aplicativo.
- **Electron e Chromium:** as licenças acompanham o runtime empacotado. Não remover `LICENSE.electron.txt` ou `LICENSES.chromium.html` para reduzir o pacote.
- **SQLite/better-sqlite3:** a licença e o módulo nativo necessário permanecem na distribuição.

O projeto não distribui SF Pro nem fontes proprietárias da Apple. Georgia e Segoe UI são usadas como fontes do sistema quando disponíveis.
