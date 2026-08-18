-- ============================================================
-- Sổ Chi Tiêu — Migration 0047: accounts.is_liquid (rút ra được ngay?)
--
-- VÌ SAO CẦN CỘT NÀY
-- App đang SUY "tiền rút ra được ngay" từ LOẠI tài khoản:
--     LIQUID_TYPES = ['cash', 'bank', 'ic', 'ewallet']   (health/snapshot.ts)
-- Suy như vậy sai một ca có thật và khá phổ biến: **tiền gửi có kỳ hạn** (定期預金)
-- là `type = 'bank'`, nên nó đang được đếm là tiền tiêu ngay được.
--
-- Con số sai đó chảy vào ba chỗ:
--   · Quỹ dự phòng          — mẫu số phồng, "5 tháng đệm" thành một lời hứa hão
--   · Khả năng trả nợ ngắn hạn — chỉ số DUY NHẤT đang đỏ, tức chỗ nhạy nhất
--   · Khối 01 của tab Quyết định — "phần giữ lại đi đâu" xếp sai tầng
--
-- NULLABLE có chủ ý, và KHÔNG backfill theo loại tài khoản.
-- null = "chưa ai nói", và lúc đó app rơi về phép suy theo loại như cũ. Nếu backfill
-- `is_liquid = true` cho mọi tài khoản bank thì ta vừa xoá mất sự phân biệt giữa
-- "người dùng đã xác nhận đây là tiền rút ngay được" và "app đang đoán" — đúng cái
-- phân biệt mà cột này được thêm vào để có.
--
-- Cùng lối với `categories.kind` (0046): cột mới nullable, giá trị null nghĩa là
-- chưa quyết, và app phải nói ra khi nó đang đoán.
-- ============================================================

alter table public.accounts
  add column if not exists is_liquid boolean;

comment on column public.accounts.is_liquid is
  'true = rút ra tiêu được ngay; false = phải chờ/bán (tiền gửi có kỳ hạn, đầu tư). '
  'null = chưa đặt → app suy từ `type` (cash/bank/ic/ewallet), và nói rõ là đang suy. '
  'Nuôi: quỹ dự phòng, khả năng trả nợ ngắn hạn, và khối "phần giữ lại đi đâu".';
