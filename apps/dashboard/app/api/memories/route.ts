import { NextResponse } from 'next/server';
import { getCurrentSession } from '../../../lib/auth/session';
import { ContactMemoryModel } from '@noxivo/database';
import dbConnect from '../../../lib/mongodb';

export async function GET(req: Request) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contactId');

    await dbConnect();

    const tenantId = session.actor.tenantId;
    const agencyId = session.actor.agencyId;

    if (!tenantId || !agencyId) {
      return NextResponse.json({ error: 'No tenant scope' }, { status: 400 });
    }

    if (!contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 });
    }

    const memories = await ContactMemoryModel.find({
      agencyId,
      tenantId,
      contactId
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return NextResponse.json({
      memories: memories.map(m => ({
        id: m._id.toString(),
        fact: m.fact,
        category: m.category,
        source: m.source,
        confidence: m.confidence,
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    console.error('Failed to fetch memories:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { contactId, fact, category, source } = body;

    await dbConnect();

    const tenantId = session.actor.tenantId;
    const agencyId = session.actor.agencyId;

    if (!tenantId || !agencyId) {
      return NextResponse.json({ error: 'No tenant scope' }, { status: 400 });
    }

    if (!contactId || !fact) {
      return NextResponse.json({ error: 'contactId and fact required' }, { status: 400 });
    }

    await ContactMemoryModel.create({
      agencyId,
      tenantId,
      contactId,
      fact,
      category: category || 'custom',
      source: source || 'manual',
      confidence: 1,
      metadata: {}
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to create memory:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const memoryId = searchParams.get('memoryId');

    await dbConnect();

    const tenantId = session.actor.tenantId;
    const agencyId = session.actor.agencyId;

    if (!tenantId || !agencyId) {
      return NextResponse.json({ error: 'No tenant scope' }, { status: 400 });
    }

    if (!memoryId) {
      return NextResponse.json({ error: 'memoryId required' }, { status: 400 });
    }

    await ContactMemoryModel.findOneAndDelete({
      _id: memoryId,
      agencyId,
      tenantId
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete memory:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
