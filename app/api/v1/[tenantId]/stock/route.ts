import { NextResponse } from 'next/server';
import { handler, pagination, requireTenant, safeSearch, unwrap } from '@/lib/api';

/**
 * GET /api/v1/{tenantId}/stock
 * Stock por ubicación exacta (pasillo/estantería/bin).
 * Filtros: warehouseId, itemId, itemType=consumable|tool, search, page, pageSize
 */
export const GET = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const url = new URL(req.url);
  const q = url.searchParams;
  const { page, pageSize, from, to } = pagination(url);

  let query = supabase
    .from('v_stock_by_location')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .gt('qty_on_hand', 0)
    .order('warehouse_code').order('sku').order('location_code')
    .range(from, to);

  if (q.get('warehouseId')) query = query.eq('warehouse_id', q.get('warehouseId')!);
  if (q.get('itemId')) query = query.eq('item_id', q.get('itemId')!);
  if (q.get('itemType')) query = query.eq('item_type', q.get('itemType')!);
  const s = safeSearch(q.get('search'));
  if (s) query = query.or(`sku.ilike.%${s}%,item_name.ilike.%${s}%,location_code.ilike.%${s}%`);

  const { data, error, count } = await query;
  if (error) unwrap({ data, error });
  return NextResponse.json({ data, page, pageSize, total: count });
});
