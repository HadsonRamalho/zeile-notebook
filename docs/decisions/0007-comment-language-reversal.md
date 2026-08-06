# 0007 — Comentários de pt-BR para en-US

## Contexto

O Zeile havia declarado comentário de código em pt-BR como **regra**, não dívida (Q10) —
identificador, log e `errorCode` já eram en-US desde o início, mas comentário explicativo era
deliberadamente pt-BR. A justificativa registrada então era zero trabalho de tradução e zero
convivência bilíngue no mesmo arquivo, aceitando como custo consciente a barreira à
contribuição externa — o projeto não visava contribuição de fora naquele momento.

Esse objetivo mudou: o Zeile passou a visar facilitar contribuição externa, e a barreira que
Q10 aceitava como custo deixou de ser aceitável.

## Alternativas

1. **Manter pt-BR**, aceitando a barreira como permanente. Rejeitada — é exatamente a premissa
   que deixou de valer.
2. **Bilíngue por convenção** (comentário novo em en-US, comentário antigo permanece em pt-BR
   como "legado tolerado", sem prazo de migração). Rejeitada: cria convivência bilíngue
   indefinida no mesmo arquivo, o problema que Q10 evitava desde o início — só do lado errado.
3. **Reverter Q10 por completo.** en-US passa a ser a regra para comentário novo, e o pt-BR
   existente é dívida a resolver, não exceção permanente.

## Decisão

Alternativa 3. Q108 revoga Q10. Comentário, identificador, log e `errorCode` — os quatro — são
en-US. Os ~205 comentários pt-BR que existiam no momento da reversão migram arquivo por
arquivo, no mesmo espírito da migração incremental do Q109 (Catcher): sem prazo de tolerância
para comentário pt-BR em arquivo **novo ou tocado**; arquivo intocado migra em mutirão próprio,
não fica pendente indefinidamente. `components/vendor/*` continua isento (Q21) — não é código
próprio, comentário original do autor upstream não se traduz.

Identificador (variável, função, arquivo, tipo) que ainda estiver em pt-BR é levantado e
renomeado no mesmo esforço de migração do arquivo — não é um item separado.

As seis categorias de "quando comentar" do Q11 continuam valendo sem alteração: a reversão
muda o idioma, não o critério de quando um comentário se justifica. Ver
[comment-guide.md](../architecture/comment-guide.md).

## Consequências

- Todo comentário escrito a partir desta decisão é en-US, sem exceção fora de `vendor/`.
- O comentário pt-BR remanescente não é mais "conforme por decisão" (como era sob Q10) — é
  dívida visível, e aparece como tal em qualquer auditoria futura de estilo.
- Nenhum guard automático de CI verifica idioma de comentário hoje — a regra depende de review
  humano até que (se) valha a pena escrever um.
- Esta ADR, os docs de `architecture/` e o catálogo de decisões (`decisoes.md`,
  `plano-execucao.md`) **continuam em pt-BR** — a reversão do Q10 é sobre comentário de código,
  não sobre a prosa normativa do projeto, que segue o idioma em que o catálogo inteiro já estava
  escrito.

## Status

Aceita.
