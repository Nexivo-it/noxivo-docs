export type SupportedShopProvider = 'shopify' | 'woocommerce';
export const SHOP_PLAN_PERMISSIONS = {
  reseller_basic: { shopify: false, woocommerce: false },
  reseller_pro: { shopify: true, woocommerce: true },
  enterprise: { shopify: true, woocommerce: true },
} as const satisfies Record<string, Record<SupportedShopProvider, boolean>>;

export type SupportedAgencyPlan = keyof typeof SHOP_PLAN_PERMISSIONS;

function isSupportedAgencyPlan(plan: string): plan is SupportedAgencyPlan {
  return Object.hasOwn(SHOP_PLAN_PERMISSIONS, plan);
}

function copyPermissions(plan: SupportedAgencyPlan): Record<SupportedShopProvider, boolean> {
  return { ...SHOP_PLAN_PERMISSIONS[plan] };
}

export function getShopPermissionsForPlan(plan: string): Record<SupportedShopProvider, boolean> {
  if (isSupportedAgencyPlan(plan)) {
    return copyPermissions(plan);
  }

  return copyPermissions('reseller_basic');
}

export function canUseShopProvider(plan: string, provider: SupportedShopProvider): boolean {
  return getShopPermissionsForPlan(plan)[provider];
}
