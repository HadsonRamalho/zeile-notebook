## Resumo

<!-- O que muda e por quê, em duas ou três linhas. -->

## Como testar

<!-- Passos para verificar na prática. -->

## Checklist

- [ ] Rodei `pnpm lint` e `pnpm types:check` localmente
- [ ] Rodei `cargo fmt --check` e `cargo clippy` no que toquei do Rust
- [ ] Nenhuma string de UI hardcoded; chaves novas existem em `en.json` **e** `pt-br.json`
- [ ] Nenhum `errorCode` novo sem chave de tradução nos dois locales
- [ ] Migration (se houver) tem `down.sql` com a destrutividade declarada no cabeçalho
- [ ] Artefato gerado (tipos, `schema.rs`) regenerado e commitado, se a fonte mudou
