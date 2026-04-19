import { type Types } from 'mongoose';
import { CustomDomainReservationModel, type CustomDomainReservation } from '@noxivo/database';
import { normalizeCustomDomain } from '@noxivo/contracts';

function normalizeNullableDomain(domain: string | null | undefined): string | null {
  if (!domain || domain.trim().length === 0) {
    return null;
  }

  return normalizeCustomDomain(domain);
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Error && /duplicate key/i.test(error.message);
}

export async function syncCustomDomainReservation(input: {
  ownerType: CustomDomainReservation['ownerType'];
  ownerId: string | Types.ObjectId;
  nextDomain: string | null | undefined;
  currentDomain?: string | null;
}): Promise<string | null> {
  const nextDomain = normalizeNullableDomain(input.nextDomain);
  const currentDomain = normalizeNullableDomain(input.currentDomain);

  if (nextDomain === currentDomain) {
    return nextDomain;
  }

  if (nextDomain) {
    try {
      await CustomDomainReservationModel.create({
        domain: nextDomain,
        ownerType: input.ownerType,
        ownerId: input.ownerId
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new Error('Custom domain is already in use');
      }

      throw error;
    }
  }

  if (currentDomain) {
    await CustomDomainReservationModel.deleteOne({
      domain: currentDomain,
      ownerType: input.ownerType,
      ownerId: input.ownerId
    }).exec();
  }

  return nextDomain;
}
