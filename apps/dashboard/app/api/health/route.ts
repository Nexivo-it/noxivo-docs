import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import { getDashboardRedisPublisher } from '../../../lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status: Record<string, any> = {
    service: 'noxivo-dashboard',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  try {
    // 1. Check MongoDB
    await dbConnect();
    status.checks.mongodb = 'healthy';
  } catch (error) {
    status.checks.mongodb = 'unhealthy';
    status.error = error instanceof Error ? error.message : 'Unknown error';
  }

  try {
    // 2. Check Redis
    const redis = getDashboardRedisPublisher();
    if (redis) {
      await redis.ping();
      status.checks.redis = 'healthy';
    } else {
      status.checks.redis = 'not_configured';
    }
  } catch (error) {
    status.checks.redis = 'unhealthy';
  }

  const isHealthy = Object.values(status.checks).every(s => s === 'healthy' || s === 'not_configured');

  return NextResponse.json(status, { status: isHealthy ? 200 : 503 });
}
