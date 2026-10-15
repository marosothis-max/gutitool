'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Acciones del traslado según su estado:
 *  solicitado → aprobar (supervisión) / despachar (origen)
 *  en tránsito → recibir en una ubicación del destino
 * La base de datos valida que el usuario opere ese almacén.
 */
export function TransferActions({
  tenantId, id, status, canApprove, destLocations, lineIds,
}: {
  tenantId: string; id: string; status: string; canApprove: boolean;
  destLocations: { id: string; code: string }[]; lineIds: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loc, setLoc] = useState(destLocations[0]?.id ?? '');

  async function call(action: string, body?: unknown) {
    setBusy(true); setErr('');
    const res = await fetch(`/api/v1/${tenantId}/transfers/${id}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'No se pudo completar la acción.'); return; }
    router.refresh();
  }

  if (status === 'requested' || status === 'approved') {
    return (
      <span className="inline-actions">
        {status === 'requested' && canApprove && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => call('approve')}>Aprobar</button>
        )}
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => call('dispatch')}>Despachar</button>
        {err && <span className="status-msg err">{err}</span>}
      </span>
    );
  }

  if (status === 'in_transit') {
    if (!destLocations.length) return <span className="status-msg err">El destino no tiene ubicaciones</span>;
    return (
      <span className="inline-actions">
        <select className="select" style={{ height: 34, width: 140, fontSize: 14 }} value={loc}
          onChange={(e) => setLoc(e.target.value)} aria-label="Ubicación de destino">
          {destLocations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" disabled={busy || !loc}
          onClick={() => call('receive', { lines: lineIds.map((lineId) => ({ lineId, toLocationId: loc })) })}>
          Recibir
        </button>
        {err && <span className="status-msg err">{err}</span>}
      </span>
    );
  }
  return null;
}
