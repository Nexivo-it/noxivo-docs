import { buildServer } from '../src/server.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generate() {
  // Set dummy env vars to avoid startup issues
  process.env.MONGODB_URI = 'mongodb://localhost:27017/dummy';
  process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'dummy';
  process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET = 'dummy';

  // Mock dbConnect to avoid actual connection
  mongoose.connect = async () => ({ connection: { on: () => {}, once: () => {} } }) as any;

  console.log('🏗️ Building server instance for OpenAPI generation...');
  const fastify = await buildServer({ logger: false });
  
  await fastify.ready();
  
  console.log('🔍 Extracting OpenAPI spec...');
  const openapi = fastify.swagger() as any;

  // Enhance metadata
  openapi.info = {
    title: 'Noxivo Engine API',
    description: 'Independent, headless WhatsApp & Automation engine. <br/><br/><b>Quick Links:</b><br/>• <a href="https://admin.noxivo.app/" style="color: #25D366; font-weight: bold;">Go to Admin Dashboard</a> | <a href="https://admin.noxivo.app/docs" style="color: #25D366; font-weight: bold;">Documentation</a>',
    version: '1.0.0',
    contact: {
      name: 'Noxivo Support',
      url: 'https://noxivo.app',
    }
  };

  openapi.servers = [
    {
      url: 'https://api-workflow-engine.noxivo.app',
      description: 'Production Engine API'
    },
    {
      url: 'http://localhost:4000',
      description: 'Local Development'
    }
  ];

  // Post-process OpenAPI to ensure summary/operationId are present (required by some Docusaurus plugins)
  const seenOperationIds = new Set<string>();
  if (openapi.paths) {
    for (const [pathKey, pathItem] of Object.entries(openapi.paths)) {
      const methods = Object.keys(pathItem as any);
      for (const method of methods) {
        const op = (pathItem as any)[method];
        if (!op.summary) {
          op.summary = `${method.toUpperCase()} ${pathKey}`;
        }
        
        let opId = op.operationId || `${method}_${pathKey.replace(/[\/\W]+/g, '_')}`.replace(/_+$/, '');
        
        // Deduplicate
        if (seenOperationIds.has(opId)) {
          console.warn(`⚠️ Removing duplicate operationId: ${opId} at ${pathKey}`);
          delete (pathItem as any)[method];
          continue;
        }
        
        op.operationId = opId;
        seenOperationIds.add(opId);
      }
    }
  }

  const staticDir = path.resolve(__dirname, '../docs/static');
  await fs.mkdir(staticDir, { recursive: true });
  const outputPath = path.resolve(staticDir, 'openapi.json');
  console.log(`💾 Saving OpenAPI spec to ${outputPath}...`);
  
  await fs.writeFile(outputPath, JSON.stringify(openapi, null, 2));
  console.log('✅ OpenAPI spec generated successfully!');
  
  // Also save it to a public-api.json for the engine itself
  const enginePublicDir = path.resolve(__dirname, '../public');
  await fs.mkdir(enginePublicDir, { recursive: true });
  await fs.writeFile(path.resolve(enginePublicDir, 'openapi.json'), JSON.stringify(openapi, null, 2));
  
  await fastify.close();
  process.exit(0);
}

generate().catch(err => {
  console.error('❌ Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
