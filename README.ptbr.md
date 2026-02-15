# Zeile Notebook

![Zeile Interface](public/zeile.png)

O Zeile Notebook é uma plataforma baseada em blocos para desenvolvedores, professores e estudantes. Ele permite a criação de cadernos interativos que mesclam documentação em Markdown, interfaces e execução de código nativo (como Rust e Go) em um ambiente remoto isolado.

Seja para prototipar uma API, ensinar uma linguagem de programação ou documentar arquiteturas, o Zeile oferece um ambiente isolado e colaborativo.

## Principais Funcionalidades

* **Blocos Interativos:** Uso conjunto de texto em Markdown e código executável na mesma página.
* **Privacidade por Padrão:** O código e as anotações do usuário não são utilizados para treinamento de modelos de Inteligência Artificial.
* **Colaboração e Forking:** Opção de tornar cadernos públicos ou realizar clones (forks) de cadernos de outros usuários para o seu ambiente.
* **Atalhos:** Navegação baseada em teclado para edição estruturada dos blocos.

## Arquitetura de Segurança

A execução de código de terceiros no servidor utiliza camadas de isolamento para manter a estabilidade e proteger o sistema contra abusos (como DoS, mineração de criptomoedas ou acessos indevidos):

1. **Análise Estática (AST/Regex):** Antes da compilação, o código é verificado para bloquear diretivas de compilador (ex: `//go:generate`) e importações de sistema (ex: macros `include!` no Rust ou subpacotes `os/exec` no Go).
2. **Isolamento de Contêiner (Bubblewrap/Bwrap):** O processo de compilação e a execução ocorrem dentro de um ambiente restrito.
   * *Network Namespace:* Remoção do acesso à rede (`--unshare-all`) para evitar conexões externas.
   * *Filesystem Read-Only:* O sistema de arquivos base é montado em modo leitura. O processo acessa apenas um diretório virtual temporário.
3. **WebAssembly (WASI):** O código Rust é compilado para Wasm e executado através do motor `wasmtime`, restringindo o acesso direto à arquitetura do host.
4. **Limites do Kernel (prlimit):** Processos possuem limites definidos de uso de CPU e número de threads para mitigar a exaustão de recursos.
5. **Gerenciamento de Processos:** Uso de *Process Groups* (PGID) com *timeouts* definidos para encerrar processos em loop infinito e suas respectivas threads filhas.
6. **Isolamento de Sessão:** Os espaços de trabalho (workspaces) de compilação são gerados e mapeados via UUID, prevenindo a colisão de arquivos entre usuários que compartilham a mesma rede.

## Como rodar localmente

*(Em breve: Instruções para configurar e executar o frontend em Next.js e o motor de execução em Rust/Axum).*

## Termos e Privacidade

O sistema está em conformidade com a LGPD e coleta apenas os dados necessários para autenticação e geração de logs.
* Nenhum dado inserido é vendido ou utilizado para treinar modelos de Inteligência Artificial de terceiros.
* O uso da infraestrutura para malwares, DDoS ou mineração resultará em suspensão da conta e exclusão dos dados vinculados.
* Consulte a [Política de Privacidade](/docs/privacy) e os [Termos de Uso](/docs/terms) completos.

## Contribuindo

Para contribuir com o desenvolvimento da interface de blocos ou do motor de execução, acesse as instruções no repositório em [HadsonRamalho/docs](https://github.com/HadsonRamalho/docs).
