-- Run each section on its own in the Supabase SQL editor.
-- The editor uses the database owner, so row-level security does not apply.
-- A section that reaches commit without the error named in its comment has failed the test.
-- Every section is one transaction. A raised error rolls it back, so these rows are not kept.

-- unbalanced entry rejected
begin;
insert into public.journal_entries (entry_number, date, description, source_type)
values ('JE-SQLTEST-UNBAL', current_date + 1, 'Unbalanced test', 'manual');
insert into public.journal_lines (entry_id, account_id, debit, credit)
select id, (select id from public.accounts where code = '1010'), 10, 0
from public.journal_entries where entry_number = 'JE-SQLTEST-UNBAL';
insert into public.journal_lines (entry_id, account_id, debit, credit)
select id, (select id from public.accounts where code = '4010'), 0, 4
from public.journal_entries where entry_number = 'JE-SQLTEST-UNBAL';
commit;

-- update on journal_entries rejected
begin;
insert into public.journal_entries (entry_number, date, description, source_type)
values ('JE-SQLTEST-LOCK', current_date + 1, 'Immutable test', 'manual');
insert into public.journal_lines (entry_id, account_id, debit, credit)
select id, (select id from public.accounts where code = '1010'), 10, 0
from public.journal_entries where entry_number = 'JE-SQLTEST-LOCK';
insert into public.journal_lines (entry_id, account_id, debit, credit)
select id, (select id from public.accounts where code = '3010'), 0, 10
from public.journal_entries where entry_number = 'JE-SQLTEST-LOCK';
update public.journal_entries set description = 'changed' where entry_number = 'JE-SQLTEST-LOCK';
commit;

-- delete on journal_lines rejected
begin;
insert into public.journal_entries (entry_number, date, description, source_type)
values ('JE-SQLTEST-DEL', current_date + 1, 'Delete test', 'manual');
insert into public.journal_lines (entry_id, account_id, debit, credit)
select id, (select id from public.accounts where code = '1010'), 10, 0
from public.journal_entries where entry_number = 'JE-SQLTEST-DEL';
insert into public.journal_lines (entry_id, account_id, debit, credit)
select id, (select id from public.accounts where code = '3010'), 0, 10
from public.journal_entries where entry_number = 'JE-SQLTEST-DEL';
delete from public.journal_lines
where entry_id = (select id from public.journal_entries where entry_number = 'JE-SQLTEST-DEL');
commit;

-- negative stock rejected
begin;
insert into public.items (id, name, category, unit)
values ('00000000-0000-4000-8000-000000000099', 'SQL test item', 'raw_material', 'pc');
insert into public.stock_movements (date, item_id, type, quantity_in, quantity_out, unit_cost)
values (current_date + 1, '00000000-0000-4000-8000-000000000099', 'sale', 0, 1, 0);
commit;

-- locked-period entry rejected
begin;
update public.business_settings set books_locked_through = current_date;
insert into public.journal_entries (entry_number, date, description, source_type)
values ('JE-SQLTEST-PERIOD', current_date, 'Locked period', 'manual');
commit;

-- duplicate event_key rejected
begin;
insert into public.journal_entries (entry_number, date, description, source_type, event_key)
values ('JE-SQLTEST-KEY-1', current_date + 1, 'First', 'receiving', 'sqltest:event');
insert into public.journal_lines (entry_id, account_id, debit, credit)
select id, (select id from public.accounts where code = '1010'), 10, 0
from public.journal_entries where entry_number = 'JE-SQLTEST-KEY-1';
insert into public.journal_lines (entry_id, account_id, debit, credit)
select id, (select id from public.accounts where code = '3010'), 0, 10
from public.journal_entries where entry_number = 'JE-SQLTEST-KEY-1';
insert into public.journal_entries (entry_number, date, description, source_type, event_key)
values ('JE-SQLTEST-KEY-2', current_date + 1, 'Second', 'receiving', 'sqltest:event');
commit;
