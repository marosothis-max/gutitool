import 'server-only';
import { unwrap } from './api';
import { createAdminClient } from './supabase/admin';

/** Busca el usuario por email; si no existe, le envía invitación de Supabase Auth. */
export async function findOrInviteUser(email: string, fullName?: string): Promise<string> {
  const admin = createAdminClient();
  const existing = unwrap(await admin.from('profiles').select('id').ilike('email', email).maybeSingle());
  if (existing) return existing.id as string;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  });
  if (error) throw new Error(`No se pudo invitar a ${email}: ${error.message}`);
  return data.user.id;
}
