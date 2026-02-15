FROM rust:bookworm as builder

WORKDIR /usr/src/app

COPY Cargo.toml Cargo.lock ./

RUN mkdir src && echo "fn main() {println!(\"dummy\")}" > src/main.rs
RUN cargo build --release

COPY . .

RUN touch src/main.rs

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    libssl-dev \
    ca-certificates \
    build-essential \
    curl \
    bubblewrap \
    && rm -rf /var/lib/apt/lists/*

ENV GO_VERSION=1.22.0
RUN curl -O https://dl.google.com/go/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz \
    && rm go${GO_VERSION}.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH="/usr/local/cargo/bin:${PATH}"

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path \
    && rustup target add wasm32-wasip1

RUN curl https://wasmtime.dev/install.sh -sSf | bash
ENV PATH="/root/.wasmtime/bin:${PATH}"

ENV WASMTIME_PATH="/root/.wasmtime/bin/wasmtime"
ENV HOME="/root"

WORKDIR /app

COPY --from=builder /usr/src/app/target/release/rust-server ./app

EXPOSE 3099

CMD ["./app"]
