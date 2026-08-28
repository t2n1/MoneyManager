# Edge function `tra-so` — deploy và khoá

Cầu giữ khoá API cho nút **"Tra hộ"** ở màn Tương lai. Thiết kế:
[docs/superpowers/specs/2026-08-27-tra-so-tuong-lai-design.md](superpowers/specs/2026-08-27-tra-so-tuong-lai-design.md).

Đây là function **thứ tư**, sau `push-notify`, `stock-refresh`, `fund-refresh` — nhưng là
function **đầu tiên do TRÌNH DUYỆT gọi**. Ba cái kia do cron gọi. Khác biệt đó quyết định
lệnh deploy, nên đọc mục dưới trước khi chép lệnh từ file khác trong `docs/`.

## Hai bí mật phải đặt

```bash
npx supabase@latest secrets set AI_API_KEY=<khoá> AI_MODEL=<mã model> --project-ref <project-ref>
```

`<project-ref>` là phần đầu của `VITE_SUPABASE_URL` (`https://<project-ref>.supabase.co`).

Khoá **chỉ** nằm ở đây. Không đặt vào `.env` phía app: mọi biến `VITE_*` bị nhúng vào
bundle công khai, ai mở mã nguồn cũng lấy được và tiêu hạn mức. Đó là toàn bộ lý do
function này tồn tại.

### Lấy `<mã model>` cho ĐÚNG khoá của bạn

Đừng chép mã model từ blog. Mã của Google luôn mang số phụ (`gemini-2.5-flash`,
`gemini-3.6-flash`, `gemini-3.1-flash-lite`), **đổi theo thời gian**, và bậc miễn phí bị
cắt model theo đợt — nên mã đúng hôm nay có thể chết tháng sau, và mã đúng cho khoá này
có thể sai cho khoá khác. Hỏi thẳng khoá của bạn:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=<khoá>"
```

Trong kết quả, lấy `name` của model nào có `generateContent` trong
`supportedGenerationMethods`, rồi **bỏ tiền tố `models/`** — ví dụ `models/gemini-2.5-flash`
thì `AI_MODEL` là `gemini-2.5-flash`.

Sai mã model thì mọi lượt gọi trả **404**, và function nói thẳng
*"Sai mã model phía server (AI_MODEL)"* thay vì một câu lỗi mạng chung chung — đây là kiểu
hỏng dễ mất hàng giờ nhất nếu thông báo mập mờ.

Đổi model về sau **không phải sửa mã**: chạy lại `secrets set AI_MODEL=…` là xong.

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

## Hãng và hạng model: đã chốt Gemini bậc miễn phí (2026-08-28)

Chốt **Gemini, bậc miễn phí**, tức hạng Flash — chủ nhà quyết sau khi đã nghe hai điều
dưới đây và vẫn chọn vậy. Ghi lại để người sau khỏi tưởng là sót:

- **Nội dung gửi lên vào diện huấn luyện.** Điều khoản Gemini bậc không trả tiền ghi rõ
  Google dùng nội dung để cải thiện sản phẩm, và **người thật có thể đọc**. Thiết kế đã
  giảm thiểu phần lộ: mốc sinh từ mẫu chỉ gửi mã mốc + năm + nước + tiền, không gửi chữ
  người dùng gõ; mốc tự đặt tên có màn xác nhận trước khi gửi. **Không lượt tra nào mang
  theo số dư, thu nhập, hay số tiền hiện tại của mốc** — có phép thử khoá điều đó.
- **Hạng Flash hay đưa số sai một cách tự tin.** Spec gọi đây là kiểu hỏng tệ nhất, vì
  con số sai đi vào bản chiếu 40 năm mà đồ thị vẫn vẽ ra thuyết phục.

**Cái đỡ đòn cho lựa chọn này đã có sẵn trong mã:** câu hỏi buộc model ghi nguồn và cho
phép trả lời "không biết"; `traSoKetQua.docKetQua` **từ chối mọi kết quả không kèm nguồn**;
và không có nguồn thì UI **không hiện nút "Lấy"**. Nên đường "số bịa lặng lẽ vào kịch bản"
vẫn bị chặn ở tầng kiến trúc, không phụ thuộc model giỏi hay dở.

Đổi ý lúc nào cũng được, và **không phải sửa mã**: gắn thẻ vào project Google (chuyển sang
bậc trả tiền, hết chuyện huấn luyện) rồi `secrets set AI_MODEL=<mã hạng Pro>`. Đổi sang
hãng khác thì mới phải sửa `goiNhaCungCap` — ~30 dòng, là chỗ duy nhất biết tên hãng.
