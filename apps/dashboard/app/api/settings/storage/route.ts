import { NextResponse } from 'next/server';
import { MediaStorageConfigModel } from '@noxivo/database';
import { MediaStorageConfigSchema } from '@noxivo/contracts';
import dbConnect from '../../../../lib/mongodb';
import { getCurrentSession } from '../../../../lib/auth/session';

function redactMediaConfig(config: any) {
  if (!config) return null;
  const copy = { ...config };
  if (copy.secretConfig) {
    const redacted: Record<string, string> = {};
    for (const key of Object.keys(copy.secretConfig)) {
      redacted[key] = '***REDACTED***';
    }
    copy.secretConfig = redacted;
  }
  return copy;
}

export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await dbConnect();

  const config = await MediaStorageConfigModel.findOne({ agencyId: session.actor.agencyId }).lean();
  return NextResponse.json(config ? redactMediaConfig(config) : null);
}

export async function PUT(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input = MediaStorageConfigSchema.parse(body);
    
    await dbConnect();

    const config = await MediaStorageConfigModel.findOneAndUpdate(
      { agencyId: session.actor.agencyId },
      {
        $set: {
          agencyId: session.actor.agencyId,
          provider: input.provider,
          isActive: input.isActive,
          publicBaseUrl: input.publicBaseUrl,
          publicConfig: input.publicConfig,
          secretConfig: input.secretConfig,
          pathPrefix: input.pathPrefix,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json(redactMediaConfig(config));
  } catch (error) {
    console.error('Storage config error:', error);
    return NextResponse.json({ error: 'Failed to update storage configuration' }, { status: 400 });
  }
}
