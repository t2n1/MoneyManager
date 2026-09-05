# Chuyến đi — thiết kế (mục 2a)

> **Ngày:** 2026-09-05 · **Trạng thái:** chờ duyệt · **Khảo sát:**
> [notes/2026-09-05-chuyen-di-khao-sat.md](../notes/2026-09-05-chuyen-di-khao-sat.md)
>
> Đây là **đợt 1 của hai**. Đợt 2 (mục 2b — chế độ ghi khi đang ở VN, cần chỗ cho tiền
> Việt đứng) có spec riêng, làm sau.

## 1. Vấn đề

Tháng có chuyến đi trông **rẻ giả**, và mọi phép so sánh sau đó bị kéo theo.

Số thật trong sổ:

| | |
|---|---|
| Tháng 2/2026 (có chuyến đi) | **¥186.189** |
| Trung bình 11 tháng còn lại | **¥415.202** |
| | tháng có chuyến đi trông rẻ hơn **55%** |

Chuyến đi để lại một **khoảng trống**, không phải một khoản chi:

- Tuần **2026-W08 (16–22/2/2026): không một giao dịch nào**, trên toàn bộ tài khoản.
- Các tuần kề: W06 = 26 lần, W07 = 15, W09 = 13. Riêng thẻ Rakuten tuần nào cũng 11–18 lần.
- Tết Bính Ngọ = **17/2/2026**, nằm giữa W08.
- Vé máy bay ¥104.547 ghi ở **W04 (19–25/1)** — đó là ngày MUA vé, không phải ngày bay.

### Một giả định cũ đã bị bác

Ghi nhớ trước đây nói *"quẹt thẻ ở VN vẫn vào sổ, chỉ tiền mặt mất dấu"*. Ở chuyến này
**không đúng**: cả ba thẻ tín dụng đều im lặng suốt W08. Hoặc chuyến đó tiêu toàn tiền mặt,
hoặc sao kê khoảng đó chưa nhập. Dù là lý do nào, hệ quả thiết kế giống nhau: **không có
"chi ở VN" nào trong sổ để mà gom**.

### Vì sao app phải tự dò thay vì hỏi

Chính người dùng nhớ chuyến này là "tháng 12/2025 hoặc 1/2026" — lệch ba tháng. Bắt gõ ngày
đi/ngày về là bắt nhớ một thứ đã quên. Còn một tuần 0 giao dịch giữa các tuần 13–26 giao dịch
là tín hiệu **máy đọc được, rẻ, và chắc**.

## 2. Quyết định đã chốt với người dùng

| # | Quyết định |
|---|-----------|
| 1 | App **tự dò khoảng vắng rồi hỏi xác nhận**; không bắt người dùng nhớ ngày. |
| 2 | Chuyến đi đã xác nhận thì: **(a) chú thích tháng đó** và **(b) loại khỏi mốc so sánh**. |
| 3 | **Không** dựng báo cáo riêng cho chuyến, **không** đoán số đã tiêu ở VN. |
| 4 | Loại khỏi **mốc so**, nhưng **vẫn hiện trong biểu đồ kèm dấu** — giấu một cột trong dãy 12 tháng khiến người đọc tưởng tháng đó không có dữ liệu. |

### 2b. Tinh chỉnh sau khi đọc code: đơn vị là NGÀY, không phải THÁNG

Bản chốt miệng nói "loại tháng khỏi trung bình". Code cho thấy cách đúng hơn, và nó nằm sẵn
trong kiến trúc:

- [`periodCompare`](../../../src/features/reports/periodCompare.ts:63) nhận **mảng chi từng
  ngày** (`current`, `prior`, `daysElapsed`), không nhận tháng.
- [`forecastMonthEnd`](../../../src/features/reports/insights.ts:108) nhận
  `spentSoFar / daysElapsed / daysInMonth / dailySpend[]` — cũng theo ngày.
- Khối trong app vốn đã tên là **"So với trước — cùng số ngày"**.

Nên loại trừ theo **ngày đi vắng**: tháng 2 có 7 ngày đi thì bỏ đúng 7 ngày đó ở **cả hai
vế** so sánh, giữ nguyên 21 ngày dữ liệu thật. Chính xác hơn và ít phá hơn vứt cả tháng.

Ngoại lệ: `avg3` / "TB 3 tháng" là con số **theo tháng**. Ở đó, tháng có ≥ 4 ngày đi vắng bị
loại khỏi mẫu số (xem §5.2).

## 3. Kiến trúc: tách "mốc so" khỏi "biểu đồ"

Đo bằng tìm chữ (không dùng GitNexus — xem §7 của
[spec mục 1](2026-09-05-chi-chua-ghi-so-design.md)):

| Hàm | Số file gọi | Loại việc | Xử lý |
|---|---|---|---|
| `monthlySeries` | **12** | vẽ biểu đồ | **không đụng** — thêm dấu ở chỗ vẽ |
| `periodCompare` | 4 | mốc so | loại ngày đi vắng |
| `monthExpenseCompare` | 3 | mốc so | loại ngày đi vắng |
| `categoryComparison` | 2 | mốc so (avg3) | loại tháng có chuyến |
| `forecastMonthEnd` | 4 | mốc so | loại ngày đi vắng khỏi `daysElapsed` |

Tổng bề mặt thật: **~5 file**, không phải 14. `src/mcp/` **không** nằm trong danh sách nào —
mục này không chạm MCP, không dựng lại `api/mcp.mjs`.

Bài học từ mục 1 áp nguyên: **một đầu vào riêng**, các hàm dùng chung không đổi chữ ký bắt
buộc. Tham số ngày-đi-vắng có **giá trị mặc định là tập rỗng** = hành vi cũ, để mọi phép thử
hiện có vẫn đúng — và vì thế phải có chốt canh nguồn (§9) như `tests/categoryKind.test.ts`
làm với `transferIds`.

## 4. Schema: bảng `trips`

Migration **`0058_trips.sql`**, theo đúng khuôn của `0056_relatives_remit_recipient.sql`:

```sql
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_on date not null,
  end_on date not null,
  label text not null default '',
  -- ISO-2 nơi đến; để trống khi người dùng không nói. Chưa dùng để tính gì ở đợt 1,
  -- nhưng đợt 2b cần nó để biết quy đổi sang tiền nào.
  country text not null default 'VN',
  -- true = app đã hỏi về dải ngày này và người dùng nói KHÔNG phải chuyến đi.
  -- Hàng như vậy không phải một chuyến; nó là TRÍ NHỚ về một câu đã hỏi rồi, để lần sau
  -- không hỏi lại. Mọi phép tính ở §5.2 chỉ lấy hàng `dismissed = false`.
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint trips_range_ok check (end_on >= start_on)
);

create index if not exists trips_user_idx on public.trips (user_id, start_on);

alter table public.trips enable row level security;
drop policy if exists "own rows" on public.trips;
create policy "own rows" on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Cùng commit phải sửa [src/types/database.types.ts](../../../src/types/database.types.ts)** —
file viết tay, không có codegen. Quên là compiler vẫn im, query chết lúc chạy.

Và **cả hai bản `Repo`** (`supabaseRepo`, `demoRepo`) phải có `listTrips` / `createTrip` /
`deleteTrip`; thiếu một bên là lỗi biên dịch. Mỗi `mutationFn` có invalidation nằm ngay cạnh
nó trong `hooks/queries.ts`.

## 5. Ba chỗ tiêu thụ

### 5.1 Dò và hỏi — một luật thông báo mới

File mới `src/features/notifications/rules/tripRules.ts`, theo khuôn `dataRules.ts`. Sinh
`AppNotification` kind `'action'` → tự hiện ở khối **Việc cần làm** trên Bản tin.

Điều kiện dò:

- Một dải **≥ 4 ngày liên tiếp** không có giao dịch nào trên **mọi** tài khoản.
- Dải đó nằm **hoàn toàn trong quá khứ** (đã có giao dịch trở lại sau đó) — dải đang mở là
  "chưa ghi kịp", không phải "đã đi vắng".
- Chưa trùng với `trips` nào đã lưu, và chưa bị người dùng bỏ qua.

Câu hỏi: *"16–22/2 không có giao dịch nào — anh đi vắng?"* với hai nút: **Đánh dấu là chuyến
đi** / **Không, bỏ qua**.

**Phải nhớ lần bỏ qua**, nếu không mỗi lần mở app lại hỏi cùng một dải. Đã chốt: cột
`dismissed` trên chính `trips` (có trong DDL §4). Một dải đã xét là một hàng;
`dismissed = true` nghĩa là "đã hỏi rồi, không phải chuyến đi".

Đánh đổi của cách này, nói ra để người đọc sau khỏi tưởng là lỗi: bảng tên `trips` nhưng
chứa cả những hàng **không** phải chuyến đi. Chấp nhận vì hai thứ có cùng khoá tự nhiên
(một dải ngày) và luôn được đọc cùng nhau; tách hai bảng thì mọi truy vấn đều phải hợp
nhất chúng lại. Bù lại, **mọi phép đọc phải lọc `dismissed = false`** — quên là ngày "đã
bỏ qua" lọt vào mốc so. Chốt canh ở §8.

Ngưỡng 4 ngày là phỏng đoán đầu tiên, **không phải hằng số thiêng**: dữ liệu thật có đúng
một dải trống ≥ 4 ngày trong 13 tháng, nên ngưỡng này hiện cho ra 1 câu hỏi. Nếu chạy thật mà
nó hỏi quá nhiều thì nâng ngưỡng, đừng thêm luật phụ.

### 5.2 Loại khỏi mốc so

Một module thuần mới `src/features/reports/ngayDiVang.ts`:

```ts
/** Tập ngày ISO nằm trong một chuyến đi đã xác nhận (dismissed = false). */
export function ngayDiVang(trips: readonly TripRow[]): ReadonlySet<string>

/** Bỏ các ngày đi vắng khỏi một mảng chi-từng-ngày, trả về mảng ngắn hơn. */
export function boNgayDiVang(
  daily: readonly { iso: string; amount: number }[],
  vang: ReadonlySet<string>,
): { iso: string; amount: number }[]

/** Tháng có ≥ NGUONG_THANG ngày đi vắng → loại khỏi mẫu số avg3. */
export function thangCoChuyenDi(
  trips: readonly TripRow[],
  monthStartDay: number,
): ReadonlySet<string>
```

`NGUONG_THANG = 4` — cùng ngưỡng với §5.1, và **cùng một hằng số**, không phải hai số bằng
nhau tình cờ.

Bốn hàm mốc-so nhận thêm tham số cuối `vang: ReadonlySet<string> = EMPTY` (mặc định rỗng =
hành vi cũ).

### 5.3 Chú thích và dấu trên biểu đồ

- **Báo cáo tháng:** ngay cạnh tổng Chi — *"Tháng 2 · 7 ngày đi vắng — không so được với
  tháng thường"*. Đi qua `<Num>` cho số ngày.
- **Biểu đồ 12 tháng:** cột của tháng có chuyến đi giữ nguyên chiều cao thật, **thêm dấu**
  (chấm dưới trục hoặc gạch chéo nhạt). Không bao giờ ẩn cột.
- Cả hai chỉ hiện khi có `trips` đã xác nhận; không có thì màn hình y hệt hôm nay.

## 6. Các ca biên phải xử đúng

| Ca | Xử lý |
|----|-------|
| **Chuyến vắt qua hai tháng** | Ngày thuộc tháng nào tính vào tháng đó. `thangCoChuyenDi` đếm ngày theo `getMonthRange(key, monthStartDay)`, không theo tháng lịch. |
| **Cả kỳ so sánh là ngày đi vắng** | Sau khi bỏ, mảng còn rỗng → hàm mốc-so trả `null` (đã là hành vi sẵn có của `periodCompare` khi `prior.length === 0`). Không chia cho 0. |
| **Hai chuyến chồng ngày** | `ngayDiVang` trả về TẬP, nên trùng tự triệt tiêu. |
| **Dải trống vì quên ghi, không phải đi vắng** | Đúng là ca người dùng bấm "Không, bỏ qua" → `dismissed = true`, không hỏi lại. |
| **Dải trống đang mở** (chưa có giao dịch trở lại) | Không hỏi. Xem §5.1. |
| **Chuyến đi ở tháng đang xem dở** | Ngày đi vắng bị trừ khỏi `daysElapsed` của `forecastMonthEnd`, nên nhịp chi không bị 7 ngày số 0 kéo xuống. |

## 7. Ngoài phạm vi (đợt 2b hoặc không làm)

- Không thêm tài khoản VND, không đổi màn Nhập — **đó là mục 2b**.
- Không ước lượng số đã tiêu ở VN. Mục 1 đã đo được phần ví hụt nếu có đối chiếu; ép nó
  thành "chi ở VN" là bịa.
- Không dựng trang báo cáo riêng cho chuyến.
- Không đụng `src/mcp/`, không dựng lại bundle.

## 8. Kiểm thử

`ngayDiVang.test.ts` (thuần):

- một chuyến 7 ngày → tập có đúng 7 ngày ISO
- chuyến vắt hai tháng → mỗi tháng đếm đúng phần của mình
- hai chuyến chồng ngày → không đếm trùng
- `dismissed = true` → **không** vào tập
- `boNgayDiVang` bỏ đúng ngày, giữ nguyên thứ tự
- bỏ hết → mảng rỗng, hàm mốc-so trả `null`
- tháng có 3 ngày đi vắng → **không** bị loại khỏi avg3 (dưới ngưỡng 4)

`tripRules.test.ts`:

- dải 4 ngày trống trong quá khứ → sinh đúng 1 thông báo
- dải 3 ngày → không sinh
- dải đang mở (chưa có giao dịch sau đó) → không sinh
- dải đã có `trips` phủ → không sinh
- dải đã `dismissed` → không sinh

Chốt canh nguồn `tests/chuyenDiPhamVi.test.ts`: bốn hàm mốc-so có tham số `vang` mặc định
rỗng, nên **quên truyền không gây lỗi biên dịch** — đúng cái bẫy mà
`tests/categoryKind.test.ts` được viết ra để chặn cho `transferIds`. Test phải khẳng định mọi
chỗ gọi trong `src/features/**` có truyền `vang`.

Sau khi code: `npm run build` (`tsc -b`, **không** dùng `tsc --noEmit`), `npm test`,
`npm run lint`, và **mở app xem** — chế độ Sáng, 375px/1,25×, và JSX bị biến thành chuỗi đều
không bị guardrail nguồn bắt. Nhớ luật `<Guide>`: nó trả `null` ở chế độ Gọn (mặc định), nên
câu chú thích §5.3 **không được** bọc `Guide` — đúng lỗi đã mắc ở mục 1.
