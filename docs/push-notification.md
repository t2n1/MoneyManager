# Đẩy thông báo ra ngoài app (Web Push)

Nối phần đẩy cho bộ thông báo đã có từ migration 0029. Chuông trong app tính tại chỗ
mỗi lần mở app; phần này gửi thông báo tới khoá màn hình khi app đang đóng.

## Đã chốt gì

| Quyết định | Vì sao |
|---|---|
| Chỉ đẩy nhóm **“việc cần làm”** (8 loại `kind: 'action'`) | Nguyên tắc mục A của spec: chỉ báo việc người dùng làm được gì đó. Tin-để-biết ở lại trong chuông. |
| **Một việc đẩy một lần** | Cột `pushed_at` trên `notification_state`. Mã việc-cần-làm không kèm kỳ, nên nó chỉ được đẩy lại sau khi tình huống đã hết và mã bị dọn (vòng đời mục E). |
| **Một lượt gửi = một thông báo** | Nhiều việc thì gộp: “3 việc cần để ý · …”. Gửi mỗi việc một push là biến app thành thứ người ta đi tắt thông báo. |
| Người dùng **chọn giờ + múi giờ** | `profiles.push_hour` + `profiles.push_tz`. Lưu ý định (“8 giờ sáng nơi tôi ở”) chứ không lưu mốc UTC — xem [pushSchedule.ts](../src/lib/pushSchedule.ts). |
| Bật/tắt **theo từng thiết bị** | Quyền thông báo do trình duyệt cấp cho từng máy. `push_subscriptions` vì vậy nhiều dòng mỗi người. |

## Kiến trúc

Edge function **không có bộ luật riêng**. Nó dựng lại đúng `NotificationInput` mà app
dựng trên máy, rồi gọi chính `buildNotifications` đã gói từ `src/`:

```
src/features/notifications/serverBundle.ts   ← mặt tiếp xúc duy nhất (chỉ xuất lại)
        │  npm run bundle:rules  (esbuild, platform: neutral)
        ▼
supabase/functions/push-notify/_rules.js     ← sinh tự động, ĐÃ COMMIT
        ▲
        │  import
supabase/functions/push-notify/index.ts      ← vòng qua từng user, gửi
supabase/functions/push-notify/loadInput.ts  ← đọc Postgres → NotificationInput
```

Sửa một luật trong `src/` là chuông và push đổi theo cùng nhau. Nếu quên gói lại,
[tests/pushBundle.test.ts](../tests/pushBundle.test.ts) đỏ.

Phía trình duyệt: [public/push-sw.js](../public/push-sw.js) được nhét vào service
worker qua `workbox.importScripts` (giữ nguyên cấu hình precache đang chạy tốt, không
đổi sang `injectManifest`).

## Triển khai

### 1. Áp migration

Dán [supabase/migrations/0034_push.sql](../supabase/migrations/0034_push.sql) vào
Supabase SQL Editor rồi Run.

### 2. Sinh khoá và secret — một lệnh

```bash
npm run setup:push
```

[scripts/setup-push.mjs](../scripts/setup-push.mjs) sinh cặp khoá VAPID (P-256, đúng dạng
RFC 8292) và một `PUSH_CRON_SECRET` ngẫu nhiên, tự ghi **nửa công khai** vào `.env.local`,
rồi in ra bốn khối còn lại đã điền sẵn giá trị và `project-ref` (đọc từ
`VITE_SUPABASE_URL`).

Khoá bí mật chỉ hiện trong terminal của bạn — đừng dán chúng vào chat, issue, hay git.
Mọi biến `VITE_*` đều bị nhúng vào bundle mà ai cũng tải được, nên nửa riêng tư **không
bao giờ** được đặt tên `VITE_*`.

Kiểm script mà không sinh khoá thật: `node scripts/setup-push.mjs --dry-run`.

### 3. Đặt biến môi trường

Dán khối ① (Vercel) và ② (`supabase secrets set`) mà script vừa in.

> **Đặt secret bằng Dashboard, đừng bằng PowerShell.** Vào **Edge Functions → Secrets**
> rồi dán vào ô nhập. Đường `supabase secrets set` qua PowerShell đã một lần làm hỏng
> `VAPID_PUBLIC_KEY` bằng một ký tự thừa ở đuôi, và hậu quả là push câm hai tuần —
> xem [Khi push im lặng](#khi-push-im-lặng) bên dưới.

Nếu vẫn dùng CLI: khối ② in ra **một dòng** và bọc từng cặp trong nháy kép — dán nguyên, đừng bẻ dòng cho
đẹp. PowerShell không hiểu dấu `\` nối dòng của bash, dán khối nhiều dòng vào là mất cặp
ở giữa mà không báo gì; lúc đó function vẫn deploy được và chỉ chết khi cron gọi tới.

Sau khi thêm biến trên Vercel phải **Redeploy**. Vercel không tự build lại khi đổi biến,
mà mọi biến `VITE_*` được nướng vào bundle lúc build. Cách kiểm chắc nhất là mở
`/assets/NotificationSettingsPage-*.js` của bản đang chạy: hàm đọc khoá phải trả về khoá
thật chứ không phải chuỗi rỗng. Tên file đổi cũng là dấu hiệu đã build lại.

`SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` Supabase tự cấp, không cần đặt.

Đổi khoá VAPID sau này sẽ làm **mọi thiết bị đã đăng ký hết hiệu lực** — ai đang bật
thông báo phải tắt rồi bật lại.

### 4. Deploy function

Repo này **chưa từng dùng Supabase CLI** (không có `supabase/config.toml` — mọi migration
tới nay đều dán vào SQL Editor). Edge function thì không dán được, nên lần đầu phải đăng
nhập CLI và chỉ rõ project:

```bash
npx supabase@latest login
```

```bash
npm run bundle:rules && npx supabase@latest functions deploy push-notify --project-ref <project-ref> --no-verify-jwt
```

Dùng `npx` vì repo không cài Supabase CLI, và `npm i -g supabase` bị chính nhà làm
Supabase chặn. Muốn gõ `supabase` trơn thì cài qua Scoop (`scoop bucket add supabase
https://github.com/supabase/scoop-bucket.git && scoop install supabase`).

`<project-ref>` là phần đầu của `VITE_SUPABASE_URL` (`https://<project-ref>.supabase.co`).
Dùng `--project-ref` thay vì `supabase init` + `link` để không thêm file cấu hình CLI vào
repo — chỉ có một function, không cần cả bộ local dev.

`--no-verify-jwt` là cần thiết: cron không phải người dùng đăng nhập nên không có JWT.
Đó chính là lý do có `PUSH_CRON_SECRET` — không có nó thì ai biết URL cũng gọi được.

### 5. Hẹn cron mỗi giờ

Function tự lọc ai tới giờ, nên cron chỉ cần chạy đều mỗi giờ.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'push-notify-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/push-notify',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "<PUSH_CRON_SECRET>"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

Xem lịch đã hẹn: `select * from cron.job;` · Lịch sử chạy: `select * from cron.job_run_details order by start_time desc limit 20;`

## Cách test

### Service worker (không cần server)

Chrome/Edge DevTools → **Application → Service Workers** → ô **Push** → dán payload rồi
bấm Push:

```json
{"title":"Ví đang âm ¥1.200","body":"Thường là ghi nhầm.","to":"/assets/account/abc","tag":"sct-viec-can-lam"}
```

Phải thấy thông báo hệ thống, và bấm vào nó phải **dùng lại tab đang mở** chứ không mở
tab mới. Lưu ý: `npm run dev` không sinh service worker — phải `npm run build && npm run preview`.

### Edge function tại máy

```bash
supabase functions serve push-notify --no-verify-jwt
```

```bash
curl -i -X POST http://localhost:54321/functions/v1/push-notify -H "x-cron-secret: <PUSH_CRON_SECRET>"
```

Trả về JSON đếm việc, đọc được ngay lý do bỏ qua từng user:

```json
{ "daGui": 1, "boQua": { "chưa tới giờ gửi (hoặc hôm nay đã gửi)": 2 }, "daXoaDangKy": 0, "loi": [] }
```

Muốn gửi thử ngay không cần chờ tới giờ: đặt `push_hour` về giờ hiện tại và xoá
`push_last_sent_at`.

```sql
update profiles set push_hour = extract(hour from now() at time zone push_tz),
                    push_last_sent_at = null
where user_id = '<uuid>';
```

Muốn đẩy lại một việc đã đẩy (để xem lại nội dung):

```sql
update notification_state set pushed_at = null where user_id = '<uuid>';
```

### Trên iPhone thật

Hai điều dưới đây **không tái hiện được trên Chrome desktop**, nên phải test trên máy thật:

1. **Phải Thêm vào màn hình chính trước.** iOS chỉ cấp Web Push cho PWA đã cài (16.4+).
   Safari trong tab thường không có `window.PushManager` — app hiện đúng câu này thay vì
   “trình duyệt không hỗ trợ”, xem [pushEligibility.ts](../src/features/notifications/pushEligibility.ts).
2. **Quyền phải xin từ một cú chạm.** Công tắc trong Cài đặt gọi
   `Notification.requestPermission()` ngay dòng đầu, trước mọi `await` khác. Thêm một
   `await` vào trước nó là iOS từ chối im lặng, không có lỗi nào để đọc.

Quy trình: mở app trên Safari → Chia sẻ → Thêm vào màn hình chính → mở app từ icon →
Cài đặt → Thông báo → bật “Nhận thông báo trên máy này” → đồng ý ở hộp thoại iOS.

Kiểm đã đăng ký được:

```sql
select endpoint, user_agent, created_at, last_ok_at from push_subscriptions;
```

Endpoint của iPhone phải bắt đầu bằng `https://web.push.apple.com/`; `fcm.googleapis.com`
là máy Chrome, không phải iPhone. `last_ok_at` là lần **gửi thành công** gần nhất — trước
2026-08-21 cột này không có ai ghi nên nó luôn null kể cả khi mọi thứ chạy đúng, đừng tin
kết quả cũ.

## Khi push im lặng

Không nhận được gì thì soi theo thứ tự này. Mỗi bước loại hẳn một tầng, đừng nhảy cóc.

```sql
-- ① Cron đã hẹn chưa, và có chạy không
select jobid, schedule, active from cron.job;
select jobid, status, start_time from cron.job_run_details order by start_time desc limit 10;

-- ② Function TRẢ VỀ GÌ — đây mới là chỗ có sự thật
select status_code, content, error_msg, created from net._http_response order by created desc limit 10;
```

**Cạm bẫy lớn nhất: `cron.job_run_details` báo `succeeded` kể cả khi function trả 500.**
`net.http_post` chỉ xếp hàng request rồi trả về ngay, nên pg_cron coi như xong việc của
nó. Nhìn cột đó rồi kết luận "cron chạy tốt" là bỏ sót đúng chỗ hỏng. Chỉ
`net._http_response` giữ phản hồi thật, và nó chỉ giữ khoảng 6 tiếng.

Đọc cột `content`:

| Thấy gì | Nghĩa là |
|---|---|
| `{"loi":"Thiếu biến môi trường: …"}` | Chưa đặt secret. Tên biến nằm ngay trong câu. |
| `{"loi":"Khoá VAPID không hợp lệ: …","doDai":{…}}` | Secret có nhưng sai dạng. `doDai` phải là public 87, private 43; lệch lên 88/44 là dính ký tự xuống dòng. |
| `Internal Server Error` (chuỗi trần, không JSON) | Exception không ai bắt trong handler. Function tự nó **luôn** trả JSON, nên chuỗi trần này là câu trả lời mặc định của `Deno.serve`. Vào **Dashboard → Edge Functions → push-notify → Logs** đọc stack. |
| `{"daGui":0,"boQua":{…}}` | Chạy trọn, chỉ là chưa tới lượt gửi. Lý do nằm trong `boQua`. |
| `{"loi":["gửi tới … lỗi 403 …"]}` | Tới được dịch vụ đẩy nhưng bị từ chối — thường là khoá công khai trên server khác khoá đã nướng vào bundle Vercel. |

### Đã xảy ra thật: 2026-08-21

Push câm từ lúc dựng cho tới 21/08. Cron hẹn đúng, chạy đủ mỗi giờ, iPhone đăng ký được,
6 secret đều có mặt — nhưng `VAPID_PUBLIC_KEY` trên Supabase dính một ký tự thừa ở đuôi so
với bản trong `.env.local`. `webpush.setVapidDetails` ném "Vapid public key must be a URL
safe Base 64" ngay dòng đầu sau cửa xác thực, ném trần ra khỏi handler, và `Deno.serve`
biến nó thành một chuỗi `Internal Server Error` trơ trọi trong `net._http_response`.

Ba thứ đã sửa để lần sau không mất hai tuần nữa: `setVapidDetails` nằm trong `try/catch`
và trả JSON kèm độ dài từng khoá; ba biến VAPID được cắt khoảng trắng khi đọc; và
`last_ok_at` cuối cùng đã có người ghi.

## Chỗ đã kiểm và chỗ chưa

| Phần | Trạng thái |
|---|---|
| `pushPlan`, `pushSchedule`, `pushEligibility`, `pushInputPlan` | ✅ 62 test, mỗi guard đã chứng minh đỏ được |
| Lớp repo + migration + khôi phục backup cũ | ✅ test demoRepo |
| Cửa sổ giao dịch + cổng tỷ giá của edge function | ✅ kéo về [pushInputPlan.ts](../src/features/notifications/pushInputPlan.ts) nên test được; bản viết tay trong `loadInput.ts` từng sai với `month_start_day ≠ 1` |
| Bundle bộ luật chạy ngoài trình duyệt | ✅ chạy thật trên Node: `buildNotifications` → `planPush` ra payload đúng |
| Service worker sinh đúng, không mất offline | ✅ `importScripts("/push-sw.js")` + `navigateFallback` còn nguyên trong `dist/sw.js` |
| Công tắc + ô chọn giờ trong Cài đặt | ✅ đo trên preview, đổi giờ lưu và sống qua reload |
| Deep link `?notif=1` mở tấm trượt | ✅ đo trên preview, tham số được dọn khỏi URL |
| Edge function chạy trên Deno | ✅ đã deploy thật (2026-08-07), gọi bằng secret sai trả đúng 401 |
| `npm:web-push` trên Supabase Edge Runtime | ✅ **gửi thật được** — 2026-08-21, thông báo tới iPhone. `node:crypto` của lớp tương thích Deno mã hoá aes128gcm đúng, không phải thay thư viện |
| Khoá công khai có trong bản web trên mạng | ✅ đọc thẳng bundle của Vercel, hàm đọc khoá trả về khoá thật |
| iPhone đăng ký được (chân client) | ✅ đo trên máy thật 2026-08-18 — endpoint `web.push.apple.com`, iOS 18.7 |
| **Thông báo tới được iPhone thật** | ✅ **2026-08-21** — chạy trọn dây: cron → edge function → `web.push.apple.com` → `push-sw.js` → màn hình khoá iPhone |

### `npm:web-push` trên Edge Runtime — đã ngã ngũ

Mối lo cũ: `web-push` dùng `node:crypto` (`createECDH`, `createCipheriv`) và `node:https`,
mà lớp tương thích Node của Deno chưa từng được xác minh trên đúng phiên bản runtime của
Supabase. **2026-08-21 đã xác minh: chạy đúng**, thông báo tới được iPhone thật. Không
phải đổi thư viện.

Giữ lại đoạn này vì lý do chọn nó vẫn còn giá trị nếu sau này phải xét lại: `npm:web-push`
được chọn **vì nó lỗi to và ngay** — import hỏng là function chết ngay lần gọi đầu và log
Supabase nói rõ. Tự viết crypto Web Push bằng WebCrypto thì lỗi lại âm thầm: dịch vụ đẩy
trả 201 mà máy không hiện gì.

Nếu một ngày nào đó log báo lỗi ở `npm:web-push`, thứ tự thử: `npm:web-push@3.6.7` cố định phiên bản →
`jsr:@negrel/webpush` (bản Deno thuần dùng WebCrypto) → tự ký VAPID + mã hoá aes128gcm
theo RFC 8291. Chỉ [send trong index.ts](../supabase/functions/push-notify/index.ts) phải
sửa; `planPush` và `dueForPush` không đụng tới.
