# Deploy Treats by Kit

## 1. Database

Install the Supabase CLI, then from `treats-by-kit-accounting`:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

`supabase db push` applies every file in `supabase/migrations/` in filename order.

If you cannot use the CLI, open the Supabase SQL editor and paste the migration files one at a time, in this order:

1. `20261015000100_helpers.sql`
2. `20261015000200_profiles_settings_sequences.sql`
3. `20261015000300_catalog.sql`
4. `20261015000400_purchasing.sql`
5. `20261015000500_production.sql`
6. `20261015000600_sales.sql`
7. `20261015000700_ledger.sql`
8. `20261015000800_audit.sql`
9. `20261015000900_views.sql`
10. `20261015001000_guards.sql`
11. `20261015001100_rpc_helpers.sql`
12. `20261015001200_rpc_flows.sql`
13. `20261015001300_rpc_orders_admin.sql`
14. `20261015001400_rpc_admin.sql`
15. `20261015001500_rls.sql`
16. `20261015001600_seed.sql`

## 2. First owner

Public sign-up stays off. Create the first person in Authentication, then Users. Run `supabase/manual/promote_first_owner.sql` once in the SQL editor after you replace the email. That file is marked run once manually and is not a migration.

## 3. Vercel

Set these environment variables on the Vercel project. Do not set a service role key. Do not set `VITE_ENABLE_DEMO` in production.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Redeploy after changing them. Vite reads them at build time.

## 4. Auth settings

In the Supabase dashboard:

- Authentication, then Providers, then Email: turn off public sign-ups.
- Authentication, then URL configuration: set Site URL to the deployed domain, and add that domain to the redirect allow list.

## 5. Go-live checklist

- Migrations applied, including the seed for the chart of accounts and business settings.
- Public sign-up is off.
- The first user is an active owner.
- Vercel has only the URL and the anon key.
- `VITE_ENABLE_DEMO` is unset.
- Site URL and redirect URLs match the deployed domain.
- You downloaded one full export from Business Settings and stored it somewhere other than Supabase.
- You ran `supabase/tests/accounting_rules.sql` and each section failed with the error named in its comment.
