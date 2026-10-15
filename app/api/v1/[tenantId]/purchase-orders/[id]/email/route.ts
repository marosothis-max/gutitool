import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, handler, parseBody, requireTenant, unwrap } from '@/lib/api';
import { sendEmail } from '@/lib/email';
import { buildPurchaseOrderWorkbook, loadPurchaseOrder, renderPurchaseOrderEmail } from '@/lib/purchase-orders';

const Body = z.object({
  /** Destinatarios. Si se omite: correo configurado de la empresa (tenant_settings.notify_email). */
  to: z.array(z.string().email()).max(10).optional(),
  /** Añadir el correo del proveedor como destinatario */
  includeSupplier: z.boolean().default(false),
  message: z.string().max(2000).optional(),
});

/**
 * POST /api/v1/{tenantId}/purchase-orders/{id}/email
 * Botón de "envío rápido": manda el detalle del pedido (HTML + Excel adjunto).
 */
export const POST = handler<{ tenantId: string; id: string }>(async (req, { tenantId, id }) => {
  const { supabase, user } = await requireTenant(tenantId, ['company_admin', 'supervisor', 'buyer']);
  const b = await parseBody(req, Body);

  const [po, tenant, settings] = await Promise.all([
    loadPurchaseOrder(supabase, tenantId, id),
    supabase.from('tenants').select('name').eq('id', tenantId).single().then(unwrap),
    supabase.from('tenant_settings').select('notify_email').eq('tenant_id', tenantId).maybeSingle().then(unwrap),
  ]);

  const recipients = new Set<string>(b.to ?? (settings?.notify_email ? [settings.notify_email] : []));
  if (b.includeSupplier && po.suppliers.email) recipients.add(po.suppliers.email);
  if (!recipients.size) {
    throw new ApiError(422, 'No hay destinatario: configure el correo de la empresa o indique "to"');
  }

  const to = [...recipients];
  const providerId = await sendEmail({
    to,
    subject: `[${tenant.name}] Orden de compra ${po.number}`,
    html: renderPurchaseOrderEmail(po, tenant.name, b.message),
    attachments: [{ filename: `${po.number}.xlsx`, content: await buildPurchaseOrderWorkbook(po) }],
  });

  await supabase.from('email_log').insert({
    tenant_id: tenantId, doc_type: 'purchase_order', doc_id: id, sent_to: to.join(', '),
    provider_id: providerId, sent_by: user.id,
  });

  return NextResponse.json({ sent: true, to, providerId });
});
