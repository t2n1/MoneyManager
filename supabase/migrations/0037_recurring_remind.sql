-- ============================================================
-- Sổ Chi Tiêu — Migration 0037: Khoản định kỳ kiểu NHẮC (không tự ghi)
--
-- `recurring_rules` từ 0008 tới nay chỉ có một kiểu: tới hạn là TỰ SINH giao dịch
-- (runRecurringCatchUp chạy khi mở app). Kiểu đó đúng với khoản tự động rời tài
-- khoản — tiền nhà chuyển tự động, phí thuê bao trừ thẻ.
--
-- Nó SAI với khoản phải tự tay làm: "gửi tiền về cho má" tháng nào cũng tới hạn,
-- nhưng số tiền mỗi lần một khác, và quan trọng hơn — app không được ghi là đã gửi
-- khi người ta chưa gửi. Sổ tự bịa ra một khoản chi chưa xảy ra thì số dư sai, mà
-- sai kiểu đó không ai phát hiện cho tới lúc đối chiếu ngân hàng.
--
-- `mode` tách hai việc đó:
--   'auto'   — như cũ, tới hạn tự sinh giao dịch. Mặc định, nên MỌI quy tắc đang
--              có giữ nguyên hành vi.
--   'remind' — tới hạn KHÔNG sinh gì cả, chỉ đẩy một việc-cần-làm lên chuông.
--              Người dùng bấm "Ghi khoản này" → mở form đã điền sẵn (sửa được số
--              tiền) → ghi xong mới đẩy `last_generated_on` sang kỳ đó.
--
-- `last_generated_on` giữ nguyên tên dù với kiểu 'remind' nó mang nghĩa "kỳ đã xác
-- nhận gần nhất": đổi tên cột là phải sửa engine catch-up, radar và mọi chỗ đọc nó,
-- đổi lấy đúng một từ đẹp hơn.
-- ============================================================

alter table public.recurring_rules
  add column if not exists mode text not null default 'auto'
    check (mode in ('auto', 'remind'));

-- Nhắc trước bao nhiêu ngày. 0 = chỉ nhắc đúng ngày đến hạn và các ngày sau đó.
-- Trần 30 ngày: nhắc sớm hơn một tháng thì với chu kỳ hàng tháng nó nhắc quanh năm,
-- và một lời nhắc không bao giờ tắt là một lời nhắc bị bỏ qua.
alter table public.recurring_rules
  add column if not exists remind_days_before int not null default 0
    check (remind_days_before between 0 and 30);

comment on column public.recurring_rules.mode is
  'auto = tới hạn tự sinh giao dịch (như cũ) · remind = chỉ nhắc, người dùng tự ghi rồi xác nhận.';
comment on column public.recurring_rules.remind_days_before is
  'Chỉ dùng với mode = remind: nhắc trước ngày đến hạn bấy nhiêu ngày (0 = đúng ngày).';
