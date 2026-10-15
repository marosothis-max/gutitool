'use client';
import { useState } from 'react';
import { Icon } from './Icon';

type Props = { tenantId: string; orderId: string; orderNumber: string; supplierEmail?: string | null; notifyEmail?: string | null };

/**
 * Envío rápido: manda el detalle del pedido (HTML + Excel adjunto) al correo
 * configurado de la empresa, con opción de copia al proveedor.
 */
export function SendOrderEmailButton({ tenantId, orderId, orderNumber, supplierEmail, notifyEmail }: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [includeSupplier, setIncludeSupplier] = useState(false);

  async function send() {
    setState('sending'); setMsg('');
    const res = await fetch(`/api/v1/${tenantId}/purchase-orders/${orderId}/email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ includeSupplier }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { setState('sent'); setMsg(`Pedido enviado a ${body.to.join(', ')}`); }
    else { setState('error'); setMsg(body.error ?? 'No se pudo enviar el pedido.'); }
  }

  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
      <div className="inline-actions">
        <a className="btn btn-ghost btn-sm" href={`/api/v1/${tenantId}/purchase-orders/${orderId}/export`}>
          <Icon name="download" size={16} />Excel
        </a>
        <button className="btn btn-primary btn-sm" onClick={send} disabled={state === 'sending'}
          aria-label={`Enviar ${orderNumber} por correo`}>
          <Icon name="mail" size={16} />{state === 'sending' ? 'Enviando…' : 'Enviar por correo'}
        </button>
      </div>
      <div style={{ fontSize: 13, color: 'var(--steel-600)', textAlign: 'right' }}>
        Destino: {notifyEmail || 'sin correo configurado'}
        {supplierEmail && (
          <label style={{ display: 'block' }}>
            <input type="checkbox" checked={includeSupplier} onChange={(e) => setIncludeSupplier(e.target.checked)} />{' '}
            Copia al proveedor ({supplierEmail})
          </label>
        )}
      </div>
      {msg && <span role="status" className={`status-msg ${state === 'error' ? 'err' : 'ok'}`}>{msg}</span>}
    </div>
  );
}
