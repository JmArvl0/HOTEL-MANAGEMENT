-- Locks any account still carrying the shared seed hash from the initial schema.
--
-- 20260826125341_initial_hotel_schema.sql seeded all eight role accounts with one
-- identical bcrypt hash, and that migration is public on GitHub — so the Owner
-- login was derivable by anyone reading the repository. The migration itself is
-- left untouched (it is applied history), and this one neutralises its effect:
-- any row still holding that hash is deactivated and its hash discarded.
--
-- Idempotent, and a no-op on databases whose passwords were already rotated.
-- Restore access with: node scripts/set-passwords.mjs

update public.user_accounts
   set password_hash = 'locked-run-set-passwords',
       active = false
 where password_hash = '$2b$10$3BoStqdV6TDqoMO1TT.w0.xO6YVx.VkFSn8QTSaO1Fao77lsvexae';
