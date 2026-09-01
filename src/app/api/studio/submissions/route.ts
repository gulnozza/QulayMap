import { NextRequest, NextResponse } from "next/server";
import { getLayer, listSubmissions } from "@/lib/data/store";
import type { SubmissionStatus } from "@/types/domain";

/** GET /api/studio/submissions — moderation queue (demo: single org scope). */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") as SubmissionStatus | null;
  const submissions = listSubmissions(status ?? undefined).map((s) => ({
    id: s.id,
    status: s.status,
    layer: getLayer(s.layerId),
    geometry: s.geometry,
    attributes: s.attributes,
    note: s.note,
    observedAt: s.observedAt,
    submittedBy: s.submittedBy,
    reviewerNote: s.reviewerNote,
    createdAt: s.createdAt,
  }));
  return NextResponse.json({ submissions });
}
