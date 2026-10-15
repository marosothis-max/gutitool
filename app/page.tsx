import { createClient } from '@/lib/supabase/server';
import { StockAlertsLive } from '@/components/StockAlertsLive';

// Página de arranque: muestra las empresas del usuario y sus alertas en vivo.
// La UI completa (paneles por rol) se construye sobre la API /api/v1.
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main>
        <h1>Gutitool</h1>
        <p>Inicia sesión para continuar.</p>
      </main>
    );
  }
  const { data: memberships } = await supabase
    .from('tenant_members')
    .select('tenant_id, role, tenants(name, status)')
    .eq('user_id', user.id);

  const tenants = new Map<string, { name: string; roles: string[] }>();
  for (const m of (memberships ?? []) as any[]) {
    const t = tenants.get(m.tenant_id) ?? { name: m.tenants.name, roles: [] };
    t.roles.push(m.role);
    tenants.set(m.tenant_id, t);
  }

  return (
    <main>
      <h1>Gutitool</h1>
      {[...tenants.entries()].map(([id, t]) => (
        <section key={id}>
          <h2>{t.name} <small>({t.roles.join(', ')})</small></h2>
          <StockAlertsLive tenantId={id} />
        </section>
      ))}
    </main>
  );
}
