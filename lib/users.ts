import 'server-only';
import { ApiError, unwrap } from './api';
import { createAdminClient } from './supabase/admin';

/**
 * Busca el usuario por email. Si no existe:
 *  - con contraseña: lo crea ya confirmado (el admin le comunica la contraseña temporal);
 *  - sin contraseña: le envía la invitación de Supabase Auth por correo.
 */
export async function findOrCreateUser(email: string, opts: { fullName?: string; password?: string } = {}) {
  const admin = createAdminClient();
  const existing = unwrap(
    await admin.from('profiles').select('id').ilike('email', email).maybeSingle(),
  ) as { id: string } | null;
  if (existing) return { id: existing.id, created: false };

  if (opts.password) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password: opts.password, email_confirm: true, user_metadata: { full_name: opts.fullName },
    });
    if (error || !data?.user) throw new ApiError(422, `No se pudo crear a ${email}: ${error?.message ?? 'sin usuario'}`);
    return { id: data.user.id, created: true };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: opts.fullName },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  });
  if (error || !data?.user) throw new ApiError(422, `No se pudo invitar a ${email}: ${error?.message ?? 'sin usuario'}`);
  return { id: data.user.id, created: true };
}

/** Compatibilidad con el alta de empresas. */
export async function findOrInviteUser(email: string, fullName?: string, password?: string) {
  return (await findOrCreateUser(email, { fullName, password })).id;
}
