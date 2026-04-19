import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '../../../../lib/auth/session';
import { CatalogService } from '@/lib/catalog/catalog-service';

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = session.actor.tenantId;
  const { destination, items } = await request.json();

  try {
    const catalogItems = items || await CatalogService.getCatalogItems(tenantId);
    
    const results = [];

    if (destination.type === 'webhook') {
      const webhookUrl = destination.url;
      
      for (const item of catalogItems) {
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create_service',
              data: {
                name: item.name,
                price: item.priceAmount,
                description: item.shortDescription,
                duration: item.durationMinutes,
                image: item.mediaPath,
              }
            }),
            signal: AbortSignal.timeout(10000)
          });
          
          results.push({
            itemId: item.id,
            success: response.ok,
            status: response.status,
            error: response.ok ? null : 'Webhook failed'
          });
        } catch (error) {
          results.push({
            itemId: item.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    if (destination.type === 'wordpress') {
      const { siteUrl, username, appPassword } = destination;
      
      for (const item of catalogItems) {
        try {
          const response = await fetch(`${siteUrl}/wp-json/wp/v2/services`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`
            },
            body: JSON.stringify({
              title: item.name,
              content: item.shortDescription || item.longDescription || '',
              meta: {
                service_price: item.priceAmount,
                service_duration: item.durationMinutes,
                service_image: item.mediaPath,
              }
            }),
            signal: AbortSignal.timeout(15000)
          });
          
          results.push({
            itemId: item.id,
            success: response.ok,
            status: response.status,
            error: response.ok ? null : 'WordPress API failed'
          });
        } catch (error) {
          results.push({
            itemId: item.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    if (destination.type === 'shopify') {
      const { storeUrl, accessToken, apiVersion = '2025-01' } = destination;
      const domain = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      
      for (const item of catalogItems) {
        try {
          const response = await fetch(`https://${domain}/admin/api/${apiVersion}/products.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken
            },
            body: JSON.stringify({
              product: {
                title: item.name,
                body_html: item.shortDescription || item.longDescription || '',
                variants: [{
                  price: String(item.priceAmount),
                  sku: item.slug || undefined,
                  inventory_management: 'shopify'
                }],
                images: item.mediaPath ? [{ src: item.mediaPath }] : []
              }
            }),
            signal: AbortSignal.timeout(15000)
          });
          
          const data = await response.json();
          
          results.push({
            itemId: item.id,
            success: response.ok,
            status: response.status,
            externalId: data.product?.id,
            error: response.ok ? null : 'Shopify API failed'
          });
        } catch (error) {
          results.push({
            itemId: item.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      total: results.length,
      successful: successCount,
      failed: failCount,
      results
    });
  } catch (error) {
    console.error('Publish error:', error);
    return NextResponse.json({ error: 'Publish failed' }, { status: 500 });
  }
}