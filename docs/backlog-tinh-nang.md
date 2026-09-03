# Backlog tính năng — để dành cho các giai đoạn sau

> **Ngày ghi:** 2026-07-14 · **Cập nhật:** 2026-07-20 · **Trạng thái:** Đã ship hết mục khả thi (đợt "làm hết")
>
> **Đã hoàn thành (giữ lại để tham chiếu):** A (báo cáo năm), B (lịch), C+D (giao dịch
> định kỳ), E (trang tài sản), F (nợ/cho vay), G (danh mục mẹ/con), H (xuất CSV),
> I (gợi ý thông minh), K (hoàn tác sau lưu), L (máy tính), M (nhập liên tục),
> N (tách hóa đơn), O (PWA shortcuts), Q (thẻ insight), R (dự báo run-rate),
> S (so sánh tháng), U (bất thường), V (tỷ lệ tiết kiệm + streak), W (dòng tiền tích lũy).
> Tỷ giá tự động (fetch + cache) cũng đã có sẵn trong `src/lib/rates.ts`.
> Ngoài backlog: **Gửi tiền về VN** (remittance), **tối ưu Nhật** (loại TK Nhật, danh
> mục Nhật) và **Lifetime** (chiếu tài sản ròng cả đời, 2026-07-29 — xem mục riêng ở
> nhóm "mở rộng nghiệp vụ") cũng đã ship.
>
> **Đợt "làm hết" 2026-07-20 (nhánh feat/backlog-batch) — ĐÃ XONG TOÀN BỘ mục khả thi:**
> Z (sao lưu/khôi phục JSON), H (xuất CSV), AK (ẩn số tiền), AB (hoàn tác khi xóa),
> AP (xuất PDF/in), AN (nhắc nhở trong app), AO (onboarding), AL (lọc theo số tiền),
> AA (offline persist cache), Y (nhập CSV sao kê), AM (loại trừ thống kê), X (reconcile),
> T (radar định kỳ), AD (mục tiêu tiết kiệm), AH (ngân sách nâng cao), AF (lịch sử net
> worth), J (mẫu giao dịch nhanh), AG (nợ có lãi/trả góp). Do user tự làm song song:
> AE (giá trị đầu tư), P (nhập nhanh bằng lời/parseNl). Mỗi mục 1 commit, build/lint/test sạch.
> **2026-08-05:** "nhập nhanh bằng lời" (gõ câu → tự điền form, `parseNl`) đã **bỏ hẳn**
> — xem mục P.
>
> **Đã chốt KHÔNG làm (nền lớn / phá 0đ):** AJ (sổ chung), AS (nhiều sổ),
> AR (i18n), AQ (web push), AT (trợ lý AI), AI-OCR (đọc hóa đơn tự động).
>
> File này chỉ **gom ý tưởng** cho các giai đoạn sau. Khi bắt tay làm từng mục,
> mỗi mục sẽ đi qua quy trình riêng: brainstorm → spec (`docs/superpowers/specs/`)
> → plan (`docs/superpowers/plans/`) → cài đặt. Ở đây **không có** quyết định thiết
> kế cuối cùng.

## Ràng buộc luôn đúng (nhắc lại để khỏi quên khi làm sau)

Mọi mục dưới đây khi triển khai vẫn phải theo các ràng buộc cố định của dự án:

- Stack: React + Vite + TS + Tailwind + TanStack Query + Recharts + vite-plugin-pwa.
- Không backend riêng — client gọi thẳng Supabase, bảo vệ bằng RLS.
- Chạy 2 chế độ qua `isDemoMode`: `demoRepo` (localStorage) và `supabaseRepo` (Postgres).
  **Mọi đọc/ghi đi qua interface `Repo`** (`src/data/repo.ts`) — tính năng mới phải
  cài **cả 2 repo**.
- Tiền lưu **minor units (`bigint`)**, không bao giờ dùng float.
- Đa tiền tệ JPY (chính) / VND / USD — tiền tệ theo tài khoản, quy đổi base qua
  `src/lib/rates.ts` (`convertToBase`).
- Mọi truy vấn "tháng" đi qua `getMonthRange()` / `monthKeyForDate()` (tôn trọng
  `month_start_day`).
- UI tiếng Việt. Mobile = bottom tab bar; desktop ≥1024px = sidebar.
- App phải mở nhanh — màn nặng (Recharts) phải lazy-load.
- Chi phí vận hành 0đ (Supabase + Vercel free tier).
- Mỗi tính năng 1 commit, message **không dấu**. Sau mỗi tính năng:
  `npm run build` + `npm run lint` + `npm test` phải sạch.

---

## Các mục

### A. Báo cáo theo năm

Xem báo cáo tổng hợp cho **cả năm** (bên cạnh báo cáo tháng hiện có).

- Ý tưởng: thêm chế độ "Năm" ở màn Báo cáo — tổng thu/chi/số dư 12 tháng, biểu đồ
  cột theo tháng, cơ cấu danh mục cả năm.
- Gợi ý kỹ thuật: cần helper `getYearRange()` (tôn trọng `month_start_day` như
  `getMonthRange`) và hàm gộp 12 `monthKey`. Tái dùng `convertToBase` cho đa tiền tệ.
- Liên quan: mở rộng segmented control ở `ReportsPage` (đang có `Biểu đồ | Ngân sách`).

### B. Sổ giao dịch dạng lịch (calendar)

Xem sổ giao dịch theo **giao diện lịch tháng** — mỗi ngày hiển thị tổng thu/chi,
chạm vào ngày để xem danh sách giao dịch ngày đó.

- Ý tưởng: lưới lịch 7 cột; ô ngày tô màu/nhãn theo net thu-chi; badge số giao dịch.
- Gợi ý kỹ thuật: gom giao dịch theo `occurred_on`; chú ý ranh giới tháng tài chính
  (`month_start_day`) khi tô "ngoài tháng". Component nặng → cân nhắc lazy-load.
- Liên quan: có thể là chế độ xem thứ 2 của màn sổ giao dịch (list ⇄ calendar).

### C. Khoản chi tự động (định kỳ: tuần / tháng / năm)

Khoản chi lặp lại tự động theo chu kỳ tuần, tháng, năm.

- **Trùng với GĐ3 mục 2 (Giao dịch định kỳ)** trong lộ trình hiện tại — nên gộp
  chung khi làm. Cơ chế đã chốt sơ bộ: bảng `recurring_rules`, **catch-up khi mở
  app** (không dùng cron).
- Chu kỳ cần hỗ trợ: `weekly`, `monthly`, `yearly` (mục 2 GĐ3 gốc mới nói tháng —
  đây mở rộng thêm tuần + năm).
- Gợi ý kỹ thuật: rule lưu chu kỳ + ngày bắt đầu + lần sinh gần nhất; khi mở app
  sinh bù các kỳ đã tới hạn. Cần cài cả 2 repo.

### D. Chuyển khoản tự động (định kỳ: tuần / tháng / năm)

Giống mục C nhưng cho **giao dịch chuyển khoản** (`transfer`, có `to_account_id`).

- Nên **gộp cùng cơ chế `recurring_rules` ở mục C** — chỉ khác `type = 'transfer'`
  và có tài khoản đích + `to_amount` (đa tiền tệ giữa 2 tài khoản khác loại tiền).
- Gợi ý kỹ thuật: cùng đường sinh bù khi mở app; validate 2 tài khoản khi tạo rule.

> **Ghi chú:** C + D + mục 2 GĐ3 hiện tại nên làm **thành một tính năng "Giao dịch
> định kỳ"** chung (chi/thu/chuyển khoản, chu kỳ tuần/tháng/năm), tránh làm 3 lần.

### E. Trang tổng tài sản (tách riêng khỏi trang danh mục tài khoản)

Một **trang riêng** để xem **tổng tài sản** — tổng số dư mọi tài khoản, quy đổi về
base currency.

- Ý tưởng: tổng tài sản (base), phân rã theo tài khoản, theo loại tiền; có thể kèm
  biểu đồ tỷ trọng.
- Gợi ý kỹ thuật: cộng số dư các tài khoản qua `convertToBase`; cảnh báo khi thiếu
  tỷ giá (giống `hasMissingRate` ở ngân sách). Số dư âm (nợ) xử lý sao — xem mục F.
- Liên quan: có thể là trang con hoặc màn riêng gắn với khu vực "Tài khoản".

### F. Chức năng nợ (cho bạn bè, công ty)

Theo dõi **khoản nợ / cho vay** với người/đơn vị khác (bạn bè, công ty).

- Ý tưởng: mỗi khoản nợ có đối tác, chiều (mình nợ / người ta nợ mình), số tiền,
  hạn, trạng thái (đang nợ / đã tất toán), lịch sử trả từng phần.
- Câu hỏi thiết kế cần chốt khi brainstorm:
  - Nợ có tính vào **tổng tài sản** (mục E) không? (tài sản ròng = tài khoản ± nợ)
  - Trả nợ có sinh **giao dịch** thật (ảnh hưởng số dư tài khoản) không?
  - Có gắn với **tài khoản/danh mục** nào không?
- Gợi ý kỹ thuật: bảng `debts` + có thể `debt_payments`; RLS như các bảng khác; đa
  tiền tệ. Cài cả 2 repo + migration mới.

### G. Danh mục mẹ / danh mục con (cho Thu và Chi)

Cho phép **phân cấp danh mục 2 tầng**: danh mục mẹ chứa nhiều danh mục con, áp dụng
cho cả nhóm **Thu** (`income`) và **Chi** (`expense`).

- Ý tưởng: ví dụ mẹ "Ăn uống" → con "Đi chợ", "Nhà hàng", "Cà phê". Khi nhập giao
  dịch chọn tới danh mục con; báo cáo/ngân sách có thể gộp theo mẹ.
- Câu hỏi thiết kế cần chốt khi brainstorm:
  - Giao dịch gắn vào **danh mục con** (mẹ chỉ để gom) hay cho phép gắn cả mẹ?
  - **Ngân sách** (GĐ3 mục 1) đặt theo mẹ hay con? (ảnh hưởng `buildBudgetReport`)
  - **Báo cáo** cơ cấu danh mục: hiển thị theo mẹ (gộp con) hay phẳng?
  - Giới hạn đúng **2 tầng** hay cho lồng sâu hơn? (khuyến nghị: chốt 2 tầng cho gọn)
  - Xử lý dữ liệu cũ: danh mục hiện tại thành mẹ (không cha) — migrate thế nào?
- Gợi ý kỹ thuật: thêm cột `parent_id uuid null` (self-FK) vào bảng `categories`;
  ràng buộc mẹ và con cùng `type` (income/con-income, expense/con-expense); chặn
  vòng lặp / giới hạn độ sâu. Cập nhật cả 2 repo + migration mới. UI chọn danh mục
  ở màn Nhập cần đổi thành dạng phân cấp (nhóm mẹ → chọn con).
- Liên quan: đụng nhiều nơi — màn Nhập, màn Danh mục, Báo cáo (cơ cấu danh mục),
  Ngân sách (mục 1). Cần cân nhắc kỹ trước khi làm vì lan rộng.

### H. Xuất file Excel (.xlsx)

Xuất dữ liệu giao dịch ra **file Excel** để mở/xử lý bằng Excel, Google Sheets…

- **Liên quan trực tiếp GĐ3 mục 3 (Xuất CSV):** cần chốt **CSV vs Excel thật (.xlsx)**:
  - CSV: nhẹ, không thêm thư viện, mở được bằng Excel — nhưng chỉ 1 sheet, không định
    dạng, dễ lỗi dấu tiếng Việt nếu thiếu BOM UTF-8 (mục 3 gốc đã tính BOM).
  - .xlsx thật: nhiều sheet, định dạng cột/tiền tệ, header đậm — nhưng cần thư viện
    (VD `xlsx`/SheetJS hoặc `exceljs`) → **tăng bundle**, xung đột với ràng buộc
    "app phải mở nhanh" → phải **lazy-load** đường xuất, chỉ tải lib khi bấm xuất.
- Câu hỏi thiết kế cần chốt khi brainstorm:
  - Làm **thay** mục 3 (chỉ Excel) hay **cả hai** (CSV nhanh + Excel đầy đủ)?
  - Xuất gì: giao dịch theo tháng/năm đang xem? nhiều sheet (giao dịch / danh mục /
    tài khoản / ngân sách)? tiền hiển thị theo đơn vị gốc hay quy đổi base?
  - Chạy hoàn toàn **client-side** (giữ 0đ, không backend) — xác nhận lib chạy được
    trong trình duyệt/PWA.
- Gợi ý kỹ thuật: sinh file client-side, `Blob` + tải xuống; lazy-import thư viện
  xlsx trong handler nút xuất để không nặng lần mở app. Không cần đụng schema/repo
  ghi (chỉ đọc dữ liệu sẵn có).

---

> **Bổ sung 2026-07-14 — nhóm "Trải nghiệm nhập liệu" (I–P) & "Thấu hiểu tài chính"
> (Q–W).** Phần lớn các mục dưới đây **chỉ đọc/tính toán từ dữ liệu sẵn có** hoặc là
> UI thuần → nhẹ, ít đụng schema. Mục nào cần bảng/cột mới sẽ ghi rõ.

## Nhóm trải nghiệm nhập liệu

### I. Gợi ý thông minh khi mở màn Nhập

Mở app là form đã **điền sẵn ngữ cảnh gần nhất** để rút thời gian nhập xuống ~2s.

- Ý tưởng: mặc định chọn tài khoản + danh mục dùng gần nhất; autocomplete ghi chú
  từ lịch sử `note`; có thể gợi ý danh mục theo ghi chú vừa gõ.
- Gợi ý kỹ thuật: suy ra từ giao dịch gần đây (đọc thôi, **không đổi schema**). Cân
  nhắc lưu "lựa chọn gần nhất" ở localStorage cho tức thì; gợi ý theo lịch sử tính
  client-side. Không cần đụng repo ghi.
- Liên quan: `EntryPage` / `TransactionForm`.

### J. Mẫu giao dịch nhanh (favorites) — ✅ ĐÃ LÀM (2026-07-20)

> Đã ship: store `src/features/transactions/quickTemplates.ts` (localStorage, chốt phương
> án **cục bộ theo thiết bị** cho nhẹ), chip 1 chạm + nút "Lưu mẫu" ở màn Nhập GD.

Nút lưu sẵn các giao dịch hay lặp ("Cà phê 500¥", "Ăn trưa 800¥") — **chạm 1 phát
điền sẵn** danh mục + số tiền + tài khoản.

- Khác **mục C/D (định kỳ)**: mẫu nhanh **không tự sinh**, chỉ điền hộ khi người dùng
  bấm; vẫn phải bấm Lưu.
- Câu hỏi thiết kế cần chốt: mẫu lưu **cục bộ theo thiết bị** (localStorage, đơn giản,
  không đồng bộ) hay **bảng `quick_templates`** (đồng bộ đa thiết bị, cần cài cả 2 repo
  + migration)?
- Gợi ý kỹ thuật: nếu chọn bảng → RLS như các bảng khác; nếu localStorage → không đụng
  Supabase.

### K. Hoàn tác sau khi lưu (undo)

Toast "Đã lưu ✓ · Hoàn tác" giữ ~5s để **chống nhập nhầm** khi nhập vội (< 5s).

- Gợi ý kỹ thuật: giữ id giao dịch vừa tạo; bấm Hoàn tác → `deleteTransaction(id)` +
  invalidate query. Client-only, **không đổi schema**. Chú ý dọn timer như toast hiện có.
- Liên quan: `EntryPage` (đã có sẵn cơ chế toast).

### L. Máy tính trong ô số tiền

NumPad hỗ trợ `+ − × ÷` để gõ biểu thức ("1200+800") — rất hay dùng khi gộp hóa đơn.

- Gợi ý kỹ thuật: **UI thuần** trong `NumPad`; tính trên **minor units** (số nguyên),
  tránh float; validate biểu thức. Không đụng data.

### M. Nhập liên tục (batch)

Sau khi lưu, **giữ nguyên tài khoản/ngày**, chỉ xóa số tiền + ghi chú để nhập một
loạt món (đi chợ về nhập nhiều lần).

- Gợi ý kỹ thuật: UI thuần ở `TransactionForm` (biến thể của `resetAfterSubmit` — reset
  một phần). Có thể là một tùy chọn bật/tắt. Không đụng data.

### N. Tách hóa đơn (split)

Một lần trả → chia **nhiều danh mục** (siêu thị: đồ ăn + gia dụng).

- Câu hỏi thiết kế cần chốt: lưu thành **nhiều giao dịch rời** (đơn giản, mỗi dòng 1
  danh mục) hay **1 giao dịch có nhiều dòng con** (cần cột `group_id`/bảng con →
  migration + đụng repo, báo cáo)?
- Gợi ý kỹ thuật: khuyến nghị bản đầu làm **nhiều giao dịch rời cùng ngày/ghi chú** để
  không đổi schema; nâng cấp "nhóm" sau nếu cần.
- Liên quan: màn Nhập, Sổ giao dịch (hiển thị nhóm), Báo cáo.

### O. App shortcuts (PWA)

Giữ icon app → menu nhảy thẳng "Nhập chi / Nhập thu", đúng tinh thần "mở là nhập".

- Gợi ý kỹ thuật: khai báo `shortcuts` trong manifest (`vite-plugin-pwa`); deep link tới
  route Nhập với query định sẵn type. Không đụng data. Nhẹ.

### P. Nhập bằng giọng nói

Đọc để điền **ghi chú** (và có thể số tiền): nói "cà phê 500 yên".

- Gợi ý kỹ thuật: Web Speech API (SpeechRecognition) — **0đ, chạy client**, không thư
  viện. Kiểm tra hỗ trợ trình duyệt (tính năng tùy chọn, ẩn nếu không có). Parse tiếng
  Việt số tiền là phần khó → có thể chỉ điền text trước.
- **Đã thử và bỏ (2026-08-05):** bản **gõ** câu tự nhiên (`parseNl` + ô "Gõ nhanh" trong
  form Nhập) từng ship rồi xoá theo yêu cầu user. Nếu làm giọng nói sau này, đừng lấy
  parser cũ làm điểm bắt đầu — nó không còn trong repo.

## Nhóm thấu hiểu tài chính

### Q. Thẻ insight tự động (Tổng quan)

Vài câu ngắn tự sinh: "Tháng này chi 320k¥, +18% so tháng trước", "Ăn uống chiếm 40%",
"Cuối tuần chi gấp đôi ngày thường".

- Gợi ý kỹ thuật: **rule-based, tính client-side** từ giao dịch tháng (đọc thôi). Tái
  dùng `aggregate.ts` + `convertToBase`. Không đổi schema. Thiết kế tập luật rõ ràng,
  test được.

### R. Dự báo cuối tháng (run-rate)

Dựa tốc độ chi tới thời điểm hiện tại → **ước tính tổng cuối tháng** và đối chiếu ngân
sách: "Với đà này bạn sẽ chi ~450k¥, vượt ngân sách 50k".

- Gợi ý kỹ thuật: run-rate = chi tới nay / số ngày đã qua × số ngày trong tháng tài
  chính (tôn trọng `month_start_day` qua `getMonthRange`). Tính client-side, không đổi
  schema. **Ăn khớp trực tiếp với ngân sách (GĐ3 mục 1)** — dùng lại `buildBudgetReport`.
- Liên quan: màn Ngân sách / Tổng quan.

### S. So sánh tháng (▲▼)

Mỗi danh mục: tháng này vs tháng trước vs **trung bình 3 tháng**, kèm mũi tên tăng/giảm.

- Gợi ý kỹ thuật: gộp nhiều `monthKey` (đọc), mở rộng `aggregate.ts`; đa tiền tệ qua
  `convertToBase`. Không đổi schema. Liên quan mục **A (báo cáo năm)** — nên tái dùng
  helper gộp tháng chung.

### T. Radar khoản định kỳ (tự phát hiện)

Quét lịch sử tìm giao dịch **lặp đều** (tiền nhà, thuê bao) → nhắc "bạn có ~X/tháng cho
khoản định kỳ".

- Gợi ý kỹ thuật: heuristic gom theo (danh mục + ghi chú tương tự + số tiền gần nhau +
  khoảng cách ~1 tháng). Client-side, đọc thôi. **Feed cho mục C/D** — có thể đề xuất
  "tạo giao dịch định kỳ" từ khoản phát hiện được.

### U. Phát hiện bất thường

Cảnh báo giao dịch **lớn bất thường** so với thói quen của danh mục đó ("chi 50k¥ Mua
sắm — gấp 5 lần trung bình").

- Gợi ý kỹ thuật: so với trung bình/median lịch sử danh mục (client-side). Ngưỡng cấu
  hình đơn giản. Không đổi schema. Chú ý nhiễu khi ít dữ liệu.

### V. Tỷ lệ tiết kiệm & streak "ngày không chi"

Chỉ số sức khỏe: **(thu − chi)/thu** trong tháng; và chuỗi **ngày không chi tiêu** để
tạo động lực.

- Gợi ý kỹ thuật: tính từ giao dịch tháng (đọc). Streak = đếm ngày liên tiếp không có
  giao dịch chi. Nhẹ, không đổi schema.

### W. Dòng tiền tích lũy trong tháng

Biểu đồ đường **số dư chạy theo ngày** trong tháng (thu cộng, chi trừ).

- Gợi ý kỹ thuật: cộng dồn theo `occurred_on`; Recharts → màn nặng, **lazy-load** như
  các biểu đồ hiện có. Đọc thôi, không đổi schema.

---

> **Bổ sung 2026-07-19 — rà soát so với app quản lý tài chính cùng loại.** Nhóm
> "Độ tin cậy dữ liệu" (X–AC) là những thứ người dùng thật vấp sớm nhất; nhóm
> "Mở rộng nghiệp vụ" (AD–AJ) tùy định hướng sản phẩm; nhóm "Trải nghiệm & tiện ích"
> (AK–AT) nhẹ, làm rời được.

## Nhóm độ tin cậy dữ liệu

### X. Điều chỉnh số dư (reconcile)

Số dư ví/tài khoản thực tế luôn lệch so với sổ — cần nút "Điều chỉnh về số thực tế".

- Ý tưởng: nhập số dư thực tế → app tự tạo **giao dịch điều chỉnh** bù phần chênh;
  giao dịch này **không tính vào thống kê chi tiêu** (báo cáo, ngân sách, insight).
- Câu hỏi thiết kế: thêm `type = 'adjustment'` hay cờ `is_adjustment` trên giao dịch
  thường? (ảnh hưởng mọi chỗ lọc theo `type` — calc, aggregate, báo cáo).
- Gợi ý kỹ thuật: đặt ở `AccountDetailPage`; cài cả 2 repo + migration nếu thêm cột.

### Y. Nhập CSV từ sao kê ngân hàng

Chiều ngược của mục H: đọc file CSV sao kê → tạo hàng loạt giao dịch.

- Ý tưởng: upload CSV → map cột (ngày/số tiền/ghi chú) → xem trước → xác nhận nhập;
  nhớ mapping theo ngân hàng cho lần sau (localStorage).
- Khó ở: format mỗi ngân hàng mỗi khác (JP/VN), encoding (Shift-JIS với ngân hàng Nhật),
  chống nhập trùng (hash ngày+số tiền+ghi chú?).
- Gợi ý kỹ thuật: parse client-side; lazy-load màn nhập. Làm **sau H** (xuất) vì cùng
  hạ tầng đọc/ghi file.

### Z. Sao lưu / khôi phục thủ công (JSON)

Xuất toàn bộ dữ liệu ra 1 file JSON và nhập lại được — bảo hiểm cho demo mode
(localStorage mất là mất hết) và cho cả Supabase (di chuyển tài khoản).

- Gợi ý kỹ thuật: serialize qua các hàm đọc của `Repo`; nhập = ghi lại theo thứ tự
  phụ thuộc (accounts → categories → transactions → debts…). Không đổi schema.

### AA. Offline cho chế độ Supabase

PWA đã cài nhưng mất mạng thì bản Supabase gần như không dùng được.

- Bước rẻ: persist cache TanStack Query (`@tanstack/react-query-persist-client`) →
  mở app offline vẫn **xem** được dữ liệu đã tải.
- Bước đắt (cân nhắc kỹ): hàng đợi ghi offline + sync lại khi có mạng — phức tạp
  (xung đột, thứ tự), chỉ làm nếu thật sự cần.

### AB. Undo khi xóa (mở rộng mục K)

K mới phủ "hoàn tác sau khi **lưu**"; xóa giao dịch/khoản nợ vẫn là mất luôn sau
`window.confirm`.

- Gợi ý kỹ thuật: toast "Đã xóa · Hoàn tác" ~5s; giữ bản ghi trong bộ nhớ, hết giờ mới
  gọi delete thật (hoặc delete ngay + re-create khi undo — đơn giản hơn với repo hiện
  tại). Client-only, không đổi schema.

### AC. Khóa app bằng PIN

Dữ liệu tài chính nhạy cảm — app mở là thấy hết.

- Ý tưởng: PIN 4-6 số, hỏi khi mở app / quay lại sau X phút; tùy chọn trong Cài đặt.
- Gợi ý kỹ thuật: client-side (hash PIN trong localStorage) — đủ cho mức cá nhân,
  không phải bảo mật thật (dữ liệu Supabase đã có auth). Cân nhắc WebAuthn/biometric
  sau. Không đổi schema.

## Nhóm mở rộng nghiệp vụ

### AD. Mục tiêu tiết kiệm (savings goals)

Đích tiền + hạn + tiến độ ("Quỹ du lịch 300k¥ trước tháng 12 — đạt 60%").

- Ý tưởng: gắn mục tiêu vào 1 tài khoản hoặc 1 nhóm tài sản; tiến độ = số dư hiện tại
  / đích; hiển thị ở trang Tài sản.
- Gợi ý kỹ thuật: bảng `savings_goals` (RLS như các bảng khác) + cài cả 2 repo.
  Tính tiến độ tái dùng `getAccountBalances` + `convertToBase`.

### AE. Cập nhật giá trị tài sản đầu tư ✅ (migration 0016)

Số dư hiện chỉ đổi qua giao dịch → vàng/chứng khoán/crypto không phản ánh được
tăng giảm giá thị trường.

- **Đã cài (2026-07-20):** loại tài khoản `investment`; bảng snapshot `account_valuations`
  (giá thị trường theo ngày); view `account_balances` lộ `market_value`. Lãi/lỗ chưa
  thực hiện = giá thị trường − vốn gốc, **chỉ vào Tổng tài sản / Net worth** (Báo cáo
  thu/chi không đổi). UI: form TK có loại "Đầu tư", sheet "Cập nhật giá trị",
  AccountDetail hiện vốn gốc/giá trị/lãi lỗ + lịch sử, trang Tài sản hiện lãi/lỗ tổng.
  Spec: [`specs/2026-07-20-gia-tri-dau-tu-design.md`](./superpowers/specs/2026-07-20-gia-tri-dau-tu-design.md).
- **Ngoài phạm vi v1:** lot-tracking / tách lãi đã-thực-hiện; tự lấy giá qua API.
- Liên quan: mục X (cùng khái niệm "chỉnh số dư ngoài dòng tiền"); mục AF (lịch sử net worth).

### AF. Lịch sử tài sản ròng theo thời gian

Biểu đồ tổng tài sản (± nợ) theo tháng — trả lời "mình đang giàu lên hay nghèo đi".

- Khó ở: số dư quá khứ **tính lại được** từ giao dịch, nhưng tỷ giá quá khứ thì không
  → cần snapshot. Gợi ý: lưu snapshot tổng tài sản (base) mỗi khi mở app sang kỳ mới,
  bảng `networth_snapshots`.
- Liên quan: mục AE (giá trị đầu tư ảnh hưởng net worth), trang Tài sản.

### Lifetime — chiếu tài sản ròng cả đời — ✅ ĐÃ LÀM (2026-07-29)

> Đã ship: ba bảng `life_scenarios` / `life_phases` / `life_events` + cột
> `profiles.birth_year` (migration 0031, tỷ giá riêng cho sự kiện ở 0032), engine thuần
> `features/lifetime/project.ts` + `insights.ts` (đều nằm trong `purity.test.ts`), màn
> `/lifetime` với đồ thị + dải dao động, bảng theo năm + xuất CSV, 4 thẻ kết luận, trình
> sửa kịch bản (nhân bản / xoá / đặt kịch bản chính), 6 mẫu sinh chùm chặng-sự kiện, và
> luật nhắc lệch `lifetimeRules.ts` (loại thông báo `lifetime-drift`).

**Ngoài backlog gốc** (mục này không có trong bản ghi 2026-07-14, sinh ra từ brainstorm
riêng): chiếu tài sản ròng theo từng năm tới hết đời kiểu Zaim, dựa trên **chặng đời**
(thu chi nền) + **sự kiện** (khoản có năm đầu/cuối).

- Chặng đời **cố ý không buộc theo quốc gia**: cưới, sinh con, vợ nghỉ làm cũng đổi thu
  chi nền y như đổi nước. `country` chỉ là thuộc tính, để trống được.
- Lương hưu là **sự kiện**, không phải cột trên chặng — đóng 年金 ở Nhật nhưng nhận khi đã
  sang Mỹ, gắn vào chặng là mô hình sai.
- Điểm yếu đã biết: `fx_to_display` do người dùng tự khai (đoán tỷ giá năm 2050 thì số nào
  cũng sai). Xử lý bằng "sai một cách nhìn thấy được": tỷ giá không tra được thì để 1 và
  banner cảnh báo đếm đúng tổ hợp `currency ≠ display_currency && fx_to_display = 1`.
- Spec: [`specs/2026-07-29-lifetime-design.md`](./superpowers/specs/2026-07-29-lifetime-design.md)
  — kèm mục "Chỗ cố ý chưa làm".
- Liên quan: mục AF (lịch sử net worth — đồ thị vẽ chuỗi thật đó liền nét trước phần
  chiếu), mục AN (nhắc lệch dùng chuông trong app).

### AG. Nợ có lãi suất / trả góp — ✅ ĐÃ LÀM (2026-07-20)

> Đã ship: cột `interest_bps` + `term_months` (migration 0021), lib `amortization.ts`
> (công thức niên kim, thuần + test), lịch trả dự kiến ở màn chi tiết nợ (mỗi kỳ / tổng
> lãi / tổng phải trả + bảng chi tiết từng kỳ). Nhắc kỳ tới hạn dùng lại `due_on` sẵn có.

Mục F hiện chỉ có gốc (`principal`) — chưa mô tả được khoản vay trả góp có lãi.

- Ý tưởng: thêm lãi suất + kỳ hạn + lịch trả dự kiến (amortization); nhắc kỳ tới hạn.
- Chỉ làm khi có nhu cầu thật — độ phức tạp cao (cách tính lãi mỗi nơi mỗi khác).

### AH. Ngân sách nâng cao

- **Rollover:** hạn mức dư tháng này cộng sang tháng sau (opt-in từng danh mục).
- **Ngân sách tổng tháng:** 1 con số trần cho toàn bộ chi (bên cạnh từng danh mục).
- **Cảnh báo vượt:** banner/badge khi chạm 80%/100% hạn mức (hiện mới có thanh tiến độ,
  người dùng phải tự vào xem).
- Gợi ý kỹ thuật: rollover cần cột/flag trên `budgets` + logic ở `buildBudgetReport`;
  cảnh báo tính client-side khi mở app, ăn khớp mục R (dự báo run-rate).

### AI. Đính kèm ảnh hóa đơn

Chụp/đính ảnh hóa đơn vào giao dịch.

- Gợi ý kỹ thuật: Supabase Storage (free tier 1GB — cân nhắc nén ảnh client-side);
  demo mode lưu base64/IndexedDB có giới hạn. Cột `attachment_url` trên transactions.
  OCR tự đọc số tiền là bước sau nữa (tốn phí API → cân nhắc ràng buộc 0đ).

### AJ. Sổ chung nhiều người (vợ chồng / gia đình)

Nhiều user ghi chung một sổ, xem được giao dịch của nhau.

- **Thay đổi nền lớn nhất backlog:** data model đang gắn mọi bảng vào `user_id` +
  RLS theo user → cần khái niệm `ledger_id`/`household` + bảng thành viên + sửa RLS
  toàn bộ. Chỉ làm nếu là định hướng sản phẩm; nếu làm, càng sớm càng đỡ migrate.

## Nhóm trải nghiệm & tiện ích

### AK. Chế độ riêng tư (ẩn số tiền)

Nút mắt 👁 che mọi số tiền thành `•••` — mở app nơi công cộng không lộ số dư.

- Gợi ý kỹ thuật: state toàn cục + format tiền đi qua 1 chỗ (`lib/money.ts`) nên chèn
  được tập trung; lưu lựa chọn localStorage. UI thuần, rất nhẹ.

### AL. Lọc theo khoảng số tiền khi tìm kiếm

`TxFilter` hiện có text/loại/danh mục/tài khoản — thiếu **min–max số tiền** ("tìm các
khoản trên 10k¥").

- Gợi ý kỹ thuật: thêm `amountMin`/`amountMax` (minor units) vào `TxFilter` + 2 repo +
  UI ở `SearchPage`. Chú ý đa tiền tệ: lọc theo số gốc của tài khoản hay quy đổi base?

### AM. Loại trừ giao dịch khỏi thống kê

Cờ "không tính vào báo cáo" cho giao dịch đặc thù (hoàn tiền, mua hộ, chuyển tiền
cho chính mình khác app).

- Gợi ý kỹ thuật: cột `exclude_from_stats boolean` + lọc ở các đường aggregate.
  Liên quan mục X (giao dịch điều chỉnh cũng cần loại trừ) — nên chung một cơ chế.

### AN. Nhắc nhở trong app

- Nợ đến hạn: `due_on` đã có trong schema nhưng chưa có gì nhắc.
- Vượt/sắp vượt ngân sách (xem AH).
- Quên ghi sổ: "3 ngày chưa nhập giao dịch nào".
- Gợi ý kỹ thuật: bước 1 là **badge/banner trong app** khi mở (client-side, đọc dữ liệu
  sẵn có, không cần hạ tầng). Web Push để sau (mục AS).

### AO. Onboarding người dùng mới

User mới vào app trống không biết bắt đầu từ đâu.

- Ý tưởng: checklist ngắn (tạo tài khoản → nhập giao dịch đầu → đặt hạn mức) hoặc
  seed dữ liệu mẫu tùy chọn. UI thuần.

### AP. Xuất PDF báo cáo tháng

Báo cáo tháng dạng PDF để lưu trữ/chia sẻ.

- Gợi ý kỹ thuật: đường rẻ nhất là CSS `@media print` + `window.print()` (0 thư viện);
  lib PDF thật chỉ khi cần đẹp hơn (lazy-load như ràng buộc chung). Làm sau H.

### AQ. Web Push notifications

Đẩy nhắc nhở (mục AN) ra ngoài app khi app đóng.

- Khó ở: cần server gửi push → đụng ràng buộc "không backend riêng". Supabase Edge
  Functions + cron có free tier — cần xác nhận đủ 0đ. iOS PWA push có ràng buộc riêng.
  Chỉ làm sau khi AN (badge trong app) chứng minh nhu cầu.

### AR. Đa ngôn ngữ (i18n)

UI hiện hardcode tiếng Việt. Nếu có người dùng Nhật/Anh → cần i18n.

- Thay đổi lan rộng (mọi component) — chỉ làm nếu có nhu cầu thật. Nếu định làm,
  làm sớm rẻ hơn làm muộn.

### AS. Nhiều sổ (books)

Tách "Cá nhân" / "Công việc" / "Du lịch 2027" thành các sổ riêng, chuyển qua lại.

- Nhẹ hơn AJ (vẫn 1 user) nhưng cũng đụng schema rộng (`book_id` trên mọi bảng).
  Cân nhắc có thật sự cần không — nhóm tài sản + danh mục đôi khi đã đủ.

### AT. Trợ lý AI (nhập bằng ngôn ngữ tự nhiên / hỏi đáp)

Gõ "cà phê 500" → tự tách số tiền + đoán danh mục; hỏi "tháng này ăn ngoài hết bao
nhiêu?" → trả lời từ dữ liệu.

- Đụng ràng buộc 0đ (cần API LLM trả phí) — để xa nhất. Bản rẻ: parse rule-based
  cho cú pháp "ghi chú + số tiền" (không AI), ăn khớp mục P (giọng nói).

---

## Gợi ý gom nhóm khi làm sau (không bắt buộc)

- **Nhóm "Giao dịch định kỳ":** C + D + mục 2 GĐ3 → 1 tính năng.
- **Nhóm "Tài sản & nợ":** E + F → làm gần nhau vì nợ ảnh hưởng tổng tài sản.
- **Nhóm "Xem dữ liệu":** A (báo cáo năm) + B (lịch) → mở rộng cách xem, ít đụng schema.
- **Nhóm "Xuất dữ liệu":** H (Excel) + GĐ3 mục 3 (CSV) → chốt chung CSV vs .xlsx,
  làm một lần cho đường xuất file.
- **G (danh mục mẹ/con) là thay đổi nền:** đụng schema `categories` + màn Nhập +
  Báo cáo + Ngân sách. Nếu định làm, nên làm **sớm** (trước khi các tính năng khác
  bám thêm vào cấu trúc danh mục phẳng), hoặc chấp nhận migrate nhiều nơi sau này.
- **Nhóm "Nhập nhanh hơn":** I (gợi ý thông minh) + J (mẫu nhanh) + K (hoàn tác) +
  L (máy tính) + M (batch) → gói cải thiện màn Nhập, phần lớn UI thuần / đọc dữ liệu,
  làm được sớm và độc lập. O (PWA shortcuts) + P (giọng nói) là phụ trợ, làm rời.
- **Nhóm "Insight tính toán":** Q (thẻ insight) + R (dự báo cuối tháng) + S (so sánh
  tháng) + U (bất thường) + V (tỷ lệ tiết kiệm) → **chỉ đọc/tính client-side, không
  đổi schema**; nên gom vì dùng chung helper gộp tháng + `aggregate.ts` + `convertToBase`.
  Ăn khớp với **A (báo cáo năm)** (helper gộp tháng) và **ngân sách GĐ3 mục 1** (R).
- **T (radar định kỳ)** nên làm **kèm/nối C+D**: phát hiện xong thì đề xuất tạo rule
  định kỳ.
- **N (tách hóa đơn)** cần chốt schema (nhiều giao dịch rời vs. nhóm có `group_id`) —
  cân nhắc cùng lúc với **G** nếu định đổi cấu trúc dữ liệu giao dịch.

**Bổ sung 2026-07-19 cho nhóm X–AT:**

- **Nhóm "chỉnh số dư ngoài dòng tiền":** X (reconcile) + AE (giá trị đầu tư) +
  AM (loại trừ khỏi thống kê) → cùng cần cơ chế "giao dịch/bút toán không tính vào
  chi tiêu", nên chốt schema chung một lần.
- **Nhóm "xuất nhập file":** H (Excel/CSV) → Y (nhập CSV) → AP (PDF) — làm theo thứ
  tự đó, dùng chung hạ tầng file. Z (backup JSON) độc lập, làm được ngay.
- **Nhóm "nhắc nhở":** AN (badge trong app) trước → AQ (Web Push) chỉ khi AN chứng
  minh nhu cầu. AH (cảnh báo ngân sách) là một nguồn nhắc của AN.
- **Nhóm "tài sản":** AD (mục tiêu) + AE (giá trị đầu tư) + AF (lịch sử net worth)
  → cùng khu trang Tài sản, AF phụ thuộc AE nếu muốn số đúng.
- **AJ (sổ chung) và AS (nhiều sổ) là thay đổi nền** như G trước đây — quyết định
  sớm có làm hay không, vì càng để lâu càng khó migrate.
- **Ưu tiên đề xuất cho đợt tới:** C+D (định kỳ) → H (xuất CSV) → X (reconcile) →
  AB (undo xóa) + AK (ẩn số tiền) làm kèm vì rất nhẹ.

Thứ tự và spec chi tiết sẽ quyết định khi tới từng nhóm.

### Quyền lợi thuế Nhật — ĐÃ SHIP 2026-09-03

Màn `/quyen-loi` + khung trên Bản tin + 4 loại thông báo (spec
[2026-09-03-quyen-loi-thue-nhat-design.md](superpowers/specs/2026-09-03-quyen-loi-thue-nhat-design.md),
plan [2026-09-03-quyen-loi-thue-nhat.md](superpowers/plans/2026-09-03-quyen-loi-thue-nhat.md)).
Đã làm: ① khấu trừ người phụ thuộc ở nước ngoài (theo người, 38万, năm dương lịch),
② đòi lại 5 năm cũ (還付申告), ③ trần ふるさと納税 + cảnh báo ワンストップ, ④ NISA/iDeCo còn hạn mức.
Dữ liệu mới: bảng `relatives`, cột `transactions.remit_recipient_id`, `profiles.fuyo_claimed_years` (migration 0056).

**Chưa làm, để đợt sau:** 医療費控除 (cùng đường 確定申告 như ②); iDeCo hạn mức theo loại doanh nghiệp
(có 企業年金 thì khác); đọc 源泉徴収票 để thay số ước bằng số thật; thu nhập của người thân
(điều kiện ≤ 58万) chỉ hỏi bằng chữ, không lưu.

### Phương pháp phân bổ ngân sách — ĐÃ SHIP 2026-09-03

Sáu phương pháp chọn trong Cài đặt → Hồ sơ (spec
[2026-09-03-phuong-phap-phan-bo-design.md](superpowers/specs/2026-09-03-phuong-phap-phan-bo-design.md),
plan [2026-09-03-phuong-phap-phan-bo.md](superpowers/plans/2026-09-03-phuong-phap-phan-bo.md)):
50/30/20 · 80/20 · 70/20/10 · 6 cái lọ (JARS) · Kakeibo · Tự đặt. `need_level` nới 2 → 5 nhãn
(thêm Giáo dục, Cho đi, Dự phòng — gắn MỘT lần, mọi phương pháp gom theo bảng riêng);
`profiles.budget_method` + `budget_targets` thay 3 cột bps rời (migration 0057). Toàn bộ
tab Ngân sách, thẻ Cơ cấu ở Báo cáo, mốc "Giữ lại" ở Bảng tin và headline chạy theo phương pháp.

**Chưa làm, để đợt sau:** tách hũ Đầu tư / Tiết kiệm dài hạn của JARS theo tài khoản tiền
chảy vào; trình tự dựng khoản tuỳ ý (custom bucket builder); mỗi tháng một phương pháp.
