import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildServer } from './server.js';
import { ensurePlatformSeeds } from '@noxivo/database';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = dirname(currentFilePath);

// Load .env.local in development — silently skip if file is absent (production/Docker)
try {
  process.loadEnvFile?.(resolve(currentDirectoryPath, '../.env.local'));
} catch {
  // File not present — expected in production containers
}

async function attemptListen(server: any, host: string, port: number, maxAttempts: number = 10, attempt: number = 1): Promise<number> {
  try {
    await server.listen({ port, host });
    return port;
  } catch (error: any) {
    if (error.code === 'EADDRINUSE' && attempt < maxAttempts) {
      server.log.warn(`Port ${port} in use, trying ${port + 1}...`);
      return attemptListen(server, host, port + 1, maxAttempts, attempt + 1);
    }
    throw error;
  }
}

async function start() {
  const initialPort = Number.parseInt(process.env.PORT ?? '4000', 10);
  const host = process.env.HOST ?? '0.0.0.0';
  
  console.log('🚀 Starting Noxivo Workflow Engine...');

  try {
    // 1. Automate platform seeding on startup
    console.log('🌱 Seeding platform data...');
    await ensurePlatformSeeds();
    console.log('✅ Seeding complete');

    // 2. Build the server
    console.log('🏗️ Building server instance...');
    const server = await buildServer({ logger: process.env.LOGGER !== 'false' });
    console.log('✅ Server built');

    try {
      // 3. Start listening
      const finalPort = await attemptListen(server, host, initialPort);
      server.log.info('Workflow engine listening on %s:%d', host, finalPort);

      // 4. Cluster Management
      const actualHostUrl = process.env.CLUSTER_NODE_HOST || `http://127.0.0.1:${finalPort}`;
      await server.clusterManager.start(actualHostUrl);
      server.log.info('Cluster manager joined with node URL: %s', actualHostUrl);

    } catch (error) {
      if (server) {
        server.log.error(error);
      } else {
        console.error('Fatal error during startup listen phase:', error);
      }
      process.exit(1);
    }
  } catch (globalError) {
    console.error('❌ CRITICAL: Workflow engine failed to boot:', globalError);
    process.exit(1);
  }
}

void start();
