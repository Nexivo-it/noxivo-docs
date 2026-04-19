import { z } from 'zod';

const PremiumAgencyPlanSchema = z.enum(['reseller_pro', 'enterprise']);
const AgencyStatusSchema = z.enum(['trial', 'active', 'suspended', 'cancelled']);

const AgencyRepoInterface = z.object({
  findById: z.function()
});

const AgencyInterface = z.object({
  id: z.string(),
  plan: z.enum(['reseller_basic', 'reseller_pro', 'enterprise']),
  status: AgencyStatusSchema
});

type Agency = z.infer<typeof AgencyInterface>;

const EntitlementCheckInputSchema = z.object({
  agencyId: z.string().min(1),
  feature: z.enum(['premium_plugin', 'ai_action', 'webhook_ingestion'])
});

type EntitlementCheckInput = z.infer<typeof EntitlementCheckInputSchema>;

type EntitlementResult = {
  allowed: boolean;
  reason?: string;
};

function hasDelinquentBillingState(status: z.infer<typeof AgencyStatusSchema>): boolean {
  return status === 'suspended' || status === 'cancelled';
}

function hasPremiumPlan(plan: Agency['plan']): boolean {
  return PremiumAgencyPlanSchema.safeParse(plan).success;
}

export class EntitlementService {
  private readonly agencyRepo: z.infer<typeof AgencyRepoInterface>;

  constructor(input: { agencyRepo: z.infer<typeof AgencyRepoInterface> }) {
    this.agencyRepo = input.agencyRepo;
  }

  async checkEntitlement(input: EntitlementCheckInput): Promise<EntitlementResult> {
    const parsed = EntitlementCheckInputSchema.parse(input);

    const agency = await this.agencyRepo.findById(parsed.agencyId) as Agency | null;

    if (!agency) {
      return { allowed: false, reason: 'Agency not found' };
    }

    if (parsed.feature === 'webhook_ingestion') {
      return { allowed: true };
    }

    const isDelinquent = hasDelinquentBillingState(agency.status);
    const isPremium = hasPremiumPlan(agency.plan);

    if (isDelinquent) {
      return { allowed: false, reason: 'Agency subscription is delinquent' };
    }

    if (parsed.feature === 'premium_plugin' && !isPremium) {
      return { allowed: false, reason: 'Premium feature requires premium plan' };
    }

    if (parsed.feature === 'ai_action' && !isPremium) {
      return { allowed: false, reason: 'AI features require premium plan' };
    }

    return { allowed: true };
  }
}
