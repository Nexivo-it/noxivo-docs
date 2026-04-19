import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 60000,
    testTimeout: 60000,
    setupFiles: ['./test/setup.ts']
  },
  resolve: {
    alias: {
      '@noxivo/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@noxivo/database': resolve(__dirname, '../../packages/database/src/index.ts'),
      '@noxivo/database/models': resolve(__dirname, '../../packages/database/src/models/index.ts'),
      '@noxivo/database/contact-profile-projection': resolve(__dirname, '../../packages/database/src/contact-profile-projection.ts'),
      '@noxivo/messaging-client': resolve(__dirname, '../../packages/messaging-client/src/index.ts')
    }
  }
});
