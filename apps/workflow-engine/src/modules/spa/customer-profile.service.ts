import type mongoose from 'mongoose';
import { SpaCustomerProfileModel } from '@noxivo/database';

type UpsertSpaCustomerProjectionInput = {
  agencyId: mongoose.Types.ObjectId;
  memberId?: mongoose.Types.ObjectId | null | undefined;
  customerName: string;
  customerEmail?: string | null | undefined;
  customerPhone?: string | null | undefined;
  bookingStatus: string;
  appointmentDateLabel: string;
  bookedAt: Date;
};

export async function upsertSpaCustomerProjectionFromBooking(input: UpsertSpaCustomerProjectionInput) {
  const selector = input.memberId
    ? { agencyId: input.agencyId, memberId: input.memberId }
    : input.customerEmail
      ? { agencyId: input.agencyId, email: input.customerEmail }
      : { agencyId: input.agencyId, fullName: input.customerName, phone: input.customerPhone ?? null };

  return SpaCustomerProfileModel.findOneAndUpdate(
    selector,
    {
      $set: {
        agencyId: input.agencyId,
        memberId: input.memberId ?? null,
        email: input.customerEmail ?? null,
        phone: input.customerPhone ?? null,
        fullName: input.customerName,
        lastBookingAt: input.bookedAt,
        lastBookingLabel: input.appointmentDateLabel,
        lastBookingStatus: input.bookingStatus,
      },
      $inc: {
        bookingCount: 1,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).exec();
}
