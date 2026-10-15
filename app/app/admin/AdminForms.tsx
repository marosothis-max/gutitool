'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function CreateTenantForm({ defaultAdminEmail }: { defaultAdminEmail: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [adminEmail, setAdminEmail] = useState(defaultAdminEmail);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [whName, setWhName] = useState('Almacén Central');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch('/api/v1/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, slug: slug || slugify(name), taxId: taxId || undefined,
        notifyEmail: notifyEmail || undefined,
        admin: { email: adminEmail },
        centralWarehouse: { code: 'CEN', name: whName },
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: body.error === 'Registro duplicado' ? 'Ya existe una empresa con ese identificador.' : body.error ?? 'No se pudo crear la empresa.' });
      return;
    }
    setMsg({ ok: true, text: `${name} creada. Se ha invitado a ${adminEmail} como administrador.` });
    setName(''); setSlug(''); setSlugTouched(false); setTaxId(''); setNotifyEmail('');
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
      <div className="field">
        <label htmlFor="t-slug">Identificador</label>
        <input id="t-slug" className="input code" required pattern="[a-z0-9-]{3,40}" value={slug}
          onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} />
      </div>
      <div className="field">
        <label htmlFor="t-tax">CIF / NIF</label>
        <input id="t-tax" className="input" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="t-admin">Correo del administrador de la empresa</label>
        <input id="t-admin" className="input" type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="t-notify">Correo para envío de pedidos</label>
        <input id="t-notify" className="input" type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="t-wh">Nombre del almacén central</label>
        <input id="t-wh" className="input" required value={whName} onChange={(e) => setWhName(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Creando…' : 'Crear empresa'}</button>
    </form>
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
