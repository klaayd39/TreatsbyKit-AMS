-- Row level security. The interface hides buttons as well, but these policies are the real check.

alter table public.profiles enable row level security;
alter table public.business_settings enable row level security;
alter table public.number_sequences enable row level security;
alter table public.items enable row level security;
alter table public.suppliers enable row level security;
alter table public.customers enable row level security;
alter table public.accounts enable row level security;
alter table public.purchase_invoices enable row level security;
alter table public.purchase_invoice_lines enable row level security;
alter table public.receiving_records enable row level security;
alter table public.receiving_lines enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_lines enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_batch_lines enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
alter table public.sale_payments enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_movements enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notification_states enable row level security;

create policy profiles_select on public.profiles
for select to authenticated
using (id = auth.uid() or (public.is_active_user() and public.current_user_role() = 'owner'));

create policy settings_select on public.business_settings
for select to authenticated
using (public.is_active_user());

create policy settings_update on public.business_settings
for update to authenticated
using (public.is_active_user() and public.current_user_role() = 'owner')
with check (public.is_active_user() and public.current_user_role() = 'owner');

create policy items_select on public.items for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy items_write on public.items for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy items_update on public.items for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy items_delete on public.items for delete to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy suppliers_select on public.suppliers for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy suppliers_write on public.suppliers for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy suppliers_update on public.suppliers for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy suppliers_delete on public.suppliers for delete to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy customers_select on public.customers for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier', 'viewer'));
create policy customers_write on public.customers for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'));
create policy customers_update on public.customers for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'));
create policy customers_delete on public.customers for delete to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy accounts_select on public.accounts for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy accounts_write on public.accounts for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy accounts_update on public.accounts for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy accounts_delete on public.accounts for delete to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy books_select on public.purchase_invoices for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy books_write on public.purchase_invoices for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy books_update on public.purchase_invoices for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy books_delete on public.purchase_invoices for delete to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy invoice_lines_select on public.purchase_invoice_lines for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy invoice_lines_write on public.purchase_invoice_lines for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy invoice_lines_update on public.purchase_invoice_lines for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy invoice_lines_delete on public.purchase_invoice_lines for delete to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy receipts_select on public.receiving_records for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy receipts_write on public.receiving_records for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy receipt_lines_select on public.receiving_lines for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy receipt_lines_write on public.receiving_lines for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy supplier_payments_select on public.supplier_payments for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy supplier_payments_write on public.supplier_payments for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy recipes_select on public.recipes for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy recipes_write on public.recipes for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy recipes_update on public.recipes for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy recipes_delete on public.recipes for delete to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy recipe_lines_select on public.recipe_lines for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy recipe_lines_write on public.recipe_lines for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy recipe_lines_delete on public.recipe_lines for delete to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy batches_select on public.production_batches for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy batches_write on public.production_batches for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy batches_update on public.production_batches for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy batch_lines_select on public.production_batch_lines for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy batch_lines_write on public.production_batch_lines for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy orders_select on public.orders for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier', 'viewer'));
create policy orders_write on public.orders for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'));
create policy orders_update on public.orders for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'));

create policy order_lines_select on public.order_lines for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier', 'viewer'));
create policy order_lines_write on public.order_lines for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'));

create policy sales_select on public.sales for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy sales_write on public.sales for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'));
create policy sales_update on public.sales for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy sale_lines_select on public.sale_lines for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy sale_lines_write on public.sale_lines for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'));

create policy sale_payments_select on public.sale_payments for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier', 'viewer'));
create policy sale_payments_write on public.sale_payments for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'));
create policy sale_payments_update on public.sale_payments for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'cashier'));

create policy expenses_select on public.expenses for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy expenses_write on public.expenses for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy expenses_update on public.expenses for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy movements_select on public.stock_movements for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy movements_write on public.stock_movements for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy journals_select on public.journal_entries for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy journals_write on public.journal_entries for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));
create policy journals_update on public.journal_entries for update to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'))
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy journal_lines_select on public.journal_lines for select to authenticated
using (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper', 'viewer'));
create policy journal_lines_write on public.journal_lines for insert to authenticated
with check (public.is_active_user() and public.current_user_role() in ('owner', 'bookkeeper'));

create policy audit_select on public.audit_logs for select to authenticated
using (public.is_active_user() and public.current_user_role() = 'owner');

create policy notifications_all on public.notification_states for all to authenticated
using (public.is_active_user() and user_id = auth.uid())
with check (public.is_active_user() and user_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.v_stock_on_hand, public.v_average_cost, public.v_account_balances,
  public.v_pos_items, public.v_stock_quantities, public.v_cashier_sales, public.v_cashier_sale_lines,
  public.order_payments to authenticated;

revoke all on all functions in schema public from public;
grant execute on all functions in schema public to authenticated;
