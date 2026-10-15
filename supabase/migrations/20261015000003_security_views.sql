-- =====================================================================
--  Migración 003: Row Level Security, permisos, vistas y Realtime
-- =====================================================================
--  Matriz de escritura directa (todo lo que mueve stock va por RPC):
--   tenants ................ super admin
--   tenant_settings ........ company_admin
--   tenant_members ......... company_admin (de su empresa) / super admin
--   warehouses, locations,
--   member_warehouses,
--   item_thresholds,
--   tool_assets ............ company_admin, supervisor
--   items, suppliers ....... company_admin, supervisor, buyer
--   purchase_orders(+lines)  company_admin, supervisor, buyer
--   stock_alerts ........... company_admin, supervisor, buyer (marcar)
--   notifications .......... su propio destinatario
--   stock_*, receipts,
--   transfers, returns,
--   tool_assignments ....... SOLO lectura; escritura vía RPC
--  Lectura: cualquier miembro activo de una empresa activa ve TODO el
--  inventario de su empresa (visibilidad global desde el central).
--  Auditor = lectura total, sin escritura.
-- =====================================================================

-- ---------- 1. Lectura por tenant en todas las tablas de negocio ----------
do $$
declare t text;
begin
  foreach t in array array[
    'tenant_settings','warehouses','member_warehouses','locations','items','item_thresholds','suppliers',
    'stock_levels','stock_movements','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines',
    'transfer_orders','transfer_order_lines','returns','return_lines','tool_assets','tool_assignments',
    'stock_alerts','document_sequences','email_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.is_super_admin()) or public.is_tenant_member(tenant_id))', t || '_read', t);
  end loop;
end $$;

-- ---------- 2. Escritura por rol ----------
do $$
declare t text;
begin
  -- Datos maestros de almacén
  foreach t in array array['warehouses','locations','member_warehouses','item_thresholds','tool_assets'] loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.has_tenant_role(tenant_id, ''{company_admin,supervisor}''))
         with check (public.has_tenant_role(tenant_id, ''{company_admin,supervisor}''))', t || '_write', t);
  end loop;
  -- Catálogo y compras
  foreach t in array array['items','suppliers','purchase_orders','purchase_order_lines','email_log'] loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.has_tenant_role(tenant_id, ''{company_admin,supervisor,buyer}''))
         with check (public.has_tenant_role(tenant_id, ''{company_admin,supervisor,buyer}''))', t || '_write', t);
  end loop;
end $$;

create policy stock_alerts_update on public.stock_alerts for update to authenticated
  using (public.has_tenant_role(tenant_id, '{company_admin,supervisor,buyer}'))
  with check (public.has_tenant_role(tenant_id, '{company_admin,supervisor,buyer}'));

create policy tenant_settings_write on public.tenant_settings for all to authenticated
  using ((select public.is_super_admin()) or public.has_tenant_role(tenant_id, '{company_admin}'))
  with check ((select public.is_super_admin()) or public.has_tenant_role(tenant_id, '{company_admin}'));

-- ---------- 3. Tenants, perfiles, miembros, notificaciones ----------
alter table public.tenants enable row level security;
create policy tenants_read on public.tenants for select to authenticated
  using ((select public.is_super_admin()) or exists (
          select 1 from public.tenant_members m where m.tenant_id = tenants.id and m.user_id = (select auth.uid())));
create policy tenants_super_admin on public.tenants for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_super_admin()) or exists (
          select 1 from public.tenant_members mine
          join public.tenant_members other on other.tenant_id = mine.tenant_id
          where mine.user_id = (select auth.uid()) and other.user_id = profiles.id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Nadie puede auto-promoverse a super admin: solo se puede editar el nombre.
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;

alter table public.tenant_members enable row level security;
create policy tenant_members_read on public.tenant_members for select to authenticated
  using ((select public.is_super_admin()) or public.is_tenant_member(tenant_id) or user_id = (select auth.uid()));
create policy tenant_members_write on public.tenant_members for all to authenticated
  using ((select public.is_super_admin()) or public.has_tenant_role(tenant_id, '{company_admin}'))
  with check ((select public.is_super_admin()) or public.has_tenant_role(tenant_id, '{company_admin}'));

alter table public.notifications enable row level security;
create policy notifications_own_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- 4. Funciones internas: no invocables desde la API ----------
revoke execute on function public.next_document_number(uuid, text) from public, anon, authenticated;
revoke execute on function public._post_movement(uuid, uuid, uuid, uuid, public.movement_type, numeric, text, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.evaluate_stock_threshold(uuid, uuid) from public, anon, authenticated;

-- Las RPC de negocio: solo usuarios autenticados (validan rol internamente)
do $$
declare f text;
begin
  foreach f in array array[
    'create_purchase_order(uuid,uuid,uuid,jsonb,date,date,text,text)',
    'receive_goods(uuid,jsonb,uuid,text,uuid,text)',
    'create_transfer(uuid,uuid,jsonb,date,date,uuid,text)',
    'approve_transfer(uuid)', 'dispatch_transfer(uuid,jsonb)', 'receive_transfer(uuid,jsonb)',
    'update_transfer_eta(uuid,date,date)',
    'create_return(uuid,public.return_kind,text,jsonb,uuid,uuid,boolean)', 'post_return(uuid)',
    'issue_consumable(uuid,uuid,numeric,text)', 'adjust_stock(uuid,uuid,numeric,text)',
    'checkout_tool(uuid,text,uuid,timestamptz,text)', 'checkin_tool(uuid,uuid,text,boolean)',
    'create_replenishment_from_alert(uuid,uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- 5. Vistas (security_invoker => respetan el RLS del usuario que consulta)
-- =====================================================================

-- Stock por ubicación exacta (Pasillo / Estantería / Bin)
create view public.v_stock_by_location with (security_invoker = true) as
select s.tenant_id, s.item_id, i.sku, i.name as item_name, i.item_type, i.uom,
       s.warehouse_id, w.code as warehouse_code, w.name as warehouse_name, w.level as warehouse_level,
       s.location_id, l.code as location_code, l.aisle, l.rack, l.bin,
       s.qty_on_hand, i.unit_cost, s.qty_on_hand * i.unit_cost as stock_value, s.updated_at
  from public.stock_levels s
  join public.items i      on i.id = s.item_id
  join public.warehouses w on w.id = s.warehouse_id
  join public.locations l  on l.id = s.location_id;

-- Red de almacenes: visión del Central sobre TODOS los niveles
create view public.v_stock_network with (security_invoker = true) as
with s as (select item_id, warehouse_id, sum(qty_on_hand) qty from public.stock_levels group by 1, 2),
     tr as (select l.item_id, t.to_warehouse_id warehouse_id, sum(l.qty_dispatched) qty
              from public.transfer_order_lines l join public.transfer_orders t on t.id = l.transfer_id
             where t.status = 'in_transit' group by 1, 2),
     po as (select l.item_id, p.warehouse_id, sum(greatest(l.qty_ordered - l.qty_received, 0)) qty
              from public.purchase_order_lines l join public.purchase_orders p on p.id = l.purchase_order_id
             where p.status in ('sent','confirmed','partially_received') group by 1, 2)
select w.tenant_id, i.id as item_id, i.sku, i.name as item_name, i.item_type, i.uom,
       w.id as warehouse_id, w.code as warehouse_code, w.name as warehouse_name, w.level as warehouse_level, w.parent_id,
       coalesce(s.qty, 0)  as qty_on_hand,
       coalesce(tr.qty, 0) as qty_in_transit,
       coalesce(po.qty, 0) as qty_on_order,
       th.min_qty, th.reorder_qty, th.max_qty,
       (th.min_qty is not null and coalesce(s.qty, 0) <= th.min_qty) as below_min
  from public.items i
  join public.warehouses w on w.tenant_id = i.tenant_id
  left join s  on s.item_id = i.id  and s.warehouse_id = w.id
  left join tr on tr.item_id = i.id and tr.warehouse_id = w.id
  left join po on po.item_id = i.id and po.warehouse_id = w.id
  left join public.item_thresholds th on th.item_id = i.id and th.warehouse_id = w.id
 where s.qty is not null or th.item_id is not null or tr.qty is not null or po.qty is not null;

-- Trazabilidad: cada ítem en curso con fechas estimadas de despacho y entrega
create view public.v_order_tracking with (security_invoker = true) as
select 'purchase_order'::text as kind, p.tenant_id, p.id as doc_id, p.number, p.status::text as status,
       l.item_id, i.sku, i.name as item_name, l.qty_ordered as qty, l.qty_received as qty_done,
       coalesce(l.est_dispatch_date, p.est_dispatch_date) as est_dispatch_date,
       coalesce(l.est_delivery_date, p.est_delivery_date) as est_delivery_date,
       null::uuid as from_warehouse_id, p.warehouse_id as to_warehouse_id, s.name as counterpart,
       (p.status not in ('received','cancelled','draft')
        and coalesce(l.est_delivery_date, p.est_delivery_date) < current_date) as is_late
  from public.purchase_orders p
  join public.purchase_order_lines l on l.purchase_order_id = p.id
  join public.items i on i.id = l.item_id
  join public.suppliers s on s.id = p.supplier_id
union all
select 'transfer', t.tenant_id, t.id, t.number, t.status::text,
       l.item_id, i.sku, i.name, l.qty_requested, l.qty_received,
       t.est_dispatch_date, t.est_delivery_date, t.from_warehouse_id, t.to_warehouse_id, wf.name,
       (t.status in ('requested','approved','in_transit') and t.est_delivery_date < current_date)
  from public.transfer_orders t
  join public.transfer_order_lines l on l.transfer_id = t.id
  join public.items i on i.id = l.item_id
  join public.warehouses wf on wf.id = t.from_warehouse_id;

-- Movimientos con descripciones (para listados y Excel)
create view public.v_movements_detail with (security_invoker = true) as
select m.id, m.tenant_id, m.created_at, m.movement_type, m.quantity,
       m.item_id, i.sku, i.name as item_name, i.item_type, i.uom,
       m.warehouse_id, w.code as warehouse_code, w.name as warehouse_name,
       m.location_id, l.code as location_code,
       m.doc_type, m.doc_id, m.doc_number, m.notes, p.email as created_by_email
  from public.stock_movements m
  join public.items i      on i.id = m.item_id
  join public.warehouses w on w.id = m.warehouse_id
  join public.locations l  on l.id = m.location_id
  left join public.profiles p on p.id = m.created_by;

-- Estado de herramientas con asignación abierta
create view public.v_tool_status with (security_invoker = true) as
select a.id as asset_id, a.tenant_id, a.serial_number, a.status, i.sku, i.name as item_name,
       a.warehouse_id, w.name as warehouse_name, l.code as location_code,
       g.id as assignment_id, g.assigned_to_name, g.checked_out_at, g.due_at,
       (g.due_at is not null and g.due_at < now()) as is_overdue
  from public.tool_assets a
  join public.items i on i.id = a.item_id
  join public.warehouses w on w.id = a.warehouse_id
  left join public.locations l on l.id = a.location_id
  left join public.tool_assignments g on g.asset_id = a.id and g.returned_at is null;

-- =====================================================================
-- 6. Realtime: el panel del Central se actualiza solo
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.stock_levels, public.stock_alerts,
                                                 public.notifications, public.transfer_orders;
  end if;
end $$;
