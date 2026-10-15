import { redirect } from 'next/navigation';
import { getTenantContext, rows, ROLE_ES } from '@/lib/app';
import { planLabel } from '@/lib/plans';
import { Badge, Empty, PageHead, Panel } from '@/components/ui';
import { InviteUserForm, RemoveUserButton } from './UsersForms';

export const metadata = { title: 'Usuarios' };

export default async function UsersPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { supabase, can, user } = await getTenantContext(tenantId);
  if (!can('company_admin', 'supervisor', 'auditor')) redirect(`/app/${tenantId}`);
  const isAdmin = can('company_admin');

  const [mRes, tRes, wRes, mwRes] = await Promise.all([
    supabase.from('tenant_members').select('user_id, role, active, created_at, profiles(email, full_name)')
      .eq('tenant_id', tenantId).order('created_at'),
    supabase.from('tenants').select('plan, max_users').eq('id', tenantId).maybeSingle(),
    supabase.from('warehouses').select('id, code, name, level').eq('tenant_id', tenantId).eq('active', true).order('code'),
    supabase.from('member_warehouses').select('user_id, warehouse_id').eq('tenant_id', tenantId),
  ]);

  // Agrupa roles por usuario
  const byUser = new Map<string, { id: string; email: string; name: string | null; roles: string[]; active: boolean; warehouses: string[] }>();
  for (const m of rows(mRes.data)) {
    const u = byUser.get(m.user_id) ?? { id: m.user_id, email: m.profiles?.email ?? '', name: m.profiles?.full_name ?? null, roles: [], active: false, warehouses: [] };
    u.roles.push(m.role);
    u.active ||= m.active;
    byUser.set(m.user_id, u);
  }
  const whs = rows(wRes.data);
  const whCode = new Map(whs.map((w) => [w.id as string, w.code as string]));
  for (const mw of rows(mwRes.data)) byUser.get(mw.user_id)?.warehouses.push(whCode.get(mw.warehouse_id) ?? '');

  const users = [...byUser.values()];
  const used = users.filter((u) => u.active).length;
  const t = (tRes.data ?? null) as unknown as { plan: string; max_users: number | null } | null;
  const max = t?.max_users ?? null;
  const full = max !== null && used >= max;

  return (
    <>
      <PageHead
        title="Usuarios"
        lead={<>Plan {planLabel(t?.plan ?? 'basico')}: <strong className="num">{used}</strong> de {max ?? 'ilimitados'} usuarios en uso.</>}
      />
      {max !== null && (
        <div className="usage" aria-label={`${used} de ${max} usuarios`}>
          <div className={`usage-bar${full ? ' is-full' : ''}`} style={{ width: `${Math.min(100, (used / max) * 100)}%` }} />
        </div>
      )}

      <div className="grid-2" style={{ gridTemplateColumns: isAdmin ? 'minmax(0, 3fr) minmax(320px, 2fr)' : '1fr', alignItems: 'start' }}>
        <Panel title="Equipo" flush>
          {users.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Persona</th><th>Roles</th><th>Almacenes</th>{isAdmin && <th />}</tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name || u.email}<span className="cell-sub">{u.email}</span></td>
                      <td><span className="inline-actions">{u.roles.map((r) => <Badge key={r} tone={r === 'company_admin' ? 'blue' : 'grey'}>{ROLE_ES[r] ?? r}</Badge>)}</span></td>
                      <td className="code">{u.warehouses.length ? u.warehouses.join(', ') : <span className="muted">Todos (según rol)</span>}</td>
                      {isAdmin && <td className="r">{u.id !== user.id && <RemoveUserButton tenantId={tenantId} userId={u.id} name={u.name || u.email} />}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Sin usuarios">Da de alta al primero con el formulario.</Empty>}
        </Panel>

        {isAdmin && (
          <Panel title="Dar de alta un usuario">
            {full ? (
              <div className="form-error" role="status">
                Has llegado al límite de {max} usuarios de tu plan. Para añadir más, pide al administrador de la plataforma que amplíe el plan.
              </div>
            ) : (
              <InviteUserForm tenantId={tenantId} warehouses={whs.map((w) => ({ id: w.id, label: `${w.code}, ${w.name}` }))} />
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
