-- Verify registered emails for password recovery without exposing profile data
create or replace function public.is_registered_email(_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where lower(trim(email)) = lower(trim(_email))
  );
$$;

revoke all on function public.is_registered_email(text) from public;
grant execute on function public.is_registered_email(text) to anon, authenticated;