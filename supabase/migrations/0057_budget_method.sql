-- Phương pháp phân bổ ngân sách (spec docs/superpowers/specs/2026-09-03-phuong-phap-phan-bo-design.md).
-- budget_targets chỉ chứa mốc NGƯỜI DÙNG đã chỉnh (bps theo khoá khoản);
-- khoá thiếu = dùng mặc định của phương pháp trong code (resolveMethod).

alter table public.profiles
  add column if not exists budget_method text not null default '50-30-20',
  add column if not exists budget_targets jsonb not null default '{}'::jsonb;

-- Giữ mốc đã chỉnh của 50/30/20 cũ; ai để nguyên mặc định thì '{}'.
update public.profiles set budget_targets = jsonb_strip_nulls(jsonb_build_object(
  'essential', case when target_essential_bps <> 5000 then target_essential_bps end,
  'flexible',  case when target_flexible_bps  <> 3000 then target_flexible_bps  end,
  'savings',   case when target_savings_bps   <> 2000 then target_savings_bps   end
));

-- Bỏ hẳn ba cột cũ: hai nơi lưu cùng một thứ thì sớm muộn lệch nhau.
alter table public.profiles
  drop column target_essential_bps,
  drop column target_flexible_bps,
  drop column target_savings_bps;

-- need_level: 2 nhãn -> 5. Ràng buộc sinh từ 0025 (check inline không tên -> Postgres
-- tự đặt categories_need_level_check). Chạy lại file này thì drop-if-exists rồi add lại
-- là an toàn (add đứng sau, không đụng constraint khác tên). Nếu tên constraint khác đi:
--   select conname from pg_constraint where conrelid = 'public.categories'::regclass;
alter table public.categories drop constraint if exists categories_need_level_check;
alter table public.categories add constraint categories_need_level_check
  check (need_level in ('essential','flexible','education','giving','buffer'));
