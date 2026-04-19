import { describe, expect, it } from 'vitest';
import { resolveSpaMediaUrl } from '../src/modules/spa/media-url.service.js';

describe('resolveSpaMediaUrl', () => {
  it('resolves ImageKit asset references with the configured endpoint', () => {
    const url = resolveSpaMediaUrl({
      assetPath: '/services/signature-manicure.png',
      config: {
        provider: 'imagekit',
        publicBaseUrl: 'https://ik.imagekit.io/luxenail',
      },
    });

    expect(url).toBe('https://ik.imagekit.io/luxenail/services/signature-manicure.png');
  });
});
