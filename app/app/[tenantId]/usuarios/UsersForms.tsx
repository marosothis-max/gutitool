'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const ROLES: [string, string, string][] = [
  ['company_admin', 'Administrador', 'Gestiona usuarios, almacenes y todo lo demás'],
  ['supervisor', 'Supervisor', 'Aprueba traslados y ajusta inventario'],
  ['buyer', 'Comprador', 'Proveedores, órdenes de compra y reposiciones'],
  ['warehouse_keeper', 'Almacenista', 'Recibe, ubica, entrega y devuelve en sus almacenes'],
  ['carrier', 'Transportista', 'Ve sus traslados y actualiza fechas'],
  ['auditor', 'Auditor', 'Solo consulta y exporta'],
];

export function InviteUserForm({ tenantId, warehouses }: { tenantId: string; warehouses: { id: string; label: string }[] }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<string[]>(['warehouse_keeper']);
  const [whs, setWhs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!roles.length) { setMsg({ ok: false, text: 'Elige al menos un rol.' }); return; }
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/v1/${tenantId}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, fullName: fullName || undefined, password: password || undefined, roles, warehouseIds: whs }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: body.error ?? 'No se pudo dar de alta.' }); return; }
    setMsg({
      ok: true,
      text: body.invited ? `Invitación enviada a ${email}.`
        : password ? `${email} ya puede entrar con la contraseña temporal.` : `${email} añadido al equipo.`,
    });
    setEmail(''); setFullName(''); setPassword(''); setWhs([]);
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      {msg && <div className={msg.ok ? 'form-ok' : 'form-error'} role="status">{msg.text}</div>}
      <div className="field">
        <label htmlFor="u-name">Nombre y apellidos</label>
        <input id="u-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="u-email">Correo</label>
        <input id="u-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="u-pass">Contraseña temporal</label>
        <input id="u-pass" className="input" type="text" minLength={8} autoComplete="off" value={password}
          placeholder="Vacío = se le envía invitación por correo" onChange={(e) => setPassword(e.target.value)} />
      </div>

      <fieldset className="checks">
        <legend>Roles</legend>
        {ROLES.map(([k, label, hint]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={roles.includes(k)} onChange={() => setRoles((r) => toggle(r, k))} />
            <span>{label}<small>{hint}</small></span>
          </label>
        ))}
      </fieldset>

      {roles.includes('warehouse_keeper') && (
        <fieldset className="checks">
          <legend>Almacenes que opera</legend>
          {warehouses.length ? warehouses.map((w) => (
            <label key={w.id} className="check">
              <input type="checkbox" checked={whs.includes(w.id)} onChange={() => setWhs((l) => toggle(l, w.id))} />
              <span>{w.label}</span>
            </label>
          )) : <p className="muted" style={{ margin: 0, fontSize: 14 }}>Aún no hay almacenes creados.</p>}
        </fieldset>
      )}

      <button className="btn btn-primary" disabled={busy}>{busy ? 'Dando de alta…' : 'Dar de alta'}</button>
    </form>
  );
}

export function RemoveUserButton({ tenantId, userId, name }: { tenantId: string; userId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`¿Quitar a ${name} de la empresa? Perderá el acceso y liberará su plaza.`)) return;
    setBusy(true);
    await fetch(`/api/v1/${tenantId}/members?userId=${userId}`, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  }
  return <button className="link-btn" disabled={busy} onClick={remove}>Quitar</button>;
}
