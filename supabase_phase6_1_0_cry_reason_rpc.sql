-- 주의: 현재 workspace에서 전체 Supabase schema를 확정할 수 없으므로 적용 전 records, babies, families, family_members 컬럼명을 확인해야 한다.
-- Phase 6.1.0 reference RPC only. Do not apply blindly to production.
-- Expected assumptions:
--   records.id uuid or text
--   records.baby_id uuid
--   records.type text
--   records.subtype text nullable
--   records.amount_ml numeric nullable, or amount numeric nullable
--   records.recorded_at timestamptz, or created_at timestamptz
--   records.deleted_at timestamptz nullable
--   family_members.user_id uuid and family_members.family_id uuid, if membership checks are required
--   babies.id uuid and babies.family_id uuid, if membership checks are required

create or replace function public.get_cry_reason_v1(
  p_baby_id uuid,
  p_min_records integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_records integer := greatest(coalesce(p_min_records, 10), 1);
  v_now timestamptz := now();
  v_usable_count integer := 0;
  v_missing_count integer := 0;
  v_last_feeding_at timestamptz;
  v_last_burp_at timestamptz;
  v_last_diaper_at timestamptz;
  v_last_wake_at timestamptz;
  v_last_sleep_at timestamptz;
  v_last_feeding_amount numeric;
  v_avg_feeding_amount numeric;
  v_feeding_minutes numeric;
  v_burp_minutes numeric;
  v_diaper_minutes numeric;
  v_wake_minutes numeric;
  v_feeding_score numeric := 10;
  v_burp_score numeric := 12;
  v_diaper_score numeric := 10;
  v_sleepy_score numeric := 10;
  v_total_score numeric := 0;
  v_reasons jsonb;
begin
  if p_baby_id is null then
    return jsonb_build_object(
      'analysis_ready', false,
      'usable_record_count', 0,
      'min_required_records', v_min_records,
      'missing_record_count', v_min_records,
      'mode', 'server',
      'generated_at', v_now,
      'summary', '서버 분석을 위해 아기 정보가 필요해요.',
      'reasons', '[]'::jsonb
    );
  end if;

  /*
    Optional security hardening:
    If this RPC is SECURITY DEFINER, verify that auth.uid() belongs to the baby family.
    Uncomment and adjust column names after confirming the deployed schema.

    if not exists (
      select 1
      from public.babies b
      join public.family_members fm on fm.family_id = b.family_id
      where b.id = p_baby_id
        and fm.user_id = auth.uid()
    ) then
      raise exception 'not allowed';
    end if;
  */

  with usable_records as (
    select *
    from public.records r
    where r.baby_id = p_baby_id
      and r.deleted_at is null
      and coalesce(r.recorded_at, r.created_at) >= v_now - interval '7 days'
      and r.type in ('feeding', 'burp', 'diaper', 'sleep', 'sleep_start', 'wake', 'sleep_end')
      and coalesce(r.recorded_at, r.created_at) is not null
  )
  select count(*) into v_usable_count
  from usable_records;

  v_missing_count := greatest(0, v_min_records - v_usable_count);

  if v_usable_count < v_min_records then
    return jsonb_build_object(
      'analysis_ready', false,
      'usable_record_count', v_usable_count,
      'min_required_records', v_min_records,
      'missing_record_count', v_missing_count,
      'mode', 'server',
      'generated_at', v_now,
      'summary', '분석을 위해 ' || v_missing_count || '개의 기록이 더 필요해요!',
      'reasons', '[]'::jsonb,
      'disclaimer', '참고용 안내예요. 아기의 상태가 평소와 다르면 전문가와 상의해 주세요.'
    );
  end if;

  select coalesce(r.recorded_at, r.created_at), coalesce(r.amount_ml, r.amount)
    into v_last_feeding_at, v_last_feeding_amount
  from public.records r
  where r.baby_id = p_baby_id
    and r.deleted_at is null
    and r.type = 'feeding'
    and coalesce(r.recorded_at, r.created_at) >= v_now - interval '7 days'
  order by coalesce(r.recorded_at, r.created_at) desc
  limit 1;

  select avg(coalesce(r.amount_ml, r.amount))
    into v_avg_feeding_amount
  from public.records r
  where r.baby_id = p_baby_id
    and r.deleted_at is null
    and r.type = 'feeding'
    and coalesce(r.amount_ml, r.amount) > 0
    and coalesce(r.recorded_at, r.created_at) >= v_now - interval '7 days';

  select coalesce(r.recorded_at, r.created_at)
    into v_last_burp_at
  from public.records r
  where r.baby_id = p_baby_id
    and r.deleted_at is null
    and r.type = 'burp'
    and coalesce(r.recorded_at, r.created_at) >= v_now - interval '7 days'
  order by coalesce(r.recorded_at, r.created_at) desc
  limit 1;

  select coalesce(r.recorded_at, r.created_at)
    into v_last_diaper_at
  from public.records r
  where r.baby_id = p_baby_id
    and r.deleted_at is null
    and r.type = 'diaper'
    and coalesce(r.recorded_at, r.created_at) >= v_now - interval '7 days'
  order by coalesce(r.recorded_at, r.created_at) desc
  limit 1;

  select coalesce(r.recorded_at, r.created_at)
    into v_last_wake_at
  from public.records r
  where r.baby_id = p_baby_id
    and r.deleted_at is null
    and r.type in ('wake', 'sleep_end')
    and coalesce(r.recorded_at, r.created_at) >= v_now - interval '7 days'
  order by coalesce(r.recorded_at, r.created_at) desc
  limit 1;

  select coalesce(r.recorded_at, r.created_at)
    into v_last_sleep_at
  from public.records r
  where r.baby_id = p_baby_id
    and r.deleted_at is null
    and r.type in ('sleep', 'sleep_start')
    and coalesce(r.recorded_at, r.created_at) >= v_now - interval '7 days'
  order by coalesce(r.recorded_at, r.created_at) desc
  limit 1;

  v_feeding_minutes := case when v_last_feeding_at is null then null else extract(epoch from (v_now - v_last_feeding_at)) / 60 end;
  v_burp_minutes := case when v_last_burp_at is null then null else extract(epoch from (v_now - v_last_burp_at)) / 60 end;
  v_diaper_minutes := case when v_last_diaper_at is null then null else extract(epoch from (v_now - v_last_diaper_at)) / 60 end;
  v_wake_minutes := case when v_last_wake_at is null then null else extract(epoch from (v_now - v_last_wake_at)) / 60 end;

  v_feeding_score := case
    when v_feeding_minutes is null then 70
    when v_feeding_minutes <= 60 then 10
    when v_feeding_minutes >= 180 then 100
    else 10 + ((v_feeding_minutes - 60) / 120) * 90
  end;
  if v_last_feeding_amount is not null and v_avg_feeding_amount is not null and v_last_feeding_amount < v_avg_feeding_amount * 0.8 then
    v_feeding_score := v_feeding_score + 12;
  end if;

  v_burp_score := case
    when v_last_feeding_at is not null
      and v_feeding_minutes <= 45
      and (v_last_burp_at is null or v_last_burp_at < v_last_feeding_at) then 78
    when v_last_feeding_at is not null and v_feeding_minutes <= 45 then 15
    when v_burp_minutes is not null and v_burp_minutes > 180 then 28
    else 12
  end;
  if v_last_feeding_amount is not null and v_last_feeding_amount >= 120 and v_feeding_minutes <= 45 then
    v_burp_score := v_burp_score + 8;
  end if;

  v_diaper_score := case
    when v_diaper_minutes is null then 70
    when v_diaper_minutes <= 60 then 10
    when v_diaper_minutes >= 240 then 90
    else 10 + ((v_diaper_minutes - 60) / 180) * 80
  end;

  v_sleepy_score := case
    when v_wake_minutes is null then 70
    when v_wake_minutes <= 45 then 10
    when v_wake_minutes >= 150 then 95
    else 10 + ((v_wake_minutes - 45) / 105) * 85
  end;
  if v_last_sleep_at is not null and v_last_wake_at is not null and v_last_sleep_at > v_last_wake_at then
    v_sleepy_score := 12;
  end if;

  v_total_score := greatest(v_feeding_score + v_burp_score + v_diaper_score + v_sleepy_score, 1);

  v_reasons := jsonb_build_array(
    jsonb_build_object(
      'key', 'feeding',
      'label', '수유',
      'percent', round(v_feeding_score / v_total_score * 100),
      'score', round((v_feeding_score / v_total_score)::numeric, 2),
      'detail', case when v_feeding_minutes is null then '수유 기록이 더 쌓이면 더 안정적으로 볼 수 있어요.' else '마지막 수유 후 ' || round(v_feeding_minutes) || '분 지났어요.' end
    ),
    jsonb_build_object(
      'key', 'burp',
      'label', '트림',
      'percent', round(v_burp_score / v_total_score * 100),
      'score', round((v_burp_score / v_total_score)::numeric, 2),
      'detail', '최근 수유 후 트림 기록을 함께 확인해보세요.'
    ),
    jsonb_build_object(
      'key', 'diaper',
      'label', '기저귀',
      'percent', round(v_diaper_score / v_total_score * 100),
      'score', round((v_diaper_score / v_total_score)::numeric, 2),
      'detail', case when v_diaper_minutes is null then '기저귀 기록이 더 쌓이면 더 안정적으로 볼 수 있어요.' else '마지막 기저귀 기록 후 ' || round(v_diaper_minutes) || '분 지났어요.' end
    ),
    jsonb_build_object(
      'key', 'sleepy',
      'label', '졸림',
      'percent', round(v_sleepy_score / v_total_score * 100),
      'score', round((v_sleepy_score / v_total_score)::numeric, 2),
      'detail', case when v_wake_minutes is null then '깨어남 기록이 더 쌓이면 졸림 가능성을 더 잘 볼 수 있어요.' else '깨어난 지 ' || round(v_wake_minutes) || '분 지났어요.' end
    )
  );

  return jsonb_build_object(
    'analysis_ready', true,
    'usable_record_count', v_usable_count,
    'min_required_records', v_min_records,
    'missing_record_count', 0,
    'mode', 'server',
    'generated_at', v_now,
    'summary', '최근 기록을 바탕으로 추측했어요.',
    'reasons', v_reasons,
    'disclaimer', '참고용 안내예요. 아기의 상태가 평소와 다르면 전문가와 상의해 주세요.'
  );
end;
$$;

comment on function public.get_cry_reason_v1(uuid, integer)
is 'Phase 6.1.0 reference RPC for non-diagnostic cry reason guidance. Verify schema and RLS before production use.';

-- Test examples after schema verification:
-- select public.get_cry_reason_v1('00000000-0000-0000-0000-000000000000'::uuid, 10);
-- select jsonb_pretty(public.get_cry_reason_v1('<baby-id>'::uuid, 10));
