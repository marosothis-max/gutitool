import { NextResponse } from 'next/server';
import { handler, requireTenant, unwrap } from '@/lib/api';

/**
 * GET /api/v1/{tenantId}/tracking?itemId=&late=true&open=true
 * Trazabilidad: cada ítem en proceso (OC o traslado) con fecha estimada
 * de despacho y de entrega, y si va con retraso.
 */
export const GET = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const q = new URL(req.url).searchParams;
  let query = supabase.from('v_order_tracking').select('*').eq('tenant_id', tenantId)
    .order('est_delivery_date', { ascending: true, nullsFirst: false }).limit(1000);
  if (q.get('itemId')) query = query.eq('item_id', q.get('itemId')!);
  if (q.get('late') === 'true') query = query.eq('is_late', true);
  if (q.get('open') !== 'false') {
    query = query.in('status', ['draft', 'sent', 'confirmed', 'partially_received', 'requested', 'approved', 'in_transit']);
  }
  return NextResponse.json({ data: unwrap(await query) });
});
