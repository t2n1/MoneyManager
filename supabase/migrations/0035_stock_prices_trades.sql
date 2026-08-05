-- ============================================================
-- Sổ Chi Tiêu — Migration 0035: Tự cập nhật giá cổ phiếu Việt Nam
--
-- Nối tiếp 0016 (giá trị đầu tư): 0016 lưu MỘT con số tổng do người dùng gõ tay. Ở đây
-- thêm SỔ LỆNH để app biết đang giữ mã nào, bao nhiêu cổ — nhờ vậy edge function
-- stock-refresh tính được giá trị thị trường và tự ghi vào account_valuations.
--
-- Sổ lệnh KHÔNG phải dòng tiền: không đụng transactions, không đụng số dư. Nó chỉ nói
-- tiền trong tài khoản chứng khoán đang nằm ở dạng cổ phiếu nào. Ledger thu/chi giữ
-- nguyên sạch (đúng quyết định 2 của 0016).
--
-- Xem thêm: docs/superpowers/specs/2026-08-05-co-phieu-viet-nam-tu-cap-nhat-design.md
-- ============================================================

-- ------------------------------------------------------------
-- 1. Bảng giá chung
--
-- Bảng DUY NHẤT trong dự án không có user_id (ngoại lệ có ý thức với nguyên tắc 0.5):
-- giá cổ phiếu là dữ liệu công khai, giống hệt nhau với mọi user, và không suy ra được
-- ai đang giữ gì từ nó. Nhân bản theo user chỉ để thoả hình thức thì đổi lấy 400+ hàng
-- mỗi người và một vòng lặp hút giá cho từng user. Phần riêng tư nằm ở stock_trades.
-- ------------------------------------------------------------
create table public.stock_prices (
  symbol       text primary key,
  exchange     text        not null check (exchange in ('hose', 'hnx', 'upcom')),
  -- companyNameVi của SSI — để gợi ý khi người dùng gõ tìm mã.
  name         text        not null default '',
  -- ĐỒNG/CỔ. VND có decimals = 0 nên minor unit chính là đồng, không nhân chia gì.
  price        bigint      not null check (price > 0),
  -- Giá tham chiếu phiên trước, để hiện % thay đổi trong ngày; null = không có.
  prior_close  bigint,
  -- Ngày PHIÊN mà giá này thuộc về (không phải ngày hút). Ngày lễ sàn không chạy nên
  -- SSI vẫn trả ngày phiên cũ — cột này là thứ giúp cron biết mà không ghi trùng.
  trading_date date        not null,
  updated_at   timestamptz not null default now()
);

alter table public.stock_prices enable row level security;

-- Đọc: mọi user đã đăng nhập. Ghi: không policy nào → chỉ service role (edge function).
create policy "read for authenticated" on public.stock_prices
  for select to authenticated
  using (true);

-- Đảm bảo updated_at luôn cập nhật khi cập nhật giá, không phụ thuộc vào edge function
-- Nếu cron quên stamp, cơ sở dữ liệu tự ghi mốc thời gian chứ không để timestamp cũ
create trigger stock_prices_moddatetime
  before update on public.stock_prices
  for each row execute function extensions.moddatetime (updated_at);

-- ------------------------------------------------------------
-- 2. Sổ lệnh
-- ------------------------------------------------------------
create table public.stock_trades (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  account_id uuid        not null,
  symbol     text        not null,
  -- 'adjust' = cổ phiếu thưởng / cổ tức bằng cổ phiếu / chia tách hoặc gộp. Không có
  -- loại này thì mỗi lần được thưởng, số cổ trong app sai vĩnh viễn mà không cách nào
  -- sửa ngoài việc bịa một lệnh mua giá 0. Cổ phiếu Việt Nam chia thưởng rất thường.
  kind       text        not null check (kind in ('buy', 'sell', 'adjust')),
  traded_on  date        not null default current_date,
  -- Số cổ. Âm CHỈ hợp lệ với kind='adjust' (gộp cổ phiếu) — xem ràng buộc dưới.
  quantity   bigint      not null,
  price      bigint      not null default 0 check (price >= 0),
  fee        bigint      not null default 0 check (fee >= 0),
  -- Thuế bán 0,1% ở Việt Nam. Mua không có thuế nên cột này luôn 0 với kind='buy'.
  tax        bigint      not null default 0 check (tax >= 0),
  note       text        not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite FK: đảm bảo tài khoản thuộc đúng user; xoá tài khoản → xoá sổ lệnh.
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  constraint stock_trades_shape check (
    case kind
      when 'adjust' then quantity <> 0 and price = 0
      else quantity > 0 and price > 0
    end
  )
);

create index stock_trades_account_idx on public.stock_trades (account_id, traded_on);

alter table public.stock_trades enable row level security;

create policy "own rows" on public.stock_trades
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger stock_trades_moddatetime
  before update on public.stock_trades
  for each row execute function extensions.moddatetime (updated_at);

-- ------------------------------------------------------------
-- 3. account_valuations: đánh dấu số nào của người, số nào của máy
--
-- Mặc định 'manual' nên mọi snapshot cũ tự thuộc về người dùng. Cron ghi bằng
-- `on conflict ... do update ... where source = 'auto'` — nhờ mệnh đề where đó, hàng
-- người dùng gõ tay không bao giờ bị đè.
-- ------------------------------------------------------------
alter table public.account_valuations
  add column source text not null default 'manual'
    check (source in ('manual', 'auto'));
