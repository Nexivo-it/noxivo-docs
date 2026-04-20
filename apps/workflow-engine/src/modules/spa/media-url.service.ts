import { type MediaProvider } from '@noxivo/contracts';

type SpaMediaConfig = {
  provider: MediaProvider;
  publicBaseUrl?: string | null;
  pathPrefix?: string | null;
};

type ResolveSpaMediaUrlInput = {
  assetPath: string | null | undefined;
  config: SpaMediaConfig | null;
};

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

export function resolveSpaMediaUrl(input: ResolveSpaMediaUrlInput): string | null {
  if (!input.assetPath) {
    return null;
  }

  if (/^https?:\/\//i.test(input.assetPath)) {
    return input.assetPath;
  }

  if (!input.config?.publicBaseUrl) {
    return input.assetPath;
  }

  const base = input.config.publicBaseUrl.replace(/\/+$/, '');
  const prefix = input.config.pathPrefix ? `/${trimSlashes(input.config.pathPrefix)}` : '';
  const assetPath = input.assetPath.startsWith('/') ? input.assetPath : `/${input.assetPath}`;

  return `${base}${prefix}${assetPath}`;
}
