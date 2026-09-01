/**
 * Demo-mode data source (server only).
 *
 * With no Supabase env configured, the app runs entirely from the bundled
 * dataset plus an in-memory submission store, so every flow — explore,
 * contribute, moderate, route — works with zero setup. Submissions reset on
 * server restart; the UI labels demo mode accordingly.
 *
 * The moderation state machine here mirrors docs/03-DATABASE.md and is the
 * same logic that guards the Supabase path.
 */

import {
  demoCollections,
  demoFeatures,
  demoLayers,
  LAYER_TITLES,
  type DemoFeature,
} from "./demo-data";
import type { SubmissionStatus } from "@/types/domain";
import type { SubmissionCreate } from "@/lib/validation/schemas";

export interface StoredSubmission {
  id: string;
  layerId: string;
  featureId: string | null;
  geometry: SubmissionCreate["geometry"];
  attributes: Record<string, unknown>;
  note?: string;
  observedAt: string;
  status: SubmissionStatus;
  submittedBy: string;
  reviewerNote?: string;
  createdAt: string;
}

export interface AuditEntry {
  submissionId: string;
  actorId: string;
  fromStatus: SubmissionStatus;
  toStatus: SubmissionStatus;
  reason?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Moderation state machine (shared logic, mirrored in tests)
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  draft: ["submitted"],
  submitted: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["published"],
  rejected: [],
  published: [],
};

export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Module-singleton store (survives HMR via globalThis)
// ---------------------------------------------------------------------------

interface DemoStore {
  submissions: StoredSubmission[];
  approvedFeatures: DemoFeature[];
  audit: AuditEntry[];
  counter: number;
}

const g = globalThis as unknown as { __qulaymapStore?: DemoStore };
const store: DemoStore =
  g.__qulaymapStore ?? (g.__qulaymapStore = { submissions: [], approvedFeatures: [], audit: [], counter: 1 });

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function getCollections() {
  return demoCollections.map((c) => ({
    ...c,
    layerCount: demoLayers.filter((l) => l.collectionSlug === c.slug).length,
    featureCount: allFeatures().filter((f) =>
      demoLayers.some((l) => l.id === f.layerId && l.collectionSlug === c.slug),
    ).length,
  }));
}

export function getCollection(slug: string) {
  const collection = demoCollections.find((c) => c.slug === slug);
  if (!collection) return null;
  const layers = demoLayers
    .filter((l) => l.collectionSlug === slug)
    .map((l) => ({ ...l, titles: LAYER_TITLES[l.titleKey] }));
  const layerIds = new Set(layers.map((l) => l.id));
  const features = allFeatures().filter((f) => layerIds.has(f.layerId));
  return { collection, layers, features };
}

export function getLayer(layerId: string) {
  const layer = demoLayers.find((l) => l.id === layerId);
  if (!layer) return null;
  return { ...layer, titles: LAYER_TITLES[layer.titleKey] };
}

export function allFeatures(): DemoFeature[] {
  return [...demoFeatures, ...store.approvedFeatures];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function createSubmission(input: SubmissionCreate, submittedBy: string): StoredSubmission {
  const sub: StoredSubmission = {
    id: `sub-${store.counter++}`,
    layerId: input.layerId,
    featureId: input.featureId,
    geometry: input.geometry,
    attributes: input.attributes,
    note: input.note,
    observedAt: input.observedAt,
    status: "submitted",
    submittedBy,
    createdAt: new Date().toISOString(),
  };
  store.submissions.unshift(sub);
  return sub;
}

export function listSubmissions(status?: SubmissionStatus): StoredSubmission[] {
  return status ? store.submissions.filter((s) => s.status === status) : [...store.submissions];
}

export class ConflictError extends Error {
  constructor(from: SubmissionStatus, to: SubmissionStatus) {
    super(`Illegal transition ${from} -> ${to}`);
    this.name = "ConflictError";
  }
}

export function reviewSubmission(
  id: string,
  decision: "approve" | "reject",
  actorId: string,
  note?: string,
): StoredSubmission | null {
  const sub = store.submissions.find((s) => s.id === id);
  if (!sub) return null;

  const to: SubmissionStatus = decision === "approve" ? "approved" : "rejected";
  if (!canTransition(sub.status, to)) throw new ConflictError(sub.status, to);

  const from = sub.status;
  sub.status = to;
  sub.reviewerNote = note;
  store.audit.push({
    submissionId: sub.id,
    actorId,
    fromStatus: from,
    toStatus: to,
    reason: note,
    createdAt: new Date().toISOString(),
  });

  if (decision === "approve") {
    // approved -> published, materialize the map feature (org_reviewed trust)
    sub.status = "published";
    store.audit.push({
      submissionId: sub.id,
      actorId,
      fromStatus: "approved",
      toStatus: "published",
      createdAt: new Date().toISOString(),
    });
    const name =
      typeof sub.attributes.name === "string" && sub.attributes.name.trim().length > 0
        ? (sub.attributes.name as string)
        : null;
    store.approvedFeatures.push({
      id: `f-${sub.id}`,
      layerId: sub.layerId,
      geometry: sub.geometry as DemoFeature["geometry"],
      name,
      trustState: "org_reviewed",
      observedAt: sub.observedAt,
      source: `contributor: ${sub.submittedBy}`,
      isDemo: true, // demo mode: everything stays honestly labeled
      attributes: sub.attributes,
    });
  }

  return sub;
}
