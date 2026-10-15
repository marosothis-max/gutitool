import { NextResponse } from 'next/server';
import { handler, requireTenant, unwrap } from '@/lib/api';

/**
 * GET /api/v1/{tenantId}/alerts?status=open,in_replenishment&warehouseId=
 * Alertas de stock mínimo con el documento de reposición vinculado.
 * (La UI además se suscribe por Realtime a la tabla stock_alerts.)
 */
export const GET = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const q = new URL(req.url).searchParams;
  let query = supabase
    .from('stock_alerts')
    .select(`id, status, qty_at_trigger, min_qty, created_at, resolved_at,
             items(id, sku, name, uom, item_type), warehouses(id, code, name, level),
             purchase_orders(id, number, status, est_delivery_date),
             transfer_orders(id, number, status, est_delivery_date)`)
    .eq('tenant_id', tenantId)
    .in('status', (q.get('status') ?? 'open,in_replenishment').split(','))
    .order('created_at', { ascending: false })
    .limit(500);
  if (q.get('warehouseId')) query = query.eq('warehouse_id', q.get('warehouseId')!);
  return NextResponse.json({ data: unwrap(await query) });
});
