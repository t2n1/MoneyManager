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

Máy này chạy **PowerShell**, ở đó `curl` là tên gọi tắt của `Invoke-WebRequest` và không
hiểu cờ `-s` — nó sẽ ngồi hỏi `Uri:` chứ không chạy. Dùng bản PowerShell:

```powershell
$key = Read-Host "Dan khoa vao day"
(Invoke-RestMethod "https://generativelanguage.googleapis.com/v1beta/models?key=$key").models | Where-Object { $_.supportedGenerationMethods -contains 'generateContent' } | ForEach-Object { $_.name -replace '^models/', '' }
```

`Read-Host` để khoá không lọt vào lịch sử lệnh, và **không bao giờ dán khoá vào chat**.

Cảnh báo: **danh sách này liệt kê nhiều hơn số model bạn gọi được.** Có tên trong danh sách
không có nghĩa là tier của bạn được phép gọi. Muốn biết chắc thì phải gọi thử.

Hai điều đã học được lúc dò (2026-08-28):

- **Khoá Gemini bây giờ bắt đầu bằng `AQ.`, không phải `AIza`.** Google đã đổi định dạng;
  đừng lấy tiền tố `AIza` ra làm phép kiểm khoá đúng/sai như tài liệu cũ trên mạng.
- **Khi model bị khai tử, Google nói thẳng tên bản thay thế trong thân lỗi 404.** Nên gọi
  thử rồi đọc lỗi nhanh hơn là tra blog. PowerShell nuốt mất thân lỗi, phải moi ra:

```powershell
try { Invoke-RestMethod ... } catch { (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() }
```

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

## TRẠNG THÁI: chưa deploy — bậc miễn phí KHÔNG chạy được (dò thật 2026-08-28)

**Tính năng đã xong và đã vào `master`, nhưng chưa deploy.** Nút "Tra hộ" chưa hiện ở bản
thật. Chế độ demo thì bấm được (kết quả mẫu, không gọi mạng).

Lý do dừng, đã dò bằng lệnh thật với khoá thật — **đừng dò lại**:

| Thử gì | Kết quả |
|---|---|
| `gemini-2.5-pro` | **404** — không có cho dự án bậc miễn phí |
| `gemini-2.5-flash` | **404** — Google trả lời thẳng: *"no longer available to new users… use models/gemini-3.6-flash"* |
| `gemini-3.6-flash`, KHÔNG có `google_search` | **Chạy tốt.** Trả lời bình thường. |
| `gemini-3.6-flash`, CÓ `google_search` | **429 RESOURCE_EXHAUSTED** ngay lượt đầu, khoá mới tinh |

**Kết luận: bậc miễn phí cho model nhưng KHÔNG cho tra web.** Mà tra web là toàn bộ lý do
tính năng này tồn tại — spec đã bác thẳng phương án trả lời từ trí nhớ model, vì trí nhớ
cho một con số phẳng còn tra web cho ¥3.439.000 kèm ba cảnh báo quyết định đúng/sai.

Tệ hơn nữa nếu cứ deploy: `traSoKetQua.docKetQua` **từ chối mọi kết quả không kèm nguồn**,
và không nguồn thì UI **không hiện nút "Lấy"**. Nên nút sẽ gần như luôn báo "không tìm được
nguồn" — chết lâm sàng, không phải chạy kém.

⚠️ Con số "5.000 lượt tra Google miễn phí mỗi tháng" trôi nổi trên blog là của **Tier 1
(đã gắn thẻ)**, KHÔNG phải bậc không trả tiền. Đã đọc nhầm một lần, đừng nhầm lần nữa.

### Muốn bật thì làm gì

1. **Gắn thẻ vào đúng project Google** đang cấp khoá này → mở Tier 1. Theo tài liệu, Tier 1
   có sẵn hạn mức tra web miễn phí lớn hơn nhiều mức dùng của app này (vài chục lượt cả
   đời), nên thực tế gần như chỉ tốn tiền token. **Đặt hạn mức chi ~¥2.000/tháng** để một
   lỗi vòng lặp không đốt sạch.
2. Gắn thẻ cũng giải luôn chuyện điều khoản: bậc không trả tiền thì Google dùng nội dung
   để cải thiện sản phẩm và **người thật có thể đọc**; bậc trả tiền thì không.
3. Rồi chạy hai lệnh ở mục "Hai bí mật phải đặt" và "Deploy" bên trên, với
   `AI_MODEL=gemini-3.6-flash` (đã xác nhận gọi được).

**Đổi hãng thì không thoát:** Claude API và OpenAI API đều **không có bậc miễn phí**. Không
tồn tại đường miễn phí cho tính năng này.

### Phần lộ dữ liệu — đã giảm thiểu sẵn trong thiết kế

Dù chạy bậc nào: mốc sinh từ mẫu chỉ gửi mã mốc + năm + nước + tiền, **không gửi chữ người
dùng gõ**; mốc tự đặt tên có màn xác nhận trước khi gửi. **Không lượt tra nào mang theo số
dư, thu nhập, hay số tiền hiện tại của mốc** — `traSo.test.ts` có phép thử khoá điều đó.
