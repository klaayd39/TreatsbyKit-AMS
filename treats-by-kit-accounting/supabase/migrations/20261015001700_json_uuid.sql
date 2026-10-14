-- Prefixed ids such as line-<uuid> are not uuid values. Treat them as missing
-- so coalesce(..., gen_random_uuid()) can assign a real id.

create or replace function public.json_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' or value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return value::uuid;
end;
$$;
