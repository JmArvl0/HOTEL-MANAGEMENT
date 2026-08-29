alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('pending','confirmed','checked_in','checked_out','cancelled','no_show'));

create index if not exists reservations_staff_queue_idx
  on public.reservations(status, check_in, check_out, created_at desc);
create index if not exists reservations_source_created_idx
  on public.reservations(source, created_at desc);
