# Instalador do Krono

Interface WinForms com o símbolo de Cronus (`assets/desktop/brand/source.png`), marrom mineral/marfim, Georgia do sistema e Inter local OFL. Nenhum navegador/runtime extra. Scene.cs desenha fundo estático, símbolo e nome; a abertura curta só é reproduzida na instalação limpa. O timer de pintura desliga em repouso, invisibilidade, redução e alto contraste; somente atividade real mantém animação.

Margem externa de 40 DIP, painel com 24 DIP internos, ações fixas; janela inicial 820×560. Controles foscos próprios, foco visível por intenção de teclado. Seletor opaco/arredondado evita flash e cantos com fundo residual.

Frontend WinForms compilado pelo C# do .NET Framework fornecido com o Windows 11. Não empacota CLR, WebView, Chromium ou dependências NuGet. NSIS original é um recurso interno verificado por SHA-256 e executado apenas após confirmar a instalação. Não rodar o setup de produção no host para testes.

`npm run test:setup` compila uma prévia separada, sem NativeHost/registro/payload, e executa política/layout e o contrato de consentimento usando NSIS puro. Executáveis ignorados em .test-data/installer-policy. `npm run dist` cria o NSIS e depois o setup externo, inspeciona a assembly e recursos e verifica os ícones/manifesto. Não distribuir blockmap/latest.yml do engine; o setup não oferece autoupdate ou CLI silenciosa externa.

InterVariable.ttf original, OFL, obtida de https://github.com/rsms/inter/blob/master/docs/font-files/InterVariable.ttf em 20/10/2026. SHA-256 4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf. Licença incorporada de public/licenses/Inter.txt. Uso via PrivateFontCollection, sem instalar fontes no sistema. O build verifica esse digest; não baixa fontes em execução ou compilação. Marca e capturas são assets existentes.

NSIS continua responsável por arquivos, registro, atalhos e desinstalador. Dados SQLite não são lidos ou escritos pelo setup. Depois do exit code, a interface revalida versão/build e existência do executável antes de anunciar conclusão. Código 3010 também exige essa verificação. Em erro ou fechamento durante instalação, não forçar encerramento do engine. Cancelar antes de iniciar fecha sem extrair o payload.

Legado em silêncio só prossegue após resposta local de uso único, específica à versão/build, em pipe com ACL do usuário. /S sozinho, nonce inválido, recusa ou resposta de outro build falham fechados. Isso transporta consentimento; não é uma fronteira contra software malicioso já executando como o mesmo usuário. Downgrade/metadados inválidos continuam verificados no NSIS. O backend recusa processo Krono existente sem matá-lo.

scripts/nsis-engine.mjs deriva templates da dependência fixada sem editá-la; scripts/build-installer.mjs adapta o texto de entrada mantendo a geração padrão do desinstalador. Falha de cópia retorna 1603 em vez de sobrescrever ignorando erros. A regressão usa apenas um arquivo sintético bloqueado, sem instalar. Não confundir o teste com rollback instalado: uma falha posterior à remoção dos arquivos antigos pode exigir nova instalação; dados SQLite permanecem separados e sua preservação instalada continua pendente de VM.


## Detecção antes da abertura

SetupForm aguarda Scan antes de decidir se revela o selo. Policy.PlayIntroduction aceita somente Install sem erro; manutenção, legado, downgrade e metadados inválidos não reproduzem. Fechar durante a consulta não reinicia o relógio em formulário destruído. O seletor oferece unidades e navegação por roda/PageUp/PageDown; destino recebe Krono sem duplicar o nome. A macro customUnInstall fica fora da guarda BUILD_UNINSTALLER, removendo somente a chave AUMID própria. Nenhuma exclusão genérica de Electron.lnk.

O empacotador e as fixtures compartilham cache local em .test-data/builder-cache (ignorado); executar dist antes dos testes de extração que dependem dos plugins NSIS baixados pelo build. Não modificar node_modules nem copiar recursos de outro instalador para contornar falhas.
