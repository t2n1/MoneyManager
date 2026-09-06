-- ============================================================
-- Sổ Gạo — Migration 0062: Lịch sử 基準価額 theo phiên
--
-- Nối tiếp 0045 (bảng giá quỹ). 0045 có PK là `assoc_fund_cd` MỘT MÌNH, tức chỉ giữ được
-- 基準価額 MỚI NHẤT của mỗi quỹ — đủ để tính giá trị hôm nay, không đủ để vẽ một đường.
--
-- Nguồn KHÔNG PHẢI thứ mới: CSV của 投信協会
-- (`toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download?isinCd=&associFundCd=`) đã
-- được `parseNavHistory` đọc sẵn trong chế độ lấp lịch sử của fund-refresh, và nó trả ĐỦ
-- lịch sử từ ngày lập quỹ. Bảng này chỉ LƯU LẠI thứ vốn đã tải về rồi bị bỏ đi.
--
-- Đã gọi tay 06/09/2026, hai quỹ chủ app đang giữ:
--   9I31223A (楽天・プラス・S&P500)     697 phiên, 2023-10-27 (9.888)  → 2026-09-04 (19.753)
--   9I314241 (楽天・プラス・NASDAQ-100) 636 phiên, 2024-01-30 (10.000) → 2026-09-04 (18.438)
--
-- KHÁC phía cổ phiếu (0061) ở một điểm dễ chịu: không có bẫy đơn vị. CSV trả SỐ NGUYÊN yên
-- trên 10.000 口, đúng đơn vị `fund_prices.nav` — không nhân, không chia, không làm tròn.
--
-- Xem thêm: docs/quy-nhat.md
-- ============================================================

create table public.fund_price_history (
  assoc_fund_cd text   not null
    references public.funds (assoc_fund_cd) on delete cascade,
  nav_date      date   not null,
  -- YÊN trên 10.000 口, y hệt fund_prices.nav. KHÔNG chia 10.000 ở đây — chia sớm là làm
  -- tròn sớm; chia ở đúng một chỗ (fundValue / fundLineValue trong fundHoldings.ts).
  nav           bigint not null check (nav > 0),
  primary key (assoc_fund_cd, nav_date)
);

alter table public.fund_price_history enable row level security;

-- Đọc: mọi user đã đăng nhập. Ghi: không policy nào → chỉ service role (edge function).
-- Dữ liệu công khai, không thuộc user nào — cùng ngoại lệ có ý thức mà 0035 và 0045 đã ghi.
create policy "read for authenticated" on public.fund_price_history
  for select to authenticated
  using (true);

comment on column public.fund_price_history.nav is
  '基準価額, YÊN trên 10.000 口 (cùng đơn vị fund_prices.nav). Không chia sẵn.';
