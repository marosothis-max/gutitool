import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, isoDate, pagination, parseBody, requireTenant, unwrap, uuid } from '@/lib/api';
import { COST_ROLES, getLinePrices } from '@/lib/app';

/**
 * GET /api/v1/{tenantId}/purchase-orders
 * Filtros: status, supplierId, warehouseId, late=true, page, pageSize
 */
export const GET = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase, roles } = await requireTenant(tenantId);
  const url = new URL(req.url);
  const q = url.searchParams;
  const { page, pageSize, from, to } = pagination(url);

  let query = supabase
    .from('purchase_orders')
    .select(`id, number, status, est_dispatch_date, est_delivery_date, created_at,
             suppliers(name), warehouses(code, name),
             purchase_order_lines(id, item_id, qty_ordered, qty_received)`, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(from, to);
  if (q.get('status')) query = query.in('status', q.get('status')!.split(','));
  if (q.get('supplierId')) query = query.eq('supplier_id', q.get('supplierId')!);
  if (q.get('warehouseId')) query = query.eq('warehouse_id', q.get('warehouseId')!);
  if (q.get('late') === 'true') {
    query = query.lt('est_delivery_date', new Date().toISOString().slice(0, 10))
                 .in('status', ['sent', 'confirmed', 'partially_received']);
  }
  const { data, error, count } = await query;
  if (error) unwrap({ data, error });
  const list = (data ?? []) as unknown as { id: string; purchase_order_lines: { id: string }[] }[];
  const prices = await getLinePrices(supabase, tenantId, roles.some((r) => COST_ROLES.includes(r)), list.map((o) => o.id));
  const withPrices = prices
    ? list.map((o) => ({ ...o, purchase_order_lines: o.purchase_order_lines.map((l) => ({ ...l, unit_price: prices.get(l.id)?.price ?? null })) }))
    : list;
  return NextResponse.json({ data: withPrices, page, pageSize, total: count });
});

const Body = z.object({
  supplierId: uuid,
  warehouseId: uuid,
  estDispatchDate: isoDate.optional(),
  estDeliveryDate: isoDate.optional(),
  supplierReference: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(z.object({
    itemId: uuid,
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative().optional(),
    estDispatchDate: isoDate.optional(),
    estDeliveryDate: isoDate.optional(),
  })).min(1),
});

/** POST /api/v1/{tenantId}/purchase-orders — crea OC en borrador (número OC-AAAA-NNNNNN automático) */
export const POST = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId, ['company_admin', 'supervisor', 'buyer']);
  const b = await parseBody(req, Body);
  const res = unwrap(await supabase.rpc('create_purchase_order', {
    p_tenant_id: tenantId,
    p_supplier_id: b.supplierId,
    p_warehouse_id: b.warehouseId,
    p_lines: b.lines.map((l) => ({
      item_id: l.itemId, quantity: l.quantity, unit_price: l.unitPrice,
      est_dispatch_date: l.estDispatchDate, est_delivery_date: l.estDeliveryDate,
    })),
    p_est_dispatch_date: b.estDispatchDate ?? null,
    p_est_delivery_date: b.estDeliveryDate ?? null,
    p_notes: b.notes ?? null,
    p_supplier_reference: b.supplierReference ?? null,
  }));
  return NextResponse.json(res, { status: 201 });
});
