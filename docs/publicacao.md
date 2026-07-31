# Zeile — Abertura do repositório: perguntas e decisões

Status: **levantado, aguardando decisão.** Este documento é o checklist do que precisa estar
resolvido antes de `HadsonRamalho/zeile-notebook` mudar de `PRIVATE` para `PUBLIC`.

Cada pergunta traz o **estado verificado** no repositório (não suposto), a **resposta/decisão**
e a **ação** correspondente. As perguntas marcadas 🔴 são bloqueadoras: virar público sem elas
é irreversível ou caro de desfazer. As 🟡 são decisões suas, sem resposta técnica única. As 🟢
são higiene — dá para fazer depois, mas é a primeira coisa que um visitante vê.

Tornar o repositório público é irreversível na prática: a partir do commit em que o botão é
apertado, tudo que já foi commitado pode ter sido clonado, indexado e espelhado. Todo o bloco A
existe por causa disso.

---

## Bloco A — Bloqueadores 🔴

### P01 · Existe segredo no histórico do git?

**Verificado.** Nenhum. O único arquivo sensível versionado é `rust-server/.env.example`
(template, sem valores). `git log --all --diff-filter=A` para `*.env`, `.env.local` e `*.pem`
retorna vazio — nunca houve `.env` ou chave privada adicionada em commit algum. O
`rust-server/vapid_private.pem` existe na árvore de trabalho mas é ignorado pela regra `*.pem`
do `.gitignore` e nunca foi rastreado.

**Decisão.** O histórico está limpo, mas "meu grep não achou" não é prova suficiente para uma
ação irreversível.

**Ação.**
1. Rodar um scanner dedicado sobre o histórico completo como confirmação independente:
   `gitleaks detect --log-opts="--all"` ou `trufflehog git file://. --since-commit=$(git rev-list --max-parents=0 HEAD)`.
2. Rotacionar mesmo assim os segredos que já circularam fora do git:
   - o **PAT do GitHub** — era `NEXT_PUBLIC_GITHUB_TOKEN` e foi inlinado no bundle do cliente
     em todo build publicado; a PR #27 fecha a exposição futura, não a passada;
   - as **chaves VAPID** e o `JWT_SECRET` do ambiente hospedado, por higiene de corte.
3. Ligar **secret scanning + push protection** (grátis em repo público) no mesmo dia da virada,
   para que o próximo vazamento seja barrado no push e não descoberto depois.

### P02 · O clone público vai arrastar os 465 MB do pack?

**Verificado.** Não. `size-pack: 465.80 MiB`, mas dos 9533 objetos empacotados só **5466 são
alcançáveis** por qualquer ref (incluindo `refs/remotes`). Os três maiores blobs — 99.7 MB,
99.7 MB e 91.1 MB — são pacotes `.deb`/`.rpm` de build (assinatura `!<arch>`) que não pertencem
a nenhum commit alcançável; estão presos apenas pelo reflog local. Os maiores blobs realmente
alcançáveis são `public/icon-1024.png` (1.6 MB), `public/extension-icon.svg` (1.3 MB) e
`public/logo.png` (445 KB).

**Decisão.** Não é preciso reescrever histórico. O peso é local, não é o que o público clona.

**Ação.** Antes de abrir, limpar para que o número pare de assustar e para confirmar a hipótese:

```
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git count-objects -vH   # size-pack deve cair para dezenas de MB
```

Se depois disso o pack continuar grande, a premissa está errada e o caso vira reescrita de
histórico — reavaliar antes de prosseguir.

### P03 · E os 555 MB de resultados que estão na árvore sem versionar?

**Verificado.** Não rastreados, mas presentes e desprotegidos: `docs/new-results` (329 MB),
`docs/results` (226 MB), `resultados-zeile/`, `resultados-zeile.zip`, os `.deb`/`.rpm`/`.dmg` na
raiz, dezenas de `rust-server/server*.log`, `latency_*.csv`, `resource_*.csv`, `runner1.log`,
`oci-retry-launch.log`, além de `.claude/`, `.codex/`, `.agents/`, `.impeccable/`.

**Decisão.** Nada disso entra no git. Em repositório privado, um `git add .` distraído é um
commit a corrigir; em repositório público, é publicação definitiva.

**Ação.** Estender o `.gitignore` **antes** da virada, cobrindo artefatos de build
(`*.deb`, `*.rpm`, `*.dmg`, `*.AppImage`, `*.msi`), logs (`rust-server/*.log`, `*.log`),
resultados (`docs/results/`, `docs/new-results/`, `resultados-zeile*`, `*.csv` na raiz) e os
diretórios de agente. Se os dados do artigo precisam ser citáveis, o lugar é um release asset
ou um DOI no Zenodo — não o git.

### P04 · Os 79 alertas do Dependabot impedem a abertura?

**Verificado.** 79 alertas abertos: **34 high, 36 moderate, 9 low**. Por manifesto:
`pnpm-lock.yaml` 42, `package.json` 28, `rust-server/Cargo.lock` 7, `src-tauri/Cargo.lock` 1.
Concentração em `next` (56 alertas), `diesel` (4), e um punhado em `postcss`, `immutable`,
`lodash-es`, `sharp`, `brace-expansion`, `quinn-proto`, `jsonwebtoken`.

**Decisão.** Bloqueia as *high* de runtime. O alerta em si permanece privado mesmo em repo
público, mas o `pnpm-lock.yaml` fica visível: qualquer pessoa roda `pnpm audit` no clone e tem a
lista completa em segundos. E o Zeile **executa código de terceiros por design** — CVE em
dependência do caminho de execução não é dívida cosmética.

**Ação.**
1. `pnpm update` + `cargo update` e reavaliar — a contagem de `next` sugere alertas contra
   versões já superadas que não foram reescaneadas; boa parte deve evaporar.
2. Do que sobrar, corrigir toda *high* que esteja no caminho de request ou de execução.
3. Registrar em `SECURITY.md` as remanescentes (tipicamente transitivas sem fix upstream),
   com o motivo de não serem exploráveis aqui.

### P05 · Os workflows são seguros com PR vinda de fork?

**Verificado.** Quatro workflows rastreados:

| Workflow | Gatilho | Segredos |
|---|---|---|
| `ci.yml` | `pull_request`, `push` em `main` | nenhum |
| `deploy-backend.yml` | `push` em `prod`, `workflow_dispatch` | `DOCKERHUB_*`, `DEPLOY_HOST/USER/SSH_KEY/PORT` |
| `desktop-release.yml` | `push` de tag `v*`, `workflow_dispatch`, `workflow_call` | `GITHUB_TOKEN` |
| `release.yml` | `workflow_dispatch` | — |

**Decisão.** A postura está correta: o CI usa `pull_request` (e **não** `pull_request_target`),
então código de fork roda sem acesso a segredo; os workflows com segredo real só disparam por
push em branch protegida, tag ou acionamento manual.

**Ação.** Reforçar antes de abrir:
- `permissions: contents: read` explícito no topo de `ci.yml` (hoje herda o default do repo);
- Settings → Actions → *Require approval for all outside collaborators* (evita fork rodando CI
  no seu minuto de runner sem revisão);
- confirmar que `DEPLOY_SSH_KEY` é chave dedicada ao deploy, com acesso mínimo na VM;
- nunca migrar `ci.yml` para `pull_request_target` — é a porta clássica de exfiltração.

### P06 · A `main` está protegida?

**Verificado.** Não. Branch protection segue sem configuração — em repositório privado exige
plano pago, e é justamente na virada que fica gratuita.

**Decisão.** Configurar no mesmo dia, não depois.

**Ação.** Em `main`: exigir PR, exigir os checks do `ci.yml` verdes, exigir histórico linear,
bloquear force-push e deleção. O mesmo para `prod`, que dispara deploy.

---

## Bloco B — Decisões 🟡

### P07 · Qual licença?

**Verificado.** Não há `LICENSE`. `gh repo view` retorna `licenseInfo: null`.
`src-tauri/Cargo.toml` traz `license = ""`.

**Consequência de não decidir.** Sem licença, o padrão é *todos os direitos reservados*:
ninguém pode legalmente usar, modificar ou redistribuir. Repositório público sem licença é
vitrine, não projeto aberto.

**Opções.**

| Licença | Quando faz sentido aqui |
|---|---|
| **MIT** | adoção máxima, texto curto, zero fricção |
| **Apache-2.0** | mesma permissividade + concessão explícita de patente + exigência de NOTICE em derivados |
| **AGPL-3.0** | impede que alguém rode um Zeile fechado como serviço sem devolver as modificações |

**Recomendação.** **Apache-2.0** se o objetivo é adoção, contribuição e portfólio — a cláusula
de patente e o disclaimer de garantia importam num produto que executa código arbitrário.
**AGPL-3.0** se o objetivo é impedir um SaaS concorrente fechado sobre o Zeile; o custo é
espantar uso corporativo. Decidir antes de abrir: relicenciar depois exige o aceite de todo
contribuidor externo que já tiver aparecido.

### P08 · A licença de código cobre também `docs/`?

**Verificado.** `docs/` guarda os artigos (`Artigo.md` 450 KB, `Artigo_v2.md` 454 KB,
`Artigo_Final.md` 280 KB) e os relatórios de escalabilidade — texto acadêmico, não código.

**Decisão a tomar.** Três caminhos: (a) manter sob a mesma licença de código; (b) licenciar
`docs/` sob **CC-BY-4.0** e dizer isso no `LICENSE`/`README`; (c) **não publicar** os artigos —
se algum ainda vai a submissão, publicar o texto integral antes pode conflitar com a política
de ineditismo do veículo. Verificar a política antes de abrir; é o único item aqui com prazo
externo.

### P09 · O commit com e-mail corporativo fica?

**Verificado.** 50 commits: 47 de `hadsonramalho@gmail.com`, **1 de
`hadson.ramalho@atmansystems.com`**, 1 do `users.noreply` e 1 do bot do Actions.

**Decisão.** Não há problema legal nem de segurança — mas expõe vínculo empregatício e um
endereço corporativo a scrapers.

**Ação recomendada.** Adicionar um `.mailmap` mapeando os quatro endereços para a identidade
canônica. Normaliza atribuição em `git shortlog`/`git blame` sem reescrever histórico. Se a
exposição do endereço em si incomodar, aí sim é `git filter-repo --mailmap` — mas isso reescreve
todos os SHAs e só vale a pena antes de existir qualquer fork.

### P10 · Publicar o histórico ou começar com repositório limpo?

**Decisão recomendada: manter o histórico.** Não há segredo nele (P01), o peso não é problema
real (P02), e o histórico é evidência do trabalho — o que interessa num projeto que sustenta
artigo e TCC. Começar do zero descartaria isso em troca de nada.

### P11 · O projeto aceita contribuição externa?

**Verificado.** Existe `pull_request_template.md`. Não existem `CONTRIBUTING.md`,
`CODE_OF_CONDUCT.md`, nem templates de issue.

**Decisão a tomar.** Duas posturas válidas:
- **"aberto para ler, fechado para contribuir por enquanto"** — basta um `CONTRIBUTING.md` de
  cinco linhas dizendo isso e apontando issues para bug report. É a resposta honesta se não há
  tempo de revisar PR de terceiro.
- **"aceita contribuição"** — então: `CONTRIBUTING.md` com setup (pnpm, `diesel setup`, o
  `DATABASE_URL`), as regras de `docs/padroes.md` que valem em review, `CODE_OF_CONDUCT.md`
  (Contributor Covenant), templates de issue e labels `good first issue`.

Escolher antes: PR não respondida em repo que se anuncia aberto custa mais reputação do que um
aviso claro de que contribuição está fechada.

### P12 · A instância hospedada continua no ar depois de abrir?

**Consequência.** Abrir o código torna auditável exatamente o que protege a instância pública:
o `verify_code` de `src/sec/`, o isolamento por bwrap/WASI/prlimit, os limites de CORS, body e
rate limit da etapa 5. Isso é desejável — segurança que depende de o código ser secreto não é
segurança —, **desde que a etapa 5 esteja no ar** (ver P16) e que o rate limit esteja calibrado
para tráfego não solicitado, que aparece em horas depois da abertura.

**Ação.** Antes da virada: confirmar `CORS_ALLOWED_ORIGINS` setado no ambiente publicado,
`BIND_ADDR` correto, e que o servidor tem alerta/limite de custo para execução de código.

### P13 · Como alguém reporta uma vulnerabilidade?

**Verificado.** Não há `SECURITY.md`. O canal padrão hoje seria abrir uma issue pública — o pior
resultado possível para um bug no sandbox de execução.

**Ação.** Ligar **Private Vulnerability Reporting** (Settings → Security) e escrever
`SECURITY.md` com: canal de contato, escopo (o sandbox de execução de código é o alvo óbvio e
merece ser nomeado), o que está fora de escopo, prazo de primeira resposta, e as versões
suportadas.

---

## Bloco C — Higiene 🟢

### P14 · Os metadados do projeto estão apresentáveis?

**Verificado.** Não:

| Arquivo | Estado | Deveria ser |
|---|---|---|
| `package.json` | `"name": "docs"`, `"private": true` | `"name": "zeile-notebook"`; `private` pode ficar (não vai ao npm) |
| `src-tauri/Cargo.toml` | `description = "A Tauri App"`, `license = ""`, `repository = ""` | descrição real, licença de P07, URL do repo |
| `rust-server/Cargo.toml` | sem `license`, `description`, `repository` | idem |

**Ação.** Corrigir os três — é literalmente a primeira coisa que aparece a quem abre o
repositório.

### P15 · O README serve como porta de entrada?

**Verificado.** Existe, tem screenshot e descreve o produto bem. Falta: seção de licença,
quickstart de desenvolvimento (hoje só o `CLAUDE.md` tem os comandos), nota de arquitetura
(frontend Next + backend Rust no mesmo repo) e o aviso explícito de que o projeto **executa
código enviado pelo usuário** — quem for auto-hospedar precisa ler isso antes, não depois.

**Ação.** Acrescentar as quatro seções; apontar para `docs/` e para o Swagger em `/docs`.

### P16 · A etapa 5 entra antes ou depois da abertura?

**Verificado.** PRs #26 (CORS por env, body limit, rate limit, timeouts, request_id), #27
(remove o prefixo público do token do GitHub) e #28 (fecha o bind, exige diretório de dados,
gera segredos do Postgres) estão abertas e verdes.

**Decisão: antes.** Cada uma dessas PRs é a descrição pública de uma fraqueza junto com o
respectivo remédio. Abrir o repositório com elas ainda pendentes publica o diagnóstico e deixa o
fix em revisão.

**Ação.** Mergear #26 → #27 → #28 na ordem da stack, com `CORS_ALLOWED_ORIGINS` já setado no
ambiente publicado antes do merge de #26. Fica pendente e deve ser registrado como issue
conhecida: a CSP do `tauri.conf.json` não se aplica a páginas servidas por
`WebviewUrl::External`, então a CSP efetiva do desktop precisa vir do header da resposta do Next
(amarrado a Q61 em `docs/padroes.md`).

### P17 · Os arquivos de trabalho interno vão junto?

**Verificado.** Não rastreados hoje, mas na árvore: `CLAUDE.md`, `HANDOFF.md`, `handoff-2.md`,
`RASCUNHO.md`, `DESIGN.md`, `PRODUCT.md`, `FIGURAS.md`, além de `.claude/`, `.codex/`,
`.agents/`, `.impeccable/`.

**Decisão a tomar, arquivo a arquivo.** `CLAUDE.md` e `docs/padroes.md` ajudam contribuinte
(humano ou agente) e valem publicar. `HANDOFF.md`, `handoff-2.md` e `RASCUNHO.md` são notas de
sessão e provavelmente não. O resto: revisar antes, porque documento interno costuma citar
infraestrutura, custo e decisão de produto que não estavam destinados a público.

---

## Ordem de execução

1. `gitleaks`/`trufflehog` no histórico completo (P01).
2. Rotacionar PAT do GitHub, VAPID e `JWT_SECRET` (P01).
3. Estender o `.gitignore` para artefatos, logs, resultados e diretórios de agente (P03).
4. `git reflog expire` + `git gc --prune=now` e conferir o `size-pack` (P02).
5. **Decidir a licença** (P07) e a cobertura de `docs/` (P08) — verificar a política de
   ineditismo dos artigos ainda não submetidos.
6. `pnpm update` + `cargo update`; corrigir as *high* remanescentes (P04).
7. Mergear #26 → #27 → #28, com `CORS_ALLOWED_ORIGINS` setado antes (P16, P12).
8. Escrever `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md` e — se P11 for "aceita" —
   `CODE_OF_CONDUCT.md` (P07, P11, P13).
9. Corrigir metadados de `package.json` e dos dois `Cargo.toml`; completar o README (P14, P15).
10. Adicionar `.mailmap` (P09); decidir o destino dos arquivos internos (P17).
11. `permissions: contents: read` no `ci.yml` e exigir aprovação para workflow de fork (P05).
12. **Virar público.**
13. No mesmo dia: branch protection em `main` e `prod` (P06), secret scanning + push protection
    (P01), Private Vulnerability Reporting (P13), descrição e topics do repositório.
