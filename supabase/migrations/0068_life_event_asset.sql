-- Mốc MUA MỘT TÀI SẢN: nhà, xe, đất — sinh ra một dòng TÀI SẢN và một dòng NỢ.
--
-- Trước migration này, "Mua nhà" trong Sổ Gạo là một mốc CHI thuần tuý: tài sản ròng
-- tụt bằng khoản trả trước rồi KHÔNG BAO GIỜ nhận lại căn nhà. Trên đồ thị, mua nhà
-- luôn trông tệ hơn thực tế — mà đó đúng là quyết định lớn nhất người dùng mang tới
-- màn này để hỏi.
--
-- Monarch giải chỗ này bằng sự kiện "Buy a home" sinh ra một dòng Real Estate và một
-- dòng "Buy a home (Mortgage)" tự trả dần; đọc được ngay trong bảng theo năm của họ
-- (khảo sát 07/09/2026 trên tài khoản thật).
--
-- KHÔNG THÊM "LOẠI MỐC" MỚI — thêm mấy cột tuỳ chọn vào chính mốc CHI đang có, đúng
-- cách bốn hình dạng (0066) và ô "thay cho" (0067) đã làm. Mặc định 0 nghĩa là mốc
-- thường, không mua gì, y như trước.
--
-- Khi `asset_value_minor > 0` thì nghĩa của mốc đổi như sau, và CHỈ như sau:
--   * `amount_minor` (qua bốn hình dạng) = CHI PHÍ GIỮ tài sản mỗi năm — thuế, bảo
--     hiểm, bảo trì. Đúng ô "Yearly home ownership costs" của Monarch.
--   * năm `start_year`: thêm một khoản chi bằng TIỀN TRẢ TRƯỚC (giá − phần vay);
--   * `loan_years` năm kể từ đó: thêm một khoản chi bằng tiền trả nợ mỗi năm;
--   * tài sản: `asset_value_minor`, đổi `asset_change_bps` mỗi năm;
--   * nợ: dư nợ còn lại, teo dần theo lịch niên kim.
--
-- Luật đầy đủ (kèm lý do dùng công thức đóng thay vì lặp từng tháng) ở
-- src/features/lifetime/homeAsset.ts.
alter table public.life_events
  add column if not exists asset_value_minor bigint not null default 0,
  add column if not exists asset_change_bps integer not null default 0,
  add column if not exists loan_minor bigint not null default 0,
  add column if not exists loan_rate_bps integer not null default 0,
  add column if not exists loan_years integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'life_events_asset_check') then
    alter table public.life_events
      add constraint life_events_asset_check check (
        asset_value_minor >= 0
        and loan_minor >= 0
        -- Vay nhiều hơn giá tài sản là gõ sai. `homeAsset.ts` còn kẹp lần nữa lúc chạy
        -- (dữ liệu cũ hơn ràng buộc này vẫn phải chiếu ra được số tử tế), nhưng chặn ở
        -- DB thì không có đường nào ghi thêm dòng sai mới.
        and loan_minor <= asset_value_minor
        -- Trần 60 năm: dài hơn thế thì không phải khoản vay, là gõ nhầm. 0 = không vay.
        and loan_years between 0 and 60
        -- 10000 bps = 100%/năm. Trần rộng vì có nước lãi suất rất cao, nhưng không âm.
        and loan_rate_bps between 0 and 10000
      );
  end if;
end $$;

comment on column public.life_events.asset_value_minor is
  'Giá trị tài sản mua được, minor units theo `currency` dòng này. 0 = mốc thường, không mua gì (mặc định). Khác 0 thì `amount_minor` đổi nghĩa thành CHI PHÍ GIỮ tài sản mỗi năm — xem src/features/lifetime/homeAsset.ts.';

comment on column public.life_events.asset_change_bps is
  'Giá trị tài sản đổi bao nhiêu mỗi năm, basis points. Nhà +100 (1%/năm); xe −1500 (−15%/năm). 0 = giữ nguyên giá.';

comment on column public.life_events.loan_minor is
  'Phần đi vay của giá tài sản. 0 = trả thẳng bằng tiền mặt (cả giá ra trong năm mua). Trả trước = asset_value_minor − loan_minor.';

comment on column public.life_events.loan_rate_bps is
  'Lãi suất vay, basis points/năm. Tiền trả mỗi năm tính theo niên kim THÁNG rồi nhân 12 — khoản vay mua nhà thật trả theo tháng, niên kim theo năm cho ra số lệch vài phần trăm so với giấy tờ ngân hàng.';

comment on column public.life_events.loan_years is
  'Kỳ hạn vay, tính bằng NĂM. 0 = không vay.';
