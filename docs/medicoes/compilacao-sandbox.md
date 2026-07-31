# Medição — custo de compilar dentro do `bwrap` (Q106)

O Q106 registrou uma hipótese: a assimetria entre compilar Rust sob `bwrap` e compilar
Go/Zig/C++ direto no host seria **resíduo de medição antiga, não decisão de projeto**. A
decisão exigia número antes e depois, na mesma máquina. Este é o número.

## Método

Hello world por linguagem, 5 repetições, média, cache quente, com o fonte tocado a cada
repetição para forçar recompilação de verdade (sem isso o `cargo` responde `fresh: true` e
a medida vira ruído). Script: `scripts/medir-compilacao.sh`.

Envelope "depois" é o que `CompileSandbox::args()` produz:

```
prlimit --cpu=30 --as=4294967296 -- bwrap --unshare-all --die-with-parent --new-session \
  --ro-bind /usr /usr --ro-bind-try /lib /lib --ro-bind-try /lib64 /lib64 \
  --ro-bind-try /bin /bin --dev /dev --proc /proc --dir /tmp \
  [--ro-bind-try <toolchain> <toolchain>]... \
  --bind <cache compartilhado> /cache \
  --bind <workspace da sessão> /app --chdir /app
```

Máquina: Linux 7.0.12-zen1, x86_64. Go 1.x e clang++ do sistema, cargo com alvo
`wasm32-wasip1`.

## Resultado

| linguagem | antes | depois | Δ |
|---|---|---|---|
| **go** — mesma sessão, cache quente | 48 ms (host, sem sandbox nenhum) | 53 ms | +5 ms |
| **go** — sessão nova, cache compartilhado quente | 48 ms | 114 ms | +66 ms |
| **go** — primeira compilação após o boot (cache frio) | 2 792 ms | 2 763 ms | ≈ 0 |
| **c++** | 481 ms (só `prlimit --cpu=10 --as=2G`) | 488 ms | +7 ms |
| **rust** | 71 ms (`bwrap` sem `prlimit`) | 71 ms | 0 |
| **zig** | não medido — toolchain ausente na máquina de medição | — | — |

## Leitura

**A hipótese do Q106 se confirma.** O custo do `bwrap` em si é de poucos milissegundos —
o tempo de montar os namespaces. Não há trade-off de performance que justificasse deixar
`go build` e `clang++` rodando no host, e o C++ já pagava `prlimit` sem ganhar isolamento
de filesystem em troca.

**O que quase virou regressão real:** a primeira versão desta mudança colocou o `GOCACHE`
dentro do workspace da sessão, que é o único ponto de escrita do sandbox. Como cada
submissão tem workspace próprio, o cache nascia vazio e o Go recompilava a stdlib toda
vez: **50 ms → 2,8 s por submissão**. O Q106 já previa a saída ("reaproveitar o sandbox
— bind read-only do toolchain, cache do `go build` — não abrir mão dele"), e é o que
está implementado: um diretório de cache do servidor (`ZEILE_BUILD_CACHE`, default
`files/.build-cache`) montado read-write em `/cache`, compartilhado entre sessões.

Com ele, só a primeira compilação depois do boot paga os 2,7 s; as seguintes ficam em
~114 ms mesmo para sessão nova. O diretório não é uma abertura nova de superfície: é o
mesmo cache que o `go build` já escrevia no host antes deste envelope, com a diferença de
agora ter caminho declarado e estar fora do alcance de tudo o mais.

**O adicional de ~66 ms na sessão nova** é o custo de montar namespace, `/cache` e `/app`
somado ao link do binário, que não se aproveita entre sessões porque o artefato de saída
é outro. É o preço do isolamento e está pago.

## O que muda no envelope, além do `bwrap`

- **`env_clear`**: antes o compilador herdava o ambiente inteiro do servidor — incluindo
  `DATABASE_URL` e `JWT_SECRET`. Agora recebe só `PATH`, `HOME`, `TMPDIR` e o que a
  linguagem exige.
- **`CGO_ENABLED=0` na compilação Go**: `#cgo` faz o `go build` invocar o compilador C
  com flags escritas pelo próprio código do usuário.
- **`GOTOOLCHAIN=local`**: sem rede no sandbox, falha dizendo isso em vez de tentar
  baixar um toolchain.
- **`prlimit` no Rust também**: era o único que compilava sem teto de CPU e de memória.

## Como refazer a medição

```
bash scripts/medir-compilacao.sh          # 5 repetições
REPS=20 bash scripts/medir-compilacao.sh  # mais estável
```
