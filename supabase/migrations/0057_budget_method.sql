-- Phương pháp phân bổ ngân sách (spec docs/superpowers/specs/2026-09-03-phuong-phap-phan-bo-design.md).
-- budget_targets chỉ chứa mốc NGƯỜI DÙNG đã chỉnh (bps theo khoá khoản);
-- khoá thiếu = dùng mặc định của phương pháp trong code (resolveMethod).
--
-- File này phải CHẠY LẠI ĐƯỢC từ bất kỳ trạng thái nào: nó được dán tay vào SQL Editor
-- và cũng được `supabase db push` chạy — hai đường có thể cùng chạy một file (đã xảy ra
-- thật ngày 2026-09-03: dashboard chạy trước, db push chạy lại và chết ở câu UPDATE vì
-- ba cột nguồn đã bị drop). Nên mọi bước đều tự hỏi "còn gì để làm không" trước khi làm.

alter table public.profiles
  add column if not exists budget_method text not null default '50-30-20',
  add column if not exists budget_targets jsonb not null default '{}'::jsonb;

-- Giữ mốc đã chỉnh của 50/30/20 cũ; ai để nguyên mặc định thì '{}'.
-- Bọc trong DO + kiểm tra cột nguồn còn tồn tại: chạy lại sau khi đã drop thì không có
-- gì để chép nữa (lần chạy đầu đã chép xong), bỏ qua là đúng chứ không phải mất dữ liệu.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'target_essential_bps'
  ) then
    update public.profiles set budget_targets = jsonb_strip_nulls(jsonb_build_object(
      'essential', case when target_essential_bps <> 5000 then target_essential_bps end,
      'flexible',  case when target_flexible_bps  <> 3000 then target_flexible_bps  end,
      'savings',   case when target_savings_bps   <> 2000 then target_savings_bps   end
    ));
  end if;
end $$;

-- Bỏ hẳn ba cột cũ: hai nơi lưu cùng một thứ thì sớm muộn lệch nhau.
alter table public.profiles
  drop column if exists target_essential_bps,
  drop column if exists target_flexible_bps,
  drop column if exists target_savings_bps;

-- need_level: 2 nhãn -> 5. Ràng buộc sinh từ 0025 (check inline không tên -> Postgres
-- tự đặt categories_need_level_check). Drop-if-exists rồi add lại là an toàn khi chạy
-- lại (add đứng ngay sau drop). Nếu tên constraint khác đi:
--   select conname from pg_constraint where conrelid = 'public.categories'::regclass;
alter table public.categories drop constraint if exists categories_need_level_check;
alter table public.categories add constraint categories_need_level_check
  check (need_level in ('essential','flexible','education','giving','buffer'));
