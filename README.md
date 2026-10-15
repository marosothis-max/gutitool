# Gutitool · Inventario industrial multitenant

Plataforma SaaS de inventario para el sector industrial: almacenes **Central → Intermedio → Final** con ubicación exacta (pasillo / estantería / bin), consumibles y herramientas, compras, recepciones, traslados, devoluciones con correlativo, alertas de stock mínimo en tiempo real, exportación a Excel y envío de pedidos por correo.

📐 Arquitectura completa, modelo de datos, flujos y API: **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)**

## Estructura

```
supabase/
  migrations/
    20261015000001_core_schema.sql      tablas, tipos, integridad multitenant
    20261015000002_logic.sql            triggers (ledger, alertas, correlativos) y RPC de negocio
    20261015000003_security_views.sql   RLS, permisos, vistas, Realtime
    20261015000004_plans_user_limits.sql planes y límite de usuarios por empresa
  tests/                                pruebas end-to-end en PostgreSQL local
app/api/v1/                             API REST (route handlers)
lib/                                    clientes Supabase, utilidades API, Excel, correo
components/                             botón de envío de pedido, panel de alertas en vivo
```

## Puesta en marcha

### 1. Variables de entorno

```bash
cp .env.example .env.local
```

Rellena `.env.local` con tus claves (Supabase → Project Settings → API Keys). **`.env.local` está en `.gitignore`: nunca subas la clave secreta.**

### 2. Base de datos

Con la CLI de Supabase (recomendado):

```bash
npm install
npx supabase login
npx supabase link --project-ref rxnwqtnvrikizklrgmev
npx supabase db push
```

O bien, pega los archivos de `supabase/migrations/` **en orden** en el SQL Editor del panel de Supabase.

### 3. Crear la cuenta de Super Administrador

Con las migraciones aplicadas y `.env.local` relleno (incluida `SUPABASE_SECRET_KEY`):

```bash
npm install
npm run superadmin -- tu@correo.com "UnaContraseñaSegura" "Tu Nombre"
```

Entra en `/login` con ese correo y contraseña: irás al panel **Empresas**, desde donde:

- creas cada empresa con su **plan** y su **límite de usuarios**,
- le das de alta su **Administrador de Empresa** (con contraseña temporal o invitación por correo),
- suspendes o reactivas empresas y amplías su plan.

Cada Administrador de Empresa gestiona su equipo en **Usuarios** (supervisores, auditores, compradores,
transportistas y almacenistas). La base de datos impide superar el límite del plan.

### 4. Correo

Crea una cuenta en [Resend](https://resend.com), verifica tu dominio y define `RESEND_API_KEY` y `EMAIL_FROM`. Configura el destinatario por defecto de cada empresa en `tenant_settings.notify_email`.

### 5. Arrancar

```bash
npm run dev
```

## Pruebas de la base de datos

`supabase/tests/10_scenarios.sql` recorre el ciclo completo con distintos usuarios: alta de empresas, almacenes, recepción con OC y con factura, alertas, reposición en cascada, traslados con discrepancia, consumos, devoluciones con correlativo, herramientas, aislamiento entre empresas, auditor de solo lectura y empresa suspendida.

```bash
PGHOST=localhost PGUSER=postgres npm run db:test
```

## Notas

- Supabase limita por defecto las respuestas de la API a 1000 filas (Settings → API → Max rows). Súbelo si necesitas exportaciones más grandes.
- Genera tipos TypeScript del esquema con `npm run db:types` tras enlazar el proyecto.
