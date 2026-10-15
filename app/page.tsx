import Link from 'next/link';
import { BrandMark, Icon } from '@/components/Icon';

export const metadata = { title: 'Inventario industrial multialmacén' };

// ---------------------------------------------------------------------
// Datos de la portada (ejemplo realista de una empresa de montajes)
// ---------------------------------------------------------------------
type Bin = { code: string; qty?: number; uom?: string; fill: number; low?: boolean; item?: string };
const RACK: { shelf: string; bins: Bin[] }[] = [
  { shelf: 'E04', bins: [
    { code: 'B01', qty: 12, uom: 'rollos', fill: 0.6 }, { code: 'B02', qty: 40, uom: 'ud', fill: 0.8 },
    { code: 'B03', fill: 0 }, { code: 'B04', qty: 6, uom: 'cajas', fill: 0.35 }, { code: 'B05', qty: 22, uom: 'ud', fill: 0.55 } ] },
  { shelf: 'E03', bins: [
    { code: 'B10', qty: 310, uom: 'ud', fill: 0.9 }, { code: 'B11', qty: 95, uom: 'm', fill: 0.5 },
    { code: 'B12', qty: 18, uom: 'pares', fill: 0.12, low: true, item: 'Guante nitrilo T9' },
    { code: 'B13', qty: 64, uom: 'ud', fill: 0.7 }, { code: 'B14', qty: 8, uom: 'ud', fill: 0.3 } ] },
  { shelf: 'E02', bins: [
    { code: 'B20', qty: 3, uom: 'taladros', fill: 0.45 }, { code: 'B21', qty: 2, uom: 'radiales', fill: 0.4 },
    { code: 'B22', qty: 140, uom: 'ud', fill: 0.85 }, { code: 'B23', fill: 0 }, { code: 'B24', qty: 51, uom: 'ud', fill: 0.6 } ] },
];

const CHAPTERS = [
  ['red', 'Red de almacenes'],
  ['ubicacion', 'Ubicación exacta'],
  ['articulos', 'Consumibles y herramientas'],
  ['alertas', 'Alertas y reposición'],
  ['compras', 'Compras y recepción'],
  ['devoluciones', 'Devoluciones'],
  ['trazabilidad', 'Trazabilidad de pedidos'],
  ['informes', 'Excel y correo'],
  ['roles', 'Empresas y permisos'],
  ['seguridad', 'Seguridad y auditoría'],
  ['sectores', 'Para quién es'],
] as const;

export default function Landing() {
  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="brand"><BrandMark />Gutitool</Link>
          <nav className="site-nav" aria-label="Principal">
            <a className="link" href="#red">Producto</a>
            <a className="link" href="#sectores">Sectores</a>
            <a className="link" href="#seguridad">Seguridad</a>
            <Link className="btn btn-primary btn-sm" href="/login">Entrar</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ---------------- Hero: alzado de estantería ---------------- */}
        <section className="hero">
          <div className="hero-inner">
            <div>
              <h1>Inventario industrial que sabe dónde está cada pieza.</h1>
              <p className="hero-lead">
                Gutitool controla el material de tu almacén central, de tus almacenes intermedios y de cada obra
                o planta, hasta el pasillo, la estantería y el bin. Avisa antes de que falte algo y deja constancia
                de cada entrada, salida y traslado.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary" href="/login">Entrar en Gutitool</Link>
                <a className="btn btn-ghost" href="#red">Ver qué incluye</a>
              </div>
              <ul className="hero-facts">
                <li><strong>3 niveles de almacén</strong>Central, intermedios y finales conectados</li>
                <li><strong>Stock por bin</strong>Pasillo, estantería y casillero de cada artículo</li>
                <li><strong>Multiempresa</strong>Cada cliente, con sus datos aislados</li>
              </ul>
            </div>

            <figure className="rack" aria-label="Ejemplo de estantería con ocupación por bin">
              <div className="rack-head">
                <span className="rack-title">Almacén Central Valencia, pasillo P01</span>
                <span className="rack-sub">Actualizado ahora</span>
              </div>
              <div className="rack-frame">
                {RACK.map((row) => (
                  <div key={row.shelf} style={{ display: 'contents' }}>
                    <div className="rack-shelf-label code">{row.shelf}</div>
                    <div className="rack-row">
                      {row.bins.map((b) => (
                        <div key={b.code} className={`bin${b.fill === 0 ? ' bin-empty' : ''}${b.low ? ' bin-low' : ''}`}>
                          {b.fill > 0 && <div className="bin-fill" style={{ width: `${Math.round(b.fill * 100)}%` }} />}
                          <span className="bin-code code">{row.shelf}-{b.code}</span>
                          <span className="bin-qty num">
                            {b.qty !== undefined ? b.qty : <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>Libre</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rack-callout" role="note">
                <span className="swatch" aria-hidden="true" />
                <span><b>Guante nitrilo T9</b> en P01-E03-B12: 18 pares, mínimo 20</span>
                <span className="badge badge-yellow">Reposición pedida</span>
              </div>
              <div className="rack-legend">
                <span><i style={{ background: 'var(--cobalt)', height: 5 }} />Ocupación</span>
                <span><i style={{ background: 'var(--hazard)' }} />Bajo mínimo</span>
                <span><i style={{ background: 'var(--steel-100)' }} />Bin libre</span>
              </div>
            </figure>
          </div>
        </section>

        {/* ---------------- Red de almacenes ---------------- */}
        <section className="network" id="red" aria-labelledby="red-title">
          <div className="network-inner">
            <h2 id="red-title">El almacén central ve el stock exacto de cada almacén y de cada obra.</h2>
            <p className="lead">
              Tres niveles conectados. El material baja del central a los intermedios y de ahí a los almacenes
              finales; las compras se concentran en un solo punto y nadie tiene que llamar para preguntar qué queda.
            </p>
            <div className="tiers">
              <Tier level="Almacén central" name="Central Valencia" rows={[
                ['Guante nitrilo T9', '180 pares'], ['Disco corte 125 mm', '1.240 ud'], ['Taladro percutor 18V', '3 ud'],
              ]} />
              <div className="tier-link" aria-hidden="true"><Icon name="arrow" size={28} /></div>
              <Tier level="Almacén intermedio" name="Intermedio Norte" rows={[
                ['Guante nitrilo T9', '120 pares'], ['Disco corte 125 mm', '310 ud'], ['Taladro percutor 18V', '1 ud'],
              ]} />
              <div className="tier-link" aria-hidden="true"><Icon name="arrow" size={28} /></div>
              <Tier level="Almacén final" name="Obra Sagunto" rows={[
                ['Guante nitrilo T9', '13 pares', true], ['Disco corte 125 mm', '42 ud'], ['Taladro percutor 18V', 'Asignado'],
              ]} />
            </div>
          </div>
        </section>

        {/* ---------------- Dossier ---------------- */}
        <div className="dossier">
          <nav className="toc" aria-label="Contenido del dossier">
            <p className="toc-title">Contenido</p>
            <ol>
              {CHAPTERS.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}
            </ol>
          </nav>

          <div>
            <section className="chapter" id="ubicacion">
              <h2>Cada artículo, en su pasillo, estantería y bin</h2>
              <p>
                El stock se guarda por ubicación, no solo por almacén. Quien prepara un pedido sabe a qué bin ir, y
                quien recibe mercancía decide dónde la deja en el mismo momento en que la registra.
              </p>
              <div className="chapter-grid">
                <Point title="Códigos de ubicación legibles" text="P01-E03-B12 identifica pasillo, estantería y casillero. Sirve para etiquetas y lectores de código." />
                <Point title="Un artículo en varios sitios" text="El mismo material puede estar repartido en varios bins; el sistema suma y despacha desde donde hay stock." />
                <Point title="Inventarios por zona" text="Exporta el stock de un pasillo o de un almacén entero para recuentos físicos." />
              </div>
            </section>

            <section className="chapter" id="articulos">
              <h2>Consumibles y herramientas, cada uno con su control</h2>
              <p>Lo que se gasta y lo que tiene que volver no se gestionan igual.</p>
              <div className="pair">
                <div className="kind">
                  <div className="kind-head"><Icon name="stock" size={22} /><h3>Consumibles</h3></div>
                  <p className="muted" style={{ margin: 0 }}>EPIs, tornillería, discos, cableado, químicos.</p>
                  <ul>
                    <li>Salidas imputadas a una obra u orden de trabajo</li>
                    <li>Mínimo, cantidad de reposición y máximo por almacén</li>
                    <li>Consumo histórico por artículo y por almacén</li>
                  </ul>
                </div>
                <div className="kind">
                  <div className="kind-head"><Icon name="tools" size={22} /><h3>Herramientas</h3></div>
                  <p className="muted" style={{ margin: 0 }}>Maquinaria portátil, equipos de medida, útiles.</p>
                  <ul>
                    <li>Cada unidad con número de serie y estado</li>
                    <li>Entrega a un operario o cuadrilla con fecha de devolución</li>
                    <li>Aviso de herramientas vencidas y paso a mantenimiento</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="chapter" id="alertas">
              <h2>Alertas de mínimo que ya traen la reposición preparada</h2>
              <p>
                Cada vez que cambia el stock, Gutitool compara con el mínimo de ese almacén. Si se cruza el umbral, avisa
                al momento y propone el documento correcto para reponer.
              </p>
              <ol className="steps">
                <li><h3>Consumo</h3><p>La obra registra la salida de material para una orden de trabajo.</p></li>
                <li className="is-alert"><h3>Alerta</h3><p>El stock baja del mínimo: aviso en pantalla a compras, supervisión y al almacén.</p></li>
                <li><h3>Reposición</h3><p>Una obra pide traslado a su intermedio. Solo el central genera la orden de compra.</p></li>
                <li><h3>Cierre</h3><p>Al recibir el material, la alerta se resuelve sola.</p></li>
              </ol>
            </section>

            <section className="chapter" id="compras">
              <h2>Ninguna entrada sin su orden de compra o su factura</h2>
              <p>
                La recepción exige el número de pedido o el de factura del proveedor. Si llega menos de lo pedido, la
                orden queda parcialmente recibida y la diferencia sigue a la vista.
              </p>
              <div className="doc-sample" aria-label="Ejemplo de recepción">
                <div className="doc-sample-head">
                  <strong className="code">REC-2026-000214</strong>
                  <span className="muted">Pedido OC-2026-000097, Suministros Levante</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Artículo</th><th>Ubicación</th><th style={{ textAlign: 'right' }}>Pedido</th><th style={{ textAlign: 'right' }}>Recibido</th></tr></thead>
                    <tbody>
                      <tr><td>Guante nitrilo T9</td><td className="code">P01-E03-B12</td><td className="num" style={{ textAlign: 'right' }}>600</td><td className="num" style={{ textAlign: 'right' }}>400</td></tr>
                      <tr><td>Disco corte 125 mm</td><td className="code">P02-E01-B04</td><td className="num" style={{ textAlign: 'right' }}>500</td><td className="num" style={{ textAlign: 'right' }}>500</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="chapter" id="devoluciones">
              <h2>Devoluciones con numeración propia</h2>
              <p>Cada devolución genera un documento con número correlativo, sin saltos y sin posibilidad de editarlo.</p>
              <div className="chapter-grid">
                <Point title="Al proveedor" text="Material defectuoso o sobrante: sale del stock y queda el documento DEV para el abono." />
                <Point title="Al almacén superior" text="El sobrante de una obra vuelve a su intermedio con un traslado generado automáticamente." />
                <Point title="Con motivo obligatorio" text="Cada devolución explica por qué; útil para reclamar y para detectar proveedores problemáticos." />
              </div>
            </section>

            <section className="chapter" id="trazabilidad">
              <h2>Fecha de despacho y de entrega en cada artículo pedido</h2>
              <p>
                Pedidos a proveedor y traslados entre almacenes muestran cuándo salen y cuándo llegan, línea a línea.
                Lo que va con retraso aparece marcado.
              </p>
              <div className="chapter-grid">
                <Point title="Transportistas" text="Ven sus traslados asignados y actualizan las fechas estimadas." />
                <Point title="Discrepancias" text="Si llegan 78 de 80, el traslado queda marcado para revisarlo." />
                <Point title="Historial completo" text="Cada movimiento guarda quién, cuándo, dónde y con qué documento." />
              </div>
            </section>

            <section className="chapter" id="informes">
              <h2>Excel completo y pedidos enviados por correo en un clic</h2>
              <p>Stock por ubicación, movimientos y pedidos se descargan en Excel con filtros y formato listos para usar.</p>
              <div className="chapter-grid">
                <Point title="Exportación a Excel" text="Stock por bin, red de almacenes, kardex de movimientos y seguimiento de pedidos." />
                <Point title="Envío rápido del pedido" text="El detalle de la orden llega al correo configurado, con el Excel adjunto y copia opcional al proveedor." />
              </div>
            </section>

            <section className="chapter" id="roles">
              <h2>Una plataforma, muchas empresas, cada persona con su papel</h2>
              <p>Los datos de cada empresa están aislados en la base de datos. Dentro de cada empresa, cada rol ve y hace lo suyo.</p>
              <div className="table-scroll">
                <table className="roles-table">
                  <tbody>
                    <tr><th>Administrador de plataforma</th><td>Da de alta empresas, las suspende o reactiva.</td></tr>
                    <tr><th>Administrador de empresa</th><td>Crea almacenes y usuarios y asigna roles.</td></tr>
                    <tr><th>Supervisor</th><td>Aprueba traslados, ajusta inventario, opera cualquier almacén.</td></tr>
                    <tr><th>Comprador</th><td>Gestiona proveedores, órdenes de compra y alertas de reposición.</td></tr>
                    <tr><th>Almacenista</th><td>Recibe, ubica, entrega y devuelve material en sus almacenes asignados.</td></tr>
                    <tr><th>Transportista</th><td>Consulta sus traslados y actualiza fechas de despacho y entrega.</td></tr>
                    <tr><th>Auditor</th><td>Ve todo y exporta; no puede modificar nada.</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="chapter" id="seguridad">
              <h2>Pensado para pasar una auditoría</h2>
              <div className="chapter-grid">
                <Point title="Movimientos inmutables" text="Nada se borra ni se edita: los errores se corrigen con ajustes que quedan registrados." />
                <Point title="Stock nunca negativo" text="Dos salidas simultáneas no pueden dejar un bin en negativo." />
                <Point title="Permisos en la base de datos" text="El aislamiento entre empresas y roles lo aplica PostgreSQL, no solo la aplicación." />
                <Point title="Suspensión inmediata" text="Una empresa suspendida pierde el acceso en el mismo instante." />
              </div>
            </section>

            <section className="chapter" id="sectores">
              <h2>Para empresas que mueven material entre almacenes y obras</h2>
              <div className="sectors">
                <Sector title="Construcción y obra civil" text="Almacén central, delegaciones y cada obra con su propio stock." />
                <Sector title="Montajes e instalaciones" text="Herramienta asignada por cuadrilla y consumibles por orden de trabajo." />
                <Sector title="Mantenimiento industrial" text="Repuestos críticos con mínimos por planta y trazabilidad por equipo." />
                <Sector title="Energía y utilities" text="Material distribuido en subestaciones, parques y bases operativas." />
                <Sector title="Minería y canteras" text="Consumibles de alto volumen y herramienta pesada en emplazamientos remotos." />
                <Sector title="Fabricación" text="Almacén de materia prima, almacenes de línea y devoluciones a proveedor." />
              </div>
            </section>
          </div>
        </div>

        <section className="cta-band">
          <div className="cta-inner">
            <div>
              <h2>Pon orden en tu almacén esta semana</h2>
              <p>Da de alta tu empresa, carga tus almacenes y ubicaciones y empieza a registrar movimientos.</p>
            </div>
            <Link className="btn btn-light" href="/login">Entrar en Gutitool</Link>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>Gutitool, inventario industrial multialmacén</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </>
  );
}

function Tier({ level, name, rows }: { level: string; name: string; rows: [string, string, boolean?][] }) {
  return (
    <div className="tier">
      <div className="tier-level">{level}</div>
      <div className="tier-name">{name}</div>
      {rows.map(([label, q, low]) => (
        <div key={label} className={`tier-row${low ? ' low' : ''}`}>
          <span>{label}</span>
          <span className="q num">{q}{low ? ', bajo mínimo' : ''}</span>
        </div>
      ))}
    </div>
  );
}

function Point({ title, text }: { title: string; text: string }) {
  return <div className="point"><h3>{title}</h3><p>{text}</p></div>;
}

function Sector({ title, text }: { title: string; text: string }) {
  return <div className="sector"><h3>{title}</h3><p>{text}</p></div>;
}
