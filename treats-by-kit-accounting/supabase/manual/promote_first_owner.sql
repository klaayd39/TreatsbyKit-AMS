-- RUN ONCE MANUALLY in the Supabase SQL editor after you create the first user
-- (Authentication > Users). Replace the email, then run this once.
-- Do not put this statement in a migration. It is not idempotent on purpose:
-- it promotes one specific person and should not run again by accident.

update public.profiles
set role = 'owner', active = true
where email = 'you@example.com';
