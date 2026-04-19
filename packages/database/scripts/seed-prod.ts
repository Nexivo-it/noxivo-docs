/// <reference types="node" />
import { ensurePlatformSeeds } from '../src/index.js';

/**
 * Manual production seeding script.
 * Now just a wrapper around the shared ensurePlatformSeeds utility.
 */
async function run() {
  await ensurePlatformSeeds();
}

run().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
