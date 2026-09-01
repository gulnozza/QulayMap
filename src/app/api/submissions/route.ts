import { NextRequest, NextResponse } from "next/server";
import { SubmissionCreateSchema } from "@/lib/validation/schemas";
import { createSubmission, getLayer } from "@/lib/data/store";
import { jsonError } from "@/lib/http";

/**
 * POST /api/submissions — create a place/correction/condition submission.
 * Demo mode: attributed to "demo-user", stored in memory, reviewable in /studio.
 * Supabase mode adds real auth + RLS (docs/04-API-SPEC.md).
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, "invalid_payload", "Body must be JSON");
  }
  const parsed = SubmissionCreateSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return jsonError(
      400,
      "invalid_payload",
      first ? `${first.path.join(".")}: ${first.message}` : "Invalid payload",
    );
  }
  if (!getLayer(parsed.data.layerId)) {
    return jsonError(404, "not_found", `Unknown layer: ${parsed.data.layerId}`);
  }

  const submission = createSubmission(parsed.data, "demo-user");
  return NextResponse.json(
    { submission: { id: submission.id, status: submission.status } },
    { status: 201 },
  );
}
