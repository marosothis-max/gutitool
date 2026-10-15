-- =====================================================================
--  Migración 006: costes e importes ocultos para almacenistas y transportistas
--  Se revoca la lectura de las columnas de coste/precio a nivel de base de
--  datos. Solo administrador, supervisor, comprador y auditor las obtienen,
--  mediante funciones que comprueban el rol.
-- =====================================================================

create or replace function public.can_see_costs(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select public.is_super_admin()) or public.has_tenant_role(p_tenant, '{company_admin,supervisor,buyer,auditor}')
$$;

-- 1) Lectura por columnas: todo menos el coste / precio
revoke select on public.items from authenticated, anon;
grant select (id, tenant_id, sku, name, description, item_type, uom, active, created_at) on public.items to authenticated;

revoke select on public.purchase_order_lines from authenticated, anon;
grant select (id, tenant_id, purchase_order_id, item_id, qty_ordered, qty_received, est_dispatch_date, est_delivery_date)
  on public.purchase_order_lines to authenticated;

-- 2) Funciones que devuelven costes solo a quien puede verlos (vacío para el resto)
create or replace function public.item_costs(p_tenant_id uuid)
returns table (item_id uuid, unit_cost numeric)
language sql stable security definer set search_path = public as $$
  select i.id, i.unit_cost from items i
   where i.tenant_id = p_tenant_id and public.can_see_costs(p_tenant_id)
$$;

create or replace function public.po_line_prices(p_tenant_id uuid, p_purchase_order_ids uuid[] default null)
returns table (line_id uuid, purchase_order_id uuid, item_id uuid, unit_price numeric)
language sql stable security definer set search_path = public as $$
  select l.id, l.purchase_order_id, l.item_id, l.unit_price from purchase_order_lines l
   where l.tenant_id = p_tenant_id and public.can_see_costs(p_tenant_id)
     and (p_purchase_order_ids is null or l.purchase_order_id = any (p_purchase_order_ids))
$$;

revoke execute on function public.item_costs(uuid) from public, anon;
revoke execute on function public.po_line_prices(uuid, uuid[]) from public, anon;
grant execute on function public.item_costs(uuid) to authenticated;
grant execute on function public.po_line_prices(uuid, uuid[]) to authenticated;
grant execute on function public.can_see_costs(uuid) to authenticated;

-- 3) La vista de stock ya no expone coste ni valor (se calculan aparte si el rol lo permite)
drop view if exists public.v_stock_by_location;
create view public.v_stock_by_location with (security_invoker = true) as
select s.tenant_id, s.item_id, i.sku, i.name as item_name, i.item_type, i.uom,
       s.warehouse_id, w.code as warehouse_code, w.name as warehouse_name, w.level as warehouse_level,
       s.location_id, l.code as location_code, l.aisle, l.rack, l.bin,
       s.qty_on_hand, s.updated_at
  from public.stock_levels s
  join public.items i      on i.id = s.item_id
  join public.warehouses w on w.id = s.warehouse_id
  join public.locations l  on l.id = s.location_id;

notify pgrst, 'reload schema';
