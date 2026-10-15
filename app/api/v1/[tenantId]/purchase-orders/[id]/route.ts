import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, handler, isoDate, parseBody, requireTenant, unwrap } from '@/lib/api';
import { loadPurchaseOrder } from '@/lib/purchase-orders';

/** GET /api/v1/{tenantId}/purchase-orders/{id} — detalle con líneas y fechas estimadas */
export const GET = handler<{ tenantId: string; id: string }>(async (_req, { tenantId, id }) => {
  const { supabase } = await requireTenant(tenantId);
  return NextResponse.json({ data: await loadPurchaseOrder(supabase, tenantId, id) });
});

// Transiciones permitidas desde la API (la recepción cambia el estado por sí sola)
const TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
};

const Body = z.object({
  status: z.enum(['sent', 'confirmed', 'cancelled']).optional(),
  estDispatchDate: isoDate.nullable().optional(),
  estDeliveryDate: isoDate.nullable().optional(),
  supplierReference: z.string().max(80).optional(),
});

/** PATCH /api/v1/{tenantId}/purchase-orders/{id} — cambia estado y/o fechas estimadas */
export const PATCH = handler<{ tenantId: string; id: string }>(async (req, { tenantId, id }) => {
  const { supabase } = await requireTenant(tenantId, ['company_admin', 'supervisor', 'buyer']);
  const b = await parseBody(req, Body);
  const current = unwrap(
    await supabase.from('purchase_orders').select('status').eq('tenant_id', tenantId).eq('id', id).single(),
  );
  if (b.status && !(TRANSITIONS[current.status] ?? []).includes(b.status)) {
    throw new ApiError(422, `Transición no permitida: ${current.status} → ${b.status}`);
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status) patch.status = b.status;
  if (b.estDispatchDate !== undefined) patch.est_dispatch_date = b.estDispatchDate;
  if (b.estDeliveryDate !== undefined) patch.est_delivery_date = b.estDeliveryDate;
  if (b.supplierReference !== undefined) patch.supplier_reference = b.supplierReference;

  const data = unwrap(
    await supabase.from('purchase_orders').update(patch).eq('tenant_id', tenantId).eq('id', id).select().single(),
  );
  return NextResponse.json({ data });
});
