-- Computed stock, average cost, account balances, and cashier-safe reads.
-- Average cost matches the app: finished goods use production_output only,
-- everything else uses purchase only. Adjustments and sales do not change it.

create or replace view public.v_stock_on_hand
with (security_invoker = true) as
select
  item_id,
  coalesce(sum(quantity_in - quantity_out), 0)::numeric(14, 4) as quantity_on_hand
from public.stock_movements
group by item_id;

create or replace view public.v_average_cost
with (security_invoker = true) as
select
  movements.item_id,
  case
    when coalesce(sum(movements.quantity_in - movements.quantity_out), 0) <= 0 then null
    else (
      sum((movements.quantity_in - movements.quantity_out) * movements.unit_cost)
      / sum(movements.quantity_in - movements.quantity_out)
    )::numeric(14, 4)
  end as average_cost
from public.stock_movements as movements
join public.items on items.id = movements.item_id
where movements.type = case
  when items.category = 'finished_good' then 'production_output'
  else 'purchase'
end
group by movements.item_id;

create or replace view public.v_account_balances
with (security_invoker = true) as
select
  accounts.id as account_id,
  accounts.code,
  accounts.type,
  accounts.normal_balance,
  coalesce(sum(lines.debit), 0)::numeric(14, 2) as debit_total,
  coalesce(sum(lines.credit), 0)::numeric(14, 2) as credit_total,
  case
    when accounts.normal_balance = 'debit'
      then (coalesce(sum(lines.debit), 0) - coalesce(sum(lines.credit), 0))::numeric(14, 2)
    else (coalesce(sum(lines.credit), 0) - coalesce(sum(lines.debit), 0))::numeric(14, 2)
  end as balance
from public.accounts
left join public.journal_lines as lines on lines.account_id = accounts.id
group by accounts.id, accounts.code, accounts.type, accounts.normal_balance;

-- Cashier catalog: name, unit, selling price, and quantity. No cost.
create or replace view public.v_pos_items
with (security_invoker = false) as
select
  items.id,
  items.name,
  items.unit,
  items.category,
  items.selling_price,
  coalesce(stock.quantity_on_hand, 0)::numeric(14, 4) as quantity_on_hand
from public.items
left join (
  select item_id, sum(quantity_in - quantity_out) as quantity_on_hand
  from public.stock_movements
  group by item_id
) as stock on stock.item_id = items.id
where items.category = 'finished_good'
  and public.is_active_user()
  and public.current_user_role() in ('owner', 'bookkeeper', 'cashier', 'viewer');

create or replace view public.v_stock_quantities
with (security_invoker = false) as
select
  stock_movements.id,
  stock_movements.item_id,
  stock_movements.date,
  stock_movements.type,
  stock_movements.quantity_in,
  stock_movements.quantity_out,
  stock_movements.reference_type,
  stock_movements.reference_id,
  stock_movements.created_at
from public.stock_movements
where public.is_active_user()
  and public.current_user_role() = 'cashier';

create or replace view public.v_cashier_sales
with (security_invoker = false) as
select
  id, sale_number, date, sold_at, customer_id, source, order_id,
  subtotal, discount_type, discount_value, discount_amount, total,
  status, void_reason, voided_at, notes, created_at, updated_at, created_by
from public.sales
where public.is_active_user() and public.current_user_role() = 'cashier';

create or replace view public.v_cashier_sale_lines
with (security_invoker = false) as
select id, sale_id, item_id, quantity, unit_price, line_total, revenue, sort_order
from public.sale_lines
where public.is_active_user() and public.current_user_role() = 'cashier';

create or replace view public.order_payments
with (security_invoker = true) as
select * from public.sale_payments where order_id is not null;
