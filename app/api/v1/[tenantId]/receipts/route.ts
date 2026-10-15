import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, pagination, parseBody, requireTenant, unwrap, uuid } from '@/lib/api';

/** GET /api/v1/{tenantId}/receipts — recepciones con su OC / factura */
export const GET = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const url = new URL(req.url);
  const { page, pageSize, from, to } = pagination(url);
  let query = supabase
    .from('goods_receipts')
    .select(`id, number, received_at, supplier_invoice_number, notes,
             purchase_orders(number), suppliers(name), warehouses(code, name),
             goods_receipt_lines(quantity, items(sku, name, uom), locations(code))`, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('received_at', { ascending: false })
    .range(from, to);
  const wh = url.searchParams.get('warehouseId');
  if (wh) query = query.eq('warehouse_id', wh);
  const { data, error, count } = await query;
  if (error) unwrap({ data, error });
  return NextResponse.json({ data, page, pageSize, total: count });
});

const Body = z
  .object({
    warehouseId: uuid,
    purchaseOrderId: uuid.optional(),
    supplierInvoiceNumber: z.string().trim().min(1).max(60).optional(),
    supplierId: uuid.optional(),
    notes: z.string().max(2000).optional(),
    lines: z.array(z.object({ itemId: uuid, locationId: uuid, quantity: z.number().positive() })).min(1),
  })
  .refine((b) => b.purchaseOrderId || b.supplierInvoiceNumber, {
    message: 'Obligatorio: purchaseOrderId o supplierInvoiceNumber',
    path: ['purchaseOrderId'],
  });

/**
 * POST /api/v1/{tenantId}/receipts — entrada de mercancía.
 * Asocia OBLIGATORIAMENTE la OC o la factura del proveedor (validado aquí y en la BD),
 * ubica cada línea en un pasillo/estantería/bin y actualiza el estado de la OC.
 */
export const POST = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const b = await parseBody(req, Body);
  const res = unwrap(await supabase.rpc('receive_goods', {
    p_warehouse_id: b.warehouseId,
    p_lines: b.lines.map((l) => ({ item_id: l.itemId, location_id: l.locationId, quantity: l.quantity })),
    p_purchase_order_id: b.purchaseOrderId ?? null,
    p_supplier_invoice_number: b.supplierInvoiceNumber ?? null,
    p_supplier_id: b.supplierId ?? null,
    p_notes: b.notes ?? null,
  }));
  return NextResponse.json(res, { status: 201 });
});
