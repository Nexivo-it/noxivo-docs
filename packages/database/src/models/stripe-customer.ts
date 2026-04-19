import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const StripeCustomerSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    unique: true,
    index: true
  },
  stripeCustomerId: {
    type: String,
    required: true,
    unique: true
  },
  stripeSubscriptionId: {
    type: String,
    default: null
  },
  subscriptionItemIds: {
    type: [{
      meterKey: {
        type: String,
        required: true
      },
      stripeItemId: {
        type: String,
        required: true
      }
    }],
    default: []
  },
  status: {
    type: String,
    required: true,
    enum: ['trialing', 'active', 'past_due', 'canceled', 'incomplete'],
    default: 'trialing'
  },
  isDelinquent: {
    type: Boolean,
    required: true,
    default: false
  },
  lastInvoiceAt: {
    type: Date,
    default: null
  }
}, {
  collection: 'stripeCustomers',
  timestamps: true
});

export type StripeCustomer = InferSchemaType<typeof StripeCustomerSchema>;

export const StripeCustomerModel =
  (models.StripeCustomer as Model<StripeCustomer> | undefined) ||
  model<StripeCustomer>('StripeCustomer', StripeCustomerSchema);
