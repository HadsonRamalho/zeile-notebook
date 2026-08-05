import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/base";

interface HandleErrorOptions {
  err: unknown;
  t: (
    key: string,
    values?: Record<string, string | number | Date>,
  ) => string;
  setError?: (msg: string) => void;
}

export function handleApiError({ err, t, setError }: HandleErrorOptions) {
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
