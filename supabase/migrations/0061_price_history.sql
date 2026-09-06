-- ============================================================
-- Sổ Gạo — Migration 0061: Lịch sử giá theo ngày, và chỉ số thị trường
--
-- Nối tiếp 0035 (bảng giá cổ phiếu). 0035 có PK là `symbol` MỘT MÌNH, tức nó chỉ giữ
-- được giá MỚI NHẤT của mỗi mã. Đủ để tính giá trị hôm nay, không đủ để vẽ một đường.
--
-- Nguồn: dchart của VNDirect (`dchart-api.vndirect.com.vn/dchart/history`). Đã gọi tay
-- 06/09/2026: VNINDEX ra 2.252 phiên từ 2017-08-24, HPG ra 2.662 phiên từ 2016-01-04, và
-- bar cuối của HPG khớp đúng `stock_prices.price` mà app đang hiện. Yahoo — nguồn mà
-- stock-refresh đang dùng cho giá hiện tại — KHÔNG dùng được cho chỉ số: `^VNINDEX.VN`
-- có thật nhưng `validRanges` chỉ ['1d','5d'].
--
-- Xem thêm: docs/superpowers/specs/2026-09-06-trang-dau-tu-design.md
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lịch sử giá cổ phiếu
--
-- Không có user_id, cùng ngoại lệ có ý thức mà 0035 đã ghi: giá là dữ liệu công khai,
-- giống nhau với mọi user, và không suy ra được ai giữ gì từ nó.
--
-- ĐƠN VỊ LÀ ĐỒNG/CỔ, y hệt `stock_prices.price` — dchart trả nghìn đồng (21.7) nên phía
-- ghi phải nhân 1.000. Giữ chung một đơn vị với bảng giá hiện tại là để hai chỗ so được
-- với nhau mà không ai phải nhớ hệ số.
--
-- Giá ở đây là giá ĐÃ ĐIỀU CHỈNH cổ tức/chia tách (dchart trả vậy). Đúng cho việc đo lợi
-- nhuận, nhưng xem §10 của spec: nếu sổ lệnh thiếu một lần chia tách thì khối lượng dựng
-- lại được sẽ thấp hơn thực tế ở giai đoạn trước lần chia đó.
-- ------------------------------------------------------------
create table public.stock_price_history (
  symbol       text   not null,
  trading_date date   not null,
  close        bigint not null check (close > 0),
  primary key (symbol, trading_date)
);

alter table public.stock_price_history enable row level security;

-- Đọc: mọi user đã đăng nhập. Ghi: không policy nào → chỉ service role (edge function).
create policy "read for authenticated" on public.stock_price_history
  for select to authenticated
  using (true);

comment on column public.stock_price_history.close is
  'Giá đóng cửa ĐÃ ĐIỀU CHỈNH, ĐỒNG/cổ (cùng đơn vị stock_prices.price).';

-- ------------------------------------------------------------
-- 2. Chỉ số thị trường
--
-- Bảng RIÊNG chứ không nhét VNINDEX vào bảng trên, và lý do là đơn vị: chỉ số là ĐIỂM có
-- hai số lẻ (1853,08), còn giá cổ phiếu là đồng. Repo không dùng số thực cho tiền nên chỉ
-- số phải nhân 100. Một cột mang hai hệ số tuỳ theo dòng là kiểu lỗi không test nào bắt
-- được và không màn nào hiện ra — nó chỉ ra một biểu đồ sai hình.
-- ------------------------------------------------------------
create table public.index_prices (
  index_code   text   not null,
  trading_date date   not null,
  close_x100   bigint not null check (close_x100 > 0),
  primary key (index_code, trading_date)
);

alter table public.index_prices enable row level security;

create policy "read for authenticated" on public.index_prices
  for select to authenticated
  using (true);

comment on column public.index_prices.close_x100 is
  'Điểm số × 100 (1853,08 → 185308). Nhân 100 vì repo không dùng số thực.';

-- ------------------------------------------------------------
-- 3. Ngành của mã — về đúng bảng đã trả lời "mã này là gì"
--
-- `stock_prices` đang giữ `name` (tên công ty) nên ngành thuộc về đây, không cần bảng thứ
-- ba. Nguồn: `api-finfo.vndirect.com.vn/v4/industry_classification`.
-- Rỗng = chưa tra được; UI gom vào "Chưa rõ" và VẪN tính vào tổng.
-- ------------------------------------------------------------
alter table public.stock_prices
  add column if not exists industry text not null default '';

comment on column public.stock_prices.industry is
  'Tên ngành tiếng Việt (VNDirect). Rỗng = chưa tra được, UI gom vào "Chưa rõ".';

-- ------------------------------------------------------------
-- 4. Khoản thu/chi thuộc về mã nào
--
-- Để bảng Cơ cấu danh mục có cột "Cổ tức đã nhận" theo từng mã.
--
-- VÌ SAO Ở ĐÂY chứ không phải một kind='dividend' trong stock_trades: brokerCash() tính
-- tiền mặt = số dư sổ − tiền đã mua, nên cổ tức tiền ĐÃ vào tiền mặt dưới dạng giao dịch
-- thu. Thêm một loại lệnh mang tiền vào sổ lệnh là đếm hai lần. Thứ duy nhất còn thiếu là
-- "khoản thu này thuộc mã nào" — đúng một cột, đúng khuôn remit_recipient_id (0056).
--
-- null = chưa gán. KHÔNG đoán mã từ ghi chú.
-- ------------------------------------------------------------
alter table public.transactions
  add column if not exists stock_symbol text;

comment on column public.transactions.stock_symbol is
  'Mã cổ phiếu mà khoản thu/chi này thuộc về (cổ tức, phí lưu ký). null = chưa gán.';
