import type { SessionActor } from './session';
import { TenantModel } from '@noxivo/database';

function isObjectIdLike(value: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(value);
}

function dedupeTenantIds(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

export function resolveActorTenantId(actor: SessionActor): string | null {
  if (actor.tenantId.length > 0) {
    return actor.tenantId;
  }

  const fallbackTenantId = actor.tenantIds.find((tenantId) => tenantId.length > 0);
  return fallbackTenantId ?? null;
}

export async function resolveActorTenantCandidates(actor: SessionActor): Promise<string[]> {
  const rawCandidates = dedupeTenantIds([
    actor.tenantId,
    ...(actor.tenantIds ?? [])
  ]);

  if (rawCandidates.length === 0) {
    return [];
  }

  const objectIdCandidates = rawCandidates.filter(isObjectIdLike);
  const slugCandidates = rawCandidates
    .filter((candidate) => !isObjectIdLike(candidate))
    .map((candidate) => candidate.toLowerCase());

  if (slugCandidates.length === 0) {
    return rawCandidates;
  }

  const agencyScopedQuery = isObjectIdLike(actor.agencyId)
    ? {
        agencyId: actor.agencyId,
        slug: { $in: slugCandidates }
      }
    : {
        slug: { $in: slugCandidates }
      };

  let matchedTenants = await TenantModel.find(agencyScopedQuery, { _id: 1 }).lean();

  // Fallback: if agency context is stale/non-canonical, still resolve by unique slug.
  if (matchedTenants.length === 0 && isObjectIdLike(actor.agencyId)) {
    matchedTenants = await TenantModel.find(
      { slug: { $in: slugCandidates } },
      { _id: 1 }
    ).lean();
  }

  const resolvedTenantIds = matchedTenants.map((tenant) => tenant._id.toString());

  return dedupeTenantIds([
    ...objectIdCandidates,
    ...resolvedTenantIds,
    ...rawCandidates
  ]);
}
