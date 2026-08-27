# Ghi chép brainstorm — nối Google Gemini vào Sổ Gạo (2026-08-27)

## Điều user muốn (turn 1)
Bốn việc, và một việc được nói là CHÍNH:
1. **[CHÍNH] Gợi ý điền màn Tài sản → Tương lai** — "nhiều chỗ tôi chưa biết điền sao cho đúng"
2. Hỏi đáp bằng lời về sổ
3. Chụp biên lai/hoá đơn → thành giao dịch
4. Nhận xét/tóm tắt cuối tháng

## Đã tra trong repo
- **Không có mảnh AI nào** trong `src/`, `api/`, `supabase/functions/`. Đây là nền mới.
- Đã có MCP server cho Claude đọc sổ: `api/_handler.ts` → `api/mcp.mjs`, 5 tool
  (`truy_van`, `bao_cao_thang`, `ngan_sach`, `thoi_quen_ghi_chep`, `lich_su_ty_gia`),
  đọc bằng service-role, **không có đường ghi**. Logic ở `src/mcp/tools/`.
- **Khoá API không thể để phía trình duyệt**: mọi `VITE_*` bị nhúng vào bundle
  (`.env.example` ghi rõ). Phải có mảnh server. Hai chỗ có sẵn: Vercel function (`api/`)
  hoặc Supabase Edge Function (đã có 3 cái, có cơ chế secret).

## Phát hiện quan trọng cho việc #1
Màn Tương lai (`src/features/lifetime/`) đã có SẴN đúng hai thứ mà AI cần:
- **`draft.ts` — bản nháp trùm cả kịch bản** (chặng, mốc, tuổi chiếu tới). Sửa vào nháp
  thì đồ thị + thẻ kết luận vẽ lại ngay, có thanh `DraftBanner` để Lưu/Bỏ.
  → **AI KHÔNG được ghi DB. AI đổ đề xuất vào bản nháp**, user nhìn đồ thị rồi tự Lưu.
  Không cần dựng cơ chế duyệt mới — cơ chế duyệt đã tồn tại.
- **`presets.ts` — mẫu sinh chùm chặng/mốc**, số cứng có ghi nguồn + ngày tra, UI dán nhãn
  "số mặc định, kiểm tra lại". Gemini là bản MỀM của cái này.
  Quy ước đơn vị tiền ở đó rất chặt (hậu tố `_JPY`/`_VND`, ép cứng currency) vì đã từng
  sai 150 lần âm thầm khi để rơi về tiền của chặng → **đề xuất của AI phải luôn kèm
  `currency` tường minh**, đây là cái bẫy số 1.
- `baseline.ts::suggestBaseline` đã suy thu/chi nền từ giao dịch thật (12 tháng, có
  `monthsCovered` để nói số đáng tin cỡ nào) → AI không cần đoán thu/chi nền, đã có số.

## Bảng field AI phải điền (việc #1)
- `LifeScenarioRow`: end_age, real_return_bps, band_spread_bps, starting_assets_minor, nominal_terms
- `LifePhaseRow`: start_year, label, country, currency, annual_income_minor, annual_expense_minor, fx_to_display
- `LifeEventRow`: start_year, end_year, kind, amount_minor, currency, label, note, fx_to_display, inflate
Đây chính là "nhiều chỗ chưa biết điền sao" — lợi suất thực, dải dao động, lương hưu, học phí.

## Chưa quyết
- Thứ tự làm / tách thành mấy vòng
- Đặt mảnh server ở Vercel hay Supabase Edge
- Chuyện gửi dữ liệu tiền của mình sang Google

## Đã chốt (turn 2)
- **Tách thành nền + 4 vòng.** Vòng đầu: NỀN + "Gợi ý màn Tương lai (đề xuất vào bản nháp)".
  Ba vòng sau (biên lai, hỏi đáp, nhận xét cuối tháng) bàn lại sau khi vòng đầu dùng thử.

## Giá Gemini — đã tra thật (2026-08-27, ai.google.dev/gemini-api/docs/pricing)
| Model | Miễn phí | Có thẻ (tới 31/12/2026) | Có thẻ (từ 1/1/2027) |
|---|---|---|---|
| Gemini 3.7 Flash | 0 | $0,75 in / $3,75 out per 1M | $1,50 / $7,50 |
| Gemini 2.5 Flash | 0 | $0,30 in / $2,50 out per 1M | — |
| Gemini 3.1 Pro Preview | không có | $2,00 in / $12,00 out (≤200k) | — |

**Điều khoản dữ liệu (Google ghi thẳng trên trang giá):**
- Miễn phí: "Content used to improve our products"
- Có thẻ: "Content **not** used to improve our products"

**Ước tính cho việc gợi ý màn Tương lai** (3.7 Flash, ~4.000 chữ vào / ~1.500 chữ ra):
≈ 1,3 ¥/lần · ≈ 65 ¥/tháng nếu 50 lần · ≈ 800 ¥/năm.

## ĐANG CHỜ (turn 3)
User **bỏ qua** câu hỏi chọn mức tài khoản (có thẻ / miễn phí làm mờ số / miễn phí số thật).
→ Chưa chốt. **Không được bắt đầu thiết kế phần gửi dữ liệu cho tới khi có câu trả lời**,
vì "làm mờ số" là một lớp code hẳn hoi, có/không đổi hẳn thiết kế.

Khuyến nghị của tôi vẫn là: **bản có thẻ**. 800 ¥/năm đổi lấy việc lương + số dư không
vào diện huấn luyện.

### Ba bước lấy khoá (user tự làm phần thẻ)
1. aistudio.google.com/apikey → Create API key → tạo project Google Cloud mới
2. console.cloud.google.com/billing → gắn thẻ vào ĐÚNG project đó (bước này mới biến khoá
   thành bản có-trả-tiền). Nên đặt hạn mức chi ~¥2.000/tháng để chặn bug gọi vòng lặp.
3. Khoá là **secret phía server**, KHÔNG phải `VITE_*` trong `.env.local` — mọi `VITE_*`
   bị nhúng vào bundle công khai.

## So sánh Claude / Gemini / ChatGPT (turn 3, đã tra web 2026-08-27)

### Điều khoản dữ liệu — bậc "miễn phí thì bị huấn luyện" LÀ ĐẶC SẢN CỦA GEMINI
| | Dùng dữ liệu gửi lên để huấn luyện? | Nguồn |
|---|---|---|
| Gemini miễn phí | **CÓ** ("Content used to improve our products") | ai.google.dev/gemini-api/docs/pricing |
| Gemini có thẻ | Không | cùng trang |
| Claude API | Không, mặc định; không có bản miễn phí | privacy.claude.com |
| OpenAI API | Không, mặc định (phải opt-in mới có) | help.openai.com |

### Giá thật per 1M token (in / out), tra 2026-08-27
- Gemini 3.7 Flash: $0,75 / $3,75 (→ $1,50 / $7,50 từ 1/1/2027)
- Gemini 2.5 Flash: $0,30 / $2,50 · Gemini 3.1 Pro: $2,00 / $12,00
- Claude Haiku 4.5: $1 / $5 · Sonnet 5: $2 / $10 · Opus 5: $5 / $25 · Fable 5: $10 / $50
  (LƯU Ý: Claude 4.7+ dùng tokenizer mới, ~+30% token cùng một đoạn text → cộng 30% vào
  Sonnet 5 / Opus 5, KHÔNG cộng cho Haiku 4.5)
- GPT-5: $1,25 / $10 · GPT-5-mini: $0,25 / $2 · GPT-5-nano: $0,05 / $0,40 · GPT-5-pro: $15 / $120

### Chi phí/NĂM cho vòng 1 (50 lần/tháng, ~4.000 in + ~1.500 out mỗi lần, ¥155/$)
GPT-5-mini ¥370 · Gemini 2.5 Flash ¥460 · Gemini 3.7 Flash ¥800 · Claude Haiku 4.5 ¥1.070 ·
GPT-5 ¥1.860 · Gemini 3.1 Pro ¥2.420 · Claude Sonnet 5 ¥2.780 · Claude Opus 5 ¥6.950
→ **Giá KHÔNG phải trục để quyết.** Cả bảng là 1–2 bát mì một năm.

### Trục thật để cân
- Thử không cần thẻ: **chỉ Gemini**
- Suy luận tiền + sự thật ở Nhật (厚生年金, 児童手当, học phí 2044): bản Pro/Sonnet/GPT-5
- Trả đúng khuôn số: cả ba OK (app đã có zod để kiểm)
- OCR biên lai (vòng 3): Gemini rẻ nhất và quen việc
- Nối MCP server đã có (vòng 2): Claude + OpenAI nối được thẳng trong API; Gemini phải
  làm cầu qua SDK. **CHƯA XÁC MINH KỸ — phải tra lại khi tới vòng 2, đừng dựa vào để quyết bây giờ.**

### Khuyến nghị (turn 3)
1. Viết mảnh server sao cho đoạn "gọi nhà cung cấp nào" gọn trong ~30 dòng một file.
   KHÔNG phải khung cắm mô-đun. Lý do KHÔNG phải "cho linh hoạt" mà là: user đang không
   quyết được giữa ba cái, giá không giúp quyết → phải chạy thử cùng một câu hỏi qua hai
   bên mới quyết được. Đây là chỗ abstraction KHÔNG phải làm sớm.
2. Bắt đầu bằng Gemini (thử được hôm nay không cần thẻ, và user hỏi nó trước).

### Lưu ý đã nói với user
Gói Claude Code đang trả ≠ khoá API. Hai hoá đơn khác nhau, không dùng lại được.

## Chất lượng suy luận (turn 4 — user hỏi "con nào tốt hơn")

### Điểm thi hạng cao nhất (tra 2026-08-27; NGUỒN LÀ BLOG SO SÁNH, không phải báo cáo gốc)
| Bài | Claude | Gemini | GPT |
|---|---|---|---|
| GPQA Diamond | 94,2% | 94,3% | 94,0% |
| Humanity's Last Exam | 67,6% | **79,6%** | — |
| SWE-bench | **~82–88%** | ~64% | — |
→ Ở hạng cao **cả ba đã hội tụ**. Chênh <2 điểm là sai số. Gemini dẫn ở bài siêu khó,
Claude dẫn ở sửa code. Không ai giỏi hơn nói chung.

### KẾT LUẬN THẬT: quyết theo HẠNG, không theo HÃNG
Việc vòng 1 = biết sự thật ở Nhật (厚生年金 công thức 平均標準報酬額 × 5,481/1000 × số tháng,
児童手当, học phí) VÀ biết nói "tôi không chắc".
- Hạng cao (Opus 5 / Gemini 3.1 Pro / GPT-5): biết, và biết tự nhận không chắc
- Hạng Flash/mini: **trả lời tự tin và SAI** ← kiểu hỏng tệ nhất ở đây, vì con số sai đi
  vào bản chiếu 40 năm mà biểu đồ vẫn vẽ ra thuyết phục. Đúng bẫy presets.ts đã ghi:
  "sai 150 lần và KHÔNG có guard nào bắt được".
→ **ĐỪNG chọn Flash/mini để tiết kiệm.** Chênh Flash vs hạng cao là ¥800 vs ¥2.800/năm.

### Phép thử user làm được ngay, 0 đồng (đã đưa cho user)
Dán cùng một câu vào claude.ai / gemini.google.com / chatgpt.com (cả ba có bản web free):
"Tôi 40 tuổi, làm công ăn lương ở Nhật, thu nhập trước thuế 6 triệu yên/năm, đã tham gia
厚生年金 15 năm, dự định làm tới 60. Tuổi 65 nhận lương hưu khoảng bao nhiêu một năm?
Nói rõ công thức và những chỗ anh không chắc."
User có memory `hagukumi-kikin-so-that.md` (số thật đã tra kỹ) để đối chiếu xem ai bịa.

### Hệ quả cho thiết kế
Dù chọn hãng nào, **prompt phải buộc model ghi nguồn từng con số và cho phép trả
"không biết"** — cùng quy ước mà presets.ts đã đặt ("số mặc định, kiểm tra lại").
Đây là biện pháp phòng hộ ở tầng kiến trúc, không phụ thuộc hãng.

## ĐANG CHỜ (turn 4)
Chưa chốt hãng + hạng. Câu hỏi treo: bắt đầu bằng Gemini free → gắn thẻ / Gemini có thẻ /
Claude API / OpenAI API. Chưa được viết code.

## Turn 5 — user chọn "để tôi thử ba bản web trước"
Đã soạn bộ đề: `docs/superpowers/notes/2026-08-27-de-thu-ba-hang-ai.md`
- Câu 1 đo BIẾT (厚生年金, có bảng chấm 5 điểm cộng / 4 điểm trừ)
- Câu 2 đo BIẾT MÌNH KHÔNG BIẾT (real_return_bps + band_spread_bps) — **câu quyết định**
Nguyên tắc chấm: hạng cao trả lời câu 1 hơi kém nhưng câu 2 thật thà thì TỐT HƠN hạng cao
trả lời câu 1 mượt rồi phán "để 5%".

**TRẠNG THÁI: đang chờ user chạy thử. Chưa viết một dòng code nào. Chưa chốt hãng.**
Bước tiếp sau khi user báo kết quả: chốt hãng → viết bản thiết kế NỀN + vòng 1 → user duyệt
→ mới tới writing-plans.
