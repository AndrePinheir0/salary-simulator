---
name: deploy-gh-pages
description: Use when asked to deploy, publish, or release the salary-simulator project to production. Triggers on "faz deploy", "publica", "deploy", "lança em produção".
---

# Deploy — GitHub Pages

## Comando

```bash
npm run deploy:gh
```

Este comando faz:
1. `ng build --configuration production --base-href /salary-simulator/`
2. Publica `dist/salary-simulator/browser` no branch `gh-pages` via `angular-cli-ghpages`

## URL de produção

`https://andrepinheir0.github.io/salary-simulator/`

## Notas

- Não é necessário fazer `git push` antes — o script publica directamente o build.
- Avisos de CSS (`selector errors`) durante o build são normais e não bloqueiam o deploy.
- O deploy demora ~30–60 segundos até estar disponível no GitHub Pages.
