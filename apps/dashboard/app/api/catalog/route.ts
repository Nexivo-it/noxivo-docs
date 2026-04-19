import { NextRequest, NextResponse } from 'next/server';
import { CatalogService } from '../../../lib/catalog/catalog-service';
import { getCurrentSession } from '../../../lib/auth/session';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ items: [] });
  }

  try {
    const tenantId = session.actor.tenantId;
    const items = await CatalogService.getCatalogItems(tenantId);

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching catalog:', error);
    return NextResponse.json({ items: [], error: 'Failed to fetch catalog' }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { payload } = await request.json();
    const tenantId = session.actor.tenantId;

    const item = await CatalogService.createItem(tenantId, payload);

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Error creating catalog item:', error);
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}