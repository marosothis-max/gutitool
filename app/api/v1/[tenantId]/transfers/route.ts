import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, isoDate, pagination, parseBody, requireTenant, unwrap, uuid } from '@/lib/api';

/** GET /api/v1/{tenantId}/transfers — filtros: status, fromWarehouseId, toWarehouseId, carrier=me */
export const GET = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase, user } = await requireTenant(tenantId);
  const url = new URL(req.url);
  const q = url.searchParams;
  const { page, pageSize, from, to } = pagination(url);

  let query = supabase
    .from('transfer_orders')
    .select(`id, number, status, est_dispatch_date, est_delivery_date, dispatched_at, received_at, has_discrepancy, notes,
             from:warehouses!transfer_orders_tenant_id_from_warehouse_id_fkey(code, name, level),
             to:warehouses!transfer_orders_tenant_id_to_warehouse_id_fkey(code, name, level),
             transfer_order_lines(id, qty_requested, qty_dispatched, qty_received, items(sku, name, uom))`,
            { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(from, to);
  if (q.get('status')) query = query.in('status', q.get('status')!.split(','));
  if (q.get('fromWarehouseId')) query = query.eq('from_warehouse_id', q.get('fromWarehouseId')!);
  if (q.get('toWarehouseId')) query = query.eq('to_warehouse_id', q.get('toWarehouseId')!);
  if (q.get('carrier') === 'me') query = query.eq('carrier_id', user.id);

  const { data, error, count } = await query;
  if (error) unwrap({ data, error });
  return NextResponse.json({ data, page, pageSize, total: count });
});

const Body = z.object({
  fromWarehouseId: uuid,
  toWarehouseId: uuid,
  estDispatchDate: isoDate.optional(),
  estDeliveryDate: isoDate.optional(),
  carrierId: uuid.optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(z.object({ itemId: uuid, quantity: z.number().positive(), fromLocationId: uuid.optional() })).min(1),
});

/** POST /api/v1/{tenantId}/transfers — solicitud de traslado (TRF-AAAA-NNNNNN) */
export const POST = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const b = await parseBody(req, Body);
  const res = unwrap(await supabase.rpc('create_transfer', {
    p_from_warehouse_id: b.fromWarehouseId,
    p_to_warehouse_id: b.toWarehouseId,
    p_lines: b.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity, from_location_id: l.fromLocationId })),
    p_est_dispatch_date: b.estDispatchDate ?? null,
    p_est_delivery_date: b.estDeliveryDate ?? null,
    p_carrier_id: b.carrierId ?? null,
    p_notes: b.notes ?? null,
  }));
  return NextResponse.json(res, { status: 201 });
});
