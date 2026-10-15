'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PLAN_INFO, PLANS, planLabel, type Plan } from '@/lib/plans';

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function CreateTenantForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [plan, setPlan] = useState<Plan>('basico');
  const [maxUsers, setMaxUsers] = useState<string>('5');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [whName, setWhName] = useState('Almacén Central');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function choosePlan(p: Plan) {
    setPlan(p);
    const d = PLAN_INFO[p].defaultUsers;
    setMaxUsers(d === null ? '' : String(d));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch('/api/v1/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, slug: slug || slugify(name), taxId: taxId || undefined, notifyEmail: notifyEmail || undefined,
        plan, maxUsers: maxUsers ? Number(maxUsers) : null,
        admin: { email: adminEmail, fullName: adminName || undefined, password: adminPassword || undefined },
        centralWarehouse: { code: 'CEN', name: whName },
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: body.error === 'Registro duplicado' ? 'Ya existe una empresa con ese identificador.' : body.error ?? 'No se pudo crear la empresa.' });
      return;
    }
    setMsg({
      ok: true,
      text: adminPassword
        ? `${name} creada. ${adminEmail} ya puede entrar con la contraseña que has indicado.`
        : `${name} creada. Se ha enviado una invitación a ${adminEmail}.`,
    });
    setName(''); setSlug(''); setSlugTouched(false); setTaxId(''); setNotifyEmail('');
    setAdminName(''); setAdminEmail(''); setAdminPassword('');
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      {msg && <div className={msg.ok ? 'form-ok' : 'form-error'} role="status">{msg.text}</div>}
      <div className="field">
        <label htmlFor="t-name">Nombre de la empresa</label>
        <input id="t-name" className="input" required value={name}
          onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
      </div>
      <div className="pair" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="t-slug">Identificador</label>
          <input id="t-slug" className="input code" required pattern="[a-z0-9-]{3,40}" value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} />
        </div>
        <div className="field">
          <label htmlFor="t-tax">CIF / NIF</label>
          <input id="t-tax" className="input" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
        </div>
      </div>

      <div className="pair" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="t-plan">Plan contratado</label>
          <select id="t-plan" className="select" value={plan} onChange={(e) => choosePlan(e.target.value as Plan)}>
            {PLANS.map((p) => <option key={p} value={p}>{PLAN_INFO[p].label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-max">Límite de usuarios</label>
          <input id="t-max" className="input num" type="number" min={1} placeholder="Sin límite" value={maxUsers}
            onChange={(e) => setMaxUsers(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="t-aname">Administrador de la empresa</label>
        <input id="t-aname" className="input" placeholder="Nombre y apellidos" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
      </div>
      <div className="pair" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="t-admin">Correo</label>
          <input id="t-admin" className="input" type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="t-apass">Contraseña temporal</label>
          <input id="t-apass" className="input" type="text" minLength={8} placeholder="Vacío = invitación por correo"
            value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} autoComplete="off" />
        </div>
      </div>

      <div className="pair" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="t-notify">Correo para pedidos</label>
          <input id="t-notify" className="input" type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="t-wh">Almacén central</label>
          <input id="t-wh" className="input" required value={whName} onChange={(e) => setWhName(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Creando…' : 'Crear empresa'}</button>
    </form>
  );
}

/** Plan y límite de usuarios editables en la propia fila. */
export function PlanEditor({ id, plan, maxUsers, used }: { id: string; plan: string; maxUsers: number | null; used: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [p, setP] = useState<Plan>((PLANS as readonly string[]).includes(plan) ? (plan as Plan) : 'basico');
  const [max, setMax] = useState(maxUsers === null ? '' : String(maxUsers));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const full = maxUsers !== null && used >= maxUsers;

  async function save() {
    setBusy(true); setErr('');
    const res = await fetch(`/api/v1/admin/tenants/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: p, maxUsers: max ? Number(max) : null }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'No se pudo guardar.'); return; }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <span>
        {planLabel(plan)}
        <span className="cell-sub">
          <span className={full ? 'badge badge-yellow' : undefined}>{used} de {maxUsers ?? 'ilimitados'} usuarios</span>{' '}
          <button className="link-btn" style={{ fontSize: 13 }} onClick={() => setEditing(true)}>Cambiar</button>
        </span>
      </span>
    );
  }
  return (
    <span className="inline-actions">
      <select className="select" style={{ height: 34, width: 130, fontSize: 14 }} value={p} aria-label="Plan"
        onChange={(e) => { const v = e.target.value as Plan; setP(v); const d = PLAN_INFO[v].defaultUsers; setMax(d === null ? '' : String(d)); }}>
        {PLANS.map((x) => <option key={x} value={x}>{PLAN_INFO[x].label}</option>)}
      </select>
      <input className="input num" style={{ height: 34, width: 90, fontSize: 14 }} type="number" min={1}
        placeholder="Sin límite" aria-label="Límite de usuarios" value={max} onChange={(e) => setMax(e.target.value)} />
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>Guardar</button>
      <button className="link-btn" onClick={() => setEditing(false)}>Cancelar</button>
      {err && <span className="status-msg err">{err}</span>}
    </span>
  );
}

export function TenantStatusButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = status === 'active' ? 'suspended' : 'active';
  async function toggle() {
    if (next === 'suspended' && !window.confirm('La empresa perderá el acceso inmediatamente. ¿Suspender?')) return;
    setBusy(true);
    await fetch(`/api/v1/admin/tenants/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    router.refresh();
  }
  return (
    <button className="link-btn" onClick={toggle} disabled={busy}>
      {status === 'active' ? 'Suspender' : 'Reactivar'}
    </button>
  );
}
