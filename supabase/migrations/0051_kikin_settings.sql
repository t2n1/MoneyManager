-- ============================================================
-- Sổ Chi Tiêu — Migration 0051: profiles.kikin_give_rate_bps, profiles.kikin_sheet
--
-- VÌ SAO CẦN HAI CỘT NÀY
-- Màn hình 退職金 (はぐくみ企業年金) dựng số từ hai thứ mà 基金 ĐỔI THEO THỜI GIAN và app
-- không có cách nào tự biết:
--
--   1. 給付利率 — 基金 đặt lại theo TỪNG 事業年度. Giá trị 事業年度 2025 là 0,30% (30 bps),
--      và chính giấy ghi "将来の利率および利息額を保証するものではありません". Gán cứng
--      trong code thì mỗi năm phải nhớ đi sửa; quên là con số cũ nằm đó không ai biết.
--
--   2. Ba điểm hiệu chuẩn trên sheet mô phỏng cá nhân — số 社会保険料 và thuế ứng với từng
--      mức đóng, ở MỨC LƯƠNG lúc sheet được in. Lương đổi thì sheet cũ đi, và 基金 gửi
--      sheet mới. Phần thuế KHÔNG dựng lại được từ luật (đã thử ba cách, lệch cả ba — xem
--      docs/superpowers/specs/2026-08-26-man-hinh-taishokukin-design.md mục ④), nên ba
--      điểm này là dữ liệu, không phải tham số tinh chỉnh.
--
-- NULLABLE, KHÔNG default, KHÔNG backfill.
-- null = "người dùng chưa khai" → màn hình rơi về hằng số dựng sẵn trong code
-- (KIKIN_GIVE_RATE_BPS_2025 = 30 và SHEET_2025_08) và NÓI RÕ đang dùng số của ngày nào.
-- Backfill một giá trị sẽ xoá mất phân biệt giữa "người dùng đã xác nhận" và "app đang
-- dùng số mặc định" — đúng cái phân biệt hai cột này sinh ra để có. Cùng lối với
-- categories.kind (0046), accounts.is_liquid (0047) và accounts.last_reconciled_at (0050).
--
-- VÌ SAO `kikin_sheet` LÀ jsonb CHỨ KHÔNG PHẢI BẢNG RIÊNG
-- Ba dòng số, một người chỉ có một 基金, và không truy vấn nào cần lọc hay nối theo từng
-- điểm. Một bảng riêng là thêm một method vào CẢ HAI bản Repo (supabaseRepo và demoRepo)
-- mà không mua được gì. Cần lịch sử nhiều sheet thì lúc đó tách bảng — jsonb không chặn
-- đường đó.
--
-- `dated` trong jsonb là NGÀY IN TRÊN SHEET, không phải ngày người dùng gõ vào. Màn hình
-- hiện ngày đó cạnh con số, để "tiết kiệm được bao nhiêu" không âm thầm cũ đi khi lương
-- đã đổi mà sheet thì chưa.
--
-- KHÔNG dựng lại view nào. Khác 0050 (thêm cột vào `accounts` thì phải sửa view
-- `account_balances` vì view đó liệt kê cột rõ ràng), `profiles` không có view nào đọc
-- qua, và edge function không đọc hai cột này.
-- ============================================================

alter table public.profiles
  add column if not exists kikin_give_rate_bps integer,
  add column if not exists kikin_sheet jsonb;

-- Khoảng 0..10000 bps = 0..100%/năm. Suất âm là vô nghĩa với một chế độ 元本保証, và
-- trên 100%/năm thì gần như chắc chắn người dùng gõ nhầm đơn vị (0,3 thay vì 30).
alter table public.profiles
  drop constraint if exists profiles_kikin_give_rate_bps_range;
alter table public.profiles
  add constraint profiles_kikin_give_rate_bps_range
    check (kikin_give_rate_bps is null
           or (kikin_give_rate_bps >= 0 and kikin_give_rate_bps <= 10000));

comment on column public.profiles.kikin_give_rate_bps is
  '給付利率 của 企業年金 (basis points, 30 = 0,30%/năm). 基金 đặt lại theo từng 事業年度 nên '
  'đây là số người dùng khai lại khi có giấy mới. null = chưa khai → app dùng '
  'KIKIN_GIVE_RATE_BPS_2025 (30) và nói rõ đó là mức của 事業年度 2025. '
  'Nuôi: khối "Tới lúc nghỉ" của màn 退職金 (balanceAccrual.projectBalance).';

comment on column public.profiles.kikin_sheet is
  'Ba điểm hiệu chuẩn từ sheet mô phỏng cá nhân của 基金: '
  '{"dated":"2025-08","points":[{"m":0,"si":630456,"tax":308280},...]} — m = 掛金/tháng, '
  'si = 社会保険料/năm, tax = 所得税+住民税/năm. null = chưa khai → app dùng SHEET_2025_08. '
  'LƯU Ý: sheet của 基金 KHÔNG tính 子ども・子育て支援金 (0,23%, 施行 2026年4月), nên phần '
  'si thấp hơn số thật kể từ 4/2026 và "tiết kiệm được" hơi lạc quan. '
  'Nuôi: khối "Đã giảm được" và "Thử mức đóng khác" của màn 退職金 (kikinBenefit.benefitAt).';
