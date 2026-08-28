# Bản thiết kế — "Tra hộ" số cho mốc cuộc đời (màn Tương lai)

Ngày: 2026-08-27 · Trạng thái: chờ duyệt · Tiếp nối:
[ghi chép brainstorm Gemini](../notes/2026-08-27-gemini-brainstorm.md)

## Vấn đề

Màn Tương lai bắt người dùng điền những con số họ không có cơ sở để biết. Câu nguyên
văn: *"cưới xin thì tôi không biết chi phí này"*. Không biết thì để 0, mà để 0 thì bản
chiếu 40 năm vẽ ra một đường sai — vẫn mượt mà, vẫn thuyết phục, không có gì báo động.

`presets.ts` đã đỡ một phần bằng số cứng có ghi nguồn, nhưng số cứng thì cũ dần và chỉ
phủ được vài mốc.

## Phạm vi — đã chốt

Ba câu hỏi đã chốt trong lúc brainstorm:

1. **Tra từng khoản, bấm mới chạy.** Không quét cả kịch bản, không dựng kịch bản từ đoạn
   văn. AI chỉ chạm đúng dòng người dùng đang đứng.
2. **Tra web thật**, không trả lời từ trí nhớ model. Lý do có bằng chứng: hỏi "chi phí
   cưới ở Nhật", trí nhớ cho một con số phẳng; tra web cho ¥3.439.000 (ゼクシィ 2024) KÈM
   ba cảnh báo — khảo sát 2025 đổi cách đo nên không so được, khoảng phổ biến nhất chỉ
   chiếm 18,6% nên đây là dải, và đó là 総額 chưa trừ ご祝儀. Hai cảnh báo cuối quyết định
   kịch bản đúng hay sai, và trí nhớ không có chúng.
3. **11 loại mốc có sẵn được hỏi kỹ, mốc tự đặt tên hỏi chung.** Cái làm câu trả lời về cưới
   đúng không phải model giỏi, mà là việc BIẾT phải hỏi "đã trừ ご祝儀 chưa".

## Cố ý không làm

- Không tự động tra. Mở trang không tốn gì, không gọi mạng.
- Không lưu lại kết quả cũ (cache). Vài chục lượt cả đời, cache là máy móc thừa.
- Không tra hàng loạt cả kịch bản.
- **Không làm phần "khoản nào đáng tra kỹ".** Thứ đó không cần AI — nó là chạy engine hai
  lần với cận thấp/cận cao rồi so, đúng kiểu việc `stress.ts` đang làm. Việc riêng, làm sau.

## Luồng người dùng

Ô số tiền của mốc nằm ở `EventEditorPopover` — form nhỏ nổi dưới đồ thị khi bấm một chip.
Nút "Tra hộ" đặt cạnh ô đó.

Bấm thì mở `TraSoSheet`, chờ 10–20 giây, rồi hiện:

- Ba mức: thấp / giữa / cao. **Dải, không phải một con số** — vì thực tế là dải.
- Một đoạn ngắn nói số đó là gì và đã trừ/chưa trừ những gì.
- Các cảnh báo model tìm được (đổi cách đo, đổi theo luật, số gộp...).
- Nguồn + ngày tra.
- Ba nút "Lấy ...", một nút "Bỏ qua".

Bốn luật cố định của luồng này:

1. **Không tự chạy.** Chỉ tra khi bấm.
2. **Số vào bản nháp, không vào DB.** Đồ thị đổi ngay, ghi khi bấm Lưu — đúng cơ chế
   `draft.ts` đang chạy. Không dựng cơ chế duyệt mới; cơ chế duyệt đã tồn tại.
3. **Nguồn + ngày tra tự ghi vào `note` của mốc.** Sáu tháng sau mở lại còn biết số ở đâu
   ra và cũ chưa. Đường đã thông sẵn — `patchDraftEvent` nhận `note`, và `planDraftSave`
   đã so `note` để ghi xuống DB. **Không phải sửa `draft.ts`.**
4. **Tiền luôn là tiền của chặng.** Từ bản v5 (`fxModel.ts`, chốt 2026-08-24) tiền nằm
   trên CHẶNG chứ không trên mốc. Câu hỏi mang theo nước + tiền của chặng; câu trả lời
   sai đồng tiền thì bị chặn, không tự quy đổi.

## Kiến trúc

### Vì sao phải có mảnh server

Khoá API không được nằm trong app: app chạy trên trình duyệt, mọi biến `VITE_*` bị nhúng
vào bundle công khai (`.env.example` ghi rõ). Ai mở mã nguồn cũng lấy được khoá và tiêu
hạn mức.

Thêm edge function `tra-so` — thứ tư, sau `push-notify`, `stock-refresh`, `fund-refresh`.

Function này **cố tình ngu**: không có phép tính tiền nào, không đụng DB. Nó đòi người
gọi đã đăng nhập (JWT), ghim sẵn model + độ dài tối đa + bật tra web (app không được tự
chọn — một lỗi vòng lặp phía app không được phép đốt hết hạn mức), chuyển câu hỏi đi, trả
kết quả về.

Vì nó không chứa luật tiền nên **không phải chạy `npm run bundle:rules`**. Không có bản
sao nào để trôi lệch — đây là lý do đặt ranh giới ở đúng chỗ này.

### Đi đúng đường đã có

Luật của repo: feature không tự gọi mạng, mọi thứ qua `repo` rồi qua hook trong
`queries.ts`. Giữ nguyên luật đó — thêm `traSo()` vào **cả hai** bản repo:

- `supabaseRepo.traSo()` gọi edge function.
- `demoRepo.traSo()` trả về một kết quả mẫu có sẵn.

Hệ quả đáng giá: **chế độ demo vẫn bấm được nút này**, thấy đúng luồng, không cần mạng
không cần khoá. Mở đường tắt gọi thẳng từ feature thì demo vỡ, và compiler không bắt được.

Lưu ý: đây là **lần đầu app gọi edge function từ phía trình duyệt** — cả ba function hiện
có đều do cron gọi. Mẫu mới, cần làm cho đúng ngay lần đầu.

### File

| File | Việc |
|---|---|
| `src/features/lifetime/traSo.ts` | **Thuần.** Dựng câu hỏi từ mốc + năm + nước + tiền. Chứa "cách hỏi cho đúng" của 11 loại mốc. Unit test. |
| `src/features/lifetime/traSoKetQua.ts` | **Thuần.** Đọc kết quả, kiểm, từ chối cái sai. Unit test. |
| `src/features/lifetime/TraSoSheet.tsx` | Màn kết quả. Chỉ hiện số, không tính số. |
| `supabase/functions/tra-so/index.ts` | Cầu giữ khoá. ~30 dòng cho đoạn "gọi hãng nào". |

Sửa thêm: nút trong `EventEditorPopover`, `traSo()` + kiểu dữ liệu trong `repo.ts` /
`supabaseRepo.ts` / `demoRepo.ts`, hook trong `queries.ts`. **`draft.ts` không đổi.**

Toán thuần nằm ngoài React, đúng quy ước repo: hai file `.ts` không JSX mang toàn bộ luật,
component chỉ render.

### "Cách hỏi cho đúng" — gắn vào LOẠI MỐC, không vào mẫu

Đây là phần mang giá trị thật, sống cạnh `LIFE_PRESETS` trong `traSo.ts`.

`LIFE_PRESETS` có **6 mẫu**, nhưng chúng sinh ra **11 loại mốc** — riêng "Sinh con" đẻ ra
5 mốc. Nút "Tra hộ" bấm trên một MỐC, nên luật hỏi phải gắn theo loại mốc, không theo mẫu.

| # | Mẫu | Loại mốc | Phải hỏi cho đúng cái gì |
|---|---|---|---|
| 1 | `cuoi` | Chi phí cưới | Lấy 総額 rồi TRỪ ご祝儀 ước tính. Nói rõ giả định bao nhiêu khách. |
| 2 | `sinh-con` | Trợ cấp trẻ em (児童手当) | Tra LUẬT hiện hành, không tra bài báo cũ. Đây là khoản THU, không phải chi. |
| 3 | `sinh-con` | Nuôi con 0–6 tuổi | Có gồm tiền nhà trẻ không, và 幼保無償化 đã trừ chưa. |
| 4 | `sinh-con` | Nuôi con 7–15 tuổi | Trường công hay tư, có gồm học thêm (塾) không. |
| 5 | `sinh-con` | Nuôi con 16–17 tuổi | Cấp ba công/tư, và 高等学校等就学支援金 đã trừ chưa. |
| 6 | `sinh-con` | Con vào đại học | TÁCH công / tư / y khoa. Kèm tiền nhập học năm đầu (入学金) riêng học phí. |
| 7 | `mua-nha` | Trả trước mua nhà | % trả trước thông thường, và các khoản thuế phí kèm theo. |
| 8 | `mua-nha` | Trả vay mua nhà | Lãi suất nào, kỳ hạn bao lâu, số/năm hay số/tháng. |
| 9 | `nghi-huu` | Lương hưu | TÁCH 老齢基礎年金 và 老齢厚生年金. Nói rõ 満額 là số đổi hàng năm và đang lấy năm nào. |
| 10 | `chuyen-nuoc` | Chi phí chuyển nhà, thủ tục | Một lần, gồm những gì (vận chuyển, visa, đặt cọc nhà mới). |
| 11 | `ho-tro-bo-me` | Hỗ trợ bố mẹ | Theo VND và theo mức sống vùng, không quy từ số Nhật. |

Loại 2 là khoản **thu** chứ không phải chi — luật hỏi phải mang theo `kind` để model không
trả về một khoản chi.

Mốc tự đặt tên: hỏi chung, và UI dán nhãn thẳng *"tra chung — tôi không biết khoản này có
bẫy gì, kiểm nguồn kỹ hơn bình thường."*

## Dữ liệu gửi đi

**Một lượt tra không cần biết số dư, thu nhập, tài sản, hay bất kỳ giao dịch nào.** Nó chỉ
cần: mốc gì, năm nào, nước nào, tiền gì. Đây là tính chất cố ý, không phải tình cờ.

| | Gửi đi | Rủi ro |
|---|---|---|
| Mốc sinh từ mẫu (11 loại) | Mã mốc + năm + nước + tiền (`cuoi · 2029 · Nhật · JPY`) | Gần như không. Không có chữ nào người dùng gõ. |
| Mốc tự đặt tên | Chính chữ người dùng gõ | *"Sửa bếp"* vô hại. *"Chi phí điều trị cho mẹ"* là thông tin sức khoẻ người thân. |

Nên: **mốc tự đặt tên hiện cảnh báo một dòng trước khi gửi** — *"Câu này gửi ra ngoài,
đừng gõ chuyện riêng"* — người dùng bấm tiếp hay thôi.

## Xử lý hỏng

| Hỏng | App làm gì |
|---|---|
| Mất mạng, function lỗi | Báo "không tra được". **Ô tiền giữ nguyên.** |
| Kết quả lộn xộn, đọc không ra | Từ chối, báo thẳng. **Không đoán.** |
| Sai đồng tiền so với chặng | **Chặn.** Không tự quy đổi — đúng luật `hasMissingRate`: thà thiếu còn hơn bịa. |
| Không tìm được nguồn | Bắt buộc nói "không tìm được". **Không có nguồn thì không có nút Lấy.** |
| Hết hạn mức | Nói rõ là hết hạn mức, không phải lỗi người dùng. |

Điểm chung, và là tiêu chí nghiệm thu của cả bản thiết kế: **không đường nào dẫn tới một
con số sai lặng lẽ đi vào kịch bản.** Hỏng thì hỏng ồn ào; số cũ không suy suyển.

## Phép thử

- Unit test cho `traSo.ts` (dựng câu hỏi đủ 11 loại mốc + mốc tự đặt tên).
- Unit test cho `traSoKetQua.ts`: kết quả tốt, kết quả lộn xộn, sai đồng tiền, không nguồn.
- **Phép thử khoá "không gửi tiền đi"** — dựng câu hỏi cho đủ 11 loại mốc rồi khẳng định trong
  đó không có số dư / thu nhập / tài sản, và với mốc sinh từ mẫu thì không có chữ người dùng
  gõ. Lời hứa ở mục "Dữ liệu gửi đi" thành cái chốt tự động, không phải lời hứa suông.
- Không test gọi mạng thật.
- `tests/designSystem.test.ts` đã canh sẵn phần UI.

## Hãng và hạng — ĐÃ CHỐT 2026-08-28

> **Chốt: Gemini, bậc miễn phí (hạng Flash).** Chủ nhà quyết sau khi đã nghe cả hai điều
> mục này cảnh báo, và vẫn chọn vậy. Chi tiết + cái đỡ đòn đã có trong mã, xem
> [docs/tra-so.md](../../tra-so.md). Mã model không còn ghim trong mã nguồn nữa mà đọc từ
> biến môi trường `AI_MODEL` — đổi hạng hay đổi sang bậc trả tiền không phải sửa mã.
>
> Phần dưới giữ nguyên làm hồ sơ lập luận lúc chưa chốt.

**Chưa chốt, và spec này cố ý không gắn hãng.**

Bản ghi chép sáng nay đã tra giá thật cả ba hãng và kết luận: giá **không** phải trục để
quyết — cả bảng nằm trong khoảng ¥370–¥6.950 một năm cho mức dùng này. Hai trục thật:

1. **Điều khoản dữ liệu.** Gemini bậc miễn phí ghi thẳng *"Content used to improve our
   products"*, và người thật có thể đọc. Gemini có thẻ, Claude API, OpenAI API đều không.
2. **Hạng model.** Hạng Flash/mini *trả lời tự tin và sai* — kiểu hỏng tệ nhất ở đây, vì
   con số sai đi vào bản chiếu 40 năm mà biểu đồ vẫn vẽ ra thuyết phục. Từ 01/04/2026 bậc
   miễn phí của Gemini **chỉ còn Flash và Flash-Lite**, nên "Gemini free" và "đừng dùng
   Flash" là hai điều không thể cùng đúng.

**Thủ tục quyết**: bộ đề 2 câu ở
[`2026-08-27-de-thu-ba-hang-ai.md`](../notes/2026-08-27-de-thu-ba-hang-ai.md), dán vào bản
web miễn phí của cả ba hãng. Câu 2 (biết-mình-không-biết) là câu quyết định.

**Điều này không chặn việc code.** Đoạn "gọi hãng nào" gói trong ~30 dòng của
`supabase/functions/tra-so/index.ts`. Chốt hãng là sửa một file. Đây là chỗ **không** nên
dựng khung cắm mô-đun sớm — lý do không phải "cho linh hoạt" mà là phải chạy thử thật mới
quyết được.

## Ràng buộc bất kể hãng nào

Dù chọn hãng gì, câu hỏi **phải buộc model ghi nguồn từng con số và cho phép trả lời
"không biết"** — cùng quy ước `presets.ts` đã đặt ("số mặc định, kiểm tra lại"). Đây là
phòng hộ ở tầng kiến trúc, không phụ thuộc hãng, và là thứ khiến mục "không tìm được
nguồn thì không có nút Lấy" ở trên thực thi được.
