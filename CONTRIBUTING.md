# Contribuir com o Krono

Use uma issue para descrever problemas ou discutir mudanças maiores antes de abrir uma implementação extensa. Para correções pequenas, envie uma PR com o problema, a mudança de comportamento e a forma como verificou o resultado.

O aplicativo é local e não exige conta. Preserve esse comportamento, a interface em português e a separação entre a animação e o registro real do tempo. Não acrescente dependências ou acesso à rede sem justificar a necessidade.

Antes de enviar:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

Execute também a integração e os cenários de interface relacionados quando alterar persistência, timer, hábitos, backup, comandos ou diálogos. Os comandos e os limites estão em [Compilar e testar](docs/building.md).

Relate quais verificações executou e quais ficaram pendentes. Uma captura estática não comprova uma animação; um build não comprova instalação ou preservação dos dados.

Ferramentas de IA podem ajudar nas contribuições. O autor da PR continua responsável por compreender a alteração, verificar o resultado e não incluir segredos ou conteúdo de terceiros sem a licença adequada.
