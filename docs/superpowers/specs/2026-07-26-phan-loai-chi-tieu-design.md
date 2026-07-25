# Phân loại chi tiêu 2 trục — Thiết yếu/Linh hoạt & Cố định/Biến đổi

Ngày: 2026-07-26

## Mục tiêu

Cho người dùng nhìn được **cơ cấu chi tiêu** qua hai câu hỏi:

1. **Thiết yếu vs Linh hoạt** (nhu cầu bắt buộc vs sở thích) — mình đang dành bao
   nhiêu % cho mỗi bên, có lành mạnh không (đối chiếu quy tắc 50/30/20).
2. **Cố định vs Biến đổi** — khi cần "thắt lưng buộc bụng" khẩn cấp thì cắt được ở
   đâu nhanh nhất.

Hai trục **độc lập** với nhau. Ô giao "Linh hoạt × Biến đổi" chính là *van xả khẩn
cấp*: chỗ cắt giảm nhanh nhất.

## Quyết định đã chốt (với user)

- **Gắn nhãn ở danh mục** (không phải theo từng giao dịch) — gọn thao tác, khớp
  pattern ngân sách leaf-only. Có thể thêm override per-giao-dịch ở giai đoạn sau
  mà không phải đổi cấu trúc.
- **Phân loại lần đầu qua màn "Phân loại nhanh" riêng** — 1 màn liệt kê mọi danh
  mục Chi lá, mỗi dòng 2 toggle, phân loại hàng loạt trong một lần.
- **Trục Thiết yếu/Linh hoạt tính % trên Thu nhập** (kiểu 50/30/20).
- **Trục Cố định/Biến đổi tính % trên tổng Chi** (câu hỏi "cắt ở đâu" nên lấy chi
  tiêu làm mẫu số).

## Phạm vi

- Thêm migration `0025_expense_classification.sql`: 2 cột nullable trên
  `categories` + gán sẵn nhãn cho bộ danh mục mặc định (seed 0017).
- Thêm hàm thuần `classificationBreakdown()` trong
  `src/features/reports/aggregate.ts` (kèm unit test).
- Thêm component hiển thị `SpendClassificationCard.tsx` trong `features/reports/`.
- Thêm màn "Phân loại nhanh" `ClassifyCategoriesPage.tsx` trong
  `features/categories/` + route + lối vào từ Cài đặt (và link từ card báo cáo).
- Thêm 2 nút gạt vào `CategoryForm` (trong `CategoriesPage.tsx`) cho danh mục Chi lá.
- Cập nhật `demoRepo.ts` để danh mục demo có nhãn mẫu (card báo cáo có gì để hiện
  ở chế độ demo).
- **Không** đổi luồng nhập giao dịch. **Không** thêm cột trên `transactions` ở giai
  đoạn này.

## A. Data model (migration 0025)

```sql
alter table public.categories
  add column need_level text check (need_level in ('essential','flexible')),
  add column cost_type  text check (cost_type  in ('fixed','variable'));
```

- Cả hai **nullable**. `null` = "chưa phân loại".
- Chỉ có ý nghĩa với danh mục **Chi** (`type = 'expense'`). Với danh mục Thu, hai
  cột luôn để null và UI không hiển thị.
- Gán nhãn ở **danh mục lá**. Danh mục cha có thể tự mang nhãn để dùng cho phần chi
  gán **trực tiếp** vào cha (hiếm). Không có cơ chế cascade cha→con: báo cáo gom
  theo **từng danh mục thực sự phát sinh giao dịch** nên chỉ cần đọc nhãn của chính
  danh mục đó.
- Migration gán sẵn nhãn hợp lý cho các danh mục mặc định (theo tên đã biết ở seed
  0017), ví dụ: Tiền nhà = essential/fixed; Ăn uống = essential/variable; Giải trí =
  flexible/variable; Đăng ký/subscription = flexible/fixed. Danh mục của user tạo
  tay giữ null cho tới khi phân loại.
- **Cần áp migration này lên Supabase thật** (giống các migration 0012+ trước).

## B. Nhập liệu

### B1. Trong `CategoryForm` (CategoriesPage.tsx)

Tái dùng đúng mẫu "segmented control" đã có trong form (`bg-gray-200 rounded-xl
p-1`). Thêm 2 control, mỗi control 3 lựa chọn để cho phép bỏ trống:

- **Tính chất**: Thiết yếu / Linh hoạt / (Chưa) — map `need_level`.
- **Loại chi**: Cố định / Biến đổi / (Chưa) — map `cost_type`.

Điều kiện hiển thị: chỉ khi `effectiveType === 'expense'` **và** danh mục là lá
(không phải cha đang có con — tái dùng cờ `typeLocked`/`hasChildren` sẵn có). Với
danh mục Thu hoặc cha có con thì ẩn hoàn toàn.

`NewCategory`/patch bổ sung 2 trường tùy chọn `need_level`, `cost_type`.

### B2. Màn "Phân loại nhanh" (`ClassifyCategoriesPage.tsx`)

- Route mới, ví dụ `/categories/classify`. Lối vào: một mục trong Cài đặt
  ("Phân loại chi tiêu") và một link "Phân loại N danh mục" ngay trên card báo cáo
  khi còn danh mục chưa phân loại.
- Nội dung: danh sách **mọi danh mục Chi lá** (gồm con + cha-không-có-con), nhóm
  hiển thị theo cha để dễ đọc. Mỗi dòng: icon + tên + 2 toggle nhỏ (Tính chất, Loại
  chi).
- Lưu ngay khi đổi (optimistic qua `useUpdateCategory`) — không cần nút Lưu tổng.
- Có bộ lọc nhanh "Chỉ hiện chưa phân loại" để hoàn tất phần còn thiếu.
- Tuân thủ UI/UX: touch target ≥44px, có trạng thái rõ ràng cho toggle đang chọn,
  hỗ trợ dark mode bằng semantic token như phần còn lại của app.

## C. Báo cáo — card "Cơ cấu chi tiêu" (`SpendClassificationCard.tsx`)

Một `<section>` mới đặt **sau** `CategoryBreakdownCard` trong tab Biểu đồ, ở **cả
chế độ Tháng và Năm**. Cùng khung thẻ `rounded-xl bg-white … shadow-sm` +
biến thể dark mode.

Card gồm 3 phần. **Cách trình bày (đã chốt — kiểu lai):**

- **C1 (50/30/20)** → **thanh có vạch mục tiêu**, KHÔNG donut. Lý do: giá trị của
  trục này là *so với mốc 50/30/20*, mà thanh thể hiện "value vs mốc" tốt hơn pie
  (pie không vẽ được vạch mục tiêu). Mắt đọc độ dài thanh chính xác hơn góc lát.
- **C2 (Cố định/Biến đổi)** → **1 donut** + các dòng thanh bên dưới. Chỉ 2–3 lát,
  thuần tỉ lệ, không có mốc → donut cho cảm nhận tỉ trọng tức thì.

**Quy ước donut (chỉ C2):**

- Dùng `PieChart` của Recharts (đã là dependency) ở dạng **donut** (`innerRadius` >
  0), tâm ghi tổng Chi.
- Số lát ≤ 3 → nằm trong ngưỡng an toàn của `no-pie-overuse`.
- **Màu chỉ để phân biệt nhanh; ý nghĩa luôn có ở dòng text bên dưới** (tuân
  `color-not-only`): donut không phải nguồn thông tin duy nhất, các `BreakdownRow`
  là bản text thay thế cho screen-reader. Truyền `aria-label` mô tả tỉ lệ chính cho
  vùng biểu đồ.
- Tooltip khi chạm/hover hiện tên lát + số tiền + % (`tooltip-on-interact`).
- Tôn trọng `prefers-reduced-motion`: tắt animation vẽ donut; số liệu ở rows vẫn đọc
  được ngay.
- Đặt kích thước qua `ResponsiveContainer` + `aspect-ratio` để không gây layout shift.

**Bảng màu** (từ `PALETTE` sẵn có): Nhu cầu/Cố định = xanh lá `#16a34a`, Sở
thích/Biến đổi = cam `#f59e0b`, Tiết kiệm = xanh dương `#0ea5e9`, Chưa phân loại =
xám `#9ca3af`.

### C1. Trục 50/30/20 (Thiết yếu/Linh hoạt trên Thu nhập) — dạng thanh

- Mẫu số = **tổng Thu** trong kỳ (đã quy đổi base).
- 3 dòng `BreakdownRow` (thanh): **Nhu cầu** (essential expense / income), **Sở
  thích** (flexible expense / income), **Tiết kiệm** = (Thu − tổng Chi) / Thu.
- Mỗi thanh có **vạch mục tiêu** overlay: Nhu cầu 50%, Sở thích 30%, Tiết kiệm 20%
  (một đường dọc mảnh trên nền thanh + nhãn "mục tiêu ≤50%"). Thanh vượt mốc "xấu"
  (Nhu cầu/Sở thích > mốc) đổi sang màu cảnh báo; Tiết kiệm dưới mốc thì nhạt/đỏ.
  → cần mở rộng `BreakdownRow` để nhận prop tùy chọn `targetPct` (vẽ vạch) mà không
  phá vỡ mọi nơi đang dùng nó (prop optional, mặc định không vẽ).
- Chi **chưa phân loại** → 1 dòng *Chưa phân loại* màu xám.
- **Edge — kỳ không có Thu** (`income = 0`): ẩn phần C1, thay bằng thông báo "Cần có
  thu nhập trong kỳ để tính tỷ lệ 50/30/20". Trục C2 vẫn hoạt động.
- **Edge — Chi > Thu**: Tiết kiệm âm → dòng Tiết kiệm hiện số âm màu đỏ; % Nhu
  cầu/Sở thích có thể >100%, thanh kẹp ở 100% chiều dài nhưng nhãn % hiển thị trung
  thực (vd "112%").

### C2. Trục Cố định/Biến đổi (trên tổng Chi) — donut + thanh

- Mẫu số = **tổng Chi** trong kỳ.
- **Donut** với các lát: Cố định, Biến đổi, (Chưa phân loại). Tâm ghi tổng Chi.
- 2 dòng `BreakdownRow` bên dưới: **Cố định** và **Biến đổi**, kèm dòng *Chưa phân
  loại* nếu có.

### C3. Insight "van xả khẩn cấp"

- Một dòng nổi bật: *"Cần cắt giảm gấp? Có thể cắt tối đa **{X}/tháng** ở nhóm Linh
  hoạt × Biến đổi ({Y}% chi tiêu)."*
- `X` = tổng chi của các danh mục có `need_level='flexible'` **và**
  `cost_type='variable'`. `Y` = X / tổng Chi.
- Nếu X = 0 (chưa phân loại đủ) → ẩn dòng này, thay bằng nhắc "Phân loại chi tiêu để
  xem gợi ý cắt giảm".

### C4. Nhắc phân loại

- Khi còn danh mục Chi lá chưa phân loại (theo dữ liệu danh mục, không theo kỳ): hiện
  link "Phân loại {N} danh mục →" trỏ tới màn B2.

## D. Hàm thuần `classificationBreakdown` (aggregate.ts)

Chữ ký (thuần, test được, không phụ thuộc React):

```ts
interface ClassificationBreakdown {
  needEssential: number   // chi essential (base minor)
  needFlexible: number    // chi flexible
  needUnclassified: number
  costFixed: number
  costVariable: number
  costUnclassified: number
  emergencyCut: number    // chi flexible & variable
  totalExpense: number
}
classificationBreakdown(
  slices: CategorySlice[],
  categories: CategoryRow[],
): ClassificationBreakdown
```

- Duyệt `slices` (đã là chi theo từng danh mục, đã quy đổi base). Với mỗi slice, tra
  `need_level`/`cost_type` của **chính danh mục đó**; cộng vào bucket tương ứng, thiếu
  nhãn thì vào `*Unclassified`.
- `emergencyCut` cần biết một danh mục vừa flexible vừa variable → cộng riêng ở cùng
  vòng lặp.
- Tổng Thu lấy sẵn từ `sumIncomeExpense` (chế độ năm đã có) hoặc tính tương tự cho
  chế độ tháng; truyền income vào card, không nhét vào hàm này để hàm chỉ lo phần chi.
- Unit test trong `aggregate.test.ts`: các case essential/flexible/unclassified,
  emergencyCut, chi > thu, không có thu, danh mục cha-trực-tiếp có nhãn.

## E. Kiến trúc file (mỗi đơn vị một nhiệm vụ)

| File | Thay đổi |
|------|----------|
| `supabase/migrations/0025_expense_classification.sql` | mới — 2 cột + seed nhãn mặc định |
| `src/types/database.types.ts` | thêm `need_level`, `cost_type` vào `CategoryRow`/`NewCategory` |
| `src/features/reports/aggregate.ts` | thêm `classificationBreakdown()` thuần |
| `src/features/reports/aggregate.test.ts` | thêm test cho hàm trên |
| `src/features/reports/BreakdownRow.tsx` | mới — tách `BreakdownRow` khỏi `CategoryBreakdownCard.tsx` thành component dùng chung; thêm prop optional `targetPct` (vẽ vạch mục tiêu; mặc định off) |
| `src/features/reports/CategoryBreakdownCard.tsx` | import `BreakdownRow` từ file mới (bỏ bản cục bộ) |
| `src/features/reports/SpendClassificationCard.tsx` | mới — C1 thanh (có vạch mục tiêu), C2 donut (Recharts `PieChart`) + thanh |
| `src/features/reports/ReportsPage.tsx` | gắn card mới (tháng + năm), truyền income |
| `src/features/categories/CategoriesPage.tsx` | thêm 2 control vào `CategoryForm` |
| `src/features/categories/ClassifyCategoriesPage.tsx` | mới — màn phân loại nhanh |
| router + trang Cài đặt | thêm route + lối vào "Phân loại chi tiêu" |
| `src/data/demoRepo.ts` | gán nhãn mẫu cho danh mục demo |

## F. Không làm (YAGNI)

- Không tag theo từng giao dịch (để giai đoạn sau nếu cần).
- Không có trục thứ ba hay cấu hình mốc 50/30/20 tùy chỉnh — dùng mốc chuẩn cố định.
- Không đổi cấu trúc ngân sách hay luồng nhập giao dịch.
- Không donut cho C1 (trục 50/30/20 cần vạch mục tiêu → dùng thanh). Chỉ C2 có donut
  (≤3 lát, hợp `no-pie-overuse`).

## G. Rủi ro / lưu ý

- **Migration phải áp lên Supabase thật** mới có cột; nếu quên, app sẽ lỗi đọc cột.
  Cần kiểm thử ở cả demo mode (không có Supabase) — card vẫn phải chạy nhờ demoRepo.
- Card phụ thuộc chất lượng phân loại: khi phần lớn chưa phân loại, số liệu ít nghĩa
  → dùng dòng nhắc phân loại + nhóm "Chưa phân loại" để trung thực, không gây hiểu lầm.
