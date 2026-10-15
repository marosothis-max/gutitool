import { NextResponse } from 'next/server';
import { handler, requireTenant, unwrap } from '@/lib/api';

/**
 * GET /api/v1/{tenantId}/stock/network
 * Visión del Almacén Central: stock, en tránsito, pedido y mínimo de cada
 * artículo en TODOS los almacenes (central, intermedios, finales).
 * Filtros: level=central|intermediate|final, itemId, belowMin=true
 * Agrupa por artículo para pintar la matriz artículo × almacén.
 */
export const GET = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const q = new URL(req.url).searchParams;

  let query = supabase.from('v_stock_network').select('*').eq('tenant_id', tenantId).order('sku');
  if (q.get('level')) query = query.eq('warehouse_level', q.get('level')!);
  if (q.get('itemId')) query = query.eq('item_id', q.get('itemId')!);
  if (q.get('belowMin') === 'true') query = query.eq('below_min', true);
  const rows = unwrap(await query) as Record<string, any>[];

  const byItem = new Map<string, any>();
  for (const r of rows) {
    const it = byItem.get(r.item_id) ?? {
      item_id: r.item_id, sku: r.sku, name: r.item_name, item_type: r.item_type, uom: r.uom,
      total_on_hand: 0, total_in_transit: 0, total_on_order: 0, warehouses: [],
    };
    it.total_on_hand += Number(r.qty_on_hand);
    it.total_in_transit += Number(r.qty_in_transit);
    it.total_on_order += Number(r.qty_on_order);
    it.warehouses.push({
      warehouse_id: r.warehouse_id, code: r.warehouse_code, name: r.warehouse_name, level: r.warehouse_level,
      parent_id: r.parent_id, qty_on_hand: Number(r.qty_on_hand), qty_in_transit: Number(r.qty_in_transit),
      qty_on_order: Number(r.qty_on_order), min_qty: r.min_qty === null ? null : Number(r.min_qty),
      below_min: r.below_min,
    });
    byItem.set(r.item_id, it);
  }
  return NextResponse.json({ data: [...byItem.values()], generated_at: new Date().toISOString() });
});
