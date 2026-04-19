import { NextRequest, NextResponse } from 'next/server';
import { CatalogService } from '../../../../lib/catalog/catalog-service';
import { getCurrentSession } from '../../../../lib/auth/session';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const tenantId = session.actor.tenantId;
    const items = await CatalogService.getCatalogItems(tenantId);
    const item = items.find((i) => i.id === id);

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching catalog item:', error);
    return NextResponse.json({ error: 'Failed to fetch item' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tenantId = session.actor.tenantId;
    const payload = await request.json();

    const item = await CatalogService.updateItem(tenantId, id, payload);

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating catalog item:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tenantId = session.actor.tenantId;

    await CatalogService.deleteItem(tenantId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting catalog item:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}