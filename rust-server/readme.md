# Rust API Template

A scalable template for building REST APIs in Rust, using:

- axum: modern asynchronous web framework
- diesel: safe and powerful ORM
- diesel-async: asynchronous PostgreSQL connections
- jsonwebtoken: JWT-based authentication
- reqwest: HTTP client for consuming external APIs
- web-push: push notifications for browsers
- utoipa: OpenAPI documentation generation


## Features

- User registration and login with validations
- JWT authentication (access token)
- Authentication middleware with axum
- Full async PostgreSQL support
- Modular and extensible architecture
- Planned support for:
  - Refresh tokens and session management
  - External API consumption
  - Push notifications using Web Push

## Requirements

- Rust (stable)
- PostgreSQL
- Diesel CLI (optional but recommended)

Install Diesel CLI:

```
cargo install diesel_cli --no-default-features --features postgres
```
or

https://diesel.rs/guides/getting-started

## .env Configuration

Create a `.env` file in the root with:

```
DATABASE_URL=postgres://username:password@localhost/database_name

JWT_SECRET=your_super_secret_key

FRONTEND_URL=http://localhost:3000
```


## Running the Project

```
diesel setup

cargo run
```

## API Documentation (Swagger UI)

After running the server, access the interactive documentation at:
```
http://localhost:3099/docs
```

## Contributing

Contributions are welcome! Feel free to open issues or PRs.


## Author

Made by HadsonRamalho with ❤️ and Rust.
