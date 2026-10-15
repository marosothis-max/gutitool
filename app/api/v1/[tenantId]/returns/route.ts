import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, pagination, parseBody, requireTenant, unwrap, uuid } from '@/lib/api';

/** GET /api/v1/{tenantId}/returns — devoluciones (DEV-AAAA-NNNNNN) */
export const GET = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const url = new URL(req.url);
  const { page, pageSize, from, to } = pagination(url);
  let query = supabase
    .from('returns')
    .select(`id, number, kind, status, reason, created_at, posted_at,
             warehouses(code, name), suppliers(name), goods_receipts(number), transfer_orders(number, status),
             return_lines(quantity, items(sku, name, uom), locations(code))`, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(from, to);
  const st = url.searchParams.get('status');
  if (st) query = query.eq('status', st);
  const { data, error, count } = await query;
  if (error) unwrap({ data, error });
  return NextResponse.json({ data, page, pageSize, total: count });
});

const Body = z
  .object({
    warehouseId: uuid,
    kind: z.enum(['to_supplier', 'to_upstream_warehouse']),
    reason: z.string().trim().min(3).max(500),
    supplierId: uuid.optional(),
    receiptId: uuid.optional(),
    post: z.boolean().default(true), // contabilizar ya (mueve stock) o dejar en borrador
    lines: z.array(z.object({ itemId: uuid, locationId: uuid, quantity: z.number().positive() })).min(1),
  })
  .refine((b) => b.kind !== 'to_supplier' || b.supplierId, { message: 'supplierId obligatorio', path: ['supplierId'] });

/**
 * POST /api/v1/{tenantId}/returns
 *  - to_supplier: saca el stock y genera el documento DEV con correlativo único.
 *  - to_upstream_warehouse: además crea y despacha un traslado al almacén padre.
 */
export const POST = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const b = await parseBody(req, Body);
  const res = unwrap(await supabase.rpc('create_return', {
    p_warehouse_id: b.warehouseId,
    p_kind: b.kind,
    p_reason: b.reason,
    p_lines: b.lines.map((l) => ({ item_id: l.itemId, location_id: l.locationId, quantity: l.quantity })),
    p_supplier_id: b.supplierId ?? null,
    p_receipt_id: b.receiptId ?? null,
    p_post: b.post,
  }));
  return NextResponse.json(res, { status: 201 });
});
