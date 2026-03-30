-- Ensure password recovery email existence check uses auth accounts (not only profiles)
create or replace function public.is_registered_email(_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.email is not null
      and lower(trim(u.email)) = lower(trim(_email))
      and u.deleted_at is null
  )
  or exists (
    select 1
    from public.profiles p
    where p.email is not null
      and lower(trim(p.email)) = lower(trim(_email))
  );
$$;

revoke all on function public.is_registered_email(text) from public;
grant execute on function public.is_registered_email(text) to anon, authenticated, postgres;