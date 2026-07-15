# Máy tính trong ô số tiền (mục L) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho gõ phép tính (`+ − × ÷`) ngay trong ô số tiền màn Nhập trên điện thoại; app tự tính tổng để lưu.

**Architecture:** Tách toàn bộ logic (nhập phím + tính) ra tệp thuần `calc.ts` để unit-test; `NumPad` thêm nút phép tính + `00`; `TransactionForm` dùng `calc` để nhận phím và tính, đổi cách hiển thị ô số tiền. Không đụng dữ liệu/`repo`/`schema`.

**Tech Stack:** React 19 + TypeScript, Vitest (unit test logic thuần), Tailwind. Tiền lưu ở đơn vị nhỏ nhất (số nguyên).

## Global Constraints

- Stack cố định: React + Vite + TS + Tailwind + TanStack Query. Không thêm thư viện mới.
- Tiền lưu **đơn vị nhỏ nhất (số nguyên)**, không dùng float để lưu. Dãy chữ số gõ vào chính là minor units.
- UI tiếng Việt. Bàn phím `NumPad` chỉ hiện trên mobile (`lg:hidden`); ô nhập desktop giữ nguyên.
- Chỉ unit-test **logic thuần** (theo công ước dự án — chưa có test giao diện). Test dùng `import { describe, expect, it } from 'vitest'`, tên test tiếng Việt.
- Sau mỗi task: `npm run build` + `npm run lint` + `npm test` phải sạch.
- Commit message **không dấu**, prefix `GD-nhap:`.
- 4 dấu phép tính dùng đúng ký tự hiển thị: `+` `−` (U+2212) `×` `÷` — xuyên suốt `NumPad`, `calc`.
- Tính **trái sang phải** (không ưu tiên nhân chia). Nhân/chia lẻ → làm tròn số học ở kết quả cuối.
- Mỗi số tối đa 12 chữ số; tổng biểu thức tối đa 40 ký tự.

---

### Task 1: `calc.ts` — hàm tính biểu thức `evalExpression`

**Files:**
- Create: `src/features/transactions/calc.ts`
- Test: `src/features/transactions/calc.test.ts`

**Interfaces:**
- Consumes: (không có — tệp thuần, không import gì)
- Produces:
  - `evalExpression(expr: string): number | null` — tính biểu thức trên số nguyên, trái→phải, làm tròn kết quả cuối; `null` nếu chia cho 0; biểu thức trống → `0`; tự bỏ dấu phép tính thừa ở đầu/cuối.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/features/transactions/calc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { evalExpression } from './calc'

describe('evalExpression', () => {
  it('biểu thức trống → 0', () => {
    expect(evalExpression('')).toBe(0)
  })

  it('một số đơn → chính nó', () => {
    expect(evalExpression('1200')).toBe(1200)
  })

  it('cộng, trừ, nhân, chia cơ bản', () => {
    expect(evalExpression('1200+800')).toBe(2000)
    expect(evalExpression('2000−500')).toBe(1500)
    expect(evalExpression('500×3')).toBe(1500)
    expect(evalExpression('1000÷4')).toBe(250)
  })

  it('chia lẻ → làm tròn số học', () => {
    expect(evalExpression('1000÷3')).toBe(333)
    expect(evalExpression('100÷8')).toBe(13) // 12,5 làm tròn lên
  })

  it('tính lần lượt trái sang phải, không ưu tiên nhân chia', () => {
    expect(evalExpression('1200+800×2')).toBe(4000) // (1200+800)×2
  })

  it('bỏ dấu phép tính thừa ở cuối', () => {
    expect(evalExpression('1200+')).toBe(1200)
    expect(evalExpression('1200+800+')).toBe(2000)
  })

  it('chia cho 0 → null', () => {
    expect(evalExpression('100÷0')).toBe(null)
  })

  it('chỉ có dấu → 0', () => {
    expect(evalExpression('+')).toBe(0)
    expect(evalExpression('×')).toBe(0)
  })

  it('cho phép kết quả âm', () => {
    expect(evalExpression('100−500')).toBe(-400)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run src/features/transactions/calc.test.ts`
Expected: FAIL — không import được `./calc` (module chưa tồn tại).

- [ ] **Step 3: Viết code tối thiểu cho pass**

Tạo `src/features/transactions/calc.ts`:

```ts
// Logic thuần cho ô số tiền: gõ phím + tính biểu thức.
// Tiền ở đơn vị nhỏ nhất (số nguyên); tính trái→phải, làm tròn kết quả cuối.

const OPERATORS = ['+', '−', '×', '÷'] as const

/**
 * Tính biểu thức trên số nguyên, trái→phải, làm tròn kết quả cuối.
 * Trả null nếu chia cho 0. Biểu thức trống → 0. Bỏ dấu phép tính thừa ở đầu/cuối.
 */
export function evalExpression(expr: string): number | null {
  const ops = OPERATORS as readonly string[]
  let s = expr
  while (s.length > 0 && ops.includes(s[s.length - 1])) s = s.slice(0, -1)
  while (s.length > 0 && ops.includes(s[0])) s = s.slice(1)
  if (s === '') return 0

  const tokens = s.match(/\d+|[+−×÷]/g)
  if (!tokens) return 0

  let acc = Number(tokens[0])
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]
    const num = Number(tokens[i + 1])
    if (op === '+') acc += num
    else if (op === '−') acc -= num
    else if (op === '×') acc *= num
    else if (op === '÷') {
      if (num === 0) return null
      acc /= num
    }
  }
  return Math.round(acc)
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run src/features/transactions/calc.test.ts`
Expected: PASS — tất cả case xanh.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/calc.ts src/features/transactions/calc.test.ts
git commit -m "GD-nhap: calc evalExpression + test (L)"
```

---

### Task 2: `calc.ts` — quy tắc nhập phím `appendKey`

**Files:**
- Modify: `src/features/transactions/calc.ts`
- Test: `src/features/transactions/calc.test.ts`

**Interfaces:**
- Consumes: `OPERATORS` (đã có trong `calc.ts` từ Task 1)
- Produces:
  - `MAX_AMOUNT_DIGITS = 12` (export const) — số chữ số tối đa cho một số.
  - `MAX_EXPR_LENGTH = 40` (export const) — độ dài tối đa của cả biểu thức.
  - `appendKey(expr: string, key: string): string` — áp một phím bấm vào biểu thức, trả biểu thức mới. Phím: `'0'..'9'`, `'00'`, `'000'`, `'+'`, `'−'`, `'×'`, `'÷'`, `'⌫'`. Quy tắc: không cho bắt đầu bằng dấu; bấm 2 dấu liền → thay dấu cuối; `⌫` xóa lùi 1 ký tự; chặn vượt giới hạn số chữ số / độ dài; bỏ số 0 vô nghĩa ở đầu mỗi số.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/features/transactions/calc.test.ts` (thêm `appendKey` vào dòng import ở đầu tệp: `import { appendKey, evalExpression } from './calc'`):

```ts
describe('appendKey', () => {
  it('không cho bắt đầu bằng dấu phép tính', () => {
    expect(appendKey('', '+')).toBe('')
    expect(appendKey('', '×')).toBe('')
  })

  it('gõ chữ số nối vào số hiện tại', () => {
    expect(appendKey('', '5')).toBe('5')
    expect(appendKey('5', '0')).toBe('50')
    expect(appendKey('12', '000')).toBe('12000')
  })

  it('nút 00 và 000 khi trống → một số 0', () => {
    expect(appendKey('', '00')).toBe('0')
    expect(appendKey('', '000')).toBe('0')
  })

  it('bỏ số 0 vô nghĩa ở đầu mỗi số', () => {
    expect(appendKey('0', '5')).toBe('5')
    expect(appendKey('5+0', '3')).toBe('5+3')
  })

  it('bấm dấu sau số → nối dấu', () => {
    expect(appendKey('5', '+')).toBe('5+')
    expect(appendKey('5+', '3')).toBe('5+3')
  })

  it('bấm 2 dấu liền nhau → thay dấu cuối', () => {
    expect(appendKey('5+', '×')).toBe('5×')
  })

  it('xóa lùi 1 ký tự (số hoặc dấu)', () => {
    expect(appendKey('5+3', '⌫')).toBe('5+')
    expect(appendKey('5+', '⌫')).toBe('5')
    expect(appendKey('5', '⌫')).toBe('')
  })

  it('chặn vượt 12 chữ số cho một số', () => {
    expect(appendKey('123456789012', '3')).toBe('123456789012')
  })

  it('chặn vượt độ dài tối đa của biểu thức', () => {
    const long = '9'.repeat(40)
    expect(appendKey(long, '1')).toBe(long)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run src/features/transactions/calc.test.ts`
Expected: FAIL — `appendKey` chưa export (`appendKey is not a function`).

- [ ] **Step 3: Viết code tối thiểu cho pass**

Thêm vào cuối `src/features/transactions/calc.ts`:

```ts
export const MAX_AMOUNT_DIGITS = 12
export const MAX_EXPR_LENGTH = 40

/**
 * Áp một phím bấm vào biểu thức, trả biểu thức mới.
 * Phím: '0'..'9', '00', '000', '+', '−', '×', '÷', '⌫'.
 */
export function appendKey(expr: string, key: string): string {
  if (key === '⌫') return expr.slice(0, -1)

  const ops = OPERATORS as readonly string[]
  if (ops.includes(key)) {
    if (expr === '') return expr // không cho bắt đầu bằng dấu
    if (ops.includes(expr[expr.length - 1])) return expr.slice(0, -1) + key // thay dấu cuối
    if (expr.length + key.length > MAX_EXPR_LENGTH) return expr
    return expr + key
  }

  if (!/^\d+$/.test(key)) return expr // phím lạ → bỏ qua
  const currentNum = expr.match(/\d+$/)?.[0] ?? ''
  if (currentNum.length + key.length > MAX_AMOUNT_DIGITS) return expr
  if (expr.length + key.length > MAX_EXPR_LENGTH) return expr
  return (expr + key).replace(/(^|[+−×÷])0+(?=\d)/g, '$1') // bỏ 0 vô nghĩa đầu mỗi số
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run src/features/transactions/calc.test.ts`
Expected: PASS — cả `evalExpression` và `appendKey` xanh.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/calc.ts src/features/transactions/calc.test.ts
git commit -m "GD-nhap: calc appendKey + test (L)"
```

---

### Task 3: `TransactionForm` — nối máy tính vào form, đổi hiển thị ô số tiền

**Files:**
- Modify: `src/features/transactions/TransactionForm.tsx`

**Interfaces:**
- Consumes: `appendKey`, `evalExpression`, `MAX_AMOUNT_DIGITS` từ `./calc`.
- Produces: (không có API mới cho task sau — chỉ đổi hành vi nội bộ form)

Ghi chú: task này chưa hiện nút phép tính (đó là Task 4). Sau task này form vẫn chạy đúng với các phím số hiện tại; `evalExpression` xử lý cả chuỗi số thuần nên không đổi hành vi cũ.

- [ ] **Step 1: Đổi import + bỏ hằng số cục bộ**

Trong `src/features/transactions/TransactionForm.tsx`:

Đổi dòng import money để thêm type `CurrencyCode`:

```ts
import { CURRENCIES, formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
```

Thêm import calc ngay dưới import `NumPad`:

```ts
import { appendKey, evalExpression, MAX_AMOUNT_DIGITS } from './calc'
```

Xóa dòng hằng số cục bộ `const MAX_AMOUNT_DIGITS = 12` (dùng bản import từ `calc`).

- [ ] **Step 2: Thêm helper hiển thị biểu thức (cấp module)**

Thêm ngay trên `interface TransactionFormProps`:

```ts
const hasOperator = (expr: string) => /[+−×÷]/.test(expr)

/** Biểu thức → chuỗi hiển thị: mỗi số định dạng như tiền, nối bằng dấu có khoảng trắng. */
function formatExpr(expr: string, currency: CurrencyCode): string {
  return expr
    .replace(/\d+/g, (n) => formatMoney(Number(n), currency))
    .replace(/([+−×÷])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
}
```

- [ ] **Step 3: Tính amount/toAmount bằng `evalExpression`**

Thay hai dòng:

```ts
  const amount = digits === '' ? 0 : Number(digits)
  const toAmount = toDigits === '' ? 0 : Number(toDigits)
```

bằng:

```ts
  const amountResult = evalExpression(digits)
  const amount = amountResult ?? 0
  const toAmountResult = evalExpression(toDigits)
  const toAmount = toAmountResult ?? 0
```

(`canSave` giữ nguyên: khi chia cho 0 → `amountResult` là `null` → `amount = 0` → `amount > 0` sai → nút Lưu mờ.)

- [ ] **Step 4: Cho `onNumPadKey` dùng `appendKey`**

Thay cả hàm:

```ts
  function onNumPadKey(key: NumPadKey) {
    const setter = activeField === 'to' && crossCurrency ? setToDigits : setDigits
    setter((d) => {
      if (key === '⌫') return d.slice(0, -1)
      const next = (d + key).replace(/^0+(?=\d)/, '')
      return next.length > MAX_AMOUNT_DIGITS ? d : next
    })
  }
```

bằng:

```ts
  function onNumPadKey(key: NumPadKey) {
    const setter = activeField === 'to' && crossCurrency ? setToDigits : setDigits
    setter((d) => appendKey(d, key))
  }
```

- [ ] **Step 5: Đổi `amountBox` sang nhận biểu thức + hiện kết quả tạm**

Thay cả helper `amountBox` (từ `const amountBox = (` tới hết phần return của nó) bằng:

```tsx
  /** Ô số tiền: div hiển thị trên mobile (numpad gõ), input trên desktop */
  const amountBox = (
    field: 'main' | 'to',
    expr: string,
    currency: CurrencyCode,
    setDigitsFn: (v: string) => void,
    label?: string,
  ) => {
    const isActive = crossCurrency && activeField === field
    const ring = isActive ? 'ring-2 ring-green-500' : ''
    const result = evalExpression(expr)
    const showExpr = hasOperator(expr)
    const mobileText = showExpr ? formatExpr(expr, currency) : formatMoney(result ?? 0, currency)
    const inputValue = result && result !== 0 ? formatMoney(result, currency) : ''
    return (
      <div className="flex flex-col gap-0.5">
        {label && <span className="px-1 text-xs text-gray-500">{label}</span>}
        <button
          type="button"
          onClick={() => setActiveField(field)}
          className={`truncate rounded-xl bg-white px-4 py-3 text-right font-bold shadow-sm ${
            showExpr ? 'text-xl' : 'text-3xl'
          } ${AMOUNT_COLOR[type]} ${ring} lg:hidden`}
        >
          {mobileText}
        </button>
        {showExpr && result !== null && (
          <span className="px-1 text-right text-sm text-gray-500 lg:hidden">
            = {formatMoney(result, currency)}
          </span>
        )}
        <input
          inputMode="numeric"
          value={inputValue}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setDigitsFn(parsed === '0' ? '' : parsed.slice(0, MAX_AMOUNT_DIGITS))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder={formatMoney(0, currency)}
          className={`hidden rounded-xl bg-white px-4 py-3 text-right text-3xl font-bold shadow-sm outline-green-500 lg:block ${AMOUNT_COLOR[type]}`}
        />
      </div>
    )
  }
```

- [ ] **Step 6: Cập nhật lời gọi `amountBox` (truyền biểu thức thay vì số)**

Thay hai dòng gọi:

```tsx
      {amountBox('main', amount, srcCurrency, setDigits, crossCurrency ? 'Chuyển đi' : undefined)}
      {crossCurrency &&
        amountBox('to', toAmount, dstCurrency, setToDigits, `Nhận được (${dstCurrency})`)}
```

bằng:

```tsx
      {amountBox('main', digits, srcCurrency, setDigits, crossCurrency ? 'Chuyển đi' : undefined)}
      {crossCurrency &&
        amountBox('to', toDigits, dstCurrency, setToDigits, `Nhận được (${dstCurrency})`)}
```

- [ ] **Step 7: Kiểm tra dựng bản + lint + test**

Run: `npm run build && npm run lint && npm test`
Expected: cả 3 sạch (không lỗi TypeScript, không lỗi lint, test cũ + `calc.test.ts` xanh).

- [ ] **Step 8: Nghiệm thu nhanh trên bản xem trước (mobile)**

Mở dev server, đặt khung xem cỡ điện thoại. Nhập một giao dịch bằng bàn phím số hiện có (chưa có nút phép tính): gõ số → hiện đúng số tiền như trước, bấm Lưu chạy bình thường. (Nút phép tính sẽ có ở Task 4.)

- [ ] **Step 9: Commit**

```bash
git add src/features/transactions/TransactionForm.tsx
git commit -m "GD-nhap: noi may tinh vao form nhap (L)"
```

---

### Task 4: `NumPad` — thêm nút phép tính + `00`, lưới 4 cột, nút xóa trải rộng

**Files:**
- Modify: `src/features/transactions/NumPad.tsx`

**Interfaces:**
- Consumes: (không)
- Produces:
  - `NumPadKey` mở rộng: `'0'..'9' | '00' | '000' | '+' | '−' | '×' | '÷' | '⌫'`. `TransactionForm.onNumPadKey` nhận kiểu này (đã dùng `appendKey` xử lý mọi phím ở Task 3).

- [ ] **Step 1: Thay toàn bộ nội dung `NumPad.tsx`**

```tsx
const NUM_OP_KEYS = [
  '1', '2', '3', '÷',
  '4', '5', '6', '×',
  '7', '8', '9', '−',
  '00', '0', '000', '+',
] as const

const OP_SET = new Set(['+', '−', '×', '÷'])

export type NumPadKey = (typeof NUM_OP_KEYS)[number] | '⌫'

const ARIA: Record<string, string> = {
  '+': 'Cộng',
  '−': 'Trừ',
  '×': 'Nhân',
  '÷': 'Chia',
  '⌫': 'Xóa',
}

/** Bàn phím số + phép tính cho mobile — không dùng bàn phím hệ thống. */
export function NumPad({ onKey }: { onKey: (key: NumPadKey) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-4 gap-1.5">
        {NUM_OP_KEYS.map((key) => {
          const isOp = OP_SET.has(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onKey(key)}
              aria-label={ARIA[key] ?? key}
              className={`rounded-xl py-3.5 text-xl font-semibold shadow-sm transition active:scale-95 ${
                isOp
                  ? 'bg-gray-100 text-green-700 active:bg-gray-300'
                  : 'bg-white text-gray-800 active:bg-gray-200'
              }`}
            >
              {key}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => onKey('⌫')}
        aria-label={ARIA['⌫']}
        className="w-full rounded-xl bg-white py-3.5 text-xl font-semibold text-gray-800 shadow-sm transition active:scale-95 active:bg-gray-200"
      >
        ⌫
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Kiểm tra dựng bản + lint + test**

Run: `npm run build && npm run lint && npm test`
Expected: cả 3 sạch. (Type `NumPadKey` rộng ra nhưng `onNumPadKey` dùng `appendKey(d, key)` nhận `string` nên không lỗi.)

- [ ] **Step 3: Nghiệm thu trên bản xem trước (mobile) — luồng đầy đủ**

Mở dev server, khung xem cỡ điện thoại, vào màn Nhập:
1. Gõ `1200` `+` `800` → ô hiện `¥1.200 + ¥800`, dòng nhỏ dưới hiện `= ¥2.000`.
2. Bấm Lưu → mở Sổ giao dịch, xác nhận có giao dịch `¥2.000`.
3. Thử một phép nhân (vd `500` `×` `3` → `= ¥1.500`) và một phép chia lẻ (vd `1000` `÷` `3` → `= ¥333`).
4. Thử chia cho 0 (`100` `÷` `0`) → nút Lưu mờ đi.
5. Thử `⌫` xóa lùi cả số lẫn dấu.

Chụp màn hình biểu thức + kết quả tạm để báo lại.

- [ ] **Step 4: Commit**

```bash
git add src/features/transactions/NumPad.tsx
git commit -m "GD-nhap: NumPad them phep tinh + 00 (L)"
```

---

## Self-Review

**Spec coverage:**
- 4 phép + − × ÷ → Task 1 (`evalExpression`), Task 4 (nút).
- Trái→phải, làm tròn cuối, chia 0 → null → Task 1 + test.
- Bàn phím 4 cột + `00` + `⌫` trải rộng → Task 4.
- Hiển thị biểu thức + kết quả tạm; chưa gõ dấu thì như cũ → Task 3 (`amountBox`, `formatExpr`).
- Quy tắc nhập (không mở đầu bằng dấu, thay dấu cuối, xóa lùi, giới hạn 12 chữ số / 40 ký tự, bỏ 0 vô nghĩa) → Task 2 (`appendKey`) + test.
- Áp cho cả ô "nhận được" chuyển khoản → Task 3 (`onNumPadKey` theo `activeField`, cả 2 ô đều gọi `amountBox` với biểu thức).
- Desktop giữ nguyên → Task 3 (ô `input` vẫn `parseMoney`; `evalExpression` xử lý chuỗi số thuần).
- Không đụng schema/repo → không task nào chạm data.
- Chỉ unit-test logic thuần → test chỉ ở `calc.test.ts`; NumPad/Form nghiệm thu bằng build+lint+preview.

**Placeholder scan:** không có TBD/TODO; mọi step có code/lệnh cụ thể.

**Type consistency:** `evalExpression(string): number | null`, `appendKey(string, string): string`, `MAX_AMOUNT_DIGITS`, `MAX_EXPR_LENGTH`, `NumPadKey`, `CurrencyCode`, `formatExpr(string, CurrencyCode): string`, `hasOperator(string)` — dùng nhất quán giữa các task. Ký tự dấu `−` (U+2212) dùng đồng nhất ở `calc` và `NumPad`.
