# Cảnh báo tỷ giá đã cũ

Ngày: 2026-08-06

## Vấn đề

`fetchRates` (`src/lib/rates.ts`) lấy tỷ giá từ `open.er-api.com`. Khi gọi lỗi
(mất mạng, API chết, đổi endpoint), nó lặng lẽ trả bản lưu trong `localStorage`
và **không kiểm tra bản lưu đó cũ bao lâu**:

```ts
} catch (err) {
  const cached = localStorage.getItem(CACHE_KEY(base))
  if (cached) return (JSON.parse(cached) as { rates: Rates }).rates
  throw err
}
```

Hệ quả: API hỏng cả tuần thì mọi con số quy đổi trong app vẫn hiện bình thường,
tính theo tỷ giá tuần trước, không màn hình nào có dấu hiệu gì. Người dùng không
có cách nào biết.

Đây là chuyện KHÁC với 15 banner "chưa quy đổi được (đang chờ tỷ giá)" đang có
(`hasMissingRate`). Những banner đó nói *thiếu hẳn* tỷ giá; ở đây tỷ giá *có*,
chỉ là cũ.

## Phạm vi

Hiện một khối tỷ giá ở trang **Cài đặt**, chuyển sang cảnh báo vàng khi số đã cũ
**quá 3 ngày**. Không đụng màn hình nào khác.

Vì sao chỉ Cài đặt, không phải dải cảnh báo toàn app: đây là tình huống hiếm
(nguồn hỏng nhiều ngày liền), không đáng chiếm chỗ cố định trên mọi trang.

Vì sao 3 ngày: nguồn chỉ đổi số 1 lần/ngày (khoảng 00:00 UTC). Ngưỡng 1 ngày sẽ
kêu oan mỗi lần người dùng offline qua đêm; 3 ngày nghĩa là hỏng thật.

## Đo "cũ" bằng đồng hồ nào

API trả về hai mốc thời gian khác nhau:

| Mốc | Nghĩa | Hiện trạng |
|---|---|---|
| `fetchedAt` | Lúc app tải số về | app đã lưu (`rates.ts:25`) |
| `time_last_update_unix` | Lúc nguồn định giá con số | app đang vứt đi |

**Dùng `time_last_update_unix`.** Nó là lúc con số thật sự được định giá. Nếu API
còn sống nhưng đứng số (treo bên phía họ), `fetchedAt` vẫn nhảy đều mỗi 12 tiếng
và ta mù hoàn toàn — còn mốc kia đứng yên và lộ ra ngay. Cache lưu cả hai;
`fetchedAt` giữ lại để soi lỗi sau này, chỉ `sourceUpdatedAt` dùng để phán "cũ".

## Thay đổi trong `src/lib/rates.ts`

**KHÔNG đổi chữ ký `fetchRates`.** Có hai nơi gọi nó — `src/hooks/queries.ts:57`
và `src/features/lifetime/ScenarioEditorSheet.tsx:15` — nơi thứ hai không liên
quan gì tới việc này; đổi kiểu trả về là kéo theo sửa oan.

### 1. Ghi thêm `sourceUpdatedAt` vào cache

Kiểu bản ghi cache thành:

```ts
type RatesCache = {
  rates: Rates
  fetchedAt: number
  /** epoch ms — `time_last_update_unix` × 1000. Thiếu = cache ghi trước bản này. */
  sourceUpdatedAt?: number
}
```

`fetchRates` đọc `json.time_last_update_unix` (giây, nhân 1000). Nguồn không trả
trường này thì bỏ qua — **không được** để việc đó làm hỏng đường lấy tỷ giá.

### 2. `readRatesMeta(base): RatesCache | null` — hàm mới, export

Đọc `localStorage`, `JSON.parse`. Không có khoá, parse lỗi, hoặc `rates` không
phải object → trả `null`. Không ném lỗi.

### 3. `rateAgeDays(sourceUpdatedAt: number, now: number): number` — hàm thuần, export

`Math.floor((now - sourceUpdatedAt) / 86_400_000)`. Mốc ở tương lai (lệch đồng
hồ máy) → trả `0`, không trả số âm.

Ngưỡng cảnh báo `STALE_RATE_DAYS = 3` export từ đây để UI và test dùng chung.

### Tương thích ngược

Cache đang nằm trong máy người dùng chưa có `sourceUpdatedAt` → `undefined` →
**không cảnh báo, không hiện dòng "cập nhật"** (chỉ hiện các dòng tỷ giá). Chậm
nhất 12 tiếng sau (`staleTime` của `useRates`) là có số thật. Không đổi tên khoá
cache, không cần xoá gì.

## Cách viết tỷ giá cho dễ đọc

Hàm thuần trong `rates.ts`, export, có test:

```ts
formatRateLine(base: CurrencyCode, code: CurrencyCode, rate: number): string
```

- `rate >= 1` → `1 ¥ = 165 ₫`
- `rate < 1` → lật ngược: `1 $ = 158 ¥`

Không lật thì USD ra `1 ¥ = 0,0063 $`, nhìn không hiểu gì. Số hiển thị làm tròn
theo `decimals` của loại tiền đích, dùng `formatMoney` sẵn có.

## Giao diện — `src/features/settings/SettingsPage.tsx`

Khối mới đặt ngay dưới khối hồ sơ (chỗ đang ghi "Tiền gốc {base}", dòng 145),
vì cùng chủ đề tiền tệ. Dùng `useRates()` để lấy `base` + `rates`, và
`readRatesMeta(base)` cho mốc thời gian.

### Bình thường

```
⇄  Tỷ giá quy đổi
   1 ¥ = 165 ₫
   1 $ = 158 ¥
   Cập nhật hôm nay
```

- Một dòng cho mỗi loại tiền trong `rates` khác `base` (tối đa 2 — app chỉ có
  JPY/VND/USD).
- Dòng cuối xám, theo `rateAgeDays`: `0` → `Cập nhật hôm nay`, `1` → `Cập nhật
  hôm qua`, `≥2` → `Cập nhật N ngày trước`.
- `readRatesMeta` trả `null`, hoặc trả về nhưng thiếu `sourceUpdatedAt` (cache
  ghi trước bản này) → **bỏ hẳn dòng cuối**, chỉ hiện các dòng tỷ giá.

### Khi cũ quá 3 ngày

Dòng cuối chuyển vàng cam (cùng lớp Tailwind với các banner sẵn có:
`text-amber-700 dark:text-amber-300`), kèm nút:

```
⚠ Cập nhật 5 ngày trước — mạng hoặc nguồn tỷ giá đang lỗi,
  số quy đổi có thể sai.
  [ Thử lấy lại ]
```

Nút **Thử lấy lại** chỉ hiện khi đang cảnh báo — thấy lỗi mà không làm gì được
thì bực. Bấm → `queryClient.invalidateQueries({ queryKey: ['rates'] })`.

### Chưa có tỷ giá

`rates === undefined` (query đang chạy hoặc đã lỗi và chưa từng có cache): khối
không hiện gì cả. Đây không phải chuyện của tính năng này — `hasMissingRate` ở
các màn khác đã lo.

## Test

`src/lib/rates.test.ts` thêm:

- `rateAgeDays`: đúng 0 ngày, 3 ngày, mốc tương lai → 0.
- `formatRateLine`: nhánh `rate >= 1` (VND), nhánh `rate < 1` (USD lật ngược).
- `readRatesMeta`: không có khoá → `null`; JSON hỏng → `null`; cache cũ thiếu
  `sourceUpdatedAt` → trả object với trường đó `undefined`.

Không viết test UI cho `SettingsPage` — dự án chưa có test render nào cho trang
này.

## Không đụng tới

- 15 banner `hasMissingRate` ở các màn khác.
- Mục **Gửi tiền về VN** (`src/features/remittance/`) — nó tính từ số VND người
  nhận thật sự nhận, không dùng tỷ giá tự động.
- `convertToBase`.
- `staleTime` 12 tiếng của `useRates`.
