import type { ReactNode } from 'react';
import { Shell } from '@/components/Sidebar';
import { getTenantContext, ROLE_ES } from '@/lib/app';

export default async function TenantLayout({
  children, params,
}: { children: ReactNode; params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { supabase, tenant, roles, profile, user, can } = await getTenantContext(tenantId);
  const { count } = await supabase
    .from('stock_alerts').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('status', 'open');

  return (
    <Shell
      tenantId={tenantId}
      tenantName={tenant.name}
      roleLabel={roles.map((r) => ROLE_ES[r] ?? r).join(', ')}
      email={profile?.email ?? user.email ?? ''}
      alerts={count ?? 0}
      isSuperAdmin={!!profile?.is_super_admin}
      canSeeUsers={can('company_admin', 'supervisor', 'auditor')}
    >
      {children}
    </Shell>
  );
}
