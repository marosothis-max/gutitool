-- =====================================================================
--  GUTITOOL · Inventario industrial multitenant
--  Migración 001: esquema, integridad multitenant, numeración, ledger
-- =====================================================================
--  Principios:
--   * Toda tabla de negocio lleva tenant_id y FKs COMPUESTAS (tenant_id, id)
--     para que sea imposible mezclar datos de dos empresas, aunque falle la app.
--   * El stock NUNCA se edita directamente: solo se insertan movimientos
--     (ledger inmutable) y un trigger mantiene stock_levels.
--   * Los documentos (OC, REC, TRF, DEV) reciben correlativo automático,
--     sin huecos, por empresa y año.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------
create type public.app_role        as enum ('company_admin','supervisor','auditor','buyer','carrier','warehouse_keeper');
create type public.tenant_status   as enum ('active','suspended','cancelled');
create type public.warehouse_level as enum ('central','intermediate','final');
create type public.item_type       as enum ('consumable','tool');
create type public.movement_type   as enum (
  'receipt',          -- entrada por compra
  'issue',            -- consumo / salida de consumible
  'transfer_out',     -- salida por traslado (despacho)
  'transfer_in',      -- entrada por traslado (recepción)
  'return_out',       -- devolución a proveedor
  'adjustment_in',    -- ajuste positivo (inventario físico)
  'adjustment_out',   -- ajuste negativo
  'tool_checkout',    -- herramienta entregada a un operario
  'tool_checkin'      -- herramienta devuelta
);
create type public.po_status       as enum ('draft','sent','confirmed','partially_received','received','cancelled');
create type public.transfer_status as enum ('requested','approved','in_transit','received','cancelled');
create type public.return_kind     as enum ('to_supplier','to_upstream_warehouse');
create type public.return_status   as enum ('draft','posted','cancelled');
create type public.alert_status    as enum ('open','in_replenishment','resolved');
create type public.tool_status     as enum ('available','assigned','maintenance','lost','retired');

-- ---------------------------------------------------------------------
-- 2. Tenants, usuarios y roles
-- ---------------------------------------------------------------------
create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  tax_id        text,
  status        public.tenant_status not null default 'active',
  created_at    timestamptz not null default now(),
  suspended_at  timestamptz
);

create table public.tenant_settings (
  tenant_id         uuid primary key references public.tenants on delete cascade,
  notify_email      text,                 -- destino del botón "Enviar pedido por correo"
  default_currency  text not null default 'EUR',
  logo_url          text,
  updated_at        timestamptz not null default now()
);

create table public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  email           text not null,
  full_name       text,
  is_super_admin  boolean not null default false,   -- SaaS Admin
  created_at      timestamptz not null default now()
);

-- Un usuario puede tener varios roles en una empresa y pertenecer a varias empresas.
create table public.tenant_members (
  tenant_id   uuid not null references public.tenants on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  role        public.app_role not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id, role)
);
create index tenant_members_user_idx on public.tenant_members (user_id);

-- ---------------------------------------------------------------------
-- 3. Almacenes (jerarquía Central → Intermedio → Final) y ubicaciones
-- ---------------------------------------------------------------------
create table public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  code        text not null,
  name        text not null,
  level       public.warehouse_level not null,
  parent_id   uuid references public.warehouses,
  address     text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, id),
  check ((level = 'central') = (parent_id is null))
);
create unique index warehouses_one_central_per_tenant on public.warehouses (tenant_id) where level = 'central';

-- Almacenistas asignados a almacenes concretos
create table public.member_warehouses (
  tenant_id     uuid not null,
  user_id       uuid not null references public.profiles on delete cascade,
  warehouse_id  uuid not null,
  primary key (user_id, warehouse_id),
  foreign key (tenant_id, warehouse_id) references public.warehouses (tenant_id, id) on delete cascade
);

create table public.locations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  warehouse_id  uuid not null,
  aisle         text not null,   -- Pasillo
  rack          text not null,   -- Estantería
  bin           text not null,   -- Casillero / Bin
  code          text generated always as (aisle || '-' || rack || '-' || bin) stored,
  active        boolean not null default true,
  unique (warehouse_id, aisle, rack, bin),
  unique (tenant_id, id),
  unique (warehouse_id, id),
  foreign key (tenant_id, warehouse_id) references public.warehouses (tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------------
-- 4. Catálogo
-- ---------------------------------------------------------------------
create table public.items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants on delete cascade,
  sku          text not null,
  name         text not null,
  description  text,
  item_type    public.item_type not null,
  uom          text not null default 'UD',
  unit_cost    numeric(14,4) not null default 0 check (unit_cost >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (tenant_id, sku),
  unique (tenant_id, id)
);

-- Umbrales por artículo y almacén (mínimo, cantidad de reposición, máximo)
create table public.item_thresholds (
  tenant_id     uuid not null,
  item_id       uuid not null,
  warehouse_id  uuid not null,
  min_qty       numeric(14,3) not null check (min_qty >= 0),
  reorder_qty   numeric(14,3) not null check (reorder_qty > 0),
  max_qty       numeric(14,3) check (max_qty is null or max_qty > min_qty),
  primary key (item_id, warehouse_id),
  foreign key (tenant_id, item_id)      references public.items (tenant_id, id) on delete cascade,
  foreign key (tenant_id, warehouse_id) references public.warehouses (tenant_id, id) on delete cascade
);

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  name        text not null,
  tax_id      text,
  email       text,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id)
);

-- ---------------------------------------------------------------------
-- 5. Stock (saldo por ubicación) y ledger de movimientos
-- ---------------------------------------------------------------------
create table public.stock_levels (
  tenant_id     uuid not null,
  warehouse_id  uuid not null,
  location_id   uuid not null,
  item_id       uuid not null,
  qty_on_hand   numeric(14,3) not null default 0 check (qty_on_hand >= 0),
  updated_at    timestamptz not null default now(),
  primary key (location_id, item_id),
  foreign key (tenant_id, warehouse_id)  references public.warehouses (tenant_id, id),
  foreign key (warehouse_id, location_id) references public.locations (warehouse_id, id),
  foreign key (tenant_id, item_id)       references public.items (tenant_id, id)
);
create index stock_levels_item_wh_idx on public.stock_levels (tenant_id, item_id, warehouse_id);

create table public.stock_movements (
  id             bigint generated always as identity primary key,
  tenant_id      uuid not null,
  warehouse_id   uuid not null,
  location_id    uuid not null,
  item_id        uuid not null,
  movement_type  public.movement_type not null,
  quantity       numeric(14,3) not null check (quantity <> 0),  -- con signo
  doc_type       text,          -- goods_receipt | transfer | return | issue | adjustment | tool_assignment
  doc_id         uuid,
  doc_number     text,
  notes          text,
  created_by     uuid references public.profiles,
  created_at     timestamptz not null default now(),
  foreign key (tenant_id, warehouse_id)   references public.warehouses (tenant_id, id),
  foreign key (warehouse_id, location_id) references public.locations (warehouse_id, id),
  foreign key (tenant_id, item_id)        references public.items (tenant_id, id),
  check (
    (movement_type in ('receipt','transfer_in','adjustment_in','tool_checkin') and quantity > 0) or
    (movement_type in ('issue','transfer_out','return_out','adjustment_out','tool_checkout') and quantity < 0)
  )
);
create index stock_movements_tenant_date_idx on public.stock_movements (tenant_id, created_at desc);
create index stock_movements_item_idx        on public.stock_movements (tenant_id, item_id, created_at desc);
create index stock_movements_doc_idx         on public.stock_movements (doc_type, doc_id);

-- ---------------------------------------------------------------------
-- 6. Compras y recepción
-- ---------------------------------------------------------------------
create table public.purchase_orders (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants,
  number              text not null,                    -- OC-2026-000001 (automático)
  supplier_id         uuid not null,
  warehouse_id        uuid not null,                    -- almacén de destino
  status              public.po_status not null default 'draft',
  supplier_reference  text,
  est_dispatch_date   date,
  est_delivery_date   date,
  notes               text,
  source_alert_id     uuid,
  created_by          uuid references public.profiles default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, number),
  unique (tenant_id, id),
  foreign key (tenant_id, supplier_id)  references public.suppliers (tenant_id, id),
  foreign key (tenant_id, warehouse_id) references public.warehouses (tenant_id, id),
  check (est_delivery_date is null or est_dispatch_date is null or est_delivery_date >= est_dispatch_date)
);

create table public.purchase_order_lines (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  purchase_order_id  uuid not null,
  item_id            uuid not null,
  qty_ordered        numeric(14,3) not null check (qty_ordered > 0),
  qty_received       numeric(14,3) not null default 0 check (qty_received >= 0),
  unit_price         numeric(14,4) not null default 0 check (unit_price >= 0),
  est_dispatch_date  date,     -- por línea: sobreescribe la fecha de cabecera
  est_delivery_date  date,
  unique (purchase_order_id, item_id),
  foreign key (tenant_id, purchase_order_id) references public.purchase_orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, item_id)           references public.items (tenant_id, id)
);

create table public.goods_receipts (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants,
  number                   text not null,               -- REC-2026-000001
  warehouse_id             uuid not null,
  purchase_order_id        uuid,
  supplier_id              uuid,
  supplier_invoice_number  text,
  notes                    text,
  received_by              uuid references public.profiles,
  received_at              timestamptz not null default now(),
  unique (tenant_id, number),
  unique (tenant_id, id),
  foreign key (tenant_id, warehouse_id)      references public.warehouses (tenant_id, id),
  foreign key (tenant_id, purchase_order_id) references public.purchase_orders (tenant_id, id),
  foreign key (tenant_id, supplier_id)       references public.suppliers (tenant_id, id),
  -- REQUISITO: toda entrada se asocia a una OC o a una factura de proveedor
  constraint receipt_requires_po_or_invoice
    check (purchase_order_id is not null or nullif(btrim(supplier_invoice_number), '') is not null)
);

create table public.goods_receipt_lines (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  receipt_id   uuid not null,
  po_line_id   uuid references public.purchase_order_lines,
  item_id      uuid not null,
  location_id  uuid not null,
  quantity     numeric(14,3) not null check (quantity > 0),
  foreign key (tenant_id, receipt_id)  references public.goods_receipts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, item_id)     references public.items (tenant_id, id),
  foreign key (tenant_id, location_id) references public.locations (tenant_id, id)
);

-- ---------------------------------------------------------------------
-- 7. Traslados entre almacenes
-- ---------------------------------------------------------------------
create table public.transfer_orders (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants,
  number             text not null,                     -- TRF-2026-000001
  from_warehouse_id  uuid not null,
  to_warehouse_id    uuid not null,
  status             public.transfer_status not null default 'requested',
  carrier_id         uuid references public.profiles,   -- transportista asignado
  est_dispatch_date  date,
  est_delivery_date  date,
  dispatched_at      timestamptz,
  received_at        timestamptz,
  has_discrepancy    boolean not null default false,
  source_alert_id    uuid,
  notes              text,
  requested_by       uuid references public.profiles default auth.uid(),
  created_at         timestamptz not null default now(),
  unique (tenant_id, number),
  unique (tenant_id, id),
  foreign key (tenant_id, from_warehouse_id) references public.warehouses (tenant_id, id),
  foreign key (tenant_id, to_warehouse_id)   references public.warehouses (tenant_id, id),
  check (from_warehouse_id <> to_warehouse_id)
);

create table public.transfer_order_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  transfer_id       uuid not null,
  item_id           uuid not null,
  from_location_id  uuid,
  to_location_id    uuid,
  qty_requested     numeric(14,3) not null check (qty_requested > 0),
  qty_dispatched    numeric(14,3) not null default 0 check (qty_dispatched >= 0),
  qty_received      numeric(14,3) not null default 0 check (qty_received >= 0),
  foreign key (tenant_id, transfer_id)      references public.transfer_orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, item_id)          references public.items (tenant_id, id),
  foreign key (tenant_id, from_location_id) references public.locations (tenant_id, id),
  foreign key (tenant_id, to_location_id)   references public.locations (tenant_id, id)
);

-- ---------------------------------------------------------------------
-- 8. Devoluciones (correlativo DEV-AAAA-NNNNNN)
-- ---------------------------------------------------------------------
create table public.returns (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants,
  number        text not null,
  kind          public.return_kind not null,
  warehouse_id  uuid not null,                 -- almacén que devuelve
  supplier_id   uuid,
  receipt_id    uuid,                          -- recepción de origen (opcional)
  transfer_id   uuid,                          -- traslado generado si va a almacén superior
  reason        text not null,
  status        public.return_status not null default 'draft',
  created_by    uuid references public.profiles default auth.uid(),
  created_at    timestamptz not null default now(),
  posted_by     uuid references public.profiles,
  posted_at     timestamptz,
  unique (tenant_id, number),
  unique (tenant_id, id),
  foreign key (tenant_id, warehouse_id) references public.warehouses (tenant_id, id),
  foreign key (tenant_id, supplier_id)  references public.suppliers (tenant_id, id),
  foreign key (tenant_id, receipt_id)   references public.goods_receipts (tenant_id, id),
  foreign key (tenant_id, transfer_id)  references public.transfer_orders (tenant_id, id),
  check (kind <> 'to_supplier' or supplier_id is not null)
);

create table public.return_lines (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  return_id    uuid not null,
  item_id      uuid not null,
  location_id  uuid not null,
  quantity     numeric(14,3) not null check (quantity > 0),
  foreign key (tenant_id, return_id)   references public.returns (tenant_id, id) on delete cascade,
  foreign key (tenant_id, item_id)     references public.items (tenant_id, id),
  foreign key (tenant_id, location_id) references public.locations (tenant_id, id)
);

-- ---------------------------------------------------------------------
-- 9. Herramientas (unidades serializadas y asignaciones)
-- ---------------------------------------------------------------------
create table public.tool_assets (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  item_id        uuid not null,
  serial_number  text not null,
  status         public.tool_status not null default 'available',
  warehouse_id   uuid not null,
  location_id    uuid,
  notes          text,
  created_at     timestamptz not null default now(),
  unique (tenant_id, serial_number),
  unique (tenant_id, id),
  foreign key (tenant_id, item_id)        references public.items (tenant_id, id),
  foreign key (tenant_id, warehouse_id)   references public.warehouses (tenant_id, id),
  foreign key (warehouse_id, location_id) references public.locations (warehouse_id, id)
);

create table public.tool_assignments (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  asset_id            uuid not null,
  assigned_to_user    uuid references public.profiles,
  assigned_to_name    text not null,            -- operario / cuadrilla / OT
  checked_out_by      uuid references public.profiles,
  checked_out_at      timestamptz not null default now(),
  due_at              timestamptz,
  condition_out       text,
  returned_at         timestamptz,
  return_location_id  uuid,
  condition_in        text,
  foreign key (tenant_id, asset_id) references public.tool_assets (tenant_id, id)
);
create unique index tool_assignments_one_open on public.tool_assignments (asset_id) where returned_at is null;

-- ---------------------------------------------------------------------
-- 10. Alertas, notificaciones, numeración
-- ---------------------------------------------------------------------
create table public.stock_alerts (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  item_id            uuid not null,
  warehouse_id       uuid not null,
  qty_at_trigger     numeric(14,3) not null,
  min_qty            numeric(14,3) not null,
  status             public.alert_status not null default 'open',
  purchase_order_id  uuid,
  transfer_order_id  uuid,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  foreign key (tenant_id, item_id)           references public.items (tenant_id, id),
  foreign key (tenant_id, warehouse_id)      references public.warehouses (tenant_id, id),
  foreign key (tenant_id, purchase_order_id) references public.purchase_orders (tenant_id, id),
  foreign key (tenant_id, transfer_order_id) references public.transfer_orders (tenant_id, id)
);
-- Solo una alerta activa por artículo y almacén (evita spam de alertas)
create unique index stock_alerts_one_active on public.stock_alerts (item_id, warehouse_id) where status <> 'resolved';
create index stock_alerts_tenant_status_idx on public.stock_alerts (tenant_id, status);

create table public.notifications (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  payload     jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create table public.document_sequences (
  tenant_id   uuid not null references public.tenants on delete cascade,
  doc_type    text not null,        -- OC | REC | TRF | DEV
  period      int  not null,        -- año
  last_value  bigint not null,
  primary key (tenant_id, doc_type, period)
);

create table public.email_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants on delete cascade,
  doc_type    text not null,
  doc_id      uuid not null,
  sent_to     text not null,
  provider_id text,
  sent_by     uuid references public.profiles,
  sent_at     timestamptz not null default now()
);
