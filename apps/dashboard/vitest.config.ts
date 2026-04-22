import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '@noxivo/contracts': resolve(__dirname, '../../packages/contracts/src'),
      '@noxivo/database': resolve(__dirname, '../../packages/database/src'),
      '@noxivo/workflow-engine': resolve(__dirname, '../workflow-engine/src/public-api.ts')
    }
  }
});
