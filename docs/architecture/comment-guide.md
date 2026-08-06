# Comentários

## Idioma 🔴

Comentário, identificador, mensagem de log e `errorCode` são todos em **en-US**.

Isso é a reversão do Q10: o Zeile chegou a declarar comentário em pt-BR como regra (não
dívida), aceitando como custo a barreira à contribuição externa. O Q108 revoga essa decisão —
o objetivo passou a ser facilitar contribuição de fora, não mais um projeto fechado. Os ~205
comentários pt-BR do código anterior a essa reversão **não estão conformes** e são dívida a
resolver arquivo por arquivo, não exceção permanente — a única pasta isenta é
`components/vendor/*` (Q21).

## Quando comentar 🟡

Comentário só se justifica por caber numa das seis categorias abaixo. Fora delas, o comentário
não existe — nome de identificador bem escolhido já é a documentação.

1. **Implementação de padrão externo**, com referência perene (ver "Como referenciar" abaixo).
2. **Trade-off de performance medido** — não intuição, número. "Trocado por X porque Y era N×
   mais lento" exige que N tenha vindo de uma medição real, citada ou reproduzível.
3. **Invariante ou pré-condição não local** — a garantia não é visível só lendo a função; quem
   editar precisa saber que quebrar aquilo tem efeito em outro lugar do código.
4. **Violação intencional de convenção** — por que este arquivo não segue o padrão que os
   vizinhos seguem.
5. **Regex ou operação bitwise não trivial** — o que o padrão captura, não a sintaxe do regex.
6. **Decisão de UX/interação** — por que a interface se comporta assim e não do jeito óbvio.
   Esta é a categoria mais frequente e mais valiosa do Zeile: o motivo de um gesto, um debounce,
   uma ordem de eventos, quase nunca está no código em volta.

Comentário que só repete o nome do identificador, ou que descreve o que a linha faz em vez do
porquê, não se encaixa em nenhuma categoria e não deve ser escrito.

## Como referenciar coisa externa 🔴

O Zeile comenta comportamento de biblioteca externa com frequência: Automerge,
`perfect-freehand`, Excalidraw, sql.js, Pyodide, Typst. Toda citação assim precisa de:

- **Link permanente** — DOI, número de RFC, URL arquivada (não uma URL que pode sair do ar ou
  mudar de conteúdo).
- **Nunca** referência a PR, issue ou commit deste repositório — o Git já guarda essa história;
  comentário que aponta para ela fica obsoleto no primeiro rebase ou squash.

ADR conta como referência legítima: é versionada e perene, ao contrário de um número de PR.

## `biome-ignore` 🔴

Todo `biome-ignore` leva uma justificativa que diz **o que falha sem o ignore** — não que "é
necessário". Encaixa-se na categoria 4 (violação intencional de convenção).

```ts
// biome-ignore lint/a11y/noStaticElementInteractions: só propaga o clique para não colapsar a
// linha; os controles reais (Slider) já são acessíveis
```

não

```ts
// biome-ignore lint/a11y/noStaticElementInteractions: necessário aqui
```

## Mudou X ⇒ verifique Y

- Comentário pt-BR sobrevivente num arquivo tocado ⇒ traduza para en-US no mesmo PR, não abra
  exceção nova.
- `biome-ignore` novo ⇒ a mensagem explica a falha real, não repete "necessário" ou "ok aqui".
- Import de biblioteca externa nova com comportamento não óbvio ⇒ considere se o comentário
  categoria 1 (padrão externo) se aplica antes de deixar a lib "falar por si".
