'use client';
import { useEffect, useState } from 'react';

/** Activa las apariciones al desplazar en todos los elementos .lx-reveal de la página. */
export function RevealOnScroll() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.lx-reveal'));
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((e) => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          const el = en.target as HTMLElement;
          el.style.transitionDelay = `${Number(el.dataset.delay ?? 0)}ms`;
          el.classList.add('in');
          io.unobserve(el);
        }
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}

/** Hook: valores que cambian cada pocos segundos para simular la red en vivo. */
function useLive<T>(initial: T, step: (v: T) => T, ms = 2600) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setV((x) => step(x)), ms);
    return () => clearInterval(id);
  }, [ms, step]);
  return v;
}

const fmt = (n: number) => n.toLocaleString('es-ES');

type Net = { central: number; inter: number; final: number; flash: number };
const NET0: Net = { central: 1240, inter: 310, final: 42, flash: -1 };
const netStep = (n: Net): Net => {
  // Simula consumo en el final y reposición desde el intermedio y el central
  const k = Math.floor(Math.random() * 3);
  if (k === 0 && n.final > 18) return { ...n, final: n.final - (2 + Math.floor(Math.random() * 6)), flash: 2 };
  if (k === 1 && n.inter > 60) return { ...n, inter: n.inter - 20, final: n.final + 20, flash: 1 };
  return { ...n, central: n.central - 40, inter: n.inter + 40, flash: 0 };
};

/** Tabla de la red de almacenes con cifras que se mueven. */
export function LiveNetwork() {
  const n = useLive(NET0, netStep);
  const cell = (v: number, i: number, min?: number) => (
    <td className={min !== undefined && v <= min ? 'low' : undefined}>
      <span className={`lx-tick${n.flash === i ? ' flash' : ''}`}>{fmt(v)}</span>
      {min !== undefined && <small>mín. {min}</small>}
    </td>
  );
  return (
    <div className="lx-net">
      <div className="lx-net-head"><span>Disco de corte 125 mm, unidades por almacén</span><span className="lx-live">En vivo</span></div>
      <table>
        <thead><tr><th>Artículo</th><th>Central</th><th>Intermedio</th><th>Mina Norte</th></tr></thead>
        <tbody>
          <tr><td>Disco corte 125 mm</td>{cell(n.central, 0)}{cell(n.inter, 1)}{cell(n.final, 2, 25)}</tr>
          <tr><td>Electrodo E7018 3,2</td><td>860 kg</td><td>210 kg</td><td>38 kg<small>mín. 20</small></td></tr>
          <tr><td>Junta espirometálica 2&quot;</td><td>96</td><td>24</td><td className="low">4<small>mín. 6</small></td></tr>
          <tr><td>Guante nitrilo T9</td><td>1.180</td><td>320</td><td>64<small>mín. 40</small></td></tr>
        </tbody>
      </table>
    </div>
  );
}

const kpiStep = (k: number[]) => [k[0], k[1] + (Math.random() < 0.5 ? 1 : 0), k[2], k[3] + (Math.random() < 0.4 ? 1 : -1)];

/** Indicadores de la maqueta del panel. */
export function LiveKpis() {
  const k = useLive([3, 5, 11, 27], kpiStep, 3200);
  const labels = ['Bajo mínimo', 'En tránsito', 'OC abiertas', 'Herramientas fuera'];
  return (
    <div className="lx-kpis">
      {k.map((v, i) => (
        <div key={labels[i]} className={`lx-kpi${i === 0 ? ' alert' : ''}`}>
          <small>{labels[i]}</small><strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}
