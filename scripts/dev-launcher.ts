import process from 'process';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'child_process';
import path from 'path';

async function start() {
  console.log('🛠  Initializing Zero-Config Dev Environment...');
  
  // 1. Start In-Memory MongoDB
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri() + 'noxivo';
  console.log(`🚀 In-memory MongoDB started at: ${uri}`);

  // 2. Seed the DB
  console.log('🌱 Seeding data...');
  const seedProcess = spawn('npx', ['tsx', 'packages/database/scripts/seed-dev.ts'], {
    env: { ...process.env, MONGODB_URI: uri },
    stdio: 'inherit',
    shell: true
  });

  seedProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ Seeding failed with code ${code}. Check if you have another instance running.`);
      mongod.stop();
      process.exit(1);
    }

    console.log('✅ Data ready. Starting Noxivo SaaS Dashboard...');
    
    // 3. Start the actual project
    // Note: We use the absolute path to pnpm found earlier to ensure it works in this environment
    const pnpmPath = '/opt/homebrew/bin/pnpm';
    
    const devProcess = spawn(pnpmPath, ['dev'], {
      env: { 
        ...process.env, 
        MONGODB_URI: uri,
        NODE_ENV: 'development'
      },
      stdio: 'inherit',
      shell: true
    });

    // 4. Handle Cleanup
    const cleanup = async () => {
      console.log('\n🧹 Cleaning up ephemeral database...');
      devProcess.kill();
      await mongod.stop();
      console.log('👋 Goodbye!');
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
}

start().catch((err) => {
  console.error('💥 Critical failure in dev-launcher:', err);
  process.exit(1);
});
