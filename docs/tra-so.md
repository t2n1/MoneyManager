# Edge function `tra-so` — deploy và khoá

Cầu giữ khoá API cho nút **"Tra hộ"** ở màn Tương lai. Thiết kế:
[docs/superpowers/specs/2026-08-27-tra-so-tuong-lai-design.md](superpowers/specs/2026-08-27-tra-so-tuong-lai-design.md).

Đây là function **thứ tư**, sau `push-notify`, `stock-refresh`, `fund-refresh` — nhưng là
function **đầu tiên do TRÌNH DUYỆT gọi**. Ba cái kia do cron gọi. Khác biệt đó quyết định
lệnh deploy, nên đọc mục dưới trước khi chép lệnh từ file khác trong `docs/`.

## Đặt khoá

```bash
npx supabase@latest secrets set AI_API_KEY=<khoá> --project-ref <project-ref>
```

`<project-ref>` là phần đầu của `VITE_SUPABASE_URL` (`https://<project-ref>.supabase.co`).

Khoá **chỉ** nằm ở đây. Không đặt vào `.env` phía app: mọi biến `VITE_*` bị nhúng vào
bundle công khai, ai mở mã nguồn cũng lấy được và tiêu hạn mức. Đó là toàn bộ lý do
function này tồn tại.

## Deploy — KHÔNG có `--no-verify-jwt`

```bash
npx supabase@latest functions deploy tra-so --project-ref <project-ref>
```

⚠️ **Đừng chép cờ `--no-verify-jwt` từ [push-notification.md](push-notification.md) hay
[co-phieu-viet-nam.md](co-phieu-viet-nam.md).** Hai file đó ghi đúng cho function của
chúng: `push-notify` và `stock-refresh` do **cron** gọi, mà cron không có JWT của người
dùng nào, nên bắt buộc phải tắt kiểm.

`tra-so` thì ngược lại: nó do **trình duyệt của người đã đăng nhập** gọi, và mỗi lượt gọi
**tiêu tiền thật** của hạn mức API. Deploy kèm cờ đó là mở một endpoint tiêu tiền cho bất
kỳ ai trên Internet — không cần tài khoản, không cần gì cả. Kiểm chữ ký JWT do Supabase
làm trước khi request tới function; đoạn kiểm `Authorization` trong `index.ts` chỉ là chốt
thứ hai, nó **không** thay được việc kiểm chữ ký.

Repo không có `supabase/config.toml` (mọi migration tới nay đều dán vào SQL Editor), nên
`verify_jwt` không được khai ở đâu cả — mặc định của lệnh deploy là thứ duy nhất giữ nó
bật. Vì vậy cái sai ở đây là một cờ gõ thừa, và nó không để lại dấu vết nào trong repo.

## Chạy thử tại máy

```bash
npx supabase@latest functions serve tra-so
```

Không cần chạy thử để xem luồng: **chế độ demo bấm được nút này** (`demoRepo.traSo` trả
một kết quả mẫu, không gọi mạng, không cần khoá).

## Không phải chạy `npm run bundle:rules`

Function này không chứa luật tiền nào — không phép tính, không đụng DB. Việc kiểm kết quả
nằm ở `src/features/lifetime/traSoKetQua.ts`, nơi có unit test. Không có bản sao nào để
trôi lệch, và đó là lý do ranh giới được đặt đúng ở chỗ này.

## Hãng và hạng model: CHƯA CHỐT

`index.ts` đang ghim `gemini-3-flash` và có dấu `// TẠM` ở đúng dòng đó. Spec lập luận
rằng hạng Flash/mini *trả lời tự tin và sai* — kiểu hỏng tệ nhất ở đây. Xem mục "Quyết
định còn treo" trong spec trước khi coi lựa chọn hiện tại là quyết định cuối.
