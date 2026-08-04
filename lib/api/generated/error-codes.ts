/**
 * @generated
 * Gerado por `pnpm generate:error-codes` a partir de
 * rust-server/src/models/error.rs (ApiError::ALL_ERROR_CODES). Não editar
 * à mão — rode o comando de novo e commite o resultado.
 */

export const ERROR_CODES = [
  "BAD_REQUEST",
  "DATABASE_CONNECTION_ERROR",
  "INVALID_AUTH_TOKEN",
  "MULTIPLE_AUTH_ERRORS",
  "DATABASE_ERROR",
  "TOKEN_CREATION_FAILED",
  "INVALID_DATA",
  "INVALID_EMAIL",
  "INVALID_CREDENTIALS",
  "WRONG_PROVIDER",
  "USER_NOT_ACTIVE",
  "INVALID_PASSWORD",
  "MISSING_FRONTEND_URL",
  "USER_NOT_FOUND",
  "MISSING_ENV_VAR",
  "PASSWORDS_DO_NOT_MATCH",
  "ERROR_SENDING_EMAIL",
  "PERMISSION_DENIED",
  "LAST_LOGIN_METHOD",
  "UNIQUE_VIOLATION",
  "FOREIGN_KEY_VIOLATION",
  "NOT_FOUND",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
