import { NextRequest, NextResponse } from 'next/server';
import { CatalogAssistant } from '../../../../lib/ai/catalog-assistant';
import { getCurrentSession } from '../../../../lib/auth/session';

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { context, mode } = await request.json();

    if (mode === 'seo-only') {
      const suggestions = await CatalogAssistant.refineSEO(context);
      return NextResponse.json({ suggestions });
    }

    const suggestions = await CatalogAssistant.suggestMetadata(context);
    return NextResponse.json({ suggestions });
  } catch (error: any) {
    console.error('AI Help Route Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate AI suggestions' }, { status: 500 });
  }
}
