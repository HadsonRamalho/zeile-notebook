# 0006 — Compilação de Go, Zig e C++ dentro do `bwrap`

## Contexto

A etapa de **execução** de código do usuário era simétrica entre linguagens — todas passavam
pelo mesmo envelope `bwrap`. A etapa de **compilação** não era: `compile_rust` já rodava sob
`bwrap` (`--unshare-all --die-with-parent --new-session`, bind read-only de `/usr` `/lib` `/bin`,
`/tmp` novo, workspace da sessão montado em `/app`); `compile_cpp` rodava só sob
`prlimit --cpu=10 --as=2147483648`, sem isolamento de filesystem/rede; `compile_go` e
`compile_zig` invocavam o compilador direto no host, sem `prlimit` nem `bwrap`.

Isso importa porque **compilador executa código**: `build.rs` do Cargo, macro em tempo de
compilação, diretiva de linker, `#cgo` do Go. O `verify_*_code` (análise estática em
`src/sec/mod.rs`) barra o token e o módulo óbvios, mas é blocklist textual, não prova — e é
exatamente a camada que o resto do modelo de sandbox assume como falível (por isso existem as
camadas de isolamento depois dela, não só ela).

A hipótese registrada no catálogo (Q106) era que a assimetria vinha de medição antiga de
performance, não de decisão de projeto — e a entrega precisava vir com número antes de trocar
comportamento em produção.

## Alternativas

1. **Manter a assimetria**, aceitando que compilação de Go/Zig/C++ roda sem isolamento de
   filesystem e rede. Rejeitada de saída — viola a defesa em profundidade que o resto do sandbox
   já assume (múltiplas camadas, nenhuma delas confiável isoladamente).
2. **Isolar só com `prlimit`** (CPU e memória), sem `bwrap`. Mais barato de implementar, mas não
   fecha acesso a filesystem nem rede durante a compilação — só limita recurso, não superfície.
3. **Envelope `bwrap` idêntico ao de `compile_rust`**, para as três linguagens.

## Decisão

Alternativa 3, mas só depois de medir. O envelope idêntico ao de Rust foi aplicado a
`compile_go`, `compile_zig` e `compile_cpp`; a hipótese do Q106 se confirmou: `bwrap` custa
poucos milissegundos, não havia trade-off de performance real justificando a assimetria
original. Medição em [medições/compilacao-sandbox.md](../medicoes/compilacao-sandbox.md).

O que quase virou regressão foi outro ponto, não o `bwrap` em si: pôr `GOCACHE` dentro do
workspace da sessão (que é descartado por sessão) fazia cada submissão recompilar a stdlib do
Go inteira (50 ms → 2,8 s). A saída, já prevista pelo próprio Q106 como mitigação caso o custo
fosse real, foi cache do servidor montado read-write em `/cache` (`ZEILE_BUILD_CACHE`),
compartilhado entre sessões — não abrir mão do isolamento para recuperar velocidade.

## Consequências

- `executor/sandbox.rs` concentra o envelope de compilação para as quatro linguagens — ponto
  único em vez de quatro implementações divergentes.
- `env_clear()` foi adicionado ao envelope de compilação como achado lateral, não como item do
  Q106: antes o compilador herdava o ambiente inteiro do servidor, `DATABASE_URL` e
  `JWT_SECRET` incluídos.
- **Zig não foi medido nem exercitado por teste real** — não havia toolchain na máquina de
  medição. O envelope está escrito por simetria com as outras três linguagens (cache local na
  sessão, cache global compartilhado); a primeira execução real numa máquina com `zig`
  instalado é verificação pendente, não confirmada por este documento.
- `RunLimits` inteiro (`mem_kb` incluído, antes só `cpu_secs` chegava ao `prlimit`) foi aplicado
  na mesma etapa — achado relacionado (Q107), não pré-requisito do Q106, mas os dois tocavam o
  mesmo envelope e foram resolvidos juntos.

## Status

Aceita.
