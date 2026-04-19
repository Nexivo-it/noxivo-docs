import {
  parseWhiteLabelConfig,
  type WhiteLabelConfig
} from '@noxivo/contracts';

export interface TenantBrandingOverrides extends Partial<WhiteLabelConfig> {}

export function resolveEffectiveBranding(input: {
  agencyDefaults: unknown;
  tenantOverrides?: TenantBrandingOverrides | null;
}): WhiteLabelConfig {
  const agencyDefaults = parseWhiteLabelConfig(input.agencyDefaults);
  const overrides = input.tenantOverrides ?? {};

  return parseWhiteLabelConfig({
    ...agencyDefaults,
    ...overrides
  });
}
