-- ============================================================
-- Sổ Chi Tiêu — Migration 0036: Ngân sách cho NHÃN
--
-- Hạn mức theo danh mục (bảng `budgets`, 0002) trả lời "tháng này ăn uống bao nhiêu
-- là đủ". Nhãn hỏi câu khác hẳn: "cả chuyến về VN cho phép tiêu bao nhiêu" — tiền
-- nằm rải ở vé máy bay, quà, phong bì, tức BA danh mục khác nhau, nên không hạn mức
-- danh mục nào chặn được nó.
--
-- HAI KIỂU KỲ, do từng nhãn tự chọn (`budget_period`):
--   'total'   — trần cho TOÀN BỘ đời nhãn, không reset. Hợp với nhãn theo dịp
--               ("Về VN 2026", "Đám cưới"): tiêu dần qua nhiều tháng, cái cần biết
--               là đã tiêu bao nhiêu trên tổng cho phép.
--   'monthly' — trần cho MỖI THÁNG, hết tháng reset. Hợp với nhãn lặp đều
--               ("Cà phê", "Chi chung với người yêu").
--
-- Vì sao là CỘT trên `tags` chứ không phải bảng theo tháng như `budgets`: hạn mức
-- nhãn là một con số đặt kèm cái nhãn, không phải thứ ngồi đặt lại mỗi tháng. Kiểu
-- 'monthly' cố ý dùng CÙNG MỘT số cho mọi tháng; cần tháng này khác tháng kia thì
-- đó là hạn mức danh mục, không phải nhãn.
--
-- Đơn vị: minor units theo BASE CURRENCY của hồ sơ — giống `budgets.amount`, vì chi
-- theo nhãn đã được quy đổi về base trước khi cộng (xem features/tags/aggregate.ts).
-- ============================================================

alter table public.tags
  add column if not exists budget_amount bigint check (budget_amount > 0);

-- not null + default: đọc cột này không bao giờ phải xử lý null, và nhãn cũ mặc
-- định là 'total' — kiểu hợp với đúng thứ nhãn sinh ra để làm (theo dịp).
-- Cột chỉ có nghĩa khi budget_amount không null; không đặt trần thì giá trị ở đây
-- là rác vô hại, KHÔNG được coi là "có ngân sách kiểu total".
alter table public.tags
  add column if not exists budget_period text not null default 'total'
    check (budget_period in ('total', 'monthly'));

comment on column public.tags.budget_amount is
  'Trần chi cho nhãn (minor units theo base currency). null = không đặt trần.';
comment on column public.tags.budget_period is
  'Kỳ của trần: total = cả đời nhãn (không reset) · monthly = mỗi tháng. Chỉ có nghĩa khi budget_amount không null.';
