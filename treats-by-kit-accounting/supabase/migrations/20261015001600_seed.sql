-- Idempotent chart of accounts and the single settings row.

insert into public.business_settings (id, business_name, currency)
values ('00000000-0000-4000-8000-000000000001', 'Treats by Kit', 'PHP')
on conflict (id) do nothing;

insert into public.accounts (code, name, type, normal_balance, description, active, system)
values
  ('1010', 'Cash on Hand', 'asset', 'debit', 'Cash kept at the bakery', true, true),
  ('1020', 'GCash', 'asset', 'debit', 'GCash wallet', true, true),
  ('1030', 'Bank', 'asset', 'debit', 'Bank account', true, true),
  ('1100', 'Accounts Receivable', 'asset', 'debit', 'Amounts customers still owe', true, true),
  ('1200', 'Raw Materials Inventory', 'asset', 'debit', 'Ingredients on hand', true, true),
  ('1210', 'Packaging Materials Inventory', 'asset', 'debit', 'Packaging on hand', true, true),
  ('1220', 'Finished Goods Inventory', 'asset', 'debit', 'Products ready to sell', true, true),
  ('2010', 'Accounts Payable', 'liability', 'credit', 'Amounts owed to suppliers and unpaid bills', true, true),
  ('2020', 'Customer Deposits', 'liability', 'credit', 'Down payments not yet applied to a sale', true, true),
  ('3010', 'Owner''s Capital', 'equity', 'credit', 'Owner contributions', true, true),
  ('3020', 'Owner''s Drawings', 'equity', 'credit', 'Owner withdrawals', true, true),
  ('3030', 'Retained Earnings', 'equity', 'credit', 'Earnings kept in the business', true, true),
  ('4010', 'Sales Revenue', 'revenue', 'credit', 'Sales before discounts', true, true),
  ('4020', 'Sales Discounts', 'contra_revenue', 'debit', 'Discounts given on sales', true, true),
  ('4090', 'Other Income', 'revenue', 'credit', 'Income that is not a sale, including retained deposits', true, true),
  ('5010', 'Cost of Goods Sold', 'cogs', 'debit', 'Cost of finished goods sold', true, true),
  ('5020', 'Spoilage and Waste', 'cogs', 'debit', 'Ingredients lost in production', true, true),
  ('5030', 'Inventory Adjustments', 'cogs', 'debit', 'Count corrections', true, true),
  ('5040', 'Labor and Overhead Applied', 'contra_cogs', 'credit', 'Labor and overhead added to finished goods', true, true),
  ('6010', 'Rent', 'expense', 'debit', 'Shop rent', true, true),
  ('6020', 'Utilities', 'expense', 'debit', 'Electricity, water, and similar bills', true, true),
  ('6030', 'Salaries and Wages', 'expense', 'debit', 'Pay for people', true, true),
  ('6040', 'Delivery and Transport', 'expense', 'debit', 'Deliveries and transport', true, true),
  ('6050', 'Marketing', 'expense', 'debit', 'Advertising and promotion', true, true),
  ('6060', 'Supplies', 'expense', 'debit', 'Shop supplies that are not inventory', true, true),
  ('6070', 'Repairs and Maintenance', 'expense', 'debit', 'Repairs and upkeep', true, true),
  ('6080', 'Miscellaneous', 'expense', 'debit', 'Other operating costs', true, true)
on conflict (code) do nothing;
