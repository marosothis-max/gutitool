import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, parseBody, requireSuperAdmin, unwrap } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { findOrInviteUser } from '@/lib/users';

/** GET /api/v1/admin/tenants — Super Admin: todas las empresas con nº de usuarios */
export const GET = handler(async () => {
  const { supabase } = await requireSuperAdmin();
  const data = unwrap(await supabase.from('tenants')
    .select('id, name, slug, tax_id, status, created_at, suspended_at, tenant_members(count)')
    .order('created_at', { ascending: false }));
  return NextResponse.json({ data });
});

const Body = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  taxId: z.string().max(30).optional(),
  notifyEmail: z.string().email().optional(),
  admin: z.object({ email: z.string().email(), fullName: z.string().max(120).optional() }),
  centralWarehouse: z.object({ code: z.string().min(1).max(20), name: z.string().min(2) })
    .default({ code: 'CEN', name: 'Almacén Central' }),
});

/**
 * POST /api/v1/admin/tenants — Super Admin crea una empresa:
 * tenant + ajustes + almacén central + invitación al Administrador de Empresa.
 */
export const POST = handler(async (req) => {
  await requireSuperAdmin();
  const b = await parseBody(req, Body);
  // Rol de super admin ya verificado: el alta inicial usa la clave de servicio
  // porque el super admin no es miembro de la empresa que está creando.
  const supabase = createAdminClient();

  const tenant = unwrap(await supabase.from('tenants')
    .insert({ name: b.name, slug: b.slug, tax_id: b.taxId ?? null }).select().single());
  unwrap(await supabase.from('tenant_settings').insert({ tenant_id: tenant.id, notify_email: b.notifyEmail ?? null }));
  unwrap(await supabase.from('warehouses').insert({
    tenant_id: tenant.id, code: b.centralWarehouse.code, name: b.centralWarehouse.name, level: 'central',
  }));

  const adminId = await findOrInviteUser(b.admin.email, b.admin.fullName);
  unwrap(await supabase.from('tenant_members').insert({ tenant_id: tenant.id, user_id: adminId, role: 'company_admin' }));

  return NextResponse.json({ data: tenant, adminUserId: adminId }, { status: 201 });
});
