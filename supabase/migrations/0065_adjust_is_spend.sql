-- Khoản "Điều chỉnh số dư" này là TIỀN ĐÃ TIÊU MÀ QUÊN GHI, hay chỉ là chỉnh lại số dư?
--
-- Cùng một hành động của người dùng (nhập số dư thực tế) mang hai ý nghĩa hoàn toàn khác
-- nhau, mà chỉ người ghi biết là ý nào:
--
--   1. "Ví tôi hụt ¥3.000 so với sổ"  → đúng là tiêu mà quên ghi, PHẢI vào tổng Chi.
--   2. "Tôi vừa khai số dư ban đầu"   → không tiêu đồng nào, KHÔNG được vào tổng Chi.
--
-- Trước migration này `chiChuaGhi.ts` coi MỌI khoản bù là ý (1). Hậu quả đo được trên sổ
-- thật ngày 07/09/2026:
--
--   * Tháng 8: chi thật ¥303.936, nhưng một lượt khai số dư ban đầu ngày 05/08 (năm dòng,
--     tạo cùng một phút 07/08 08:21, trong đó Yucho −¥20.846.401) bị cộng vào thành
--     ¥16.364.804 — phồng 54 lần. Thẻ ba đường đọc ra "1903% / −1803%".
--   * Tháng 9: chi thật ¥144.294, nhưng một lần đối chiếu tài khoản VND (+213.121.047 đ
--     ≈ ¥1.29 triệu) trừ ngược thành −¥1.141.798 — CHI ÂM.
--
-- MẶC ĐỊNH `false`, và đó là lựa chọn có chủ đích cho cả dữ liệu cũ:
-- mọi khoản bù đang có trong sổ đều được tạo khi tính năng "Chưa ghi rõ" chưa tồn tại
-- (nó lên ngày 05/09/2026), tức là người dùng bấm đối chiếu mà KHÔNG hề biết nó sẽ bị
-- tính là chi tiêu. Suy ngược ý định cho họ là bịa; trả về "không phải chi tiêu" là đưa
-- tổng Chi về đúng cái sàn mà nó vốn là.
alter table public.transactions
  add column if not exists adjust_is_spend boolean not null default false;

comment on column public.transactions.adjust_is_spend is
  'Chỉ có nghĩa với khoản danh mục "Điều chỉnh số dư": true = phần chênh này là tiền đã tiêu mà quên ghi (vào tổng Chi qua chiChuaGhi.ts); false = chỉ chỉnh lại số dư, không phải chi tiêu. Mặc định false.';
