-- Consolidate accounts from the legacy authentication table into the single
-- runtime source used by NextAuth. Preserve IDs so compatible references can
-- continue to identify the same user.
do $$
begin
  if to_regclass('public.app_users') is not null then
    insert into public.user_accounts (
      id,
      email,
      name,
      role,
      password_hash,
      active,
      created_at
    )
    select
      id,
      lower(trim(email)),
      name,
      role,
      password_hash,
      active,
      created_at
    from public.app_users
    on conflict do nothing;
  end if;
end
$$;