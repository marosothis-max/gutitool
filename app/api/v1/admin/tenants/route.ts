import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, parseBody, requireSuperAdmin, unwrap } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { findOrInviteUser } from '@/lib/users';
import { PLANS } from '@/lib/plans';

/** GET /api/v1/admin/tenants — Super Admin: empresas con plan y usuarios activos */
export const GET = handler(async () => {
  const { supabase } = await requireSuperAdmin();
  const data = unwrap(await supabase.from('tenants')
    .select('id, name, slug, tax_id, status, plan, max_users, created_at, suspended_at')
    .order('created_at', { ascending: false })) as unknown as { id: string }[];
  const counts = await Promise.all(
    data.map((t) => supabase.rpc('tenant_active_users', { p_tenant: t.id }).then((r) => Number(r.data ?? 0))),
  );
  return NextResponse.json({ data: data.map((t, i) => ({ ...t, active_users: counts[i] })) });
});

const Body = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  taxId: z.string().max(30).optional(),
  notifyEmail: z.string().email().optional(),
  plan: z.enum(PLANS).default('basico'),
  maxUsers: z.number().int().positive().nullable().default(5),
  admin: z.object({
    email: z.string().email(),
    fullName: z.string().max(120).optional(),
    password: z.string().min(8).max(72).optional(),
  }),
  centralWarehouse: z.object({ code: z.string().min(1).max(20), name: z.string().min(2) })
    .default({ code: 'CEN', name: 'Almacén Central' }),
});

/**
 * POST /api/v1/admin/tenants — Super Admin crea una empresa con su plan y límite de usuarios:
 * tenant + ajustes + almacén central + Administrador de Empresa (con contraseña o invitación).
 */
export const POST = handler(async (req) => {
  await requireSuperAdmin();
  const b = await parseBody(req, Body);
  // Rol de super admin ya verificado: el alta inicial usa la clave de servicio
  // porque el super admin no es miembro de la empresa que está creando.
  const supabase = createAdminClient();

  const tenant = unwrap(await supabase.from('tenants')
    .insert({ name: b.name, slug: b.slug, tax_id: b.taxId ?? null, plan: b.plan, max_users: b.maxUsers })
    .select().single()) as unknown as { id: string };
  unwrap(await supabase.from('tenant_settings').insert({ tenant_id: tenant.id, notify_email: b.notifyEmail ?? null }));
  unwrap(await supabase.from('warehouses').insert({
    tenant_id: tenant.id, code: b.centralWarehouse.code, name: b.centralWarehouse.name, level: 'central',
  }));

  const adminId = await findOrInviteUser(b.admin.email.trim().toLowerCase(), b.admin.fullName, b.admin.password);
  unwrap(await supabase.from('tenant_members').insert({ tenant_id: tenant.id, user_id: adminId, role: 'company_admin' }));

  return NextResponse.json({ data: tenant, adminUserId: adminId }, { status: 201 });
});
