import Link from 'next/link';
import type { ReactNode } from 'react';
import './landing.css';
import { Icon } from '@/components/Icon';
import { LiveKpis, LiveNetwork, RevealOnScroll } from '@/components/landing/Motion';

export const metadata = { title: 'Inventario industrial para petróleo, metalurgia y minería' };

const TAPE = [
  'Stock por bin', 'Alertas de mínimo', 'Central · Intermedio · Frente', 'Herramientas con nº de serie',
  'Recepción con factura', 'Devoluciones numeradas', 'Excel en un clic', 'Pedido por correo', 'Multiempresa',
];

const FEATURES: [string, string, string][] = [
  ['network', 'Red de almacenes', 'Central, intermedios y almacenes finales en obra, planta o mina, conectados y con stock en tiempo real.'],
  ['location', 'Ubicación al bin', 'Pasillo, estantería y casillero de cada artículo. Quien prepara sabe a qué hueco ir.'],
  ['alert', 'Alertas de mínimo', 'Al cruzar el umbral avisa al momento y deja preparada la orden de compra o el traslado.'],
  ['tools', 'Herramientas controladas', 'Cada unidad con número de serie, a quién se entregó y cuándo debe volver.'],
  ['orders', 'Compras con trazabilidad', 'Fecha estimada de despacho y de entrega en cada línea pedida. Lo retrasado, marcado.'],
  ['receipt', 'Recepción obligada a documento', 'Ninguna entrada sin número de orden de compra o factura del proveedor.'],
  ['returns', 'Devoluciones numeradas', 'Correlativo propio sin saltos, a proveedor o de vuelta al almacén superior.'],
  ['download', 'Excel y correo', 'Stock, movimientos y pedidos en Excel. El pedido sale por correo con un botón.'],
];

export default function Landing() {
  return (
    <div className="lx">
      {/* Marca la página como animable antes del primer pintado (sin parpadeo) */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('lx-js')" }} />
      <RevealOnScroll />

      {/* ---------- Navegación ---------- */}
      <header className="lx-nav">
        <div className="lx-wrap lx-nav-in">
          <Link href="/" className="lx-logo" aria-label="Gutitool, inicio">
            <Mark />
            <span className="lx-logo-word">Guti<b>tool</b></span>
          </Link>
          <nav className="lx-links" aria-label="Principal">
            <a className="l" href="#flujo">Cómo funciona</a>
            <a className="l" href="#funciones">Funciones</a>
            <a className="l" href="#sectores">Sectores</a>
            <a className="l" href="#seguridad">Seguridad</a>
            <Link className="lx-btn lx-btn-hot lx-btn-sm" href="/login">Iniciar sesión</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="lx-hero lx-mesh">
          <div className="lx-wrap lx-hero-grid">
            <div>
              <p className="lx-kicker">Inventario para la industria pesada</p>
              <h1 className="lx-display">
                <span>Tu almacén,</span>
                <span>bajo control.</span>
                <span className="hot">Cero paradas.</span>
              </h1>
              <p className="lx-lead">
                Gutitool controla el stock del almacén central, de los intermedios y de cada pozo, planta o mina,
                hasta el pasillo y el bin. Avisa antes de quedarte sin repuestos y registra cada entrada, salida y traslado.
              </p>
              <div className="lx-actions">
                <Link className="lx-btn lx-btn-hot" href="/login">Iniciar sesión</Link>
                <a className="lx-btn lx-btn-line" href="#flujo">Ver qué hace</a>
              </div>
              <ul className="lx-chips">
                <li>Stock al bin</li><li>3 niveles de almacén</li><li>Herramientas por nº de serie</li>
                <li>Excel y correo</li><li>Datos aislados por empresa</li>
              </ul>
            </div>

            <div className="lx-stage" aria-hidden="true">
              <div className="lx-screen">
                <div className="lx-screen-top"><i /><i /><i /><span>gutitool · Panel · Minera del Norte</span></div>
                <div className="lx-screen-body">
                  <div className="lx-side"><b className="on" /><b /><b /><b /><b /><b /><b /></div>
                  <div className="lx-main">
                    <h4>Hola, Marta</h4>
                    <LiveKpis />
                    <div className="lx-table">
                      <div className="lx-row"><span>Artículo</span><span>Almacén</span><span className="q">Stock</span><span>Reposición</span></div>
                      <div className="lx-row low"><span>Junta espirometálica 2&quot;</span><span>Pozo 14</span><span className="q">4 / 6</span><span><span className="lx-tag warn">Bajo mínimo</span></span></div>
                      <div className="lx-row"><span>Bola molienda 3&quot;</span><span>Planta Sur</span><span className="q">2,1 t</span><span><span className="lx-tag">TRF-000031</span></span></div>
                      <div className="lx-row"><span>Electrodo E7018</span><span>Central</span><span className="q">860 kg</span><span><span className="lx-tag ok">En plazo</span></span></div>
                      <div className="lx-row"><span>Broca tricono 8½&quot;</span><span>Intermedio</span><span className="q">3</span><span><span className="lx-tag">OC-000097</span></span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lx-phone">
                <div className="lx-phone-in">
                  <div className="lx-phone-head"><small>Recepción OC-2026-000097</small><strong>Escanea la ubicación</strong></div>
                  <div className="lx-scan"><i /><span className="code">P01-E03-B12</span></div>
                  <div className="lx-phone-list">
                    <div className="lx-phone-item"><span>Junta 2&quot; 300#</span><b>24 ud</b></div>
                    <div className="lx-phone-item"><span>Disco corte 125</span><b>500 ud</b></div>
                  </div>
                  <div className="lx-phone-btn">Registrar entrada</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Cinta de señalización ---------- */}
        <div className="lx-tape-wrap" aria-hidden="true">
          <div className="lx-tape">
            <div className="lx-tape-track">
              {[...TAPE, ...TAPE].map((t, i) => <span key={i}>{t}</span>)}
            </div>
          </div>
        </div>

        {/* ---------- Flujo ---------- */}
        <section className="lx-sec" id="flujo">
          <div className="lx-wrap">
            <p className="lx-kicker lx-reveal">Toda la cadena de suministro</p>
            <h2 className="lx-display lx-reveal">Del proveedor <span className="hot">al frente de trabajo</span></h2>
            <p className="lx-sub lx-reveal">Cada pieza recorre el mismo circuito y deja rastro en cada paso. Sin hojas sueltas ni llamadas para saber qué queda.</p>
            <div className="lx-flow">
              <div className="lx-conveyor" aria-hidden="true" />
              <div className="lx-crate" aria-hidden="true" /><div className="lx-crate c2" aria-hidden="true" /><div className="lx-crate c3" aria-hidden="true" />
              {[
                ['Compra', 'La orden de compra lleva fechas estimadas de despacho y entrega por línea.'],
                ['Recepción', 'Entra en el central con su factura u orden, y se ubica en su bin.'],
                ['Traslado', 'Baja al intermedio y de ahí al pozo, planta o mina, con transportista asignado.'],
                ['Consumo', 'Se imputa a la orden de trabajo. Las herramientas se entregan con fecha de vuelta.'],
                ['Reposición', 'Bajo el mínimo salta la alerta y se genera el traslado o la compra.'],
              ].map(([t, d], i) => (
                <div key={t} className="lx-step lx-reveal" data-delay={i * 90}>
                  <div className="lx-step-n">{i + 1}</div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Funciones ---------- */}
        <section className="lx-sec alt lx-mesh" id="funciones">
          <div className="lx-wrap">
            <p className="lx-kicker lx-reveal">Lo que hace</p>
            <h2 className="lx-display lx-reveal">Todo tu inventario <span className="hot">en una pantalla</span></h2>
            <p className="lx-sub lx-reveal">Administración, compras, almacenistas, transportistas y auditoría trabajan sobre los mismos datos, cada uno con su rol.</p>
            <div className="lx-cards">
              {FEATURES.map(([ic, t, d], i) => (
                <article key={t} className="lx-card lx-reveal" data-delay={(i % 4) * 80}>
                  <div className="lx-card-ic"><Icon name={ic} size={22} /></div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Puesto de mando ---------- */}
        <section className="lx-sec">
          <div className="lx-wrap lx-split">
            <div>
              <p className="lx-kicker lx-reveal">Puesto de mando</p>
              <h2 className="lx-display lx-reveal">El central lo ve <span className="hot">todo, ya</span></h2>
              <p className="lx-sub lx-reveal" style={{ marginBottom: 0 }}>
                Stock exacto de cada artículo en cada almacén, lo que va en camino y lo que está pedido.
                Se actualiza con cada movimiento, sin recargar.
              </p>
              <ul className="lx-list lx-reveal">
                <li><span><b>Matriz artículo por almacén</b>Con mínimo, tránsito y pedidos pendientes en cada celda.</span></li>
                <li><span><b>Entregas con retraso</b>Las órdenes y traslados fuera de plazo aparecen marcados.</span></li>
                <li><span><b>Exportación inmediata</b>La red completa en Excel para la reunión de planificación.</span></li>
              </ul>
            </div>
            <div className="lx-reveal" data-delay={120}><LiveNetwork /></div>
          </div>
        </section>

        {/* ---------- Compras, recepción, devoluciones ---------- */}
        <section className="lx-sec alt">
          <div className="lx-wrap lx-split">
            <div className="lx-reveal">
              <div className="lx-doc">
                <div className="lx-doc-head"><b>REC-2026-000214</b><span>OC-2026-000097 · Suministros Levante</span></div>
                <table>
                  <thead><tr><th>Artículo</th><th>Ubicación</th><th className="r">Pedido</th><th className="r">Recibido</th></tr></thead>
                  <tbody>
                    <tr><td>Junta espirometálica 2&quot;</td><td>P01-E03-B12</td><td className="r">48</td><td className="r">24</td></tr>
                    <tr><td>Disco corte 125 mm</td><td>P02-E01-B04</td><td className="r">500</td><td className="r">500</td></tr>
                    <tr><td>Electrodo E7018 3,2</td><td>P04-E02-B01</td><td className="r">200 kg</td><td className="r">200 kg</td></tr>
                  </tbody>
                </table>
                <div className="lx-doc-foot"><span className="lx-tag warn">Recibida parcial</span><span className="lx-tag">Factura FV-2026/0042</span><span className="lx-tag ok">Stock actualizado</span></div>
              </div>
            </div>
            <div>
              <p className="lx-kicker lx-reveal">Compras y devoluciones</p>
              <h2 className="lx-display lx-reveal">Ni una entrada <span className="hot">sin documento</span></h2>
              <ul className="lx-list lx-reveal">
                <li><span><b>Recepción contra orden o factura</b>Si llega menos de lo pedido, la diferencia queda pendiente y a la vista.</span></li>
                <li><span><b>Devoluciones con número propio</b>DEV-2026-000001 y siguientes, sin saltos ni posibilidad de editarlas.</span></li>
                <li><span><b>Pedido al proveedor en un clic</b>El detalle sale por correo con el Excel adjunto.</span></li>
              </ul>
            </div>
          </div>
        </section>

        {/* ---------- Sectores ---------- */}
        <section className="lx-sec lx-mesh" id="sectores">
          <div className="lx-wrap">
            <p className="lx-kicker lx-reveal">Hecho para la industria</p>
            <h2 className="lx-display lx-reveal">Donde parar <span className="hot">cuesta caro</span></h2>
            <p className="lx-sub lx-reveal">Operaciones repartidas en emplazamientos lejanos, repuestos críticos y herramienta cara que tiene que volver.</p>
            <div className="lx-sectors">
              <Sector delay={0} title="Petróleo y gas" icon={<PumpJack />}
                text="Base logística, almacenes de campo y pozos con su propio stock de repuestos críticos."
                tags={['Juntas y bridas', 'Válvulas', 'Brocas', 'Químicos', 'EPI']} />
              <Sector delay={90} title="Metalurgia" icon={<Ladle />}
                text="Almacén de materia prima, almacenes de línea y consumibles de alto volumen controlados por turno."
                tags={['Electrodos', 'Refractarios', 'Discos y abrasivos', 'Gases', 'Utillaje']} />
              <Sector delay={180} title="Minería" icon={<MineCart />}
                text="Central en la base y almacenes en cada mina o planta de proceso, con herramienta pesada asignada."
                tags={['Aceros de desgaste', 'Bolas de molienda', 'Explosivos', 'Neumáticos', 'Filtros']} />
            </div>
            <ul className="lx-sectors-more lx-chips lx-reveal">
              <li>Energía y subestaciones</li><li>Mantenimiento industrial</li><li>Construcción y obra civil</li><li>Química y refino</li>
            </ul>
          </div>
        </section>

        {/* ---------- Seguridad ---------- */}
        <section className="lx-sec alt" id="seguridad">
          <div className="lx-wrap">
            <p className="lx-kicker lx-reveal">Seguridad</p>
            <h2 className="lx-display lx-reveal">Tus datos, <span className="hot">blindados</span></h2>
            <div className="lx-sec-grid">
              {[
                ['shield', 'Aislamiento por empresa', 'Cada empresa solo ve lo suyo. Lo garantiza la base de datos, no solo la aplicación.'],
                ['movements', 'Movimientos inmutables', 'Nada se borra ni se edita. Los errores se corrigen con ajustes registrados.'],
                ['users', 'Roles y límites', 'Siete perfiles con permisos distintos y número de usuarios según el plan contratado.'],
                ['check', 'Stock nunca negativo', 'Dos salidas a la vez no pueden dejar un bin por debajo de cero.'],
              ].map(([ic, t, d], i) => (
                <article key={t} className="lx-card lx-reveal" data-delay={i * 80}>
                  <div className="lx-card-ic"><Icon name={ic} size={22} /></div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Cierre ---------- */}
        <section className="lx-cta lx-mesh">
          <div className="lx-wrap">
            <h2 className="lx-display lx-reveal">¿Ponemos tu almacén <span className="hot">en marcha?</span></h2>
            <p className="lx-reveal">Damos de alta tu empresa, cargamos almacenes y ubicaciones y tu equipo empieza a registrar movimientos esta semana.</p>
            <div className="lx-actions lx-reveal">
              <Link className="lx-btn lx-btn-hot" href="/login">Iniciar sesión</Link>
              <a className="lx-btn lx-btn-line" href="#funciones">Ver funciones</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lx-foot">
        <div className="lx-wrap">
          <span>Gutitool, inventario industrial multialmacén</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}

function Sector({ title, text, tags, icon, delay }: { title: string; text: string; tags: string[]; icon: ReactNode; delay: number }) {
  return (
    <article className="lx-sector lx-reveal" data-delay={delay}>
      <h3>{title}</h3>
      <p>{text}</p>
      <ul>{tags.map((t) => <li key={t}>{t}</li>)}</ul>
      <div className="lx-sector-ic" aria-hidden="true">{icon}</div>
    </article>
  );
}

function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="6" fill="#ff5b14" />
      <rect x="7" y="8" width="18" height="14" rx="1.5" fill="none" stroke="#120600" strokeWidth="2.6" />
      <path d="M7 15h18" stroke="#120600" strokeWidth="2.6" />
      <path d="M7 25.5h18" stroke="#120600" strokeWidth="2.6" strokeDasharray="3 2" />
    </svg>
  );
}

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
function PumpJack() {
  return <svg viewBox="0 0 100 100"><path {...S} d="M10 88h80M30 88l12-40 12 40M42 48l-28-8 4-10 52 14M70 44v32M64 76h12M14 40l-4 18" /></svg>;
}
function Ladle() {
  return <svg viewBox="0 0 100 100"><path {...S} d="M20 30h50l-6 34a10 10 0 01-10 8H36a10 10 0 01-10-8zM70 34l16-14M30 82h40M40 72v10M60 72v10M30 40h34" /></svg>;
}
function MineCart() {
  return <svg viewBox="0 0 100 100"><path {...S} d="M12 36h76l-8 32H20zM8 88h84M30 78a7 7 0 100 .1M70 78a7 7 0 100 .1M30 36l8-14 12 8 10-12 10 18" /></svg>;
}
