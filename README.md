# Zeile Notebook

![Zeile Interface](public/zeile-en.png)

Zeile Notebook is a block-based platform for developers, educators, and students. It enables the creation of interactive notebooks that blend Markdown documentation, user interfaces, and native code execution (such as Rust and Go) within an isolated remote environment.

Whether prototyping an API, teaching a programming language, or documenting architectures, Zeile provides an isolated and collaborative workspace.

## Key Features

* **Interactive Blocks:** Combined use of Markdown text and executable code on the same page.
* **Privacy by Default:** User code and notes are not used for Artificial Intelligence model training.
* **Collaboration and Forking:** Option to make notebooks public or clone (fork) notebooks from other users into your own environment.
* **Shortcuts:** Keyboard-based navigation for structured block editing.

## Security Architecture

Executing third-party code on the server utilizes isolation layers to maintain stability and protect the system against abuse (such as DoS, cryptocurrency mining, or unauthorized access):

1. **Static Analysis (AST/Regex):** Prior to compilation, the code is scanned to block compiler directives (e.g., `//go:generate`) and system imports (e.g., `include!` macros in Rust or `os/exec` subpackages in Go).
2. **Container Isolation (Bubblewrap/Bwrap):** The compilation process and execution occur within a restricted environment.
   * *Network Namespace:* Removal of network access (`--unshare-all`) to prevent external connections.
   * *Filesystem Read-Only:* The base filesystem is mounted in read-only mode. The process only accesses a temporary virtual directory.
3. **WebAssembly (WASI):** Rust code is compiled to Wasm and executed through the `wasmtime` engine, restricting direct access to the host architecture.
4. **Kernel Limits (prlimit):** Processes have defined limits for CPU usage and thread count to mitigate resource exhaustion.
5. **Process Management:** Use of *Process Groups* (PGID) with defined timeouts to terminate infinite loop processes and their respective child threads.
6. **Session Isolation:** Compilation workspaces are generated and mapped via UUID, preventing file collision between users sharing the same network.

## Local Development

*(Coming soon: Instructions to configure and run the Next.js frontend and the Rust/Axum execution engine).*

## Terms and Privacy

The system complies with data protection standards and collects only the data necessary for authentication and logging.
* No inserted data is sold or used to train third-party Artificial Intelligence models.
* Use of the infrastructure for malware, DDoS, or mining will result in account suspension and deletion of linked data.
* Refer to the full [Privacy Policy](/docs/privacy) and [Terms of Use](/docs/terms).

## License

Zeile Notebook is released under the [MIT License](LICENSE). You are free to use, modify and
distribute it, including commercially, as long as the copyright notice is kept.

The license covers the source code. The **Zeile** name and logo are not licensed with it — a
fork is welcome, calling it Zeile is not.

## Contributing

To contribute to the development of the block interface or the execution engine, access the instructions in the repository at [HadsonRamalho/docs](https://github.com/HadsonRamalho/docs).
