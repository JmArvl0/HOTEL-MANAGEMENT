-- AI Executive Shift Summary: allow the new audit feature value.
alter table public.ai_interactions drop constraint if exists ai_interactions_feature_check;
alter table public.ai_interactions add constraint ai_interactions_feature_check
  check (feature in ('brief','ask','explain','report_summary','executive_shift_summary','guest_concierge','guest_smart_request'));
