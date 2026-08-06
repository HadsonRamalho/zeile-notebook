import type { Result } from "@catcherjs/core";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/base";

type Translate = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

interface HandleErrorOptions {
  err: unknown;
  t: Translate;
  setError?: (msg: string) => void;
}

interface HandleResultOptions {
  result: Result<unknown, unknown>;
  t: Translate;
  setError?: (msg: string) => void;
}

// Accepts either a caught exception (legacy try/catch call sites) or a Result
// directly (Q109/etapa 19) — a Result that's Ok is a no-op, so callers can
// pass it unconditionally instead of guarding with `if (result.isErr())` first.
export function handleApiError(
  options: HandleErrorOptions | HandleResultOptions,
) {
  let err: unknown;
  if ("result" in options) {
    if (options.result.isOk()) return;
    err = options.result.error;
  } else {
    err = options.err;
  }

  const { t, setError } = options;
  const errorCode = err instanceof ApiClientError ? err.code : "UNKNOWN_ERROR";
  const errorDetails = err instanceof ApiClientError ? err.details : {};

  const translatedMessage = t(
    errorCode,
    errorDetails as Record<string, string | number | Date>,
  );

  if (setError) {
    setError(translatedMessage);
  }

  toast.error(translatedMessage);
}
