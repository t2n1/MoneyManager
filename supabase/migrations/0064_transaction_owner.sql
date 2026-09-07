-- Ai chi khoản này: bạn, người kia, hay chung.
--
-- Bước đầu của kế hoạch dùng chung hai người, và là bước DUY NHẤT làm được an toàn khi
-- chưa có người dùng thứ hai thật: đây chỉ là một CHIỀU PHÂN LOẠI trên giao dịch của
-- chính chủ tài khoản. Không đụng RLS, không có login thứ hai, không có ai đọc được dữ
-- liệu của ai. Phần đó (nới RLS trên 32 bảng) để dành tới khi có người thật.
--
-- Vì sao ba giá trị mà không phải tham chiếu tới một bảng người dùng: khi mới bắt đầu
-- dùng chung, "người kia" chưa có tài khoản trong app — họ chỉ tồn tại trong đầu người
-- ghi sổ. Bắt phải tạo một dòng người dùng trước khi ghi được một khoản chi là dựng rào
-- ngay ở bước đầu tiên. Khi nào họ có tài khoản thật thì 'partner' ánh xạ sang id của họ.
--
-- Mặc định 'mine': mọi giao dịch đang có vẫn là của chủ sổ, đúng như trước.
create type public.tx_owner as enum ('mine', 'partner', 'shared');

alter table public.transactions
  add column if not exists owner public.tx_owner not null default 'mine';

comment on column public.transactions.owner is
  'Ai chi khoản này: mine (mình) / partner (người kia) / shared (chung). Chỉ là chiều phân loại — KHÔNG phải quyền truy cập.';

-- Lọc theo người là truy vấn sẽ chạy thường xuyên trên màn Tìm kiếm và báo cáo.
create index if not exists transactions_owner_idx
  on public.transactions (user_id, owner);

-- Công tắc bật chiều "người chi" trong giao diện.
--
-- Không có nó thì ô chọn người nằm giữa đường đi thường ngày của MỌI người dùng mà lúc
-- nào cũng chỉ có một giá trị — thêm một quyết định vào form nhập, đúng cái lời hứa
-- "ghi xong trong 5 giây" không chịu nổi. Cột vẫn luôn tồn tại và luôn có giá trị; chỉ
-- giao diện là ẩn/hiện.
alter table public.profiles
  add column if not exists couple_mode boolean not null default false;

comment on column public.profiles.couple_mode is
  'true = hiện ô "ai chi" khi ghi/sửa và bộ lọc theo người. Không đổi dữ liệu, chỉ đổi giao diện.';
