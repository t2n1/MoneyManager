-- ============================================================
-- Sổ Gạo — Migration 0071: dấu "đã xem" trên hoá đơn thẻ
--
-- VÌ SAO CẦN: trang Đối chiếu sao kê chỉ ra dòng lệch, nhưng phần lớn dòng lệch là
-- khác biệt cấu trúc đã hiểu (ví có số dư, hoàn tiền nhà thẻ gộp…) — tháng sau nạp lại
-- cùng file, app hỏi lại đúng những dòng đó. Người dùng cần nói một lần "đã xem, đúng là
-- vậy" và app phải nhớ.
--
-- VÌ SAO LƯU TRÊN card_bills CHỨ KHÔNG BẢNG RIÊNG: dấu này thuộc về MỘT kỳ của MỘT thẻ,
-- đúng khoá (account_id, close_date) của hoá đơn; một mảng khoá dòng là đủ, không có quan
-- hệ nào khác để tra. Tách bảng là thêm một join cho một cột.
--
-- KHOÁ DÒNG (định nghĩa ở src/features/assets/statementDismiss.ts):
--   'tx:<uuid giao dịch>'                 dòng sổ thừa, VÀ hoàn tiền phía sổ đã biết tx gốc
--                                         (refundDiffs[].tx)
--   'stm:<ngày>|<số tiền>|<tên NFKC>'     dòng thẻ thiếu
--   'rtx:<ngày>|<số tiền>|<ghi chú>'      chỉ dự phòng: hoàn tiền phía sổ KHÔNG có tx đính
--                                         kèm (refundDiffs[].tx undefined)
--   'topups:<ngày chốt>'                  cụm nạp ví chưa ghép
--
-- Xem: docs/superpowers/specs/2026-09-13-doi-chieu-sao-ke-the-2-design.md §7
-- ============================================================

alter table public.card_bills
  add column if not exists dismissed jsonb   not null default '[]'::jsonb,
  add column if not exists reviewed  boolean not null default false;

-- `dismissed` phải luôn là mảng jsonb: một giá trị khác dạng (object, string, số...) làm
-- `new Set(dismissed)` phía trang (statementDismiss.ts) ném lỗi hoặc ra kết quả rác im lặng.
alter table public.card_bills
  add constraint card_bills_dismissed_is_array check (jsonb_typeof(dismissed) = 'array');

comment on column public.card_bills.dismissed is
  'Mảng khoá dòng lệch người dùng đã bấm Bỏ qua. Định dạng khoá: xem statementDismiss.ts.';
comment on column public.card_bills.reviewed is
  'true = kỳ không còn dòng nào chưa xử lý (khớp, giải thích được, hoặc đã bỏ qua). App tính lại mỗi lần ghi hoá đơn.';
