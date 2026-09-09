-- Khối chặng đời trên trục thời gian mang MÀU và ICON riêng (bản vẽ 1c).
--
-- Vì sao cần: bản vẽ phân biệt CHẶNG với MỐC chỉ bằng mắt — hai dải màu khác nhau rõ
-- rệt. Mốc đã có `icon` (0066) và `color` (0067); chặng thì chưa có gì, nên trước đây
-- dải chặng chỉ tô nền so le theo THỨ TỰ. Tô theo thứ tự thì chèn một chặng vào giữa là
-- đổi màu toàn bộ các chặng sau nó — màu không dính vào chặng, nên không dùng để nhớ.
--
-- Dùng chung bảng khoá màu của nhãn (src/features/tags/colors.ts), y như 0067 đã làm
-- cho mốc: lưu KHOÁ ('sky', 'green'...), không lưu hex. Hex trong DB thì đổi bảng màu
-- của app là mọi dữ liệu cũ lệch tông, và không có đường nào tô lại cho light mode.
--
-- '' = CHƯA CHỌN, tô theo thứ tự như trước 0069. Dữ liệu cũ hiện y như cũ.
alter table public.life_phases
  add column if not exists color text not null default '',
  add column if not exists icon text not null default '';
