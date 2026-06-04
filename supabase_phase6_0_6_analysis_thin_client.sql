-- Phase 6.0.6 analysis thin-client RPC draft
-- Purpose:
--   Move sample counting and basic recent analysis boundaries to Supabase so the
--   browser can render server-provided analysis state instead of finalizing
--   client-only averages, trends, probabilities, or confidence values.
--
-- 주의: 현재 workspace에서 전체 Supabase schema를 확정할 수 없으므로,
-- 적용 전 records/families/family_members/babies 컬럼명을 확인해야 한다.
--
-- Assumptions to verify before applying:
--   1. public.records exists.
--   2. public.records.baby_id is uuid and scopes records to one baby.
--   3. public.records has either recorded_at or created_at timestamp data.
--   4. public.records has type, subtype, amount, and deleted_at fields, or those
--      names are present in the row JSON produced by to_jsonb(records).
--   5. Existing RLS policies already restrict the caller to allowed family/baby
--      records. This function is SECURITY INVOKER on purpose and does not bypass RLS.
--
-- Return JSON shape:
-- {
--   "analysis_ready": true,
--   "usable_record_count": 10,
--   "min_required_records": 10,
--   "missing_record_count": 0,
--   "range_days": 7,
--   "metrics": {
--     "feeding_amount": { "total_ml": 700, "average_daily_ml": 100 },
--     "feeding_count": { "total": 10, "average_daily_count": 1.43 },
--     "sleep": { "record_count": 5 },
--     "diaper": { "total": 8 }
--   },
--   "summary": { "text": "Recent analysis is ready.", "warnings": [] }
-- }

create or replace function public.get_baby_analysis_v1(
  p_baby_id uuid,
  p_days integer default 7,
  p_min_records integer default 10
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 7), 31));
  v_min_records integer := greatest(1, coalesce(p_min_records, 10));
  v_window_start timestamptz := now() - (greatest(1, least(coalesce(p_days, 7), 31))::text || ' days')::interval;
  v_usable_count integer := 0;
  v_missing_count integer := 0;
  v_analysis_ready boolean := false;
  v_metrics jsonb := '{}'::jsonb;
begin
  if p_baby_id is null then
    return jsonb_build_object(
      'analysis_ready', false,
      'usable_record_count', 0,
      'min_required_records', v_min_records,
      'missing_record_count', v_min_records,
      'range_days', v_days,
      'metrics', null,
      'summary', jsonb_build_object(
        'text', 'baby_id is required.',
        'warnings', jsonb_build_array('missing_baby_id')
      )
    );
  end if;

  with usable_records as (
    select
      r.*,
      to_jsonb(r) as row_json
    from public.records r
    where r.baby_id = p_baby_id
      and nullif(to_jsonb(r)->>'deleted_at', '') is null
      and coalesce(
        case
          when (to_jsonb(r)->>'recorded_at') ~ '^\d{4}-\d{2}-\d{2}' then (to_jsonb(r)->>'recorded_at')::timestamptz
          else null
        end,
        case
          when (to_jsonb(r)->>'created_at') ~ '^\d{4}-\d{2}-\d{2}' then (to_jsonb(r)->>'created_at')::timestamptz
          else null
        end
      ) >= v_window_start
  )
  select count(*) into v_usable_count
  from usable_records;

  v_missing_count := greatest(0, v_min_records - v_usable_count);
  v_analysis_ready := v_usable_count >= v_min_records;

  if not v_analysis_ready then
    return jsonb_build_object(
      'analysis_ready', false,
      'usable_record_count', v_usable_count,
      'min_required_records', v_min_records,
      'missing_record_count', v_missing_count,
      'range_days', v_days,
      'metrics', null,
      'summary', jsonb_build_object(
        'text', '분석을 위해 ' || v_missing_count || '개의 기록이 더 필요해요!',
        'warnings', jsonb_build_array('insufficient_records')
      )
    );
  end if;

  with usable_records as (
    select
      to_jsonb(r) as row_json
    from public.records r
    where r.baby_id = p_baby_id
      and nullif(to_jsonb(r)->>'deleted_at', '') is null
      and coalesce(
        case
          when (to_jsonb(r)->>'recorded_at') ~ '^\d{4}-\d{2}-\d{2}' then (to_jsonb(r)->>'recorded_at')::timestamptz
          else null
        end,
        case
          when (to_jsonb(r)->>'created_at') ~ '^\d{4}-\d{2}-\d{2}' then (to_jsonb(r)->>'created_at')::timestamptz
          else null
        end
      ) >= v_window_start
  ),
  typed as (
    select
      row_json->>'type' as record_type,
      row_json->>'subtype' as subtype,
      case
        when nullif(row_json->>'amount', '') ~ '^[0-9]+(\.[0-9]+)?$' then nullif(row_json->>'amount', '')::numeric
        when nullif(row_json->>'amount_ml', '') ~ '^[0-9]+(\.[0-9]+)?$' then nullif(row_json->>'amount_ml', '')::numeric
        else 0
      end as amount
    from usable_records
  )
  select jsonb_build_object(
    'feeding_amount', jsonb_build_object(
      'total_ml', coalesce(sum(amount) filter (where record_type = 'feeding'), 0),
      'average_daily_ml', round((coalesce(sum(amount) filter (where record_type = 'feeding'), 0) / v_days)::numeric, 2)
    ),
    'feeding_count', jsonb_build_object(
      'total', count(*) filter (where record_type = 'feeding'),
      'average_daily_count', round((count(*) filter (where record_type = 'feeding')::numeric / v_days), 2)
    ),
    'sleep', jsonb_build_object(
      'record_count', count(*) filter (where record_type in ('sleep', 'wake', 'sleep_end'))
    ),
    'diaper', jsonb_build_object(
      'total', count(*) filter (where record_type = 'diaper'),
      'pee', count(*) filter (where record_type = 'diaper' and subtype in ('urine', 'pee', 'both')),
      'poop', count(*) filter (where record_type = 'diaper' and subtype in ('stool', 'poop', 'both'))
    )
  )
  into v_metrics
  from typed;

  return jsonb_build_object(
    'analysis_ready', true,
    'usable_record_count', v_usable_count,
    'min_required_records', v_min_records,
    'missing_record_count', 0,
    'range_days', v_days,
    'metrics', v_metrics,
    'summary', jsonb_build_object(
      'text', 'Recent analysis is ready.',
      'warnings', jsonb_build_array()
    )
  );
end;
$$;

comment on function public.get_baby_analysis_v1(uuid, integer, integer)
is 'Phase 6.0.6 draft RPC for server-side analysis sample gate and basic recent metrics. Review schema assumptions before applying.';

-- Test examples after applying in Supabase SQL Editor:
-- select public.get_baby_analysis_v1('<baby_uuid_here>'::uuid, 7, 10);
-- select (public.get_baby_analysis_v1('<baby_uuid_here>'::uuid, 7, 10)->>'analysis_ready')::boolean;
-- select public.get_baby_analysis_v1('<baby_uuid_here>'::uuid, 7, 15);
