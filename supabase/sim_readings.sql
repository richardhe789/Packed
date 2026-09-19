-- Fake movement readings for Live charts (table public.sim_readings).
-- Location matches location.config.json.
--
-- Remove later:
--   delete from public.sim_readings;
-- or drop the table:
--   drop table if exists public.sim_readings;

delete from public.sim_readings;

insert into public.sim_readings (
  created_at,
  avg_rssi,
  packet_count,
  density,
  location,
  src
)
select
  ts,
  (-72.5 + occ * 14 + noise * 0.15)::real,
  greatest(0, round(4400 + occ * 1800 + noise * 20))::integer,
  least(100, greatest(0, round(occ * 100 + noise)))::integer,
  'goodwin_hall',
  'sim'
from (
  select
    ts,
    ((hashtext(ts::text) % 11) - 5)::double precision as noise,
    case
      when t < 0.2 then 0.08 + t * 0.2
      when t < 0.35 then 0.12 + power((t - 0.2) / 0.15, 2) * 0.78
      when t < 0.55 then 0.86 + sin((t - 0.35) * 20) * 0.04
      when t < 0.8 then 0.9 * power(1 - (t - 0.55) / 0.25, 2) + 0.08
      else 0.08
    end as occ
  from (
    select
      ts,
      extract(epoch from (ts - (now() - interval '6 hours')))
        / extract(epoch from interval '6 hours') as t
    from generate_series(
      now() - interval '6 hours',
      now(),
      interval '30 seconds'
    ) as ts
  ) timed
) shaped;
