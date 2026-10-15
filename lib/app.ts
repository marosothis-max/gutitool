import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { AppRole } from './api';

/** Contexto de la empresa activa para las páginas de /app/[tenantId] (cacheado por petición). */
export const getTenantContext = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/app/${tenantId}`);

  const [{ data: members }, { data: tenant }, { data: profile }] = await Promise.all([
    supabase.from('tenant_members').select('role').eq('tenant_id', tenantId).eq('user_id', user.id).eq('active', true),
    supabase.from('tenants').select('id, name, status').eq('id', tenantId).maybeSingle(),
    supabase.from('profiles').select('full_name, email, is_super_admin').eq('id', user.id).maybeSingle(),
  ]);
  if (!tenant || !members?.length) notFound();

  const roles = rows(members).map((m) => m.role as AppRole);
  const can = (...r: AppRole[]) => roles.some((x) => r.includes(x));
  return {
    supabase,
    user,
    tenant: tenant as { id: string; name: string; status: string },
    profile: profile as { full_name: string | null; email: string; is_super_admin: boolean } | null,
    roles,
    can,
  };
});

export const ROLE_ES: Record<string, string> = {
  company_admin: 'Administrador', supervisor: 'Supervisor', auditor: 'Auditor',
  buyer: 'Comprador', carrier: 'Transportista', warehouse_keeper: 'Almacenista',
};

export const LEVEL_ES: Record<string, string> = { central: 'Central', intermediate: 'Intermedio', final: 'Final' };

type Tone = 'blue' | 'green' | 'red' | 'yellow' | 'grey';
export const PO_STATUS: Record<string, [string, Tone]> = {
  draft: ['Borrador', 'grey'], sent: ['Enviada', 'blue'], confirmed: ['Confirmada', 'blue'],
  partially_received: ['Recibida parcial', 'yellow'], received: ['Recibida', 'green'], cancelled: ['Cancelada', 'red'],
};
export const TRF_STATUS: Record<string, [string, Tone]> = {
  requested: ['Solicitado', 'grey'], approved: ['Aprobado', 'blue'], in_transit: ['En tránsito', 'yellow'],
  received: ['Recibido', 'green'], cancelled: ['Cancelado', 'red'],
};
export const RET_STATUS: Record<string, [string, Tone]> = {
  draft: ['Borrador', 'grey'], posted: ['Contabilizada', 'green'], cancelled: ['Anulada', 'red'],
};
export const TOOL_STATUS: Record<string, [string, Tone]> = {
  available: ['Disponible', 'green'], assigned: ['Asignada', 'blue'], maintenance: ['Mantenimiento', 'yellow'],
  lost: ['Perdida', 'red'], retired: ['Baja', 'grey'],
};
export const MOVE_ES: Record<string, string> = {
  receipt: 'Entrada por compra', issue: 'Consumo', transfer_out: 'Salida por traslado', transfer_in: 'Entrada por traslado',
  return_out: 'Devolución a proveedor', adjustment_in: 'Ajuste positivo', adjustment_out: 'Ajuste negativo',
  tool_checkout: 'Entrega de herramienta', tool_checkin: 'Devolución de herramienta',
};

export const fmtQty = (n: unknown) =>
  Number(n ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 3 });
export const fmtMoney = (n: unknown) =>
  Number(n ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const isLate = (d: string | null | undefined) => !!d && d < new Date().toISOString().slice(0, 10);

/**
 * Normaliza el resultado de una consulta a array sin tipar. Sin tipos generados
 * de la BD (npm run db:types), el parser de supabase-js puede inferir tipos
 * demasiado estrictos para selects con relaciones; aquí se trabaja con filas planas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rows = (data: unknown): any[] => (Array.isArray(data) ? data : []);

/** Roles que pueden ver costes, valor de stock e importes (la BD lo hace cumplir igualmente). */
export const COST_ROLES: AppRole[] = ['company_admin', 'supervisor', 'buyer', 'auditor'];

type Sb = Awaited<ReturnType<typeof createClient>>;

/** Coste unitario por artículo, o null si el usuario no puede verlo. */
export async function getItemCosts(supabase: Sb, tenantId: string, allowed: boolean) {
  if (!allowed) return null;
  const { data } = await supabase.rpc('item_costs', { p_tenant_id: tenantId });
  return new Map<string, number>(rows(data).map((r): [string, number] => [r.item_id, Number(r.unit_cost)]));
}

/** Precio por línea de pedido (clave: id de línea), o null si el usuario no puede verlo. */
export async function getLinePrices(supabase: Sb, tenantId: string, allowed: boolean, poIds?: string[]) {
  if (!allowed) return null;
  const { data } = await supabase.rpc('po_line_prices', { p_tenant_id: tenantId, p_purchase_order_ids: poIds ?? null });
  return new Map<string, { poId: string; price: number }>(
    rows(data).map((r): [string, { poId: string; price: number }] => [r.line_id, { poId: r.purchase_order_id, price: Number(r.unit_price) }]),
  );
}
