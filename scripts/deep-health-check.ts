/**
 * Deep Health Diagnostics Script
 * 
 * Validates the full mesh of Noxivo:
 * 1. Dashboard connectivity to MongoDB.
 * 2. Workflow Engine connectivity to MongoDB, Redis, and MessagingProvider.
 */

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:3001';

async function runDiagnostics() {
  console.log('--- Noxivo Deep Health Diagnostics ---');
  console.log(`Dashboard URL: ${DASHBOARD_URL}`);
  console.log(`Engine URL:    ${ENGINE_URL}`);
  console.log('-----------------------------------------');

  let allHealthy = true;

  // 1. Check Dashboard Health
  try {
    console.log('Checking Dashboard Health...');
    const response = await fetch(`${DASHBOARD_URL}/api/health`);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Dashboard is healthy');
      console.log(`   MongoDB: ${data.checks.mongodb}`);
      if (data.checks.redis) console.log(`   Redis:   ${data.checks.redis}`);
    } else {
      console.error('❌ Dashboard is UNHEALTHY');
      console.error(JSON.stringify(data, null, 2));
      allHealthy = false;
    }
  } catch (err) {
    console.error(`❌ Failed to connect to Dashboard: ${err.message}`);
    allHealthy = false;
  }

  console.log('');

  // 2. Check Workflow Engine Health
  try {
    console.log('Checking Workflow Engine Health...');
    const response = await fetch(`${ENGINE_URL}/health`);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Workflow Engine is healthy');
      console.log(`   MongoDB: ${data.checks.mongodb}`);
      console.log(`   Redis:   ${data.checks.redis}`);
      console.log(`   MessagingProvider:    ${data.checks.messaging}`);
    } else {
      console.error('❌ Workflow Engine is UNHEALTHY');
      console.error(JSON.stringify(data, null, 2));
      allHealthy = false;
    }
  } catch (err) {
    console.error(`❌ Failed to connect to Workflow Engine: ${err.message}`);
    allHealthy = false;
  }

  console.log('-----------------------------------------');
  if (allHealthy) {
    console.log('✨ FULL MESH VALIDATED: ALL SYSTEMS GO');
    process.exit(0);
  } else {
    console.error('🚨 DIAGNOSTICS FAILED: SOME SYSTEMS ARE DOWN');
    process.exit(1);
  }
}

runDiagnostics();
