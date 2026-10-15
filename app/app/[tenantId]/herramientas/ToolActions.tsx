'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Entregar una herramienta disponible o registrar su devolución. */
export function ToolActions({
  tenantId, assetId, status, assignmentId, locations,
}: {
  tenantId: string; assetId: string; status: string; assignmentId: string | null;
  locations: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState('');
  const [due, setDue] = useState('');
  const [loc, setLoc] = useState(locations[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function post(body: unknown) {
    setBusy(true); setErr('');
    const res = await fetch(`/api/v1/${tenantId}/tools`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'No se pudo completar.'); return; }
    setOpen(false); setWho(''); setDue('');
    router.refresh();
  }

  if (status === 'available') {
    if (!open) return <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Entregar</button>;
    return (
      <span className="inline-actions">
        <input className="input" style={{ height: 34, width: 180, fontSize: 14 }} placeholder="Operario u orden de trabajo"
          aria-label="Entregar a" value={who} onChange={(e) => setWho(e.target.value)} />
        <input className="input" style={{ height: 34, width: 150, fontSize: 14 }} type="date" aria-label="Fecha de devolución"
          value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={busy || who.trim().length < 2}
          onClick={() => post({ action: 'checkout', assetId, assignedToName: who.trim(), dueAt: due || undefined })}>
          Confirmar
        </button>
        <button className="link-btn" onClick={() => setOpen(false)}>Cancelar</button>
        {err && <span className="status-msg err">{err}</span>}
      </span>
    );
  }

  if (status === 'assigned' && assignmentId) {
    return (
      <span className="inline-actions">
        <select className="select" style={{ height: 34, width: 160, fontSize: 14 }} value={loc}
          onChange={(e) => setLoc(e.target.value)} aria-label="Ubicación de devolución">
          {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" disabled={busy || !loc}
          onClick={() => post({ action: 'checkin', assignmentId, locationId: loc })}>
          Registrar devolución
        </button>
        {err && <span className="status-msg err">{err}</span>}
      </span>
    );
  }
  return null;
}
