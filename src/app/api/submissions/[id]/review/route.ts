import { NextRequest, NextResponse } from "next/server";
import { ReviewSchema } from "@/lib/validation/schemas";
import { ConflictError, reviewSubmission } from "@/lib/data/store";
import { jsonError } from "@/lib/http";

/**
 * POST /api/submissions/[id]/review — approve/reject with audit trail.
 * Demo mode acts as the "Access Tashkent" demo moderator; Supabase mode
 * enforces org reviewer roles + RLS.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, "invalid_payload", "Body must be JSON");
  }
  const parsed = ReviewSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, "invalid_payload", parsed.error.issues[0]?.message);
  }
  if (parsed.data.decision === "request_changes") {
    return jsonError(400, "invalid_payload", "request_changes is not available in demo mode");
  }

  try {
    const updated = reviewSubmission(
      id,
      parsed.data.decision,
      "demo-moderator",
      parsed.data.note,
    );
    if (!updated) return jsonError(404, "not_found", `Unknown submission: ${id}`);
    return NextResponse.json({ submission: { id: updated.id, status: updated.status } });
  } catch (err) {
    if (err instanceof ConflictError) return jsonError(409, "conflict", err.message);
    throw err;
  }
}
