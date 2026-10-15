import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BrandMark } from '@/components/Icon';
import { SignOutLink } from '@/components/SignOutLink';
import { Badge, Empty, PageHead, Panel } from '@/components/ui';
import { fmtDate, rows } from '@/lib/app';
import { CreateTenantForm, TenantStatusButton } from './AdminForms';

export const metadata = { title: 'Empresas' };

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/app/admin');
  const { data: profile } = await supabase.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_super_admin) redirect('/app');

  const tenantsRes = await supabase
    .from('tenants')
    .select('id, name, slug, status, created_at, tenant_members(count)')
    .order('created_at', { ascending: false });
  const minesRes = await supabase.from('tenant_members').select('tenant_id').eq('user_id', user.id);
  const myTenants = new Set(rows(minesRes.data).map((m) => m.tenant_id as string));
  const tenants = rows(tenantsRes.data);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--steel-50)' }}>
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/app" className="brand"><BrandMark />Gutitool</Link>
          <span className="muted" style={{ fontSize: 14 }}>Administración de la plataforma</span>
        </div>
      </header>
      <main className="main" style={{ margin: '0 auto' }}>
        <PageHead
          title="Empresas"
          lead="Da de alta empresas, invita a su administrador y suspende el acceso cuando sea necesario."
          actions={<SignOutLink />}
        />
        <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', alignItems: 'start' }}>
          <Panel title="Empresas dadas de alta" flush>
            {tenants.length ? (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Empresa</th><th>Estado</th><th className="r">Usuarios</th><th>Alta</th><th /></tr></thead>
                  <tbody>
                    {tenants.map((t) => (
                      <tr key={t.id}>
                        <td>
                          {myTenants.has(t.id) ? <Link href={`/app/${t.id}`}>{t.name}</Link> : t.name}
                          <span className="cell-sub code">{t.slug}</span>
                        </td>
                        <td>
                          {t.status === 'active' ? <Badge tone="green">Activa</Badge>
                            : t.status === 'suspended' ? <Badge tone="yellow">Suspendida</Badge> : <Badge tone="red">Baja</Badge>}
                        </td>
                        <td className="r">{t.tenant_members?.[0]?.count ?? 0}</td>
                        <td>{fmtDate(t.created_at)}</td>
                        <td className="r"><TenantStatusButton id={t.id} status={t.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Aún no hay empresas">Crea la primera con el formulario. Si te pones a ti como administrador, podrás entrar a ella al momento.</Empty>
            )}
          </Panel>
          <Panel title="Nueva empresa">
            <CreateTenantForm defaultAdminEmail={user.email ?? ''} />
          </Panel>
        </div>
      </main>
    </div>
  );
}
