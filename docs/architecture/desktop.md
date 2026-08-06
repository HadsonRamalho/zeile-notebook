# Desktop — Tauri

O que a versão desktop muda no escopo de regra. A maior parte já foi decidida nas etapas 4/5/8/9
([desktop-tauri.md](../desktop-tauri.md) tem a análise original da branch); este doc fecha o que
ainda não tinha decisão — assinatura, dependência de sistema por distro e versionamento formal.

## Matriz de capacidade como fonte única 🔴 (Q104, já implementado)

`GET /capabilities` (`controllers/execution_capabilities.rs`, `executor/capabilities.rs:117`) é
quem decide o que o backend sabe executar, por linguagem — nunca uma heurística de plataforma no
cliente. `useExecutionCapabilities` cruza essa resposta com a permissão de bloco no frontend, e
falha aberta (bloco desabilitado) se o endpoint não responder. Todo bloco executável novo (nova
linguagem, novo runtime) declara sua capacidade aqui antes de o frontend saber que ele existe.

## Empacotamento: `deb`/`rpm`/`appimage` no Linux, AppImage como referência de dependência 🟡 (Q123)

`src-tauri/tauri.conf.json:20` já gera os três formatos para Linux; `desktop-release.yml` monta
a matriz `ubuntu-latest` → `deb,rpm,appimage`, `macos-latest` → `dmg`, `windows-latest` →
`nsis,msi`. Isso não muda — o que se declara é qual dos três é a resposta padrão quando aparecer
o próximo caveat de dependência de sistema (o já registrado é `libxml2` em Arch): **o AppImage é
o que se testa primeiro**, porque empacota mais do runtime dentro do próprio artefato em vez de
depender de biblioteca do sistema hospedeiro.

Não introduz Flatpak/Snap (canal de distribuição adicional a manter) nem restringe formalmente
uma matriz de distros "suportados" — usa o que o `tauri-action` já produz.

## Sem assinatura de código nesta etapa, risco aceito ⚪ (Q122)

Nenhum dos instaladores (`.deb`, `.rpm`, `.dmg`, `.msi`, `.nsis`) é assinado ou notarizado. Isso
é decisão explícita, não lacuna: o custo de certificado — sobretudo Apple notarization — não se
justifica antes de haver distribuição fora do círculo de quem já confia na fonte do binário.
Reabrir quando isso deixar de ser verdade; até então, o aviso de "publisher desconhecido" do SO
em Windows/macOS é esperado, não um bug a silenciar.

## Versionamento: semver + build number, canal único ⚪ (Q124)

`package.json` (`version: "1.0.2"`) continua como fonte única de versão, espelhada em
`src-tauri/tauri.conf.json:4` (`"version": "../package.json"`). Adiciona-se um número de build
incremental para rastrear artefatos do mesmo commit — útil quando o `desktop-release.yml`
precisar ser re-executado para a mesma tag. Não se introduz canal `beta` separado de `stable`:
com um único mantenedor e sem base de usuário segmentada por estabilidade, o canal duplo seria
processo sem uso real. Reabrir se/quando houver demanda por testar release antes do público
geral.

## Gate antes do build, já em vigor 🔴 (Q101, já implementado)

`desktop-release.yml` roda `gate` (types:check + test do front, `cargo test` + `cargo check
--workspace` do Rust) antes de `build`, que depende dele (`needs: gate`). Push de tag `v*` não
publica instalador sem esse gate verde — decisão já efetiva, listada aqui só para o índice de
`desktop.md` ficar completo.

## Mudou X ⇒ verifique Y

- Linguagem/runtime executável novo ⇒ entra em `executor/capabilities.rs` antes de o frontend
  saber que existe (Q104) — nunca detecção de plataforma no cliente.
- Novo caveat de dependência de sistema reportado em alguma distro ⇒ testar primeiro se o
  AppImage já resolve (Q123) antes de considerar Flatpak/Snap ou restringir a matriz de distros.
- Decisão de distribuir fora do círculo de confiança atual (loja de app, canal público amplo) ⇒
  reabre Q122 — assinatura de código deixa de ser risco aceito.
- Demanda real por testar uma versão antes do público geral ⇒ reabre Q124 — canal único deixa
  de ser suficiente.
