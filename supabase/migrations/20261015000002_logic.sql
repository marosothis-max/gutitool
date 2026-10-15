-- =====================================================================
--  Migración 002: helpers de autorización, triggers y operaciones (RPC)
--  Todas las operaciones que mueven stock son funciones SECURITY DEFINER
--  que validan permisos y se ejecutan en UNA transacción.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Helpers de autorización (usados por RLS y por las RPC)
-- ---------------------------------------------------------------------
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_super_admin from profiles p where p.id = auth.uid()), false)
$$;

-- Miembro activo de una empresa ACTIVA (una empresa suspendida pierde acceso).
create or replace function public.is_tenant_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members m join tenants t on t.id = m.tenant_id
    where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.active and t.status = 'active')
$$;

create or replace function public.has_tenant_role(p_tenant uuid, p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members m join tenants t on t.id = m.tenant_id
    where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.active
      and t.status = 'active' and m.role = any (p_roles))
$$;

-- Puede operar un almacén: admin/supervisor de la empresa, o almacenista asignado.
create or replace function public.can_operate_warehouse(p_warehouse uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from warehouses w
    join tenants t        on t.id = w.tenant_id and t.status = 'active'
    join tenant_members m on m.tenant_id = w.tenant_id and m.user_id = auth.uid() and m.active
    where w.id = p_warehouse
      and ( m.role in ('company_admin','supervisor')
         or (m.role = 'warehouse_keeper' and exists (
               select 1 from member_warehouses mw where mw.user_id = m.user_id and mw.warehouse_id = w.id))))
$$;

create or replace function public._require(p_cond boolean, p_msg text, p_code text default 'P0001') returns void
language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception using message = p_msg, errcode = p_code;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Perfil automático al registrarse un usuario en Supabase Auth
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3. Jerarquía de almacenes
-- ---------------------------------------------------------------------
create or replace function public.trg_validate_warehouse() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_parent warehouses;
begin
  if new.parent_id is null then return new; end if;
  select * into v_parent from warehouses where id = new.parent_id;
  perform _require(v_parent.id is not null and v_parent.tenant_id = new.tenant_id,
                   'El almacén padre no existe o pertenece a otra empresa');
  perform _require(
    (new.level = 'intermediate' and v_parent.level = 'central') or
    (new.level = 'final' and v_parent.level in ('intermediate','central')),
    format('Jerarquía inválida: un almacén %s no puede depender de uno %s', new.level, v_parent.level));
  return new;
end $$;

create trigger warehouses_validate before insert or update of parent_id, level on public.warehouses
  for each row execute function public.trg_validate_warehouse();

-- ---------------------------------------------------------------------
-- 4. Correlativos de documentos (sin huecos: el contador vive en la misma
--    transacción que el documento; si ésta falla, el número no se consume)
-- ---------------------------------------------------------------------
create or replace function public.next_document_number(p_tenant uuid, p_doc_type text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from now() at time zone 'Europe/Madrid');
  v_val  bigint;
begin
  insert into document_sequences (tenant_id, doc_type, period, last_value)
  values (p_tenant, p_doc_type, v_year, 1)
  on conflict (tenant_id, doc_type, period)
    do update set last_value = document_sequences.last_value + 1
  returning last_value into v_val;
  return p_doc_type || '-' || v_year || '-' || lpad(v_val::text, 6, '0');
end $$;

create or replace function public.trg_document_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.number := next_document_number(new.tenant_id, tg_argv[0]);   -- siempre lo asigna el sistema
  elsif new.number is distinct from old.number then
    raise exception 'El número de documento % no puede modificarse', old.number using errcode = '42501';
  end if;
  return new;
end $$;

create trigger purchase_orders_number before insert or update of number on public.purchase_orders
  for each row execute function public.trg_document_number('OC');
create trigger goods_receipts_number  before insert or update of number on public.goods_receipts
  for each row execute function public.trg_document_number('REC');
create trigger transfer_orders_number before insert or update of number on public.transfer_orders
  for each row execute function public.trg_document_number('TRF');
create trigger returns_number         before insert or update of number on public.returns
  for each row execute function public.trg_document_number('DEV');

-- ---------------------------------------------------------------------
-- 5. Ledger de movimientos → saldo de stock
-- ---------------------------------------------------------------------
create or replace function public.trg_apply_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.quantity > 0 then
    insert into stock_levels (tenant_id, warehouse_id, location_id, item_id, qty_on_hand)
    values (new.tenant_id, new.warehouse_id, new.location_id, new.item_id, new.quantity)
    on conflict (location_id, item_id)
      do update set qty_on_hand = stock_levels.qty_on_hand + excluded.qty_on_hand, updated_at = now();
  else
    -- El UPDATE bloquea la fila: dos salidas concurrentes no pueden dejar stock negativo.
    update stock_levels
       set qty_on_hand = qty_on_hand + new.quantity, updated_at = now()
     where location_id = new.location_id and item_id = new.item_id
       and qty_on_hand + new.quantity >= 0;
    if not found then
      raise exception 'Stock insuficiente: artículo % en ubicación %',
        (select sku from items where id = new.item_id),
        (select code from locations where id = new.location_id)
        using errcode = 'P0001', hint = 'INSUFFICIENT_STOCK';
    end if;
  end if;
  return new;
end $$;

create trigger stock_movements_apply after insert on public.stock_movements
  for each row execute function public.trg_apply_stock_movement();

create or replace function public.trg_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'Registro inmutable (%): registre un movimiento de ajuste', tg_table_name using errcode = '42501';
end $$;

create trigger stock_movements_immutable before update or delete on public.stock_movements
  for each row execute function public.trg_immutable();

-- ---------------------------------------------------------------------
-- 6. Motor de alertas de stock mínimo
--    Se evalúa cada vez que cambia el saldo o el umbral.
-- ---------------------------------------------------------------------
create or replace function public.evaluate_stock_threshold(p_item uuid, p_warehouse uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_th    item_thresholds;
  v_qty   numeric;
  v_alert uuid;
  v_item  items;
  v_wh    warehouses;
begin
  select * into v_th from item_thresholds where item_id = p_item and warehouse_id = p_warehouse;
  if v_th.item_id is null then return; end if;

  select coalesce(sum(qty_on_hand), 0) into v_qty
    from stock_levels where item_id = p_item and warehouse_id = p_warehouse;

  if v_qty <= v_th.min_qty then
    insert into stock_alerts (tenant_id, item_id, warehouse_id, qty_at_trigger, min_qty)
    values (v_th.tenant_id, p_item, p_warehouse, v_qty, v_th.min_qty)
    on conflict (item_id, warehouse_id) where status <> 'resolved' do nothing
    returning id into v_alert;

    if v_alert is not null then  -- alerta nueva: notificar
      select * into v_item from items where id = p_item;
      select * into v_wh   from warehouses where id = p_warehouse;
      insert into notifications (tenant_id, user_id, kind, title, body, payload)
      select distinct v_th.tenant_id, m.user_id, 'stock_alert',
             format('Stock bajo mínimo: %s', v_item.sku),
             format('%s en %s: %s %s (mínimo %s)', v_item.name, v_wh.name, v_qty, v_item.uom, v_th.min_qty),
             jsonb_build_object('alert_id', v_alert, 'item_id', p_item, 'warehouse_id', p_warehouse)
        from tenant_members m
       where m.tenant_id = v_th.tenant_id and m.active
         and ( m.role in ('company_admin','supervisor','buyer')
            or (m.role = 'warehouse_keeper' and exists (
                  select 1 from member_warehouses mw where mw.user_id = m.user_id and mw.warehouse_id = p_warehouse)));
    end if;
  else
    update stock_alerts set status = 'resolved', resolved_at = now()
     where item_id = p_item and warehouse_id = p_warehouse and status <> 'resolved';
  end if;
end $$;

create or replace function public.trg_stock_levels_threshold() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform evaluate_stock_threshold(new.item_id, new.warehouse_id);
  return new;
end $$;

create trigger stock_levels_threshold after insert or update of qty_on_hand on public.stock_levels
  for each row execute function public.trg_stock_levels_threshold();
create trigger item_thresholds_evaluate after insert or update on public.item_thresholds
  for each row execute function public.trg_stock_levels_threshold();

-- ---------------------------------------------------------------------
-- 7. Utilidad interna: registrar movimiento
-- ---------------------------------------------------------------------
create or replace function public._post_movement(
  p_tenant uuid, p_warehouse uuid, p_location uuid, p_item uuid,
  p_type public.movement_type, p_qty numeric,
  p_doc_type text, p_doc_id uuid, p_doc_number text, p_notes text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into stock_movements (tenant_id, warehouse_id, location_id, item_id, movement_type, quantity,
                               doc_type, doc_id, doc_number, notes, created_by)
  values (p_tenant, p_warehouse, p_location, p_item, p_type, p_qty,
          p_doc_type, p_doc_id, p_doc_number, p_notes, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- =====================================================================
--  8. OPERACIONES (RPC) — expuestas vía supabase.rpc() / API
-- =====================================================================

-- 8.1 Crear orden de compra con líneas -------------------------------
create or replace function public.create_purchase_order(
  p_tenant_id uuid, p_supplier_id uuid, p_warehouse_id uuid, p_lines jsonb,
  p_est_dispatch_date date default null, p_est_delivery_date date default null,
  p_notes text default null, p_supplier_reference text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_po purchase_orders;
begin
  perform _require(has_tenant_role(p_tenant_id, '{company_admin,supervisor,buyer}'), 'No autorizado', '42501');
  perform _require(jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0, 'La orden necesita al menos una línea');

  insert into purchase_orders (tenant_id, supplier_id, warehouse_id, est_dispatch_date, est_delivery_date, notes, supplier_reference, created_by)
  values (p_tenant_id, p_supplier_id, p_warehouse_id, p_est_dispatch_date, p_est_delivery_date, p_notes, p_supplier_reference, auth.uid())
  returning * into v_po;

  insert into purchase_order_lines (tenant_id, purchase_order_id, item_id, qty_ordered, unit_price, est_dispatch_date, est_delivery_date)
  select p_tenant_id, v_po.id, (l ->> 'item_id')::uuid, (l ->> 'quantity')::numeric,
         coalesce((l ->> 'unit_price')::numeric, i.unit_cost),
         (l ->> 'est_dispatch_date')::date, (l ->> 'est_delivery_date')::date
    from jsonb_array_elements(p_lines) l
    left join items i on i.id = (l ->> 'item_id')::uuid and i.tenant_id = p_tenant_id;

  return jsonb_build_object('id', v_po.id, 'number', v_po.number);
end $$;

-- 8.2 Recepción de mercancía (OC o factura obligatoria) ----------------
create or replace function public.receive_goods(
  p_warehouse_id uuid,
  p_lines jsonb,                               -- [{item_id, location_id, quantity}]
  p_purchase_order_id uuid default null,
  p_supplier_invoice_number text default null,
  p_supplier_id uuid default null,
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_wh      warehouses;
  v_po      purchase_orders;
  v_rec     goods_receipts;
  v_line    purchase_order_lines;
  l         jsonb;
  v_item    uuid;
  v_loc     uuid;
  v_qty     numeric;
begin
  select * into v_wh from warehouses where id = p_warehouse_id;
  perform _require(v_wh.id is not null and can_operate_warehouse(p_warehouse_id),
                   'No autorizado para operar este almacén', '42501');
  perform _require(p_purchase_order_id is not null or nullif(btrim(p_supplier_invoice_number), '') is not null,
                   'La recepción debe asociarse a una orden de compra o a un número de factura del proveedor');
  perform _require(jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0, 'Debe indicar al menos una línea');

  if p_purchase_order_id is not null then
    select * into v_po from purchase_orders
     where id = p_purchase_order_id and tenant_id = v_wh.tenant_id for update;
    perform _require(v_po.id is not null, 'Orden de compra no encontrada');
    perform _require(v_po.warehouse_id = p_warehouse_id, 'La orden de compra tiene otro almacén de destino');
    perform _require(v_po.status in ('sent','confirmed','partially_received'),
                     format('La orden %s no admite recepciones (estado %s)', v_po.number, v_po.status));
  end if;

  insert into goods_receipts (tenant_id, warehouse_id, purchase_order_id, supplier_id, supplier_invoice_number, notes, received_by)
  values (v_wh.tenant_id, p_warehouse_id, p_purchase_order_id, coalesce(p_supplier_id, v_po.supplier_id),
          nullif(btrim(p_supplier_invoice_number), ''), p_notes, auth.uid())
  returning * into v_rec;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_item := (l ->> 'item_id')::uuid;
    v_loc  := (l ->> 'location_id')::uuid;
    v_qty  := (l ->> 'quantity')::numeric;
    perform _require(v_qty > 0, 'Cantidad inválida');
    perform _require(exists (select 1 from locations where id = v_loc and warehouse_id = p_warehouse_id),
                     'La ubicación indicada no pertenece al almacén');
    v_line := null;
    if p_purchase_order_id is not null then
      select * into v_line from purchase_order_lines
       where purchase_order_id = p_purchase_order_id and item_id = v_item for update;
      perform _require(v_line.id is not null, 'Un artículo recibido no figura en la orden de compra');
      update purchase_order_lines set qty_received = qty_received + v_qty where id = v_line.id;
    end if;

    insert into goods_receipt_lines (tenant_id, receipt_id, po_line_id, item_id, location_id, quantity)
    values (v_wh.tenant_id, v_rec.id, v_line.id, v_item, v_loc, v_qty);

    perform _post_movement(v_wh.tenant_id, p_warehouse_id, v_loc, v_item, 'receipt', v_qty,
                           'goods_receipt', v_rec.id, v_rec.number,
                           coalesce('Factura ' || v_rec.supplier_invoice_number, 'OC ' || v_po.number));
  end loop;

  if p_purchase_order_id is not null then
    update purchase_orders
       set status = case when exists (select 1 from purchase_order_lines
                                       where purchase_order_id = p_purchase_order_id and qty_received < qty_ordered)
                         then 'partially_received' else 'received' end::po_status,
           updated_at = now()
     where id = p_purchase_order_id;
  end if;

  return jsonb_build_object('id', v_rec.id, 'number', v_rec.number);
end $$;

-- 8.3 Traslados --------------------------------------------------------
create or replace function public.create_transfer(
  p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_lines jsonb,   -- [{item_id, quantity, from_location_id?}]
  p_est_dispatch_date date default null, p_est_delivery_date date default null,
  p_carrier_id uuid default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_from warehouses; v_to warehouses; v_t transfer_orders;
begin
  select * into v_from from warehouses where id = p_from_warehouse_id;
  select * into v_to   from warehouses where id = p_to_warehouse_id;
  perform _require(v_from.id is not null and v_to.id is not null and v_from.tenant_id = v_to.tenant_id, 'Almacenes inválidos');
  -- Lo solicita quien opera el origen o el destino (p.ej. un almacén final pide material)
  perform _require(can_operate_warehouse(p_from_warehouse_id) or can_operate_warehouse(p_to_warehouse_id)
                   or has_tenant_role(v_from.tenant_id, '{buyer}'), 'No autorizado', '42501');
  perform _require(jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0, 'El traslado necesita al menos una línea');

  insert into transfer_orders (tenant_id, from_warehouse_id, to_warehouse_id, est_dispatch_date, est_delivery_date, carrier_id, notes, requested_by)
  values (v_from.tenant_id, p_from_warehouse_id, p_to_warehouse_id, p_est_dispatch_date, p_est_delivery_date, p_carrier_id, p_notes, auth.uid())
  returning * into v_t;

  insert into transfer_order_lines (tenant_id, transfer_id, item_id, from_location_id, qty_requested)
  select v_from.tenant_id, v_t.id, (l ->> 'item_id')::uuid, (l ->> 'from_location_id')::uuid, (l ->> 'quantity')::numeric
    from jsonb_array_elements(p_lines) l;

  return jsonb_build_object('id', v_t.id, 'number', v_t.number);
end $$;

create or replace function public.approve_transfer(p_transfer_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t transfer_orders;
begin
  select * into v_t from transfer_orders where id = p_transfer_id for update;
  perform _require(v_t.id is not null and has_tenant_role(v_t.tenant_id, '{company_admin,supervisor}'), 'No autorizado', '42501');
  perform _require(v_t.status = 'requested', 'Solo se aprueban traslados en estado solicitado');
  update transfer_orders set status = 'approved' where id = p_transfer_id;
end $$;

-- Despacho: descuenta stock del origen. p_lines opcional [{line_id, from_location_id?, quantity?}]
create or replace function public.dispatch_transfer(p_transfer_id uuid, p_lines jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_t transfer_orders; r record; l jsonb; v_qty numeric; v_loc uuid;
begin
  select * into v_t from transfer_orders where id = p_transfer_id for update;
  perform _require(v_t.id is not null and can_operate_warehouse(v_t.from_warehouse_id), 'No autorizado', '42501');
  perform _require(v_t.status in ('requested','approved'), format('El traslado %s no puede despacharse (estado %s)', v_t.number, v_t.status));

  for r in select * from transfer_order_lines where transfer_id = p_transfer_id loop
    l     := (select e from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e where (e ->> 'line_id')::uuid = r.id);
    v_qty := coalesce((l ->> 'quantity')::numeric, r.qty_requested);
    v_loc := coalesce((l ->> 'from_location_id')::uuid, r.from_location_id,
                      (select location_id from stock_levels             -- ubicación con más stock
                        where warehouse_id = v_t.from_warehouse_id and item_id = r.item_id and qty_on_hand >= v_qty
                        order by qty_on_hand desc limit 1));
    perform _require(v_qty >= 0 and v_qty <= r.qty_requested, 'Cantidad despachada inválida');
    continue when v_qty = 0;
    perform _require(v_loc is not null, format('No hay ubicación con stock suficiente para %s',
                                               (select sku from items where id = r.item_id)), 'P0001');
    perform _require(exists (select 1 from locations where id = v_loc and warehouse_id = v_t.from_warehouse_id),
                     'Ubicación de origen inválida');
    perform _post_movement(v_t.tenant_id, v_t.from_warehouse_id, v_loc, r.item_id, 'transfer_out', -v_qty,
                           'transfer', v_t.id, v_t.number);
    update transfer_order_lines set qty_dispatched = v_qty, from_location_id = v_loc where id = r.id;
  end loop;

  update transfer_orders set status = 'in_transit', dispatched_at = now() where id = p_transfer_id;
end $$;

-- Recepción en destino. p_lines [{line_id, to_location_id, quantity?}]
create or replace function public.receive_transfer(p_transfer_id uuid, p_lines jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_t transfer_orders; r record; l jsonb; v_qty numeric; v_loc uuid;
begin
  select * into v_t from transfer_orders where id = p_transfer_id for update;
  perform _require(v_t.id is not null and can_operate_warehouse(v_t.to_warehouse_id), 'No autorizado', '42501');
  perform _require(v_t.status = 'in_transit', format('El traslado %s no está en tránsito', v_t.number));

  for r in select * from transfer_order_lines where transfer_id = p_transfer_id and qty_dispatched > 0 loop
    l     := (select e from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e where (e ->> 'line_id')::uuid = r.id);
    v_qty := coalesce((l ->> 'quantity')::numeric, r.qty_dispatched);
    v_loc := (l ->> 'to_location_id')::uuid;
    perform _require(v_qty >= 0 and v_qty <= r.qty_dispatched, 'La cantidad recibida no puede superar la despachada');
    if v_qty > 0 then
      perform _require(v_loc is not null and exists (select 1 from locations where id = v_loc and warehouse_id = v_t.to_warehouse_id),
                       'Indique una ubicación de destino válida para cada línea');
      perform _post_movement(v_t.tenant_id, v_t.to_warehouse_id, v_loc, r.item_id, 'transfer_in', v_qty,
                             'transfer', v_t.id, v_t.number);
    end if;
    update transfer_order_lines set qty_received = v_qty, to_location_id = v_loc where id = r.id;
  end loop;

  update transfer_orders
     set status = 'received', received_at = now(),
         has_discrepancy = exists (select 1 from transfer_order_lines
                                    where transfer_id = p_transfer_id and qty_received <> qty_dispatched)
   where id = p_transfer_id;
end $$;

-- Transportista / logística actualiza fechas estimadas
create or replace function public.update_transfer_eta(p_transfer_id uuid, p_est_dispatch_date date, p_est_delivery_date date) returns void
language plpgsql security definer set search_path = public as $$
declare v_t transfer_orders;
begin
  select * into v_t from transfer_orders where id = p_transfer_id for update;
  perform _require(v_t.id is not null and (
      v_t.carrier_id = auth.uid()
      or has_tenant_role(v_t.tenant_id, '{company_admin,supervisor}')
      or can_operate_warehouse(v_t.from_warehouse_id)), 'No autorizado', '42501');
  perform _require(v_t.status in ('requested','approved','in_transit'), 'El traslado ya está cerrado');
  update transfer_orders set est_dispatch_date = p_est_dispatch_date, est_delivery_date = p_est_delivery_date
   where id = p_transfer_id;
end $$;

-- 8.4 Devoluciones ----------------------------------------------------
create or replace function public.create_return(
  p_warehouse_id uuid, p_kind public.return_kind, p_reason text, p_lines jsonb,   -- [{item_id, location_id, quantity}]
  p_supplier_id uuid default null, p_receipt_id uuid default null, p_post boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_wh warehouses; v_r returns;
begin
  select * into v_wh from warehouses where id = p_warehouse_id;
  perform _require(v_wh.id is not null and can_operate_warehouse(p_warehouse_id), 'No autorizado', '42501');
  perform _require(nullif(btrim(p_reason), '') is not null, 'Indique el motivo de la devolución');
  perform _require(jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0, 'La devolución necesita al menos una línea');

  insert into returns (tenant_id, kind, warehouse_id, supplier_id, receipt_id, reason, created_by)
  values (v_wh.tenant_id, p_kind, p_warehouse_id, p_supplier_id, p_receipt_id, p_reason, auth.uid())
  returning * into v_r;

  insert into return_lines (tenant_id, return_id, item_id, location_id, quantity)
  select v_wh.tenant_id, v_r.id, (l ->> 'item_id')::uuid, (l ->> 'location_id')::uuid, (l ->> 'quantity')::numeric
    from jsonb_array_elements(p_lines) l;

  if p_post then perform post_return(v_r.id); end if;
  return jsonb_build_object('id', v_r.id, 'number', v_r.number);
end $$;

create or replace function public.post_return(p_return_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_r returns; r record; v_parent uuid; v_tid uuid;
begin
  select * into v_r from returns where id = p_return_id for update;
  perform _require(v_r.id is not null and can_operate_warehouse(v_r.warehouse_id), 'No autorizado', '42501');
  perform _require(v_r.status = 'draft', format('La devolución %s ya fue contabilizada', v_r.number));

  if v_r.kind = 'to_supplier' then
    for r in select * from return_lines where return_id = p_return_id loop
      perform _require(exists (select 1 from locations where id = r.location_id and warehouse_id = v_r.warehouse_id),
                       'Ubicación inválida en la devolución');
      perform _post_movement(v_r.tenant_id, v_r.warehouse_id, r.location_id, r.item_id, 'return_out', -r.quantity,
                             'return', v_r.id, v_r.number, v_r.reason);
    end loop;
  else
    -- Devolución al almacén superior: genera y despacha un traslado vinculado
    select parent_id into v_parent from warehouses where id = v_r.warehouse_id;
    perform _require(v_parent is not null, 'El almacén central no tiene almacén superior');
    insert into transfer_orders (tenant_id, from_warehouse_id, to_warehouse_id, status, notes, requested_by)
    values (v_r.tenant_id, v_r.warehouse_id, v_parent, 'approved', 'Devolución ' || v_r.number || ': ' || v_r.reason, auth.uid())
    returning id into v_tid;
    insert into transfer_order_lines (tenant_id, transfer_id, item_id, from_location_id, qty_requested)
    select tenant_id, v_tid, item_id, location_id, quantity from return_lines where return_id = p_return_id;
    perform dispatch_transfer(v_tid);
    update returns set transfer_id = v_tid where id = p_return_id;
  end if;

  update returns set status = 'posted', posted_at = now(), posted_by = auth.uid() where id = p_return_id;
end $$;

-- 8.5 Consumo de consumibles y ajustes --------------------------------
create or replace function public.issue_consumable(p_location_id uuid, p_item_id uuid, p_quantity numeric, p_reference text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_loc locations; v_item items;
begin
  select * into v_loc  from locations where id = p_location_id;
  select * into v_item from items where id = p_item_id and tenant_id = v_loc.tenant_id;
  perform _require(v_loc.id is not null and can_operate_warehouse(v_loc.warehouse_id), 'No autorizado', '42501');
  perform _require(v_item.item_type = 'consumable', 'Las herramientas se entregan con checkout, no con consumo');
  perform _require(p_quantity > 0, 'Cantidad inválida');
  return _post_movement(v_loc.tenant_id, v_loc.warehouse_id, p_location_id, p_item_id, 'issue', -p_quantity,
                        'issue', null, null, p_reference);
end $$;

create or replace function public.adjust_stock(p_location_id uuid, p_item_id uuid, p_delta numeric, p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_loc locations;
begin
  select * into v_loc from locations where id = p_location_id;
  perform _require(v_loc.id is not null and has_tenant_role(v_loc.tenant_id, '{company_admin,supervisor}'),
                   'Solo administradores o supervisores pueden ajustar stock', '42501');
  perform _require(p_delta <> 0 and nullif(btrim(p_reason), '') is not null, 'Indique cantidad y motivo del ajuste');
  return _post_movement(v_loc.tenant_id, v_loc.warehouse_id, p_location_id, p_item_id,
                        case when p_delta > 0 then 'adjustment_in' else 'adjustment_out' end::movement_type,
                        p_delta, 'adjustment', null, null, p_reason);
end $$;

-- 8.6 Herramientas: entrega y devolución -------------------------------
create or replace function public.checkout_tool(
  p_asset_id uuid, p_assigned_to_name text, p_assigned_to_user uuid default null,
  p_due_at timestamptz default null, p_condition text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_a tool_assets; v_id uuid;
begin
  select * into v_a from tool_assets where id = p_asset_id for update;
  perform _require(v_a.id is not null and can_operate_warehouse(v_a.warehouse_id), 'No autorizado', '42501');
  perform _require(v_a.status = 'available' and v_a.location_id is not null,
                   format('La herramienta %s no está disponible (estado %s)', v_a.serial_number, v_a.status));

  insert into tool_assignments (tenant_id, asset_id, assigned_to_user, assigned_to_name, checked_out_by, due_at, condition_out)
  values (v_a.tenant_id, p_asset_id, p_assigned_to_user, p_assigned_to_name, auth.uid(), p_due_at, p_condition)
  returning id into v_id;

  perform _post_movement(v_a.tenant_id, v_a.warehouse_id, v_a.location_id, v_a.item_id, 'tool_checkout', -1,
                         'tool_assignment', v_id, v_a.serial_number, 'Entregada a ' || p_assigned_to_name);
  update tool_assets set status = 'assigned' where id = p_asset_id;
  return v_id;
end $$;

create or replace function public.checkin_tool(
  p_assignment_id uuid, p_location_id uuid, p_condition text default null, p_to_maintenance boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare v_asg tool_assignments; v_a tool_assets; v_loc locations;
begin
  select * into v_asg from tool_assignments where id = p_assignment_id for update;
  select * into v_a   from tool_assets where id = v_asg.asset_id for update;
  select * into v_loc from locations where id = p_location_id and tenant_id = v_a.tenant_id;
  perform _require(v_asg.id is not null and v_loc.id is not null and can_operate_warehouse(v_loc.warehouse_id), 'No autorizado', '42501');
  perform _require(v_asg.returned_at is null, 'Esta asignación ya fue cerrada');

  perform _post_movement(v_a.tenant_id, v_loc.warehouse_id, p_location_id, v_a.item_id, 'tool_checkin', 1,
                         'tool_assignment', v_asg.id, v_a.serial_number, coalesce(p_condition, 'Devuelta'));
  update tool_assignments set returned_at = now(), return_location_id = p_location_id, condition_in = p_condition
   where id = p_assignment_id;
  update tool_assets
     set status = case when p_to_maintenance then 'maintenance' else 'available' end::tool_status,
         warehouse_id = v_loc.warehouse_id, location_id = p_location_id
   where id = v_a.id;
end $$;

-- 8.7 Reposición desde una alerta --------------------------------------
--  Almacén central  → borrador de ORDEN DE COMPRA al proveedor.
--  Intermedio/final → SOLICITUD DE TRASLADO desde su almacén padre.
create or replace function public.create_replenishment_from_alert(p_alert_id uuid, p_supplier_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_a   stock_alerts; v_th item_thresholds; v_wh warehouses;
  v_cur numeric; v_qty numeric; v_doc jsonb;
begin
  select * into v_a from stock_alerts where id = p_alert_id for update;
  perform _require(v_a.id is not null, 'Alerta no encontrada');
  select * into v_wh from warehouses where id = v_a.warehouse_id;
  perform _require(has_tenant_role(v_a.tenant_id, '{company_admin,supervisor,buyer}')
                   or (v_wh.level <> 'central' and can_operate_warehouse(v_wh.id)), 'No autorizado', '42501');
  perform _require(v_a.status = 'open', 'La alerta ya está en reposición o resuelta');

  select * into v_th from item_thresholds where item_id = v_a.item_id and warehouse_id = v_a.warehouse_id;
  select coalesce(sum(qty_on_hand), 0) into v_cur from stock_levels where item_id = v_a.item_id and warehouse_id = v_a.warehouse_id;
  v_qty := case when v_th.max_qty is not null then greatest(v_th.max_qty - v_cur, v_th.reorder_qty) else v_th.reorder_qty end;

  if v_wh.level = 'central' then
    perform _require(p_supplier_id is not null, 'Indique el proveedor para generar la orden de compra');
    v_doc := create_purchase_order(v_a.tenant_id, p_supplier_id, v_wh.id,
                                   jsonb_build_array(jsonb_build_object('item_id', v_a.item_id, 'quantity', v_qty)),
                                   null, null, 'Generada desde alerta de stock mínimo');
    update purchase_orders set source_alert_id = v_a.id where id = (v_doc ->> 'id')::uuid;
    update stock_alerts set status = 'in_replenishment', purchase_order_id = (v_doc ->> 'id')::uuid where id = v_a.id;
    return v_doc || jsonb_build_object('kind', 'purchase_order', 'quantity', v_qty);
  else
    v_doc := create_transfer(v_wh.parent_id, v_wh.id,
                             jsonb_build_array(jsonb_build_object('item_id', v_a.item_id, 'quantity', v_qty)),
                             null, null, null, 'Reposición automática por stock mínimo');
    update transfer_orders set source_alert_id = v_a.id where id = (v_doc ->> 'id')::uuid;
    update stock_alerts set status = 'in_replenishment', transfer_order_id = (v_doc ->> 'id')::uuid where id = v_a.id;
    return v_doc || jsonb_build_object('kind', 'transfer', 'quantity', v_qty);
  end if;
end $$;
