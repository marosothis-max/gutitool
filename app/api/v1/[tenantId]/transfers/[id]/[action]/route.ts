import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, handler, isoDate, parseBody, requireTenant, unwrap, uuid } from '@/lib/api';

/**
 * POST /api/v1/{tenantId}/transfers/{id}/approve   — supervisor/admin
 * POST /api/v1/{tenantId}/transfers/{id}/dispatch  — almacén origen: descuenta stock, pasa a "en tránsito"
 *      body opcional: { lines: [{ lineId, fromLocationId?, quantity? }] }
 * POST /api/v1/{tenantId}/transfers/{id}/receive   — almacén destino: ubica y suma stock
 *      body: { lines: [{ lineId, toLocationId, quantity? }] }  (quantity < despachada => discrepancia)
 * POST /api/v1/{tenantId}/transfers/{id}/eta       — transportista: { estDispatchDate, estDeliveryDate }
 */
const Dispatch = z.object({
  lines: z.array(z.object({ lineId: uuid, fromLocationId: uuid.optional(), quantity: z.number().nonnegative().optional() })).optional(),
});
const Receive = z.object({
  lines: z.array(z.object({ lineId: uuid, toLocationId: uuid, quantity: z.number().nonnegative().optional() })).min(1),
});
const Eta = z.object({ estDispatchDate: isoDate.nullable(), estDeliveryDate: isoDate.nullable() });

export const POST = handler<{ tenantId: string; id: string; action: string }>(async (req, { tenantId, id, action }) => {
  const { supabase } = await requireTenant(tenantId);

  // El traslado debe pertenecer al tenant de la URL
  unwrap(await supabase.from('transfer_orders').select('id').eq('tenant_id', tenantId).eq('id', id).single());

  switch (action) {
    case 'approve':
      unwrap(await supabase.rpc('approve_transfer', { p_transfer_id: id }));
      break;
    case 'dispatch': {
      const raw = await req.text();                       // body opcional
      const b = raw ? Dispatch.parse(JSON.parse(raw)) : { lines: undefined };
      unwrap(await supabase.rpc('dispatch_transfer', {
        p_transfer_id: id,
        p_lines: b.lines?.map((l) => ({ line_id: l.lineId, from_location_id: l.fromLocationId, quantity: l.quantity })) ?? null,
      }));
      break;
    }
    case 'receive': {
      const b = await parseBody(req, Receive);
      unwrap(await supabase.rpc('receive_transfer', {
        p_transfer_id: id,
        p_lines: b.lines.map((l) => ({ line_id: l.lineId, to_location_id: l.toLocationId, quantity: l.quantity })),
      }));
      break;
    }
    case 'eta': {
      const b = await parseBody(req, Eta);
      unwrap(await supabase.rpc('update_transfer_eta', {
        p_transfer_id: id, p_est_dispatch_date: b.estDispatchDate, p_est_delivery_date: b.estDeliveryDate,
      }));
      break;
    }
    default:
      throw new ApiError(404, `Acción desconocida: ${action}`);
  }

  const data = unwrap(await supabase.from('transfer_orders').select('*').eq('id', id).single());
  return NextResponse.json({ data });
});
