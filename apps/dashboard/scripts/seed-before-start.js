import path from 'node:path';
import { spawn } from 'node:child_process';

async function main() {
  const basePath = process.cwd();
  const seedUtils = await import(path.join(basePath, 'packages/database/dist/seed-utils.js'));

  console.log('🌱 Running platform seeds...');
  console.log('Base path:', basePath);

  await seedUtils.ensurePlatformSeeds();

  console.log('🚀 Starting Next.js...');
  const child = spawn('node', ['apps/dashboard/server.js'], {
    stdio: 'inherit',
    env: process.env,
    cwd: basePath
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();