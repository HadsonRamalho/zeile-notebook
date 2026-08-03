# 0001 — Política de versão mínima suportada do contrato

## Contexto

O `health/ready` do backend (Q100, `rust-server/src/controllers/health.rs`) expõe
`contract_version` (a versão do contrato que este binário implementa) e
`min_supported_contract_version` (a versão mínima de cliente que ele ainda serve sem aviso). Um
cliente que declara sua versão no header `X-Contract-Version` recebe `client_contract_outdated:
true` quando estiver abaixo do mínimo suportado.

Falta a política que diz **quando** `min_supported_contract_version` sobe. Sem ela, o campo existe
mas nada o move, e o `#[serde(alias = "<snake>")]` da transição de casing (Q29) fica sem prazo de
remoção — o que o próprio Q29 já apontava como risco ("o alias precisa de data de remoção em ADR,
senão fica para sempre").

## Alternativas

1. **Nunca subir o mínimo suportado** (compatibilidade eterna). Rejeitada: acumula código morto de
   compatibilidade indefinidamente e nunca fecha o prazo do alias do Q29.
2. **Subir a cada mudança de contrato**, ficando `min_supported == contract_version` sempre.
   Rejeitada: quebra cliente desktop que não conseguiu atualizar ainda (rede fechada, professor sem
   permissão de admin na máquina do laboratório — cenário citado no plano de LAN da Fase 4).
3. **Janela de tolerância fixa**, com o mínimo suportado só avançando quando a versão anterior já
   teve tempo de os clientes existentes atualizarem.

## Decisão

Alternativa 3. `min_supported_contract_version` só avança quando a versão que ele está deixando
para trás (`N`) tiver ficado disponível por pelo menos **90 dias corridos** como `contract_version`
atual, contados a partir do deploy que introduziu `N`. Depois desse prazo, um PR pode subir
`MIN_SUPPORTED_CLIENT_CONTRACT_VERSION` para `N`, na mesma decisão que remove os
`#[serde(alias = "<snake>")]` referentes à versão `N-1` (Q29).

`CONTRACT_VERSION` sobe em qualquer mudança **quebradora** de contrato: remoção ou renomeação de
campo, mudança de tipo, novo valor obrigatório sem default, remoção de `errorCode`. Adição aditiva
(campo opcional novo, `errorCode` novo, valor novo de enum aditivo) não exige bump.

## Consequências

- O deploy de nuvem, sem downtime prolongado por cliente, nunca vê o aviso na prática — o intervalo
  de 90 dias é folgado para esse caso.
- O caso real que a política protege é o desktop (Q98–Q104): instalador baixado uma vez, sem
  auto-update obrigatório. Um cliente parado há mais de 90 dias começa a ver
  `client_contract_outdated: true` em vez de falhar silenciosamente numa forma de contrato que não
  reconhece.
- Fecha a pendência do Q29: o alias de casing tem prazo de remoção amarrado a este documento, não a
  "algum dia".
- **Ainda não implementado**: o cliente (web ou desktop) ler `client_contract_outdated` e avisar o
  usuário. Hoje só o backend expõe e loga (`tracing::warn!`); nenhum consumidor existe. Fica como
  item aberto para quando houver de fato mais de um `contract_version` em campo.

## Status

Aceita.
