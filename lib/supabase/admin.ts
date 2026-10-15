import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Cliente con la clave SECRETA: se salta el RLS.
 * Uso restringido a operaciones de plataforma (crear empresa, invitar usuarios),
 * SIEMPRE después de comprobar el rol del usuario en el endpoint.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY no configurada');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
