-- ============================================================
-- Sổ Chi Tiêu — Migration 0027: Hạn mức theo TRỤC chi (thiết yếu/linh hoạt)
-- Trước đây categories.need_level chỉ dùng để VẼ thẻ "Thiết yếu vs Linh hoạt".
-- Ba cột này biến nó thành mục tiêu đặt được: "linh hoạt ≤ 30% thu nhập".
-- Mặc định 50/30/20 — quy tắc phổ thông, người dùng sửa được trong Cài đặt.
-- ============================================================

alter table public.profiles
  -- Trần chi THIẾT YẾU tính trên thu nhập tháng (basis points; 5000 = 50.00%).
  add column if not exists target_essential_bps int not null default 5000
    check (target_essential_bps between 0 and 10000),
  -- Trần chi LINH HOẠT trên thu nhập tháng (3000 = 30.00%).
  add column if not exists target_flexible_bps int not null default 3000
    check (target_flexible_bps between 0 and 10000),
  -- Sàn TIẾT KIỆM trên thu nhập tháng (2000 = 20.00%) — đây là mốc cần VƯỢT,
  -- ngược chiều với hai cột trên. Lưu cùng đơn vị cho nhất quán.
  add column if not exists target_savings_bps int not null default 2000
    check (target_savings_bps between 0 and 10000);

comment on column public.profiles.target_essential_bps is
  'Trần chi thiết yếu trên thu nhập tháng, basis points. 5000 = 50%.';
comment on column public.profiles.target_flexible_bps is
  'Trần chi linh hoạt trên thu nhập tháng, basis points. 3000 = 30%.';
comment on column public.profiles.target_savings_bps is
  'Sàn tiết kiệm trên thu nhập tháng, basis points. 2000 = 20%. Cần VƯỢT mốc này.';
