import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BrandMark } from '@/components/Icon';
import { SignOutLink } from '@/components/SignOutLink';
import { rows } from '@/lib/app';

// Entrada a la app: lleva a la primera empresa del usuario,
// al panel de plataforma si es super admin sin empresa, o explica qué falta.
export default async function AppHome() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: members }, { data: profile }] = await Promise.all([
    supabase.from('tenant_members').select('tenant_id, tenants!inner(status)').eq('user_id', user.id).eq('active', true).limit(1),
    supabase.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle(),
  ]);

  const first = rows(members)[0];
  if (first) redirect(`/app/${first.tenant_id}`);
  if (profile?.is_super_admin) redirect('/app/admin');

  return (
    <div className="auth-main" style={{ minHeight: '100vh' }}>
      <div className="auth-card">
        <Link href="/" className="brand" style={{ marginBottom: 24 }}><BrandMark />Gutitool</Link>
        <h1>Todavía no tienes empresa asignada</h1>
        <p>
          Tu cuenta <strong>{user.email}</strong> está creada. Pide al administrador de tu empresa que te añada
          con tu rol, o si eres el administrador de la plataforma, activa tu perfil de super administrador en Supabase.
        </p>
        <SignOutLink />
      </div>
    </div>
  );
}
