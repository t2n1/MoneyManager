-- ============================================================
-- Sổ Chi Tiêu — Migration 0034: Đẩy thông báo ra ngoài app (Web Push)
--
-- Migration 0029 dựng chuông TRONG app: bộ luật chạy trên máy mỗi lần mở app, nên
-- việc cần làm chỉ hiện khi người dùng đã tự mở app ra xem. Đợt này nối phần đẩy:
-- một edge function chạy theo giờ, tự dựng lại cùng `NotificationInput` từ Postgres,
-- gọi ĐÚNG bộ luật đó rồi gửi Web Push. Cột `pushed_at` mà 0029 chừa sẵn giờ có
-- người ghi và người đọc.
--
-- Chỉ đẩy nhóm "việc cần làm" (kind='action'). Tin-để-biết vẫn chỉ nằm trong chuông:
-- nguyên tắc mục A của spec là chỉ báo việc người dùng làm được gì đó.
-- ============================================================

-- Mỗi dòng là MỘT trình duyệt trên MỘT thiết bị đã bấm đồng ý nhận thông báo.
-- Một người có thể có nhiều dòng (điện thoại + laptop) và đều phải nhận được.
create table public.push_subscriptions (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  -- URL riêng do dịch vụ đẩy của trình duyệt cấp (FCM/Mozilla/Apple). Đây là khoá
  -- chính vì chính nó là danh tính của thiết bị: cùng một máy đăng ký lại sau khi
  -- trình duyệt đổi khoá sẽ ra endpoint khác, và bản cũ phải chết theo cách riêng
  -- (410 khi gửi), không phải bị ghi đè.
  endpoint   text        not null,
  -- Hai khoá để mã hoá nội dung (aes128gcm). Không có chúng thì chỉ gửi được thông
  -- báo rỗng. Lưu dạng base64url y như trình duyệt trả ra.
  p256dh     text        not null,
  auth       text        not null,
  -- Để người dùng nhận ra "cái này là máy nào" khi muốn tắt một thiết bị.
  user_agent text,
  created_at timestamptz not null default now(),
  -- Lần gửi thành công gần nhất; null = chưa gửi lần nào. Dùng để soi khi push im.
  last_ok_at timestamptz,
  primary key (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "own rows" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Giờ gửi do người dùng chọn.
--
-- Vì sao lưu GIỜ + MÚI GIỜ chứ không lưu sẵn một mốc UTC: chủ app đang ở Nhật và
-- dự định chuyển sang Mỹ. Nếu quy về UTC lúc đặt thì sang Mỹ "8 giờ sáng" thành 3
-- giờ chiều, còn đổi múi giờ giữa mùa (DST ở Mỹ) thì mốc UTC lệch một tiếng hai lần
-- mỗi năm. Giữ ý định ("8 giờ sáng, giờ nơi tôi ở") rồi để lúc gửi mới dịch sang UTC
-- là cách duy nhất không phải sửa dữ liệu khi chuyển nước.
alter table public.profiles
  add column push_hour smallint not null default 8
    check (push_hour >= 0 and push_hour <= 23);

-- Tên múi giờ IANA ('Asia/Tokyo', 'America/Los_Angeles'). Không dùng offset số vì
-- offset không biết DST.
alter table public.profiles
  add column push_tz text not null default 'Asia/Tokyo';

-- Lần gần nhất đã gửi push cho user này (bất kể gửi được mấy tin). Cron chạy mỗi
-- giờ, cột này là thứ chặn gửi hai lần trong cùng một ngày địa phương.
alter table public.profiles
  add column push_last_sent_at timestamptz;
