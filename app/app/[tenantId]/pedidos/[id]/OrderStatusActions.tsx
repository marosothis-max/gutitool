'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const NEXT: Record<string, [string, string][]> = {
  draft: [['sent', 'Marcar como enviada'], ['cancelled', 'Cancelar orden']],
  sent: [['confirmed', 'Proveedor confirma'], ['cancelled', 'Cancelar orden']],
  confirmed: [['cancelled', 'Cancelar orden']],
};

export function OrderStatusActions({ tenantId, orderId, status }: { tenantId: string; orderId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const options = NEXT[status];
  if (!options) return null;

  async function go(next: string) {
    if (next === 'cancelled' && !window.confirm('¿Cancelar esta orden de compra?')) return;
    setBusy(true); setErr('');
    const res = await fetch(`/api/v1/${tenantId}/purchase-orders/${orderId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'No se pudo cambiar el estado.'); return; }
    router.refresh();
  }

  return (
    <div className="inline-actions" style={{ marginBottom: 20 }}>
      {options.map(([k, label]) => (
        <button key={k} className={`btn btn-sm ${k === 'cancelled' ? 'btn-ghost' : 'btn-primary'}`} disabled={busy} onClick={() => go(k)}>
          {label}
        </button>
      ))}
      {err && <span className="status-msg err">{err}</span>}
    </div>
  );
}
