# Nhiều phương pháp phân bổ ngân sách, chọn được trong Cài đặt

Ngày: 2026-09-03

## Vấn đề

Tab Ngân sách chỉ biết **một** cơ cấu: ba trục Thiết yếu / Linh hoạt / Để dành,
viết cứng trong [`axisTargets.ts:12`](../../../src/features/budgets/axisTargets.ts).
Cài đặt cho sửa **ba con số phần trăm**
([`ProfileEditSheet.tsx:31`](../../../src/features/settings/ProfileEditSheet.tsx))
nhưng không cho đổi **số khoản** hay **cách gom**, và không có tên phương pháp nào để
chọn — người dùng phải tự biết 50/30/20 là gì rồi gõ tay.

Hệ quả thực tế: mọi khoản không phải "thiết yếu" đều rơi vào một rổ "Linh hoạt" duy
nhất. Tháng 7/2026 rổ đó là **¥224.082** — bằng đúng phần thiết yếu — mà nhìn vào
không biết bao nhiêu là ăn chơi, bao nhiêu là học hành, bao nhiêu là biếu tặng.

## Số thật dùng xuyên spec

Sổ thật, tháng 7/2026 (đọc qua MCP `so-gao`, không phải số minh hoạ):

| | |
|---|---|
| Thu | ¥374.076 |
| Chi | ¥448.506 |
| `need_level = 'essential'` | ¥224.424 |
| `need_level = 'flexible'` | ¥224.082 |
| Chưa phân loại | ¥0 |

Tháng 7 tiêu lố (thưởng về tháng 8), nên **Để dành = −¥74.430 (Âm 20%)** ở mọi phương
pháp. Giữ nguyên con số xấu này trong spec là cố ý: nó bắt mọi mockup dưới đây phải xử
lý đúng trường hợp âm.

Các danh mục liên quan tới nhãn mới, tháng 7: `Quà` ¥16.240 · `Thuốc` ¥1.132 ·
`Phí thủ tục` ¥1.000 · `Khóa học & Chứng chỉ` ¥0 · `Sách vở` ¥0.

## Sáu phương pháp

Mỗi phương pháp có **đúng một** khoản Để dành (`residual` = thu − tổng chi, chiều
`floor`); các khoản còn lại là khoản chi (chiều `cap`).

| Phương pháp | `id` | Các khoản (bps mặc định) |
|---|---|---|
| 50/30/20 | `50-30-20` | Thiết yếu 5000 · Linh hoạt 3000 · Để dành 2000 |
| Trả cho mình trước | `80-20` | Chi tiêu 8000 · Để dành 2000 |
| 70/20/10 | `70-20-10` | Sinh hoạt 7000 · Cho đi 1000 · Để dành 2000 |
| 6 cái lọ (JARS) | `jars` | Thiết yếu 5500 · Hưởng thụ 1000 · Giáo dục 1000 · Cho đi 500 · Để dành 2000 |
| Kakeibo | `kakeibo` | Sinh tồn 5000 · Hưởng thụ 2000 · Văn hóa 500 · Dự phòng 500 · Để dành 2000 |
| Tự đặt | `custom` | Thiết yếu 5000 · Hưởng thụ 2000 · Giáo dục 500 · Cho đi 500 · Dự phòng 500 · Để dành 2000 |

**Kakeibo được thêm dòng Để dành** dù bản gốc chỉ có bốn khoản chi (生存・浪費・文化・
予備). Lý do: tab Báo cáo ([`verdicts.ts:129`](../../../src/features/reports/verdicts.ts))
và Bảng tin ([`KpiRow.tsx:122`](../../../src/features/bulletin/KpiRow.tsx)) đều bám vào
mốc "tỷ lệ giữ lại được" — bỏ khoản đó đi là ba màn hình khác mất mốc. Thêm nó cũng
không phản Kakeibo: Kakeibo bắt đặt mục tiêu tiết kiệm **trước** rồi mới chia phần còn lại.

**Hai hũ Đầu tư (FFA 10%) và Tiết kiệm dài hạn (LTSS 10%) của JARS gộp làm một** dòng
Để dành 20%, có chú thích "gồm Đầu tư + Tiết kiệm dài hạn". App tính để dành bằng
`thu − chi`, một cục, nên không biết tiền đi vào tài khoản nào. Tách được nếu đọc các
giao dịch chuyển sang tài khoản nhóm Đầu tư / Tiết kiệm, nhưng tháng nào quên ghi lần
chuyển đó thì hai hũ hiện 0% trong khi tiền vẫn còn — sai lặng lẽ, tệ hơn là gộp và nói thẳng.

## Nhãn danh mục: gắn một lần, mọi phương pháp dùng chung

`categories.need_level` từ 2 giá trị lên **5**:
`essential` · `flexible` · `education` · `giving` · `buffer` (và `null` = chưa phân loại).

Mỗi phương pháp gom 5 nhãn đó theo cách riêng:

| Nhãn | `50-30-20` | `80-20` | `70-20-10` | `jars` | `kakeibo` | `custom` |
|---|---|---|---|---|---|---|
| `essential` | Thiết yếu | Chi tiêu | Sinh hoạt | Thiết yếu | Sinh tồn | Thiết yếu |
| `flexible` | Linh hoạt | Chi tiêu | Sinh hoạt | Hưởng thụ | Hưởng thụ | Hưởng thụ |
| `education` | Linh hoạt | Chi tiêu | Sinh hoạt | Giáo dục | Văn hóa | Giáo dục |
| `giving` | Linh hoạt | Chi tiêu | Cho đi | Cho đi | Hưởng thụ | Cho đi |
| `buffer` | Thiết yếu | Chi tiêu | Sinh hoạt | Thiết yếu | Dự phòng | Dự phòng |

### Luật xương sống

**Mỗi nhãn phải thuộc về ĐÚNG MỘT khoản, trong MỌI phương pháp.**

- Thiếu một nhãn → tiền biến mất lặng lẽ. Kakeibo mà không nhận `giving` thì ¥16.240
  tiền Quà tháng 7 rơi khỏi mọi con số, tổng các khoản không còn bằng tổng chi, và
  không màn nào báo.
- Nhãn nằm ở hai khoản → tiền đếm hai lần, tổng phần trăm phồng lên.

Test `budgetMethods.test.ts` chặn cả hai chiều. Đây là bất biến quan trọng nhất của
tính năng này.

## Mockup — tháng 7/2026 qua từng phương pháp

Sau khi đã đổi nhãn: `Quà` → `giving`, `Thuốc` + `Phí thủ tục` → `buffer`.

**`50-30-20`** (không đổi so với hôm nay — `giving`/`buffer` gom về Linh hoạt/Thiết yếu)
```
Thiết yếu     60%   ¥224.424 / ¥187.038   ✗ vượt trần
Linh hoạt     60%   ¥224.082 / ¥112.223   ✗ vượt trần
Để dành    Âm 20%   −¥74.430 / ¥74.815    ✗ chưa đạt sàn
```

**`jars`**
```
Thiết yếu     60%   ¥224.424 / ¥205.742   ✗
Hưởng thụ     56%   ¥207.842 / ¥37.408    ✗
Giáo dục       0%         ¥0 / ¥37.408    ✗
Cho đi         4%    ¥16.240 / ¥18.704    ✓
Để dành    Âm 20%   −¥74.430 / ¥74.815    ✗
```

**`kakeibo`**
```
Sinh tồn      59%   ¥222.292 / ¥187.038   ✗
Hưởng thụ     60%   ¥224.082 / ¥74.815    ✗
Văn hóa        0%         ¥0 / ¥18.704    ✗
Dự phòng       1%     ¥2.132 / ¥18.704    ✓
Để dành    Âm 20%   −¥74.430 / ¥74.815    ✗
```

**`80-20`**
```
Chi tiêu     120%   ¥448.506 / ¥299.261   ✗
Để dành    Âm 20%   −¥74.430 / ¥74.815    ✗
```

**`70-20-10`**
```
Sinh hoạt    116%   ¥432.266 / ¥261.853   ✗
Cho đi         4%    ¥16.240 / ¥37.408    ✓
Để dành    Âm 20%   −¥74.430 / ¥74.815    ✗
```

Kiểm chéo: ở mọi phương pháp, tổng các khoản chi = ¥448.506, đúng bằng tổng chi thật.

Giá trị của tính năng nằm ở chỗ này: 50/30/20 nói "hai khoản chi đều lố"; `jars` chỉ
thẳng ra Hưởng thụ ¥207.842 mới là chỗ vỡ, còn Giáo dục cả tháng ¥0.

## Kiến trúc

### File thuần mới: `src/features/budgets/budgetMethods.ts`

Không JSX, có unit test — theo quy ước "toán thuần nằm ngoài React" của repo.

```ts
/** Khoá khoản — ổn định vì nằm trong URL (?axis=). Nhãn hiển thị do phương pháp đặt. */
export type AxisKey =
  | 'essential' | 'flexible' | 'education' | 'giving' | 'buffer'  // khoản chi theo nhãn
  | 'living' | 'allSpend'                                          // khoản chi gộp
  | 'savings'                                                      // phần dư

export type BucketSource =
  | { kind: 'needs'; levels: readonly NeedLevel[] }
  | { kind: 'allExpense' }
  | { kind: 'residual' }

export interface MethodBucket {
  key: AxisKey
  label: string          // "Sinh tồn" ở kakeibo, "Thiết yếu" ở jars — cùng key
  hint: string           // chữ dạy, ẩn ở chế độ Gọn
  bps: number            // mốc mặc định của phương pháp
  direction: 'cap' | 'floor'
  source: BucketSource
  note?: string          // "gồm Đầu tư + Tiết kiệm dài hạn"
}

export interface BudgetMethod {
  id: BudgetMethodId
  name: string
  blurb: string          // một câu trong Cài đặt
  buckets: readonly MethodBucket[]
}

export const BUDGET_METHODS: readonly BudgetMethod[]

/** profile → phương pháp đã áp mốc người dùng chỉnh. id lạ → 50/30/20. */
export function resolveMethod(profile: ProfileRow | undefined): BudgetMethod
```

`resolveMethod` chịu id lạ mà không làm trắng màn, giống `parseDensity()`
([`src/lib/density.ts`](../../../src/lib/density.ts)) — cột là `text`, dữ liệu cũ có thể
chứa bất cứ gì.

### `aggregate.ts` — đếm theo từng nhãn, không chỉ hai

`ClassificationBreakdown` ([`aggregate.ts:506`](../../../src/features/reports/aggregate.ts))
hiện chỉ có hai ô `needEssential` / `needFlexible` — ba nhãn mới sẽ rơi vào
`needUnclassified` nếu để nguyên, tức tiền có nhãn mà bị đếm là "chưa phân loại".
Thay hai ô đó bằng `needByLevel: Record<NeedLevel, number>` (giữ `needUnclassified`
riêng). Compiler sẽ chỉ ra đủ chỗ phải theo: `axisTargets.ts` và
`SpendClassificationCard.tsx` là hai nơi đọc. `axisSlices` cũng chia lát theo cả 5
nhãn thay vì 2.

### `axisTargets.ts` — bỏ ba dòng viết cứng

`axisProgress` lặp trên `method.buckets` thay vì ba lời gọi `line(...)` viết tay.
`AxisProgress` mang thêm `method: BudgetMethod` để mọi màn dùng chung một bản đã giải,
không màn nào tự giải lại.

`AXIS_LABEL` (một `Record<AxisKey, string>` toàn cục) **biến mất** — nhãn giờ thuộc về
khoản, vì cùng một `key: 'essential'` đọc là "Thiết yếu" ở JARS và "Sinh tồn" ở Kakeibo.
Ba nơi đang import nó ([`planGroups.ts:29`](../../../src/features/budgets/planGroups.ts),
[`PlanningView.tsx:45`](../../../src/features/budgets/PlanningView.tsx),
[`planVerdict.ts:13`](../../../src/features/budgets/planVerdict.ts)) nhận `method` qua
tham số. `axisMissSummary` giữ nguyên chữ ký nhưng đọc nhãn từ `AxisLine`.

Riêng `planGroups.ts` không chỉ đổi nhãn: `ORDER`
([`planGroups.ts:135`](../../../src/features/budgets/planGroups.ts)) viết cứng hai khối
chi `['essential', 'flexible', 'unclassified', 'markers']`, và `isClassified` cùng chỗ
tra trần (dòng 138, 253) cũng chỉ biết hai nhãn. Danh sách khối phải sinh từ các khoản
chi của phương pháp (khoản `allExpense` → một khối gộp; khoản `savings` vẫn không có
khối, giữ B30.2). Luật "tiểu tổng khối khớp `axisSlices` từng đồng" giữ nguyên và giờ
được thoả tự nhiên: cả hai cùng đọc bảng gom nhãn của phương pháp.

`AxisSliceMap` từ `Record<AxisKey, CategorySlice[]>` thành `Partial<Record<…>>` — số
khoản thay đổi theo phương pháp, `Record` đầy đủ ép khai cả những khoá phương pháp
hiện tại không có.

*Impact analysis (`impact({target: 'axisProgress', direction: 'upstream'})`): rủi ro
**THẤP**, 6 symbol phía trên, 0 execution flow. `AxisKey` chỉ xuất hiện ở 5 file
không phải test; ba chỗ `Record<AxisKey, …>` gộp hết vào định nghĩa phương pháp.*

### Dữ liệu — migration `0057`

```sql
alter table profiles
  add column budget_method text not null default '50-30-20',
  add column budget_targets jsonb not null default '{}'::jsonb;

-- Giữ lại mốc người dùng đã chỉnh; ai để mặc định thì '{}'
update profiles set budget_targets = jsonb_strip_nulls(jsonb_build_object(
  'essential', case when target_essential_bps <> 5000 then target_essential_bps end,
  'flexible',  case when target_flexible_bps  <> 3000 then target_flexible_bps  end,
  'savings',   case when target_savings_bps   <> 2000 then target_savings_bps   end
));

alter table profiles
  drop column target_essential_bps,
  drop column target_flexible_bps,
  drop column target_savings_bps;

-- Ràng buộc sinh từ 0025 (check inline, không đặt tên → Postgres tự đặt
-- categories_need_level_check). Nếu drop báo không tồn tại thì tra:
--   select conname from pg_constraint where conrelid = 'categories'::regclass;
alter table categories drop constraint categories_need_level_check;
alter table categories add constraint categories_need_level_check
  check (need_level in ('essential','flexible','education','giving','buffer'));
```

**Bỏ ba cột cũ chứ không giữ song song.** Hai nơi lưu cùng một thứ thì sớm muộn lệch
nhau, và lệch ở đây có nghĩa là hai tab hiện hai mốc khác nhau cho cùng một tháng.

`budget_targets` chỉ chứa mốc **đã chỉnh**; khoá thiếu thì lấy `bps` mặc định của
phương pháp. Nhờ vậy đổi phương pháp không kéo theo số của phương pháp cũ.

Phải sửa cùng commit ([quy ước repo](../../../CLAUDE.md) — không có codegen):
- [`src/types/database.types.ts`](../../../src/types/database.types.ts): `NeedLevel`
  thêm 3 giá trị; `ProfileRow` bỏ 3 trường, thêm 2; hai danh sách khoá cột ở dòng ~839 và ~861
- [`src/data/repo.ts:297`](../../../src/data/repo.ts) — danh sách trường được phép cập nhật
- [`src/data/supabaseRepo.ts:2683`](../../../src/data/supabaseRepo.ts) — chỗ điền mặc định
- [`src/data/demoRepo.ts:988`](../../../src/data/demoRepo.ts) — profile demo

### Cài đặt

Trong [`ProfileEditSheet.tsx`](../../../src/features/settings/ProfileEditSheet.tsx),
khối "Mốc cơ cấu chi" thành:

```
Phương pháp phân bổ   [ 6 cái lọ (JARS)          ▾ ]   ← <Select>
Chia thu nhập vào 6 hũ; hũ Giáo dục và Cho đi ép bạn
tiêu có chủ đích thay vì gộp hết vào "linh hoạt".      ← method.blurb

Thiết yếu  Hưởng thụ  Giáo dục  Cho đi  Để dành
[   55  ]  [   10  ]  [   10 ]  [  5 ]  [   20 ]        ← sinh theo method.buckets
                                      ↺ Về mặc định
```

- Đổi phương pháp → các ô nạp lại `bps` mặc định, xoá phần đã chỉnh của phương pháp cũ
- Lưới ô % dùng `grid-cols-3` và xuống hàng (2 → 6 ô tuỳ phương pháp), không `grid-cols-${n}`
  dựng động — Tailwind quét chuỗi tĩnh
- Dòng "Hai mốc đầu là **trần**, tiết kiệm là **sàn**" thành câu sinh theo `direction`
  của khoản, vẫn đứng ngoài `<Guide>` (lý do cũ giữ nguyên: gõ ngược chiều thì mọi câu
  phán đọc ngược, sai lặng lẽ)
- Cảnh báo "tổng ≠ 100%" giữ nguyên, vẫn ngoài `<Guide>`

### Gắn nhãn danh mục

[`ClassificationToggle.tsx:3`](../../../src/features/categories/ClassificationToggle.tsx) —
`NEED_OPTIONS` từ 3 lên 6 mục (5 nhãn + "Chưa"). Nút gạt hiện chia cột theo số lựa chọn;
6 mục một hàng thì bóp chữ không đọc được ở 375px, nên xếp `grid-cols-3` hai hàng.

[`ClassifyCategoriesPage.tsx:43`](../../../src/features/categories/ClassifyCategoriesPage.tsx) —
bảng gán nhanh đang liệt kê 4 tổ hợp (nhu cầu × cố định/biến đổi). 5 nhãn thành 10 tổ hợp,
một danh sách phẳng 10 dòng là không dùng được. Tách thành **hai bước chọn**: chọn nhãn
nhu cầu, rồi chọn cố định/biến đổi.

### Tab Báo cáo và Bảng tin — bỏ hằng số cắm cứng

Ba chỗ đang viết thẳng con số của 50/30/20 vào code. Để nguyên là hai tab nói hai chuẩn.

| File | Hằng số | Thành |
|---|---|---|
| [`SpendClassificationCard.tsx:49`](../../../src/features/reports/SpendClassificationCard.tsx) | `> 50`, `> 30`, hai cột cứng | N cột theo `method.buckets` (bỏ khoản `savings`) |
| [`verdicts.ts:129`](../../../src/features/reports/verdicts.ts) | mốc `20` | `bps` của khoản `savings` |
| [`KpiRow.tsx:122`](../../../src/features/bulletin/KpiRow.tsx) | vạch mốc `20%` | `bps` của khoản `savings` |

### MCP server — sửa một câu mô tả, phải gói lại

[`api/_handler.ts:91`](../../../api/_handler.ts) mô tả bộ lọc `need_level` là
"'essential' (bắt buộc) / 'flexible' (sở thích)". Bộ lọc nhận chuỗi thô nên **chạy vẫn
đúng** với nhãn mới, nhưng mô tả sai sẽ làm agent gọi tool không biết lọc được
`education`/`giving`/`buffer`. Sửa câu đó → `npm run bundle:mcp` → commit `api/mcp.mjs`
cùng lần (guard: [`tests/mcpBundle.test.ts`](../../../tests/mcpBundle.test.ts)).

### Không đụng tới

- **Không** phải chạy `npm run bundle:rules` — đã kiểm: `supabase/functions/` không
  tham chiếu `need_level` hay mốc trục nào. (Khác với `bundle:mcp` ở trên — cái đó
  **có** phải chạy.)
- `cost_type` (Cố định / Biến đổi) là trục **độc lập**, không liên quan phương pháp phân bổ.
- `emergencyCut` (`flexible` ∧ `variable`) giữ định nghĩa cũ, vẫn dựa trên nhãn
  `flexible` chứ không phải khoản của phương pháp.

## Test

`budgetMethods.test.ts` (mới) — bất biến của **mọi** phương pháp trong `BUDGET_METHODS`:

1. Có **đúng một** khoản `source.kind === 'residual'`, `direction: 'floor'`
2. Khoá khoản không trùng nhau
3. **Phủ đúng một lần**: mỗi `NeedLevel` xuất hiện ở đúng một khoản `kind: 'needs'` —
   trừ phương pháp có khoản `allExpense`, khi đó nó là khoản chi duy nhất
4. Tổng `bps` mặc định = 10.000
5. `resolveMethod` với `budget_method` lạ / `undefined` / jsonb hỏng → `50-30-20`
6. `resolveMethod` chỉ đè khoá có trong `budget_targets`, khoá còn lại giữ mặc định

`axisTargets.test.ts` (cập nhật) — với **mọi** phương pháp:

7. Tổng `actual` các khoản chi + `unclassified` = `totalExpense`
8. Khoản `savings` âm khi chi > thu, và `shareLabel` in "Âm 20%" chứ không "-20%"
9. `basis <= 0` → `null` (giữ nguyên)
10. Nền ước tính (`baseline`) chỉ đắp phần thiếu (giữ nguyên)

`designSystem.test.ts` phải vẫn xanh: `<Select>`, `<SectionTitle>`, `<Money>`/`<Num>`,
không giá trị tuỳ ý.

**Kiểm bằng mắt trên app chạy thật** — `npm test` không thấy ba thứ này
([quy ước repo](../../../CLAUDE.md)): chế độ Sáng, cỡ chữ 1,25× ở 375px, và lưới ô %
5–6 cột ở màn hẹp.

## Việc người dùng phải làm một lần

Đổi nhãn 4 danh mục: `Khóa học & Chứng chỉ`, `Sách vở` → Giáo dục; `Quà`,
`Hỗ trợ gia đình` → Cho đi. Tuỳ ý: `Thuốc`, `Phí thủ tục` → Dự phòng (chỉ cần nếu dùng
Kakeibo). **Không đổi gì thì app chạy y như hôm nay** — `50-30-20` gom `education` và
`giving` về Linh hoạt, `buffer` về Thiết yếu.

## Ngoài phạm vi (cố ý)

- **Không** cho tự tạo khoản tuỳ ý. `custom` chỉ là "hiện đủ 6 khoản có sẵn, tự gõ %".
  Một trình dựng khoản kéo theo: đặt tên, chọn nhãn nguồn, thứ tự, xoá khoản đang có dữ
  liệu — nhiều gấp mấy lần phần còn lại của spec này, cho một nhu cầu chưa ai nêu.
- **Không** tách hũ Đầu tư / Tiết kiệm dài hạn (lý do ở trên).
- **Không** cho mỗi tháng một phương pháp. Một phương pháp cho cả sổ; tháng cũ hiện lại
  theo mốc mới — đúng hành vi hiện tại khi sửa ba con số %. Mốc là **cách nhìn**, không
  phải dữ liệu của tháng.
- **Không** thêm `debt` vào bộ nhãn. Trả nợ trong app này là dòng tiền nợ
  (`is_debt_flow`), đã bị loại khỏi chi, nên một nhãn danh mục sẽ không bắt được nó.
  Vì vậy `70-20-10` đặt tên khoản thứ ba là "Cho đi" chứ không "Cho đi & trả nợ".
