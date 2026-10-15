'use client';
import { useState } from 'react';

type Props = { tenantId: string; orderId: string; orderNumber: string; supplierEmail?: string | null };

/**
 * Botón de envío rápido: manda el detalle del pedido (HTML + Excel) al correo
 * configurado de la empresa, con opción de copiar al proveedor.
 */
export function SendOrderEmailButton({ tenantId, orderId, orderNumber, supplierEmail }: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [includeSupplier, setIncludeSupplier] = useState(false);

  async function send() {
    setState('sending');
    setMsg('');
    const res = await fetch(`/api/v1/${tenantId}/purchase-orders/${orderId}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ includeSupplier }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setState('sent');
      setMsg(`Enviado a ${body.to.join(', ')}`);
    } else {
      setState('error');
      setMsg(body.error ?? 'No se pudo enviar');
    }
  }

  return (
    <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={send} disabled={state === 'sending'} aria-label={`Enviar ${orderNumber} por correo`}>
        {state === 'sending' ? 'Enviando…' : '✉ Enviar pedido por correo'}
      </button>
      {supplierEmail && (
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={includeSupplier} onChange={(e) => setIncludeSupplier(e.target.checked)} />{' '}
          Copia al proveedor ({supplierEmail})
        </label>
      )}
      <a href={`/api/v1/${tenantId}/purchase-orders/${orderId}/export`}>⬇ Excel</a>
      {msg && <span role="status" style={{ color: state === 'error' ? '#b42318' : '#067647', fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
