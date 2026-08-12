-- ============================================================
-- Sổ Chi Tiêu — Migration 0045: Tự cập nhật giá quỹ đầu tư Nhật (投資信託 / NISA)
--
-- Nối tiếp 0016 (giá trị đầu tư) và 0035 (sổ lệnh cổ phiếu). Ở đây thêm SỔ LỆNH QUỸ để
-- edge function fund-refresh tính được giá trị thị trường của tài khoản NISA và tự ghi
-- vào account_valuations.
--
-- KHÁC cổ phiếu Việt Nam ở ba chỗ, đều là quyết định có ý thức (xem spec):
--   1. 基準価額 niêm yết trên 10.000 口, không phải trên 1 đơn vị. Cột `nav` giữ NGUYÊN
--      đơn vị đó; chia 10.000 ở đúng một chỗ trong app (fundValue).
--   2. Giữ CẢ `units` lẫn `amount`: đo thật trên sao kê Rakuten,
--      28.429 × 17.588 ÷ 10.000 = 50.000,93 trong khi số tiền bị trừ là 50.000. Rakuten
--      tính 口数 TỪ số tiền, nên suy ngược lại là dựng đầu vào từ đầu ra — mất mát.
--   3. KHÔNG có "tiền chưa đầu tư": Rakuten tự quét sạch tiền dư về 楽天銀行
--      (自動出金(スイープ)), nên tài khoản không bao giờ giữ tiền nhàn rỗi.
--
-- Sổ lệnh KHÔNG phải dòng tiền: không đụng transactions, không đụng số dư — đúng quyết
-- định của 0035.
--
-- Xem thêm: docs/superpowers/specs/2026-08-12-quy-nhat-tu-cap-nhat-design.md
-- ============================================================

-- ------------------------------------------------------------
-- 1. Danh bạ quỹ — công khai, không user_id
--
-- Cùng lý do với stock_prices (0035): mã quỹ và tên quỹ là dữ liệu công khai, giống hệt
-- nhau với mọi user, và không suy ra được ai giữ gì từ nó. Phần riêng tư nằm ở
-- fund_trades.
-- ------------------------------------------------------------
create table public.funds (
  -- 協会コード, vd '9I31223A'. Là khoá vì nó là thứ mọi bảng khác trỏ tới, và là thứ
  -- người dùng đọc được trên Yahoo Finance Nhật.
  assoc_fund_cd   text primary key,
  -- Cần CẢ hai mã để gọi CSV: thiếu một cái, server trả 200 kèm {"statusCode":null}.
  isin_cd         text        not null,
  name            text        not null default '',
  -- Kết quả lần hút gần nhất. Mã sai thì không có chỗ nào khác lộ ra.
  last_status     text        not null default 'chua-kiem'
    check (last_status in ('chua-kiem', 'ok', 'ma-sai', 'loi-mang')),
  last_checked_at timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.funds enable row level security;

-- Đọc: mọi user đã đăng nhập. Ghi: không policy nào → chỉ service role (edge function).
-- Không có UI thêm quỹ ở bản này, nên user không cần quyền ghi. Thêm quỹ mới = thêm một
-- hàng bằng SQL.
create policy "read for authenticated" on public.funds
  for select to authenticated
  using (true);

-- ------------------------------------------------------------
-- 2. Bí danh tên quỹ trong sao kê Rakuten
--
-- NHIỀU tên trỏ về MỘT quỹ, vì quỹ đổi tên. Rakuten đổi tên loạt 「楽天・プラス」 ngày
-- 2024-10-17 (https://www.rakuten-sec.co.jp/web/info/info20241017-01.html), nên một sao
-- kê duy nhất chứa cả tên cũ lẫn tên mới của CÙNG một quỹ.
--
-- Chứng minh bằng số: tra mã của tên MỚI (9I31223A) ra đúng đơn giá mà sao kê ghi cho
-- tên CŨ — 12.355 ở phiên 2024-08-07, 12.596 ở phiên 2024-08-09.
--
-- Ghép theo tên một cách ngây thơ cho ra 口数 ÂM (S&P500 −19.848, VTI −10.232). Đó là
-- dấu hiệu duy nhất, và là lý do script nhập có bất biến "không quỹ nào được âm".
--
-- Là BẢNG chứ không phải hằng số trong script: lần sau Rakuten đổi tên nữa thì thêm một
-- hàng, không sửa code.
-- ------------------------------------------------------------
create table public.fund_aliases (
  -- Đúng chuỗi trong cột 対象証券名 của sao kê, kể cả '/再投資型' ở cuối và ký tự
  -- full-width (Ｓ＆Ｐ５００). So khớp CHÍNH XÁC, không so gần đúng: hai quỹ Rakuten khác
  -- nhau đúng ba ký tự (・プラス) và có giá khác nhau.
  statement_name text primary key,
  assoc_fund_cd  text not null references public.funds (assoc_fund_cd) on delete cascade
);

alter table public.fund_aliases enable row level security;

create policy "read for authenticated" on public.fund_aliases
  for select to authenticated
  using (true);

-- ------------------------------------------------------------
-- 3. 基準価額 mới nhất — công khai, không user_id
-- ------------------------------------------------------------
create table public.fund_prices (
  assoc_fund_cd text primary key
    references public.funds (assoc_fund_cd) on delete cascade,
  -- YÊN trên 10.000 口 (đơn vị nguồn công bố). KHÔNG chia 10.000 ở đây — chia sớm là
  -- làm tròn sớm. Chia ở đúng một chỗ: fundValue() trong src/features/assets/fundHoldings.ts.
  nav           bigint      not null check (nav > 0),
  -- Phiên trước, để hiện % thay đổi trong ngày; null = không có.
  prior_nav     bigint,
  -- 純資産総額, đơn vị TRIỆU YÊN. KHÔNG tham gia phép tính tiền nào — nhân nhầm vào tổng
  -- tài sản là sai một triệu lần. Lưu vì nó nằm sẵn trong CSV và là cách rẻ nhất để biết
  -- quỹ còn sống hay đã đóng.
  net_assets_m  bigint,
  -- Ngày của GIÁ, không phải ngày hút. Nguồn trễ tối đa một phiên; cột này là thứ giúp
  -- valued_on đề đúng ngày thay vì đóng dấu "hôm nay" lên giá hôm qua.
  nav_date      date        not null,
  updated_at    timestamptz not null default now()
);

alter table public.fund_prices enable row level security;

create policy "read for authenticated" on public.fund_prices
  for select to authenticated
  using (true);

-- Cùng lý do với stock_prices_moddatetime: nếu cron quên stamp, DB tự ghi mốc. Đây là
-- cột DUY NHẤT phân biệt được "cron không ghi gì" với "nguồn trả giá phiên cũ" —
-- nav_date thì không phân biệt được. Khi debug một lượt cron im lặng: đo updated_at.
create trigger fund_prices_moddatetime
  before update on public.fund_prices
  for each row execute function extensions.moddatetime (updated_at);

-- ------------------------------------------------------------
-- 4. Sổ lệnh quỹ — riêng từng user
-- ------------------------------------------------------------
create table public.fund_trades (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  account_id    uuid        not null,
  assoc_fund_cd text        not null references public.funds (assoc_fund_cd),
  -- 'adjust' = 分配金再投資 (口数 tăng mà không tốn tiền) và mọi lần 口数 đổi không qua
  -- mua bán. Hai quỹ Rakuten hiện không chia 分配金 nên hiếm dùng — nhưng thiếu nó thì
  -- lần đầu tiên quỹ chia tiền, 口数 trong app sai vĩnh viễn mà không có cách sửa ngoài
  -- việc bịa một lệnh mua. Đúng lý do đã có 'adjust' ở stock_trades.
  kind          text        not null check (kind in ('buy', 'sell', 'adjust')),
  -- 約定日 (ngày khớp), KHÔNG phải 受渡日 (ngày tiền về). 基準価額 thuộc về 約定日; trên
  -- sao kê thật hai ngày này lệch tới 5 ngày (受渡 2026/4/14 ⇄ 約定 2026/4/9). Cột 受渡日
  -- cố ý KHÔNG được lưu ở đâu cả, để không ai lỡ tay dùng nó.
  traded_on     date        not null default current_date,
  -- 口数. Âm CHỈ hợp lệ với kind='adjust' — xem ràng buộc dưới.
  units         bigint      not null,
  -- 基準価額 lúc khớp, ¥/10.000口. Lưu để đối chiếu với nguồn và để hiện 取得単価; phép
  -- tính giá vốn KHÔNG dùng cột này (dùng `amount`).
  nav           bigint      not null default 0 check (nav >= 0),
  -- Số tiền THẬT đã trừ (mua) hoặc nhận về (bán), yên. Đây là nguồn sự thật cho giá vốn.
  amount        bigint      not null default 0 check (amount >= 0),
  -- 口座区分 nguyên văn: 'NISA成長投資枠' | 'NISAつみたて投資枠' | 'つみたてNISA' |
  -- '特定' | ''. KHÔNG tham gia phép tính; giữ để sau này tách được NISA khỏi 特定 mà
  -- không phải nhập lại sao kê.
  bucket        text        not null default '',
  note          text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Composite FK: đảm bảo tài khoản thuộc đúng user; xoá tài khoản → xoá sổ lệnh.
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  constraint fund_trades_shape check (
    case kind
      when 'adjust' then units <> 0 and nav = 0 and amount = 0
      else units > 0 and amount > 0
    end
  )
);

create index fund_trades_account_idx on public.fund_trades (account_id, traded_on);

alter table public.fund_trades enable row level security;

create policy "own rows" on public.fund_trades
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger fund_trades_moddatetime
  before update on public.fund_trades
  for each row execute function extensions.moddatetime (updated_at);

-- ------------------------------------------------------------
-- 5. Seed 8 quỹ — mọi mã đã gọi thật ngày 2026-08-12, đều trả 200, phiên 2026-08-10
-- ------------------------------------------------------------
insert into public.funds (assoc_fund_cd, isin_cd, name) values
  ('9I31223A', 'JP90C000Q2U6', '楽天・プラス・S&P500インデックス・ファンド'),
  ('9I314241', 'JP90C000QF22', '楽天・プラス・NASDAQ-100インデックス・ファンド'),
  ('9I312179', 'JP90C000FHD2', '楽天・全米株式インデックス・ファンド（楽天・VTI）'),
  ('0331418A', 'JP90C000H1T1', 'eMAXIS Slim 全世界株式（オール・カントリー）'),
  ('03311187', 'JP90C000GKC6', 'eMAXIS Slim 米国株式（S&P500）'),
  ('03319172', 'JP90C000ENC5', 'eMAXIS Slim 先進国株式インデックス（除く日本）'),
  ('03311182', 'JP90C000FXV1', 'eMAXIS Slim 国内株式（日経平均）'),
  ('8931317C', 'JP90C000FSK4', 'SBI 日本株4.3ブル')
on conflict (assoc_fund_cd) do nothing;

-- ------------------------------------------------------------
-- 6. Seed bí danh — 8 tên hiện hành + 2 tên CŨ của quỹ đã đổi tên
--
-- Chuỗi phải khớp CHÍNH XÁC cột 対象証券名 của sao kê, kể cả '/再投資型' và ký tự
-- full-width. Hai dòng có ghi chú "TÊN CŨ" là hai cái bẫy đã đo được.
-- ------------------------------------------------------------
insert into public.fund_aliases (statement_name, assoc_fund_cd) values
  ('楽天・プラス・Ｓ＆Ｐ５００インデックス・ファンド(楽天・プラス・Ｓ＆Ｐ５００)/再投資型', '9I31223A'),
  -- TÊN CŨ, trước 2024-10-17. Cùng quỹ, cùng 口数 — bỏ dòng này là vị thế âm 19.848 口.
  ('楽天・Ｓ＆Ｐ５００インデックス・ファンド(楽天・Ｓ＆Ｐ５００)/再投資型', '9I31223A'),
  ('楽天・プラス・NASDAQ-100インデックス・ファンド(楽天・プラス・NASDAQ-100)/再投資型', '9I314241'),
  ('楽天・全米株式インデックス・ファンド(楽天・VTI)/再投資型', '9I312179'),
  -- TÊN CŨ (đổi 愛称, tên chính thức giữ nguyên) — bỏ dòng này là vị thế âm 10.232 口.
  ('楽天・全米株式インデックス・ファンド（楽天・バンガード・ファンド（全米株式））/再投資型', '9I312179'),
  ('eMAXIS Slim 全世界株式(オール・カントリー)/再投資型', '0331418A'),
  ('eMAXIS Slim 米国株式(S&P500)/再投資型', '03311187'),
  ('eMAXIS Slim 先進国株式インデックス/再投資型', '03319172'),
  ('eMAXIS Slim 国内株式(日経平均)/再投資型', '03311182'),
  ('SBI日本株4.3ブル/再投資型', '8931317C')
on conflict (statement_name) do nothing;
