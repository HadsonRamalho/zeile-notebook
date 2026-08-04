import { NextResponse } from "next/server";
import type { ErrorCode } from "@/lib/api/generated/error-codes";

export function routeError(
  code: ErrorCode | (string & {}),
  message: string,
  status: number,
  details: Record<string, unknown> = {},
) {
  return NextResponse.json({ code, message, details }, { status });
}
