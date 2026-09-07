-- Ba thứ rút từ Forecasting của Monarch (khảo sát 07/09/2026, tài khoản thật):
-- chống ĐẾM HAI LẦN, khai chặng bằng PHẦN TRĂM, và MÀU riêng cho mốc.
--
-- ============================================================================
-- 1. life_events.replaces_minor / replaces_label — CHỐNG ĐẾM HAI LẦN
-- ============================================================================
-- Đây là sửa một con số SAI, không phải thêm tính năng.
--
-- Nút "Dùng số này" ở thẻ chặng copy CHI THẬT 12 tháng gần nhất vào
-- `annual_expense_minor` — trong đó đã có tiền thuê nhà, tiền nuôi con, mọi thứ đang
-- tiêu. Thêm mẫu "Mua nhà" là cộng khoản trả nợ LÊN TRÊN tiền thuê vẫn còn nguyên
-- trong chi nền: phần nhà ở bị tính hai lần, và không có gì trên màn hình nói ra.
--
-- Monarch giải đúng chỗ này bằng ô "Replace existing Housing expenses", và họ viết
-- hẳn cảnh báo cho vụ nuôi con: "leaving your living expenses as-is will cause those
-- costs to be counted twice, once in your baseline and once through the event".
--
-- LƯU SỐ TIỀN, KHÔNG LƯU category_id: engine Lifetime là module THUẦN (xem đầu
-- project.ts, và purity.test.ts canh nó) — nó không được biết bảng `categories`, và
-- một FK ở đây sẽ bắt nó đi tra bảng khác giữa vòng tính. `replaces_label` chỉ để câu
-- giải thích đọc được ("thay cho Nhà ở"); UI dùng danh mục thật để ĐIỀN SỐ, còn thứ
-- lưu xuống là kết quả.
alter table public.life_events
  add column if not exists replaces_minor bigint not null default 0,
  add column if not exists replaces_label text not null default '',
  -- ============================================================================
  -- 2. life_events.color — MÀU RIÊNG CHO MỐC
  -- ============================================================================
  -- Icon (0066) nói mốc này là VIỆC GÌ; màu nhóm các mốc LIÊN QUAN với nhau — mọi
  -- thứ về con một màu, mọi thứ về nhà một màu. Dùng chung bảng khoá màu của nhãn
  -- (src/features/tags/colors.ts): lưu KHOÁ ('sky'), không lưu hex, để đổi bảng màu
  -- không phải migrate dữ liệu. Chuỗi rỗng = tô theo Thu/Chi như trước.
  add column if not exists color text not null default '';

-- ============================================================================
-- 3. life_phases.income_pct_of_prev / expense_pct_of_prev — KHAI BẰNG PHẦN TRĂM
-- ============================================================================
-- "Nghỉ hưu thì chi khoảng 80% như bây giờ" là câu người ta trả lời được thật.
-- "Chi ¥3.480.000/năm vào năm 2056" thì không ai biết, nên ô đó hoặc bị bỏ trống,
-- hoặc bị điền một con số bịa mà về sau không ai nhớ nó ở đâu ra.
--
-- null = dùng số tuyệt đối trong `annual_*_minor` (mặc định, y như trước migration
-- này). Có giá trị = tính theo chặng LIỀN TRƯỚC, và `annual_*_minor` lúc đó chỉ là
-- số đã tính sẵn để đọc — engine tính lại từ phần trăm.
--
-- Chặng ĐẦU TIÊN không có chặng trước nên phần trăm vô nghĩa ở đó; engine bỏ qua và
-- dùng số tuyệt đối (xem phasePercent.ts).
alter table public.life_phases
  add column if not exists income_pct_of_prev integer,
  add column if not exists expense_pct_of_prev integer;

do $$
begin
  -- Cùng luật với `amount_minor >= 0` của 0031: dấu do `kind` mang, không do số mang.
  if not exists (select 1 from pg_constraint where conname = 'life_events_replaces_check') then
    alter table public.life_events
      add constraint life_events_replaces_check check (replaces_minor >= 0);
  end if;

  -- Trần 1000%: gấp mười lần chặng trước đã là gõ nhầm chứ không phải có ý. Sàn 0 =
  -- "chặng này không thu/chi gì" (nghỉ hưu hoàn toàn), là một câu trả lời hợp lệ.
  if not exists (select 1 from pg_constraint where conname = 'life_phases_pct_check') then
    alter table public.life_phases
      add constraint life_phases_pct_check check (
        (income_pct_of_prev is null or income_pct_of_prev between 0 and 1000)
        and (expense_pct_of_prev is null or expense_pct_of_prev between 0 and 1000)
      );
  end if;
end $$;

comment on column public.life_events.replaces_minor is
  'Số MỖI NĂM bị trừ khỏi CHI NỀN của chặng trong khoảng [start_year, end_year], theo minor units của `currency` dòng này. 0 = không thay gì (mặc định). Dùng để mốc không bị cộng CHỒNG lên khoản đang có trong chi nền — chi nền lấy từ chi thật nên đã chứa tiền thuê nhà, tiền nuôi con... Trừ suốt khoảng, KHÔNG theo nhịp lặp: mua nhà là thôi trả tiền thuê mọi năm, không phải mỗi 8 năm.';

comment on column public.life_events.replaces_label is
  'Tên khoản bị thay, để câu giải thích đọc được ("thay cho Nhà ở"). Chỉ là chữ; không phải khoá ngoại tới categories (engine Lifetime là module thuần, không biết bảng đó).';

comment on column public.life_events.color is
  'Khoá màu trong src/features/tags/colors.ts (gray|red|amber|green|sky|indigo|pink). Chuỗi rỗng = tô chip theo Thu/Chi như trước. Nhóm các mốc liên quan với nhau; icon nói mốc là việc gì.';

comment on column public.life_phases.income_pct_of_prev is
  'Thu của chặng này = bao nhiêu PHẦN TRĂM thu của chặng liền trước (đã quy về cùng đồng tiền). null = dùng annual_income_minor. Bỏ qua ở chặng đầu tiên. Luật đầy đủ ở src/features/lifetime/phasePercent.ts.';

comment on column public.life_phases.expense_pct_of_prev is
  'Như income_pct_of_prev, cho chi. Ví dụ 80 = "nghỉ hưu thì chi 80% như bây giờ".';
