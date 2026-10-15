import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, requireTenant, unwrap, uuid } from '@/lib/api';

const Body = z.object({ supplierId: uuid.optional() });

/**
 * POST /api/v1/{tenantId}/alerts/{id}/replenish
 *  - Alerta en almacén CENTRAL  → borrador de orden de compra (requiere supplierId).
 *  - Alerta en INTERMEDIO/FINAL → solicitud de traslado desde su almacén padre.
 * Cantidad = hasta el máximo configurado, o la cantidad de reposición.
 */
export const POST = handler<{ tenantId: string; id: string }>(async (req, { tenantId, id }) => {
  const { supabase } = await requireTenant(tenantId);
  const raw = await req.text();
  const b = raw ? Body.parse(JSON.parse(raw)) : {};
  unwrap(await supabase.from('stock_alerts').select('id').eq('tenant_id', tenantId).eq('id', id).single());
  const res = unwrap(await supabase.rpc('create_replenishment_from_alert', {
    p_alert_id: id, p_supplier_id: b.supplierId ?? null,
  }));
  return NextResponse.json(res, { status: 201 });
});
