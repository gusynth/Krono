# Compilar e testar

## Ambiente

- Windows 11 x64.
- Node.js `>=24.19.0 <25`, com npm, e Git.
- Acesso à internet para obter as dependências e os binários de desenvolvimento; o aplicativo instalado não precisa de conexão.
- Para gerar o setup, .NET Framework 4.x com o compilador `csc.exe` do Windows e os recursos de empacotamento baixados pelo electron-builder.

O SQLite utiliza um módulo nativo. `npm run setup` prepara esse módulo para a versão de Electron fixada no lockfile. Se o ambiente precisar compilá-lo em vez de usar um binário pré-compilado, serão necessárias as ferramentas de compilação C++ do Windows e Python suportados pelo node-gyp.

## Desenvolvimento

```powershell
npm ci
npm run setup
npm run dev
```

`npm run dev` compila e abre o aplicativo. O perfil fica em `.test-data/development`; não é o perfil da instalação normal. `npm run dev:web` abre uma prévia no navegador, sem os recursos de persistência do desktop.

## Verificações

| Comando | O que verifica |
| --- | --- |
| `npm run format:check` | Formatação do código e configurações |
| `npm run lint` | Regras de código e hooks |
| `npm run typecheck` | Contratos e tipos |
| `npm run test:unit` | Regras isoladas e contratos |
| `npm run build` | Renderer, main, preload e worker |
| `npm run test:integration` | SQLite real, worker, migrações, backup e restauração sintéticos |
| `npm run test:e2e` | Fluxos de interface em perfis descartáveis |
| `npm run test:performance` | Diagnóstico com dataset sintético; executar sozinho |

Artefatos e relatórios ficam em `artifacts`, `.test-data` e `test-results`, fora do versionamento. Testes de UI podem abrir janelas temporárias; os perfis de teste são separados. Esses testes não certificam leitor de tela, energia ou todas as escalas físicas de monitores.

## Pacotes

```powershell
npm run pack
```

Gera a pasta do aplicativo em `artifacts/packages/win-unpacked`, sem instalar. `npm run test:packaged` verifica o worker desse pacote.

`npm run dist` gera o setup local em `artifacts/packages`. Não publica no GitHub e não instala no computador. O processo preserva um identificador técnico interno para distinguir pacotes e detectar versões desconhecidas; ele não aparece como número de compilação na apresentação normal do aplicativo.

O manifesto de origem precisa de um checkout Git válido para confirmar o commit. Em uma árvore modificada, o pacote não pode ser anunciado como proveniente de fonte limpa. Não substitua um binário público mantendo a mesma versão.

## Versões experimentais e a linha pública 1.0

A primeira linha pública começa em 1.0.0. O staging utilizou numerações experimentais até 1.4, que não representam lançamentos posteriores dessa linha pública.

O instalador mantém a proteção contra downgrade; portanto, uma instalação experimental 1.4 não será substituída automaticamente por um pacote 1.0. Faça um backup pelo aplicativo, feche o Krono pela bandeja e desinstale a versão experimental sem remover os dados. Depois instale a versão pública. O diretório de dados e a identidade do aplicativo permanecem os mesmos; backups reconhecidos das versões experimentais continuam aceitos.

Esse procedimento de passagem precisa ser validado com o pacote público antes do lançamento. Não é necessário para uma instalação limpa. Não desative proteções do Windows para executar testes ou instaladores.
