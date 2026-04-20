import { NextResponse } from 'next/server';
import { MediaStorageConfigModel } from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import { getCurrentSession } from '../../../../lib/auth/session';
import ImageKit from '@imagekit/nodejs';

export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await dbConnect();
    
    // Find the storage config for the current agency
    const storageConfig = await MediaStorageConfigModel.findOne({ 
      agencyId: session.actor.agencyId,
      provider: 'imagekit',
      isActive: true 
    }).lean();

    if (!storageConfig || !storageConfig.secretConfig?.privateKey) {
      return NextResponse.json({ error: 'ImageKit is not configured for this agency' }, { status: 404 });
    }

    const config = storageConfig as any;
    const imagekit = new ImageKit({
      privateKey: config.secretConfig?.privateKey || '',
      baseURL: config.publicBaseUrl || '', // v7 uses baseURL instead of urlEndpoint for the SDK client
    });

    const authParams = imagekit.helper.getAuthenticationParameters();

    return NextResponse.json({
      ...authParams,
      publicKey: config.publicConfig?.publicKey || '', // Client needs this for upload()
    });
  } catch (error) {
    console.error('[ImageKit Auth] Failed to generate authentication parameters:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 
      { status: 500 }
    );
  }
}
