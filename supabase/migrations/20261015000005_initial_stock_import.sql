-- =====================================================================
--  Migración 005: carga inicial de inventario (pegar desde Excel)
--  Crea los artículos y ubicaciones que falten y registra el stock como
--  ajuste positivo "Inventario inicial" en el ledger. Todo o nada.
-- =====================================================================

create or replace function public.import_initial_stock(
  p_tenant_id uuid,
  p_rows jsonb,          -- [{sku, name?, item_type?, uom?, unit_cost?, warehouse_code, location_code, quantity, min_qty?, reorder_qty?, max_qty?}]
  p_reason text default 'Inventario inicial'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; i int := 0;
  v_wh warehouses; v_item items; v_loc uuid;
  v_parts text[]; v_type item_type; v_qty numeric;
  c_items int := 0; c_locs int := 0; c_moves int := 0; c_units numeric := 0;
begin
  perform _require(has_tenant_role(p_tenant_id, '{company_admin,supervisor}'),
                   'Solo administradores o supervisores pueden hacer la carga inicial', '42501');
  perform _require(jsonb_typeof(p_rows) = 'array' and jsonb_array_length(p_rows) between 1 and 5000,
                   'Envía entre 1 y 5000 filas');

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;

    -- Almacén (debe existir)
    select * into v_wh from warehouses
     where tenant_id = p_tenant_id and upper(code) = upper(btrim(r ->> 'warehouse_code'));
    perform _require(v_wh.id is not null, format('Fila %s: no existe el almacén "%s"', i, r ->> 'warehouse_code'));

    -- Ubicación PASILLO-ESTANTERÍA-BIN (se crea si no existe)
    v_parts := string_to_array(upper(btrim(r ->> 'location_code')), '-');
    perform _require(array_length(v_parts, 1) = 3 and v_parts[1] <> '' and v_parts[2] <> '' and v_parts[3] <> '',
                     format('Fila %s: la ubicación "%s" debe tener el formato PASILLO-ESTANTERIA-BIN (p. ej. P01-E03-B12)', i, r ->> 'location_code'));
    select id into v_loc from locations
     where warehouse_id = v_wh.id and aisle = v_parts[1] and rack = v_parts[2] and bin = v_parts[3];
    if v_loc is null then
      insert into locations (tenant_id, warehouse_id, aisle, rack, bin)
      values (p_tenant_id, v_wh.id, v_parts[1], v_parts[2], v_parts[3]) returning id into v_loc;
      c_locs := c_locs + 1;
    end if;

    -- Artículo (se crea si no existe)
    select * into v_item from items where tenant_id = p_tenant_id and upper(sku) = upper(btrim(r ->> 'sku'));
    if v_item.id is null then
      perform _require(nullif(btrim(r ->> 'name'), '') is not null,
                       format('Fila %s: el artículo %s no existe; indica su nombre para crearlo', i, r ->> 'sku'));
      v_type := case lower(coalesce(r ->> 'item_type', ''))
                  when 'tool' then 'tool' when 'herramienta' then 'tool' when 'h' then 'tool'
                  else 'consumable' end;
      insert into items (tenant_id, sku, name, item_type, uom, unit_cost)
      values (p_tenant_id, btrim(r ->> 'sku'), btrim(r ->> 'name'), v_type,
              coalesce(nullif(btrim(r ->> 'uom'), ''), 'UD'),
              coalesce(nullif(replace(r ->> 'unit_cost', ',', '.'), '')::numeric, 0))
      returning * into v_item;
      c_items := c_items + 1;
    end if;

    -- Cantidad
    v_qty := coalesce(nullif(replace(r ->> 'quantity', ',', '.'), '')::numeric, 0);
    perform _require(v_qty >= 0, format('Fila %s: cantidad negativa', i));
    if v_qty > 0 then
      perform _post_movement(p_tenant_id, v_wh.id, v_loc, v_item.id, 'adjustment_in', v_qty,
                             'initial_load', null, null, p_reason);
      c_moves := c_moves + 1;
      c_units := c_units + v_qty;
    end if;

    -- Umbrales opcionales
    if nullif(r ->> 'min_qty', '') is not null then
      insert into item_thresholds (tenant_id, item_id, warehouse_id, min_qty, reorder_qty, max_qty)
      values (p_tenant_id, v_item.id, v_wh.id,
              replace(r ->> 'min_qty', ',', '.')::numeric,
              coalesce(nullif(replace(r ->> 'reorder_qty', ',', '.'), '')::numeric, greatest(replace(r ->> 'min_qty', ',', '.')::numeric, 1)),
              nullif(replace(r ->> 'max_qty', ',', '.'), '')::numeric)
      on conflict (item_id, warehouse_id) do update
        set min_qty = excluded.min_qty, reorder_qty = excluded.reorder_qty, max_qty = excluded.max_qty;
    end if;
  end loop;

  return jsonb_build_object('rows', i, 'items_created', c_items, 'locations_created', c_locs,
                            'movements', c_moves, 'units', c_units);
end $$;

revoke execute on function public.import_initial_stock(uuid, jsonb, text) from public, anon;
grant execute on function public.import_initial_stock(uuid, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
