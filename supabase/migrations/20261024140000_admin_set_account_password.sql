-- 20261024140000_admin_set_account_password.sql
--
-- Governed exception to the "admin never touches passwords" rule: System
-- Administration can set a staff account's password directly from Users &
-- Roles (the Recovery dialog), fully audited. Scope is deliberately narrow:
--
-- - Actor must be an active owner/admin (null-safe guard, per project rule).
-- - Target must be non-guest, non-owner, non-admin staff; an admin actor
--   cannot touch owner/admin accounts (PROTECTED_ACCOUNT_FORBIDDEN, same as
--   the status/role RPCs), and nobody can set their own password here
--   (SELF_PASSWORD_CHANGE_FORBIDDEN — use your own recovery link).
-- - Guest accounts are refused (GUEST_PASSWORD_FORBIDDEN): guests own their
--   credentials through self-service recovery.
-- - Optimistic version check (ACCOUNT_STALE) + required reason, same as the
--   other governance RPCs. The plaintext password is hashed with bcrypt
--   (cost 12) in the route; only the hash reaches this function, which
--   re-checks its shape (INVALID_PASSWORD_HASH, same convention as
--   complete_account_recovery).
-- - One transaction: set the hash, bump auth_version (kills the target's
--   live sessions), stamp updated_at. Activation flags are left untouched —
--   activation stays a separate Lifecycle decision. The audit row carries
--   safe values only (never a hash or plaintext).
-- Grants mirror the other governance RPCs (service_role only).

create or replace function public.admin_set_account_password(p_target_user_id uuid,p_password_hash text,p_reason text,p_expected_version integer,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare actor text;t user_accounts%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 if length(coalesce(p_password_hash,''))<50 then raise exception'INVALID_PASSWORD_HASH';end if;
 if nullif(trim(p_reason),'')is null then raise exception'INVALID_PASSWORD_REASON';end if;
 select * into t from user_accounts where id=p_target_user_id for update;if not found then raise exception'ACCOUNT_NOT_FOUND';end if;
 if t.auth_version<>p_expected_version then raise exception'ACCOUNT_STALE';end if;
 if t.id=p_actor_user_id then raise exception'SELF_PASSWORD_CHANGE_FORBIDDEN';end if;
 if t.role='guest' then raise exception'GUEST_PASSWORD_FORBIDDEN';end if;
 if actor='admin' and t.role in('owner','admin')then raise exception'PROTECTED_ACCOUNT_FORBIDDEN';end if;
 update user_accounts set password_hash=p_password_hash,auth_version=auth_version+1,updated_at=now()where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_set_account_password','user_account',t.id::text,jsonb_build_object('authVersion',t.auth_version),jsonb_build_object('authVersion',t.auth_version+1,'reason',trim(p_reason)));
 return jsonb_build_object('id',t.id,'version',t.auth_version+1);end$$;
revoke all on function public.admin_set_account_password(uuid,text,text,integer,uuid)from public;
do $$declare v_role text;begin
 foreach v_role in array array['anon','authenticated'] loop
  if to_regrole(v_role) is not null then execute format('revoke all on function public.admin_set_account_password(uuid,text,text,integer,uuid) from %I',v_role);end if;
 end loop;
end$$;
grant execute on function public.admin_set_account_password(uuid,text,text,integer,uuid)to service_role;
