# Relatório — formato único de todos os modos

Um formato só. Em **pt-BR**, honesto sobre o que rodou, sem preâmbulo e sem elogio. Cada modo
preenche o bloco que lhe cabe e omite o resto.

## Esqueleto

```markdown
## <modo> — <alvo> <!-- PR #<n> — <título> | etapa <N> / item | lote de N PRs -->

Estado: <antes> → <depois> · commits: <n> · push: <sha ou "não">
**Origem**: <trecho do plano-execucao.md, ou "fora do plano: <pedido>"> <!-- deliver -->

**Aplicados** (<n>): <ref> <arquivo:linha> — <o que mudou>
**Refutados** (<n>): <ref> <arquivo:linha> — <por que não procede>
**Triados** (<n>): <n> resolvidos como já corrigidos, <n> aguardando confirmação
**Esperando reviewer** (<n>): <thread> — <o que foi respondido e quando>
**Gate**: 0 <res> · F <res> · R <res> (migrations: <res>) · G <res> · D <res>
<!-- res: passou | falhou | não rodou: <motivo> | não se aplica: <motivo> -->
**Plano**: <item marcado [x] / decisão de escopo registrada / "não alterado"> <!-- deliver -->
**Avisos do coletor**: <kind> — <detalhe> <!-- omitir se vazio -->

## Itens para discussão

1. <problema claro> — alternativas: (a) ... (b) ... — recomendação: ...

## Escalações abertas de passagens anteriores

- <id> (PR #<n>, desde <data>): <pergunta em uma linha>

## Ficou de fora

- <o quê> — <por quê>
```

## Regras que valem literalmente

- **Faixa que não rodou se declara como não rodada, com o motivo.** Nunca ✅ por omissão. Teste que
  falhou aparece com a saída real. `75` do `gate-lock.sh` = "não rodou: `<motivo>` (fila/memória)";
  `137` com a nota de teto = "não rodou: teto de memória".
- **`cargo test` sem Postgres** = "R: passou (migrations: não rodou — sem Postgres)". Nunca "R:
  passou" sozinho: os testes de migration passam vazios.
- **Faixa que não se aplica** se diz ("R: não se aplica — diff sem `rust-server/`"), para o leitor
  distinguir de esquecimento.
- **Um achado = uma linha**, com `arquivo:linha` e a referência (`Q<n>` ou `<doc>.md §<seção>`).
  Mesmo defeito em N locais = uma linha com a contagem.
- **Escalação aberta volta em todo relatório** até ter `answeredAt`.
- **Aviso do coletor entra** sempre que puder ter escondido trabalho.
- **Escopo que ficou de fora se declara**: o quê e por quê. Reduzir escopo é decisão do usuário.
- **`--dry-run`** troca todo verbo de escrita pelo condicional e abre com `DRY-RUN` na primeira linha.
- Sem hedging. Dúvida genuína vira item em `## Itens para discussão`.

## Blocos por modo

| Modo      | Blocos obrigatórios                                                                             |
| --------- | ----------------------------------------------------------------------------------------------- |
| `deliver` | alvo (item do plano + PR), origem, commits, gate, achados do auto-review, plano, ficou de fora   |
| `inbox`   | estado antes/depois, aplicados, refutados, triados, esperando reviewer, gate                    |
| `review`  | por PR: autor, veredito, 🔴/🟡/⚪, in-line publicados, achados fora de hunk, relatório local; dedup e o que ficou fora |
| `cascade` | o sentido, PRs afetadas, o que propagou, o que escalou                                          |
| `sweep`   | padrão, PRs afetadas, itens enfileirados por PR, dívida proposta para o plano                   |
| `status`  | tabela do coletor, locks ativos, escalações abertas, próximo item pendente do plano             |
| `ready`   | PRs em `done-pending` com o que falta para o merge                                              |
| ops       | o que mudou no próprio loop                                                                     |
