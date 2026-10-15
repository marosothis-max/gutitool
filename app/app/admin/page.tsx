import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BrandMark } from '@/components/Icon';
import { SignOutLink } from '@/components/SignOutLink';
import { Badge, Empty, PageHead, Panel } from '@/components/ui';
import { fmtDate, rows } from '@/lib/app';
import { CreateTenantForm, PlanEditor, TenantStatusButton } from './AdminForms';

export const metadata = { title: 'Empresas' };

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/app/admin');
  const { data: profile } = await supabase.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_super_admin) redirect('/app');

  const [tenantsRes, minesRes] = await Promise.all([
    supabase.from('tenants').select('id, name, slug, status, plan, max_users, created_at').order('created_at', { ascending: false }),
    supabase.from('tenant_members').select('tenant_id').eq('user_id', user.id),
  ]);
  const tenants = rows(tenantsRes.data);
  const myTenants = new Set(rows(minesRes.data).map((m) => m.tenant_id as string));
  const usage = await Promise.all(
    tenants.map((t) => supabase.rpc('tenant_active_users', { p_tenant: t.id }).then((r) => Number(r.data ?? 0))),
  );
  const totalUsers = usage.reduce((a, b) => a + b, 0);
  const active = tenants.filter((t) => t.status === 'active').length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--steel-50)' }}>
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/app/admin" className="brand"><BrandMark />Gutitool</Link>
          <span className="inline-actions">
            <span className="muted" style={{ fontSize: 14 }}>Administración de la plataforma</span>
            <SignOutLink />
          </span>
        </div>
      </header>
      <main className="main" style={{ margin: '0 auto' }}>
        <PageHead
          title="Empresas"
          lead="Da de alta empresas, asigna su plan y su límite de usuarios, y suspende el acceso cuando sea necesario."
        />

        <div className="kpis">
          <div className="kpi"><div className="kpi-label">Empresas activas</div><div className="kpi-value">{active}</div></div>
          <div className="kpi"><div className="kpi-label">Empresas en total</div><div className="kpi-value">{tenants.length}</div></div>
          <div className="kpi"><div className="kpi-label">Usuarios activos</div><div className="kpi-value">{totalUsers}</div></div>
          <div className="kpi"><div className="kpi-label">Suspendidas</div><div className="kpi-value">{tenants.length - active}</div></div>
        </div>

        <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(320px, 2fr)', alignItems: 'start' }}>
          <Panel title="Empresas dadas de alta" flush>
            {tenants.length ? (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Empresa</th><th>Estado</th><th>Plan y usuarios</th><th>Alta</th><th /></tr></thead>
                  <tbody>
                    {tenants.map((t, i) => (
                      <tr key={t.id}>
                        <td>
                          {myTenants.has(t.id) ? <Link href={`/app/${t.id}`}>{t.name}</Link> : t.name}
                          <span className="cell-sub code">{t.slug}</span>
                        </td>
                        <td>
                          {t.status === 'active' ? <Badge tone="green">Activa</Badge>
                            : t.status === 'suspended' ? <Badge tone="yellow">Suspendida</Badge> : <Badge tone="red">Baja</Badge>}
                        </td>
                        <td><PlanEditor id={t.id} plan={t.plan} maxUsers={t.max_users} used={usage[i]} /></td>
                        <td>{fmtDate(t.created_at)}</td>
                        <td className="r"><TenantStatusButton id={t.id} status={t.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Aún no hay empresas">Crea la primera con el formulario de la derecha.</Empty>
            )}
          </Panel>
          <Panel title="Nueva empresa">
            <CreateTenantForm />
          </Panel>
        </div>
      </main>
    </div>
  );
}
