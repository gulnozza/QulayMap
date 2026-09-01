import { NextResponse } from "next/server";

export function jsonError(
  status: number,
  code: string,
  message?: string,
  fields?: Record<string, string>,
) {
  return NextResponse.json(
    { error: { code, message: message ?? code, ...(fields ? { fields } : {}) } },
    { status },
  );
}
