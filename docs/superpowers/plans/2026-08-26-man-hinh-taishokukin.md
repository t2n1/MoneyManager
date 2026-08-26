# Màn hình 退職金 (はぐくみ企業年金) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một trang trả lời "chế độ hưu trí công ty này cho tôi được gì, mất gì, và tới lúc nghỉ nó là bao nhiêu", với mỗi con số nói rõ nó là số **đo**, số **sàn**, hay số **ước**.

**Architecture:** Bốn file toán thuần trong `src/features/tax/` và `src/features/assets/` (không JSX, có unit test), một migration thêm cột `profile`, một hook gom dữ liệu, một trang. Không đụng gì phía server — không edge function, không `npm run bundle:rules`.

**Tech Stack:** React 19 + TypeScript, TanStack Query, Tailwind v4, Vitest, Supabase (PostgREST).

**Spec:** [docs/superpowers/specs/2026-08-26-man-hinh-taishokukin-design.md](../specs/2026-08-26-man-hinh-taishokukin-design.md) — đọc cả hai; kế hoạch này lập luận từ spec đó.

## Global Constraints

- **Không dùng float cho tiền.** Mọi số tiền là integer minor units. Chia thì `Math.round` ngay, đừng để số lẻ chảy xuống.
- **Không gọi `repo` trực tiếp từ `src/features/`.** Dữ liệu đi qua hook trong [src/hooks/queries.ts](../../../src/hooks/queries.ts).
- **Migration đi cùng commit với [src/types/database.types.ts](../../../src/types/database.types.ts).** File đó viết tay, không codegen — quên là compiler im mà query chết lúc chạy.
- **Toán tiền sống trong file `.ts` riêng, không JSX, có unit test.** Component render số, không tính số.
- **Giao diện: mở [docs/design-system.md](../../design-system.md) TRƯỚC.** Dùng `<PageHeader>`, `<SectionTitle>`, `<Select>`, `<ActionButton>`, `<Money>`, `<Num>`, `<EstimateMark>`. **Không giá trị tuỳ ý** (`text-[0.8125rem]` là ban cứng trong `tests/designSystem.test.ts`).
- **Mọi số tiền qua `<Money>`, mọi số đếm/%/tháng qua `<Num>`.**
- **Ba loại số, ba cách hiện:** *đo* (không dấu) · *sàn* (chữ "ít nhất") · *ước* (dấu `≈` + `<EstimateMark>`).
- **Màn này KHÔNG khuyên đóng bao nhiêu.** Không câu nào dạng "bạn nên…". Nó hiện số và nguồn của từng số.
- Hằng số đã kiểm, dùng verbatim: `厚生年金保険料率` toàn phần **18,300%**, phần người lao động **9,150%**; hệ số 老齢厚生年金 báo酬比例 **5,481/1000**; 給付利率 事業年度 2025 = **0,30%/năm** (30 bps).

---

### Task 1: Thang 標準報酬月額 và phép suy từ phiếu lương

**Files:**
- Create: `src/features/tax/shakaiHoken.ts`
- Test: `src/features/tax/shakaiHoken.test.ts`

**Interfaces:**
- Consumes: không gì (task đầu).
- Produces:
  - `KOSEI_NENKIN_LADDER: readonly number[]` (32 phần tử)
  - `KOSEI_NENKIN_EMPLOYEE_RATE = 0.0915`
  - `gradeOf(rewardMonthly: number): number | null` — trả **số bậc 1..32**, `null` khi ngoài ¥88.000–¥650.000
  - `standardMonthlyOf(grade: number): number | null`
  - `standardMonthlyFromPension(pensionPremium: number, hasKikinLine: boolean): number | null`

- [ ] **Step 1: Viết test đỏ**

```ts
// src/features/tax/shakaiHoken.test.ts
import { describe, expect, it } from 'vitest'
import {
  gradeOf,
  standardMonthlyFromPension,
  standardMonthlyOf,
  KOSEI_NENKIN_LADDER,
  KOSEI_NENKIN_EMPLOYEE_RATE,
} from './shakaiHoken'

describe('KOSEI_NENKIN_LADDER', () => {
  it('có đúng 32 bậc, đầu ¥88.000 cuối ¥650.000', () => {
    expect(KOSEI_NENKIN_LADDER).toHaveLength(32)
    expect(KOSEI_NENKIN_LADDER[0]).toBe(88_000)
    expect(KOSEI_NENKIN_LADDER[31]).toBe(650_000)
  })

  /**
   * Đối chiếu với PDF gốc của 日本年金機構 (令和8年度) qua CỘT TIỀN PHÍ: mỗi mức nhân
   * 18,3% phải ra đúng số 全額 in trên bảng. Đây là cách bảng được kiểm lúc viết spec —
   * không đọc mắt.
   */
  it('mỗi mức nhân 18,3% ra số tròn đồng, và nửa của nó là phần người lao động', () => {
    for (const std of KOSEI_NENKIN_LADDER) {
      const full = std * 0.183
      expect(Math.abs(full - Math.round(full * 100) / 100)).toBeLessThan(0.001)
      expect(std * KOSEI_NENKIN_EMPLOYEE_RATE * 2).toBeCloseTo(full, 6)
    }
  })

  it('tăng đơn điệu, mọi mức tròn nghìn', () => {
    for (let i = 1; i < KOSEI_NENKIN_LADDER.length; i++) {
      expect(KOSEI_NENKIN_LADDER[i]).toBeGreaterThan(KOSEI_NENKIN_LADDER[i - 1])
    }
    expect(KOSEI_NENKIN_LADDER.every((v) => v % 1000 === 0)).toBe(true)
  })
})

describe('gradeOf', () => {
  /** Biên là TRUNG ĐIỂM hai mức liền nhau — đã kiểm 31/31 biên khớp PDF. */
  it('bậc 19 (¥300.000) trải từ ¥290.000 tới dưới ¥310.000', () => {
    expect(gradeOf(290_000)).toBe(19)
    expect(gradeOf(300_000)).toBe(19)
    expect(gradeOf(309_999)).toBe(19)
    expect(gradeOf(310_000)).toBe(20)
    expect(gradeOf(289_999)).toBe(18)
  })

  it('bậc 2 (¥98.000) trải từ ¥93.000 tới dưới ¥101.000', () => {
    expect(gradeOf(93_000)).toBe(2)
    expect(gradeOf(100_999)).toBe(2)
    expect(gradeOf(101_000)).toBe(3)
  })

  /**
   * Hai đầu thang HỞ: bậc 1 là `93.000円未満`, bậc 32 là `635.000円以上`. Luật trung
   * điểm không áp được ở đó, và spec chốt trả `null` chứ không kẹp — kẹp là lặng lẽ
   * trả lời sai cho một mức lương app chưa kiểm.
   */
  it('ngoài khoảng đã kiểm thì trả null, KHÔNG kẹp về hai đầu', () => {
    expect(gradeOf(87_999)).toBeNull()
    expect(gradeOf(650_001)).toBeNull()
    expect(gradeOf(0)).toBeNull()
    expect(gradeOf(-1)).toBeNull()
  })

  it('đúng biên dưới ¥88.000 và biên trên ¥650.000 vẫn nhận', () => {
    expect(gradeOf(88_000)).toBe(1)
    expect(gradeOf(650_000)).toBe(32)
  })
})

describe('standardMonthlyOf', () => {
  it('bậc 19 là ¥300.000; bậc ngoài 1..32 là null', () => {
    expect(standardMonthlyOf(19)).toBe(300_000)
    expect(standardMonthlyOf(1)).toBe(88_000)
    expect(standardMonthlyOf(32)).toBe(650_000)
    expect(standardMonthlyOf(0)).toBeNull()
    expect(standardMonthlyOf(33)).toBeNull()
  })
})

describe('standardMonthlyFromPension', () => {
  it('¥27.450 phí → 標準報酬月額 ¥300.000', () => {
    // 300.000 × 9,15% = 27.450 đúng bằng số 折半額 in trên bảng bậc 19.
    expect(standardMonthlyFromPension(27_450, false)).toBe(300_000)
  })

  it('sai số làm tròn đồng của phiếu vẫn về đúng bậc', () => {
    expect(standardMonthlyFromPension(27_449, false)).toBe(300_000)
    expect(standardMonthlyFromPension(27_451, false)).toBe(300_000)
  })

  /**
   * R1 của spec. 厚生年金基金加入員 đóng 13,300%–15,900% chứ không 18,300%, nên phép
   * chia cho 0,0915 ra một con số 標準報酬月額 SAI — và sai đó chảy vào cả khối
   * "đã giảm được" lẫn khối lương hưu. Thà không nói còn hơn nói sai.
   */
  it('phiếu có dòng 厚生年金基金 → null, không đoán', () => {
    expect(standardMonthlyFromPension(27_450, true)).toBeNull()
  })

  it('phí bằng 0 hoặc âm → null', () => {
    expect(standardMonthlyFromPension(0, false)).toBeNull()
    expect(standardMonthlyFromPension(-100, false)).toBeNull()
  })

  it('phí ứng với mức ngoài thang → null', () => {
    expect(standardMonthlyFromPension(80_000, false)).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

Run: `npx vitest run src/features/tax/shakaiHoken.test.ts`
Expected: FAIL — `Failed to resolve import "./shakaiHoken"`

- [ ] **Step 3: Viết cài đặt nhỏ nhất cho test xanh**

```ts
// src/features/tax/shakaiHoken.ts
// Bậc 標準報酬月額 của 厚生年金保険 — THUẦN, không React.
//
// Vì sao có file này: `健康保険料` và `厚生年金保険` trên phiếu lương không nói ra bậc,
// nhưng bậc là thứ duy nhất cho biết một khoản 掛金 (退職金 — はぐくみ企業年金) có thật sự
// làm tụt 社会保険料 hay không. Xem docs/superpowers/specs/2026-08-26-man-hinh-taishokukin-design.md
//
// Nguồn: bảng 保険料額表 令和8年度 của 日本年金機構
// https://www.nenkin.go.jp/service/kounen/hokenryo/ryogaku/ryogakuhyo/20200825.html
// Thang dưới đây đã được KIỂM BẰNG MÁY, không đọc mắt: suy lại từ cột tiền phí của PDF
// (`全額 ÷ 0,183` và `折半額 ÷ 0,0915` khớp nhau tới đồng, 32/32 dòng).

/** 標準報酬月額 của 厚生年金保険, bậc 1 → 32 (令和8年度). */
export const KOSEI_NENKIN_LADDER = [
  88_000, 98_000, 104_000, 110_000, 118_000, 126_000, 134_000, 142_000,
  150_000, 160_000, 170_000, 180_000, 190_000, 200_000, 220_000, 240_000,
  260_000, 280_000, 300_000, 320_000, 340_000, 360_000, 380_000, 410_000,
  440_000, 470_000, 500_000, 530_000, 560_000, 590_000, 620_000, 650_000,
] as const

/** Phần người lao động: 18,300% ÷ 2, cố định toàn quốc từ 平成29年9月1日. */
export const KOSEI_NENKIN_EMPLOYEE_RATE = 0.0915

/**
 * 報酬月額 → số bậc (1..32); `null` khi ngoài thang đã kiểm.
 *
 * Biên là **trung điểm** hai mức liền nhau — đã đối chiếu 31/31 biên với PDF, tất cả tròn
 * nghìn. Nhưng luật trung điểm chỉ đúng cho biên TRONG: bậc 1 là `93.000円未満` và bậc 32
 * là `635.000円以上`, hai đầu hở.
 *
 * Ngoài ¥88.000–¥650.000 trả `null` chứ KHÔNG kẹp về hai đầu: 健康保険 còn ba bậc thấp hơn
 * và nhiều bậc cao hơn mà spec này không kiểm được (PDF 協会けんぽ lỗi font, rơi dòng), nên
 * kẹp là lặng lẽ trả lời sai cho một mức lương app chưa hề kiểm.
 */
export function gradeOf(rewardMonthly: number): number | null {
  const L = KOSEI_NENKIN_LADDER
  if (!Number.isFinite(rewardMonthly)) return null
  if (rewardMonthly < L[0] || rewardMonthly > L[L.length - 1]) return null
  for (let i = L.length - 1; i >= 1; i--) {
    if (rewardMonthly >= (L[i - 1] + L[i]) / 2) return i + 1
  }
  return 1
}

/** Số bậc → 標準報酬月額; `null` khi bậc ngoài 1..32. */
export function standardMonthlyOf(grade: number): number | null {
  return KOSEI_NENKIN_LADDER[grade - 1] ?? null
}

/**
 * 標準報酬月額 suy từ số 厚生年金保険料 trên phiếu.
 *
 * `hasKikinLine` = phiếu có dòng `厚生年金基金`. Người đó đóng 13,300%–15,900% theo
 * 免除保険料率, không phải 18,300% — phép chia cho 0,0915 ra một con số SAI, và nó chảy
 * vào cả khối "đã giảm được" lẫn khối lương hưu. Nên trả `null`.
 */
export function standardMonthlyFromPension(
  pensionPremium: number,
  hasKikinLine: boolean,
): number | null {
  if (hasKikinLine) return null
  if (!Number.isFinite(pensionPremium) || pensionPremium <= 0) return null
  const grade = gradeOf(Math.round(pensionPremium / KOSEI_NENKIN_EMPLOYEE_RATE))
  return grade === null ? null : standardMonthlyOf(grade)
}
```

- [ ] **Step 4: Chạy để chắc nó xanh**

Run: `npx vitest run src/features/tax/shakaiHoken.test.ts`
Expected: PASS, 14 test

- [ ] **Step 5: Commit**

```bash
git add src/features/tax/shakaiHoken.ts src/features/tax/shakaiHoken.test.ts
git commit -m "feat(tax): thang 標準報酬月額 va phep suy tu phieu luong

Bang 32 muc, bien la trung diem hai muc lien nhau — kiem bang may qua cot
tien phi cua PDF 日本年金機構 (32/32 dong, 31/31 bien). Ngoai ¥88.000-¥650.000
tra null chu khong kep: 健康保険 con bac ngoai thang do ma spec khong kiem duoc.

Phieu co dong 厚生年金基金 tra null — nguoi do dong 13,3-15,9% theo 免除保険料率
nen phep chia cho 0,0915 ra so sai.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Lương hưu 厚生年金 mất bao nhiêu khi tụt bậc

**Files:**
- Create: `src/features/tax/nenkinLoss.ts`
- Test: `src/features/tax/nenkinLoss.test.ts`

**Interfaces:**
- Consumes: Task 1 — `standardMonthlyOf(grade)`
- Produces: `HOSHU_HIREI_COEF = 5.481 / 1000`, `annualPensionLoss(standardDrop: number, months: number): number`

- [ ] **Step 1: Viết test đỏ**

```ts
// src/features/tax/nenkinLoss.test.ts
import { describe, expect, it } from 'vitest'
import { annualPensionLoss, HOSHU_HIREI_COEF } from './nenkinLoss'

describe('annualPensionLoss', () => {
  /**
   * Bài test quan trọng nhất của file: dựng lại đúng con số ¥1.315 mà 基金 tự in trên
   * sheet mô phỏng cá nhân (プラン①, ¥20.000/tháng). Tụt 1 bậc quanh mức lương chủ app là
   * ¥20.000 標準報酬月額, một năm tham gia là 12 tháng.
   *
   * Khớp tới từng yên nghĩa là hệ số 5,481/1000 dùng đúng — không phải tự bịa.
   */
  it('dựng lại đúng ¥1.315/năm của sheet 基金', () => {
    expect(annualPensionLoss(20_000, 12)).toBe(1_315)
  })

  it('tuyến tính theo số tháng tham gia', () => {
    expect(annualPensionLoss(20_000, 360)).toBe(Math.round(20_000 * HOSHU_HIREI_COEF * 360))
    expect(annualPensionLoss(20_000, 0)).toBe(0)
  })

  it('không tụt bậc thì không mất gì', () => {
    expect(annualPensionLoss(0, 360)).toBe(0)
  })

  it('đầu vào âm hoặc không hữu hạn → 0, không trả số âm ngược dấu', () => {
    expect(annualPensionLoss(-20_000, 12)).toBe(0)
    expect(annualPensionLoss(20_000, -12)).toBe(0)
    expect(annualPensionLoss(Number.NaN, 12)).toBe(0)
  })
})
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

Run: `npx vitest run src/features/tax/nenkinLoss.test.ts`
Expected: FAIL — `Failed to resolve import "./nenkinLoss"`

- [ ] **Step 3: Viết cài đặt**

```ts
// src/features/tax/nenkinLoss.ts
// Lương hưu 老齢厚生年金 mất bao nhiêu khi 標準報酬月額 tụt — THUẦN.
//
// Đây là MẶT TRÁI của việc đóng 掛金 vào 退職金 (はぐくみ企業年金): 掛金 trích từ lương nên
// 標準報酬 tụt, 社会保険料 giảm — nhưng 厚生年金 sau này cũng giảm theo. Sheet của 基金 nói
// ra điều này, và màn hình phải nói lại, không được chỉ hiện phần lợi.

/**
 * Hệ số phần 報酬比例 của 老齢厚生年金, giai đoạn từ 平成15年4月 (2003/04) trở đi.
 *
 * `年金 = 平均標準報酬額 × 5,481/1000 × số tháng`. Kiểm: tụt ¥20.000 trong 12 tháng ra
 * `20.000 × 5,481/1000 × 12 = ¥1.315,44` — đúng con số ¥1.315 sheet của 基金 in ra.
 */
export const HOSHU_HIREI_COEF = 5.481 / 1000

/**
 * Lương hưu hằng năm mất đi, do 標準報酬月額 thấp hơn `standardDrop` yên trong `months`
 * tháng. Trả **0** khi đầu vào vô nghĩa — số âm ở đây là "được thêm lương hưu nhờ đóng
 * 掛金", điều không xảy ra.
 */
export function annualPensionLoss(standardDrop: number, months: number): number {
  if (!Number.isFinite(standardDrop) || !Number.isFinite(months)) return 0
  if (standardDrop <= 0 || months <= 0) return 0
  return Math.round(standardDrop * HOSHU_HIREI_COEF * months)
}
```

- [ ] **Step 4: Chạy để chắc nó xanh**

Run: `npx vitest run src/features/tax/nenkinLoss.test.ts`
Expected: PASS, 5 test — kể cả ca `¥1.315`

- [ ] **Step 5: Commit**

```bash
git add src/features/tax/nenkinLoss.ts src/features/tax/nenkinLoss.test.ts
git commit -m "feat(tax): luong huu 厚生年金 mat bao nhieu khi tut bac 標準報酬

He so 5,481/1000 (phan 報酬比例, giai doan tu 2003/04). Bai test dau tien dung
lai dung ¥1.315/nam ma 基金 tu in tren sheet — khop toi tung yen nghia la he so
dung, khong phai tu bia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Hiệu chuẩn phần lợi theo ba điểm trên sheet 基金

**Files:**
- Create: `src/features/tax/kikinBenefit.ts`
- Test: `src/features/tax/kikinBenefit.test.ts`

**Interfaces:**
- Consumes: không gì (thuần nội suy).
- Produces:
  - `type CalibrationPoint = { monthlyContribution: number; socialInsuranceAnnual: number; taxAnnual: number }`
  - `SHEET_2025_08: readonly CalibrationPoint[]` (ba điểm)
  - `type KikinBenefit = { socialInsuranceAnnual: number; taxAnnual: number; savedAnnual: number; withinCalibration: boolean }`
  - `benefitAt(monthlyContribution: number, points: readonly CalibrationPoint[]): KikinBenefit | null`

- [ ] **Step 1: Viết test đỏ**

```ts
// src/features/tax/kikinBenefit.test.ts
import { describe, expect, it } from 'vitest'
import { benefitAt, SHEET_2025_08 } from './kikinBenefit'

describe('SHEET_2025_08', () => {
  it('ba điểm, đúng số trên sheet của 基金', () => {
    expect(SHEET_2025_08).toEqual([
      { monthlyContribution: 0, socialInsuranceAnnual: 630_456, taxAnnual: 308_280 },
      { monthlyContribution: 20_000, socialInsuranceAnnual: 595_464, taxAnnual: 280_200 },
      { monthlyContribution: 73_000, socialInsuranceAnnual: 524_616, taxAnnual: 220_440 },
    ])
  })
})

describe('benefitAt', () => {
  /**
   * GROUND TRUTH của cả file. Sheet của 基金 tự in "軽減効果額" ¥63.072 và ¥193.680.
   * Model nào không dựng lại đúng hai con số đó thì không được dùng — đây là chốt kiểm
   * duy nhất chống lại việc tự bịa một công thức thuế nghe hợp lý.
   */
  it('dựng lại đúng hai con số 軽減効果額 của sheet', () => {
    expect(benefitAt(20_000, SHEET_2025_08)?.savedAnnual).toBe(63_072)
    expect(benefitAt(73_000, SHEET_2025_08)?.savedAnnual).toBe(193_680)
  })

  it('mức ¥0 thì không tiết kiệm gì', () => {
    expect(benefitAt(0, SHEET_2025_08)?.savedAnnual).toBe(0)
  })

  it('đúng tại điểm neo thì trả nguyên số của sheet, không nội suy', () => {
    const b = benefitAt(20_000, SHEET_2025_08)
    expect(b?.socialInsuranceAnnual).toBe(595_464)
    expect(b?.taxAnnual).toBe(280_200)
    expect(b?.withinCalibration).toBe(true)
  })

  /** Mức chủ app đang đóng — nằm GIỮA hai điểm neo đầu, nên là nội suy. */
  it('¥10.000 nội suy giữa ¥0 và ¥20.000', () => {
    const b = benefitAt(10_000, SHEET_2025_08)!
    expect(b.socialInsuranceAnnual).toBe(Math.round((630_456 + 595_464) / 2))
    expect(b.taxAnnual).toBe(Math.round((308_280 + 280_200) / 2))
    expect(b.savedAnnual).toBe(630_456 + 308_280 - b.socialInsuranceAnnual - b.taxAnnual)
    expect(b.withinCalibration).toBe(true)
  })

  it('nội suy giữa hai điểm neo sau', () => {
    // Giữa ¥20.000 và ¥73.000: t = (46.500 − 20.000) / 53.000 = 0,5
    const b = benefitAt(46_500, SHEET_2025_08)!
    expect(b.socialInsuranceAnnual).toBe(Math.round((595_464 + 524_616) / 2))
  })

  /**
   * Ngoài khoảng neo thì KHÔNG ngoại suy — sheet chỉ đo ba điểm, và phần 社会保険料 là
   * bậc thang nên ngoại suy thẳng ra số vô nghĩa. Kẹp về điểm neo gần nhất và hạ cờ
   * `withinCalibration` để màn hình nói ra.
   */
  it('trên ¥73.000 thì kẹp về điểm neo cuối và hạ cờ', () => {
    const b = benefitAt(100_000, SHEET_2025_08)!
    expect(b.socialInsuranceAnnual).toBe(524_616)
    expect(b.withinCalibration).toBe(false)
  })

  it('mức âm hoặc không hữu hạn → null', () => {
    expect(benefitAt(-1, SHEET_2025_08)).toBeNull()
    expect(benefitAt(Number.NaN, SHEET_2025_08)).toBeNull()
  })

  it('ít hơn hai điểm neo → null, không nội suy từ một điểm', () => {
    expect(benefitAt(10_000, [SHEET_2025_08[0]])).toBeNull()
    expect(benefitAt(10_000, [])).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

Run: `npx vitest run src/features/tax/kikinBenefit.test.ts`
Expected: FAIL — `Failed to resolve import "./kikinBenefit"`

- [ ] **Step 3: Viết cài đặt**

```ts
// src/features/tax/kikinBenefit.ts
// Đóng 掛金 vào はぐくみ企業年金 thì 社会保険料 + thuế giảm bao nhiêu — THUẦN.
//
// KHÔNG dựng từ luật, mà NỘI SUY theo các điểm 基金 tự đo và in trên sheet mô phỏng
// cá nhân. Lý do đã chứng minh trong spec: ba cách tính từ luật đều lệch (¥36.000 /
// ¥30.751 / ¥23.551 so với ¥28.080 trên giấy), vì số thật phụ thuộc 扶養 và các 控除
// riêng của người dùng — app không có.
//
// Nội suy tuyến tính là XẤP XỈ. Phần thuế biến đổi khá trơn nên còn được; phần
// 社会保険料 thật ra là BẬC THANG (xem shakaiHoken.ts) nên giữa hai điểm neo nó chỉ là
// một đường thẳng vẽ qua hai điểm đúng. Vì vậy mọi số ra từ đây là số ƯỚC, phải mang
// dấu `≈` trên màn hình.

/** Một điểm 基金 đã đo: đóng bấy nhiêu thì cả năm trả bấy nhiêu 社会保険料 và thuế. */
export interface CalibrationPoint {
  /** 掛金 mỗi tháng (yên). */
  monthlyContribution: number
  /** 社会保険料 cả năm (yên). */
  socialInsuranceAnnual: number
  /** 所得税 + 住民税 cả năm (yên). */
  taxAnnual: number
}

/**
 * Sheet mô phỏng cá nhân của chủ app, in 2025-08.
 *
 * `プラン①` và `プラン②` trên sheet cùng mức ¥20.000 và cùng mọi con số — khác nhau chỉ ở
 * mức CHẮC CHẮN tụt bậc (① ghi `△ 残業代により変化`, ② ghi `○ 確実に1等級下がる`), nên ở
 * đây chỉ cần một điểm.
 *
 * **Sheet KHÔNG tính `子ども・子育て支援金`** (0,23%, 施行 2026年4月) — chính giấy ghi vậy.
 * Nên phần 社会保険料 dưới đây thấp hơn số thật từ tháng 4/2026, và "tiết kiệm được" hơi
 * lạc quan. App không tự cộng bù (không biết suất tỉnh nào áp cho người dùng); màn hình
 * phải nói ra.
 */
export const SHEET_2025_08: readonly CalibrationPoint[] = [
  { monthlyContribution: 0, socialInsuranceAnnual: 630_456, taxAnnual: 308_280 },
  { monthlyContribution: 20_000, socialInsuranceAnnual: 595_464, taxAnnual: 280_200 },
  { monthlyContribution: 73_000, socialInsuranceAnnual: 524_616, taxAnnual: 220_440 },
]

export interface KikinBenefit {
  socialInsuranceAnnual: number
  taxAnnual: number
  /** Tiết kiệm cả năm so với mức đóng ¥0 — đúng cái sheet gọi là 軽減効果額. */
  savedAnnual: number
  /** false = mức đóng nằm ngoài khoảng sheet đã đo, số đã bị kẹp về điểm neo gần nhất. */
  withinCalibration: boolean
}

/**
 * Nội suy tuyến tính giữa các điểm neo. Ngoài khoảng neo thì **kẹp**, không ngoại suy —
 * sheet chỉ đo tới ¥73.000 (プラン③, mức MAX của chế độ), và ngoại suy một hàm bậc thang
 * ra ngoài dữ liệu là bịa. `withinCalibration = false` để màn hình nói ra.
 */
export function benefitAt(
  monthlyContribution: number,
  points: readonly CalibrationPoint[],
): KikinBenefit | null {
  if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0) return null
  if (points.length < 2) return null

  const sorted = [...points].sort((a, b) => a.monthlyContribution - b.monthlyContribution)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const base = first.socialInsuranceAnnual + first.taxAnnual

  const done = (p: { socialInsuranceAnnual: number; taxAnnual: number }, within: boolean) => ({
    socialInsuranceAnnual: p.socialInsuranceAnnual,
    taxAnnual: p.taxAnnual,
    savedAnnual: base - p.socialInsuranceAnnual - p.taxAnnual,
    withinCalibration: within,
  })

  if (monthlyContribution <= first.monthlyContribution) return done(first, true)
  if (monthlyContribution > last.monthlyContribution) return done(last, false)

  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1]
    const hi = sorted[i]
    if (monthlyContribution > hi.monthlyContribution) continue
    const span = hi.monthlyContribution - lo.monthlyContribution
    const t = span === 0 ? 0 : (monthlyContribution - lo.monthlyContribution) / span
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
    return done(
      {
        socialInsuranceAnnual: mix(lo.socialInsuranceAnnual, hi.socialInsuranceAnnual),
        taxAnnual: mix(lo.taxAnnual, hi.taxAnnual),
      },
      true,
    )
  }
  return done(last, false)
}
```

- [ ] **Step 4: Chạy để chắc nó xanh**

Run: `npx vitest run src/features/tax/kikinBenefit.test.ts`
Expected: PASS, 9 test — kể cả hai ca `¥63.072` và `¥193.680`

- [ ] **Step 5: Commit**

```bash
git add src/features/tax/kikinBenefit.ts src/features/tax/kikinBenefit.test.ts
git commit -m "feat(tax): phan loi cua 掛金, hieu chuan theo ba diem tren sheet 基金

KHONG dung tu luat: da thu ba cach, lech ca ba (¥36.000/¥30.751/¥23.551 so voi
¥28.080 tren giay) vi so that phu thuoc 扶養 va cac 控除 rieng — app khong co.

Hai bai test la ground truth: dung lai dung ¥63.072 va ¥193.680 ma 基金 tu in.
Ngoai khoang neo thi KEP chu khong ngoai suy, va ha co withinCalibration de man
hinh noi ra.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Lãi trong `projectBalance`, hiệu chuẩn theo đồ thị 基金

**Files:**
- Modify: `src/features/assets/balanceAccrual.ts`
- Test: `src/features/assets/balanceAccrual.test.ts`

**Interfaces:**
- Consumes: `MonthlyContribution`, `BalanceProjection` (đã có trong file).
- Produces:
  - `KIKIN_GIVE_RATE_BPS_2025 = 30`
  - `KIKIN_INTEREST_ANCHORS: readonly { months: number; monthly: number; interest: number }[]`
  - `BalanceProjection` thêm trường `minorAtRate: number | null`
  - `projectBalance(value, c, toYear, now, annualRateBps?)`

- [ ] **Step 1: Viết test đỏ**

```ts
// Thêm vào cuối src/features/assets/balanceAccrual.test.ts
// (bổ sung import: KIKIN_GIVE_RATE_BPS_2025)

describe('projectBalance — phần lãi hiệu chuẩn', () => {
  const NAY = { year: 2026, month: 8 }
  const DEU_20K = { minorPerMonth: 20_000, monthsObserved: 12 }

  it('không truyền suất lãi → minorAtRate là null, số sàn không đổi', () => {
    const p = projectBalance(50_000, { minorPerMonth: 10_000, monthsObserved: 4 }, 2056, NAY)!
    expect(p.minor).toBe(3_570_000)
    expect(p.minorAtRate).toBeNull()
  })

  /**
   * GROUND TRUTH. Đồ thị trên sheet 基金 (プラン①, ¥20.000/tháng, 年利0,3%) in ba con số
   * lãi: ¥4.328 / ¥32.660 / ¥87.622 ở mốc 3 / 9 / 15 năm.
   *
   * Ghép lãi tháng thuần ở 0,3%/12 cho ra ¥3.159 / ¥29.147 / ¥81.758 — thấp hơn 基金
   * lần lượt 37% / 12% / 7%. Không rõ 月次再評価率 của họ cộng theo quy tắc gì, nên spec
   * chốt hiệu chuẩn theo chính ba điểm đó (Q2).
   */
  it.each([
    [36, 4_328],
    [108, 32_660],
    [180, 87_622],
  ])('dựng lại đúng lãi của đồ thị 基金 ở mốc %i tháng: ¥%i', (months, expected) => {
    // toYear sao cho `months` đúng bằng số tháng còn đóng: months = (toYear − 2026) × 12 − 8
    const toYear = 2026 + (months + 8) / 12
    expect(Number.isInteger(toYear)).toBe(true)
    const p = projectBalance(0, DEU_20K, toYear, NAY, KIKIN_GIVE_RATE_BPS_2025)!
    expect(p.months).toBe(months)
    expect(p.minorAtRate! - p.minor).toBe(expected)
  })

  it('suất 0 bps → minorAtRate bằng đúng số sàn, không âm không NaN', () => {
    const p = projectBalance(50_000, DEU_20K, 2056, NAY, 0)!
    expect(p.minorAtRate).toBe(p.minor)
  })

  it('lãi luôn ≥ 0 và tăng theo suất', () => {
    const a = projectBalance(50_000, DEU_20K, 2056, NAY, 30)!
    const b = projectBalance(50_000, DEU_20K, 2056, NAY, 100)!
    expect(a.minorAtRate!).toBeGreaterThan(a.minor)
    expect(b.minorAtRate!).toBeGreaterThan(a.minorAtRate!)
  })

  /** Con số thật của chủ app hôm nay: ¥50.000 + ¥10.000/tháng tới 2056 ở 0,3%. */
  it('chiếu của chủ app tới 2056 ra ¥3.745.050', () => {
    const p = projectBalance(
      50_000,
      { minorPerMonth: 10_000, monthsObserved: 4 },
      2056,
      NAY,
      KIKIN_GIVE_RATE_BPS_2025,
    )!
    expect(p.minor).toBe(3_570_000)
    expect(p.minorAtRate).toBe(3_745_050)
  })
})
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

Run: `npx vitest run src/features/assets/balanceAccrual.test.ts`
Expected: FAIL — `KIKIN_GIVE_RATE_BPS_2025` không tồn tại; `minorAtRate` không tồn tại

- [ ] **Step 3: Viết cài đặt**

Thêm vào `src/features/assets/balanceAccrual.ts`:

```ts
/**
 * 給付利率 của はぐくみ企業年金, 事業年度 **2025** — basis points (30 = 0,30%/năm).
 *
 * 基金 đặt lại suất này theo TỪNG 事業年度, và giấy nói rõ không bảo đảm cho tương lai.
 * Vì vậy đây chỉ là giá trị MẶC ĐỊNH; người dùng sửa được (xem cột `profile`).
 */
export const KIKIN_GIVE_RATE_BPS_2025 = 30

/**
 * Ba điểm lãi in trên đồ thị sheet 基金 (プラン①, ¥20.000/tháng, 年利0,3%).
 *
 * Dùng để **hiệu chuẩn hình dạng** đường lãi. Ghép lãi tháng thuần ở 0,3%/12 cho ra
 * ¥3.159 / ¥29.147 / ¥81.758 — thấp hơn 基金 lần lượt 37% / 12% / 7%, và tỷ lệ đó giảm
 * dần theo số tháng nên không có MỘT suất nào khớp cả ba. Không rõ 月次再評価率 của họ
 * cộng theo quy tắc gì.
 *
 * Nên: `lãi = ghép_lãi_thuần(suất) × hệ_số_hình_dạng(số tháng)`, trong đó hệ số hình dạng
 * nội suy giữa ba điểm này và GIỮ NGUYÊN giá trị điểm cuối khi vượt 180 tháng. Đúng tại
 * cả ba điểm neo do chính cách dựng, và ô sửa suất vẫn hoạt động tự nhiên.
 */
export const KIKIN_INTEREST_ANCHORS = [
  { months: 36, monthly: 20_000, interest: 4_328 },
  { months: 108, monthly: 20_000, interest: 32_660 },
  { months: 180, monthly: 20_000, interest: 87_622 },
] as const

/** Lãi của chuỗi đóng đều cuối kỳ, KHÔNG làm tròn. Nội bộ file. */
function plainAnnuityInterest(monthly: number, i: number, n: number): number {
  if (i === 0) return 0
  return monthly * (((1 + i) ** n - 1) / i - n)
}

/** Hệ số hình dạng ở `n` tháng — nội suy giữa các điểm neo, giữ phẳng ngoài hai đầu. */
function shapeFactor(n: number, i: number): number {
  const A = KIKIN_INTEREST_ANCHORS
  const of = (k: number) => {
    const a = A[k]
    const plain = plainAnnuityInterest(a.monthly, i, a.months)
    return plain <= 0 ? 1 : a.interest / plain
  }
  if (n <= A[0].months) return of(0)
  if (n >= A[A.length - 1].months) return of(A.length - 1)
  for (let k = 1; k < A.length; k++) {
    if (n > A[k].months) continue
    const t = (n - A[k - 1].months) / (A[k].months - A[k - 1].months)
    return of(k - 1) + (of(k) - of(k - 1)) * t
  }
  return of(A.length - 1)
}
```

Rồi đổi `BalanceProjection` và `projectBalance`:

```ts
export interface BalanceProjection {
  /** Số tháng còn đóng: từ tháng SAU tháng hiện tại tới hết năm trước `toYear`. */
  months: number
  /** `value + minorPerMonth × months`. Không lãi — đây là SÀN. */
  minor: number
  /**
   * Cùng phép trên nhưng có lãi ghép, hiệu chuẩn theo đồ thị 基金.
   * `null` khi tầng gọi không truyền suất — lúc đó màn hình chỉ có số sàn.
   */
  minorAtRate: number | null
}
```

```ts
export function projectBalance(
  value: number,
  c: MonthlyContribution,
  toYear: number,
  now: { year: number; month: number },
  annualRateBps?: number,
): BalanceProjection | null {
  if (c.minorPerMonth <= 0) return null
  if (toYear <= now.year) return null
  const months = Math.max(0, (toYear - now.year) * 12 - now.month)
  const minor = value + c.minorPerMonth * months

  if (annualRateBps === undefined || !Number.isFinite(annualRateBps)) {
    return { months, minor, minorAtRate: null }
  }
  const i = Math.max(0, annualRateBps) / 10_000 / 12
  // Lãi phần đóng có hệ số hình dạng; lãi phần số dư sẵn có thì KHÔNG — hệ số đo trên
  // một chuỗi đóng đều, áp nó lên một khoản nằm sẵn là dùng số ngoài phạm vi nó đo.
  const laiDong = plainAnnuityInterest(c.minorPerMonth, i, months) * shapeFactor(months, i)
  const laiSoDu = value * ((1 + i) ** months - 1)
  return { months, minor, minorAtRate: minor + Math.round(laiDong + laiSoDu) }
}
```

- [ ] **Step 4: Chạy để chắc nó xanh**

Run: `npx vitest run src/features/assets/balanceAccrual.test.ts`
Expected: PASS — 11 test cũ + 5 test mới (trong đó 3 ca `it.each` neo)

Nếu ca `¥3.745.050` lệch một vài yên: **đừng sửa số mong đợi**. Kiểm lại thứ tự làm tròn — cộng `laiDong + laiSoDu` rồi mới `Math.round` một lần, không làm tròn từng phần.

- [ ] **Step 5: Chạy cả bộ để chắc không vỡ chỗ khác**

Run: `npx tsc --noEmit && npm test`
Expected: `projectBalance` có tham số thứ 5 tuỳ chọn nên caller cũ ở `useFundInvestData.ts` vẫn biên dịch được; toàn bộ test xanh.

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/balanceAccrual.ts src/features/assets/balanceAccrual.test.ts
git commit -m "feat(dau-tu): projectBalance co phan lai, hieu chuan theo do thi 基金

Ghep lai thang thuan o 0,3%/12 ra ¥3.159/¥29.147/¥81.758 o moc 3/9/15 nam, thap
hon 基金 lan luot 37%/12%/7% — va ty le do giam dan nen khong co MOT suat nao
khop ca ba. Nen: lai = ghep_thuan(suat) x he_so_hinh_dang(so thang), he so noi
suy giua ba diem tren do thi va giu phang ngoai hai dau.

Dung tai ca ba diem neo do chinh cach dung, va o sua suat van hoat dong.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Migration — hai tham số người dùng sửa được

**Files:**
- Create: `supabase/migrations/0051_kikin_settings.sql`
- Modify: `src/types/database.types.ts` (`ProfileRow` + `profiles.Update`)

**Interfaces:**
- Produces: `ProfileRow.kikin_give_rate_bps: number | null`, `ProfileRow.kikin_sheet: KikinSheet | null`, `type KikinSheet = { dated: string; points: { m: number; si: number; tax: number }[] }`

- [ ] **Step 1: Viết migration**

```sql
-- ============================================================
-- Sổ Chi Tiêu — Migration 0051: profiles.kikin_give_rate_bps, profiles.kikin_sheet
--
-- VÌ SAO CẦN HAI CỘT NÀY
-- Màn hình 退職金 (はぐくみ企業年金) dựng số từ hai thứ mà 基金 ĐỔI THEO THỜI GIAN và app
-- không có cách nào tự biết:
--
--   1. 給付利率 — 基金 đặt lại theo TỪNG 事業年度. Giá trị 事業年度 2025 là 0,30%
--      (30 bps) và chính giấy ghi "将来の利率および利息額を保証するものではありません".
--      Gán cứng trong code thì mỗi năm phải nhớ đi sửa, quên là con số cũ nằm đó
--      không ai biết.
--
--   2. Ba điểm hiệu chuẩn trên sheet mô phỏng cá nhân — số 社会保険料 và thuế ứng với
--      từng mức đóng, ở MỨC LƯƠNG lúc sheet được in. Lương đổi thì sheet cũ đi, và
--      基金 gửi sheet mới.
--
-- NULLABLE, KHÔNG default, KHÔNG backfill.
-- null = "người dùng chưa khai" → màn hình rơi về hằng số dựng sẵn trong code
-- (KIKIN_GIVE_RATE_BPS_2025 và SHEET_2025_08) và nói rõ đang dùng số của ngày nào.
-- Backfill một giá trị sẽ xoá mất phân biệt giữa "người dùng đã xác nhận" và "app
-- đang dùng số mặc định" — cùng lối với accounts.is_liquid (0047) và
-- accounts.last_reconciled_at (0050).
--
-- VÌ SAO `kikin_sheet` LÀ jsonb CHỨ KHÔNG PHẢI BẢNG RIÊNG
-- Ba dòng số, một người chỉ có một 基金, và không có truy vấn nào cần lọc/nối theo
-- từng điểm. Một bảng riêng là thêm một method vào CẢ HAI bản Repo (supabaseRepo và
-- demoRepo) mà không mua được gì. Nếu sau này cần lịch sử nhiều sheet thì lúc đó tách
-- bảng — jsonb không chặn đường đó.
--
-- `dated` là NGÀY IN TRÊN SHEET, không phải ngày người dùng gõ vào. Màn hình hiện
-- ngày đó cạnh con số, để "tiết kiệm được bao nhiêu" không âm thầm cũ đi.
-- ============================================================

alter table public.profiles
  add column if not exists kikin_give_rate_bps integer,
  add column if not exists kikin_sheet jsonb;

alter table public.profiles
  add constraint profiles_kikin_give_rate_bps_range
    check (kikin_give_rate_bps is null
           or (kikin_give_rate_bps >= 0 and kikin_give_rate_bps <= 10000));

comment on column public.profiles.kikin_give_rate_bps is
  '給付利率 của 企業年金 (basis points, 30 = 0,30%/năm). 基金 đặt lại theo từng 事業年度 '
  'nên đây là số người dùng khai lại khi có giấy mới. null = chưa khai → app dùng '
  'KIKIN_GIVE_RATE_BPS_2025 (30) và nói rõ đó là mức 事業年度 2025.';

comment on column public.profiles.kikin_sheet is
  'Ba điểm hiệu chuẩn từ sheet mô phỏng cá nhân của 基金: '
  '{"dated":"2025-08","points":[{"m":0,"si":630456,"tax":308280}, ...]} — m = 掛金/tháng, '
  'si = 社会保険料/năm, tax = 所得税+住民税/năm. null = chưa khai → app dùng SHEET_2025_08. '
  'Lưu ý: sheet của 基金 KHÔNG tính 子ども・子育て支援金 (0,23%, 施行 2026年4月).';
```

- [ ] **Step 2: Sửa `database.types.ts` — CÙNG COMMIT**

Thêm vào `ProfileRow` (sau `birth_year`):

```ts
  /**
   * 給付利率 của 企業年金 (basis points, 30 = 0,30%/năm) — 基金 đặt lại theo từng
   * 事業年度. null = chưa khai → app dùng `KIKIN_GIVE_RATE_BPS_2025`.
   */
  kikin_give_rate_bps: number | null
  /** Ba điểm hiệu chuẩn từ sheet của 基金; null = chưa khai → app dùng `SHEET_2025_08`. */
  kikin_sheet: KikinSheet | null
```

Và khai kiểu (đặt cạnh `ProfileRow`):

```ts
/**
 * Sheet mô phỏng cá nhân của 企業年金, người dùng gõ lại vào app.
 * `dated` là ngày IN TRÊN SHEET ('YYYY-MM'), không phải ngày gõ.
 */
export type KikinSheet = {
  dated: string
  points: { m: number; si: number; tax: number }[]
}
```

Thêm hai tên cột vào cả `profiles.Insert` (phần tuỳ chọn) và `profiles.Update` trong `Database`.

- [ ] **Step 3: Kiểm biên dịch**

Run: `npx tsc --noEmit`
Expected: sạch. Nếu đỏ ở `demoRepo.ts` vì thiếu trường trong profile giả — thêm `kikin_give_rate_bps: null, kikin_sheet: null` vào seed.

- [ ] **Step 4: Chạy cả bộ test**

Run: `npm test`
Expected: xanh. Test nào so `ProfileRow` bằng `toEqual` sẽ đỏ → thêm hai trường `null` vào fixture đó.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0051_kikin_settings.sql src/types/database.types.ts src/data/demoRepo.ts
git commit -m "feat(db): profiles.kikin_give_rate_bps + kikin_sheet (migration 0051)

Hai thu 基金 doi theo thoi gian ma app khong tu biet duoc: 給付利率 dat lai theo
tung 事業年度, va ba diem hieu chuan tren sheet ca nhan (theo muc luong luc in).

NULLABLE, khong default, khong backfill: null = chua khai -> man hinh roi ve
hang so trong code va noi ro dang dung so cua ngay nao. Backfill se xoa mat phan
biet giua 'nguoi dung da xac nhan' va 'app dang dung so mac dinh'.

kikin_sheet la jsonb chu khong bang rieng: ba dong so, mot nguoi mot 基金, khong
truy van nao can loc theo tung diem.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Hook gom dữ liệu cho màn 退職金

**Files:**
- Create: `src/features/assets/useRetirementData.ts`
- Create: `src/features/assets/retirementRows.ts` (phần thuần: nhặt các dòng phiếu lương)
- Test: `src/features/assets/retirementRows.test.ts`

**Interfaces:**
- Consumes: Task 1 `standardMonthlyFromPension`; Task 2 `annualPensionLoss`; Task 3 `benefitAt`, `SHEET_2025_08`; Task 4 `projectBalance`, `KIKIN_GIVE_RATE_BPS_2025`; đã có `measureMonthlyContribution`, `useLifePhases`, `useRangeTransactions`, `useProfile`, `useAccountBalances`, `useAccounts`.
- Produces:
  - `type MonthPension = { monthKey: string; pensionPremium: number; hasKikinLine: boolean; standardMonthly: number | null }`
  - `pensionByMonth(txs, categoryNameOf, monthKeyOf): MonthPension[]`
  - `useRetirementData(): RetirementData`

- [ ] **Step 1: Viết test đỏ cho phần thuần**

```ts
// src/features/assets/retirementRows.test.ts
import { describe, expect, it } from 'vitest'
import { pensionByMonth, type PensionTx } from './retirementRows'

const tx = (monthKey: string, category: string, amount: number): PensionTx =>
  ({ monthKey, category, amount })

describe('pensionByMonth', () => {
  it('gom 厚生年金保険 theo tháng và suy ra 標準報酬月額', () => {
    const r = pensionByMonth([tx('2026-08', 'Hưu trí (年金)', 27_450)])
    expect(r).toHaveLength(1)
    expect(r[0].pensionPremium).toBe(27_450)
    expect(r[0].standardMonthly).toBe(300_000)
    expect(r[0].hasKikinLine).toBe(false)
  })

  it('bỏ qua danh mục khác', () => {
    const r = pensionByMonth([
      tx('2026-08', 'Hưu trí (年金)', 27_450),
      tx('2026-08', 'Bảo hiểm y tế (健康保険)', 15_000),
      tx('2026-08', 'Ăn uống', 3_000),
    ])
    expect(r[0].pensionPremium).toBe(27_450)
  })

  /**
   * R1: `nhap.ts` map CẢ `厚生年金保険` và `厚生年金基金` vào cùng danh mục 'Hưu trí (年金)'.
   * Nên một tháng có hai dòng là dấu hiệu người dùng thuộc 厚生年金基金 — lúc đó tổng hai
   * dòng KHÔNG phải `標準報酬月額 × 9,15%`, và phải trả `standardMonthly = null`.
   */
  it('tháng có HAI dòng 年金 → nghi 厚生年金基金, không suy 標準報酬', () => {
    const r = pensionByMonth([
      tx('2026-08', 'Hưu trí (年金)', 27_450),
      tx('2026-08', 'Hưu trí (年金)', 8_000),
    ])
    expect(r[0].hasKikinLine).toBe(true)
    expect(r[0].standardMonthly).toBeNull()
    expect(r[0].pensionPremium).toBe(35_450)
  })

  it('sắp theo tháng, cũ trước', () => {
    const r = pensionByMonth([
      tx('2026-08', 'Hưu trí (年金)', 27_450),
      tx('2026-05', 'Hưu trí (年金)', 27_450),
    ])
    expect(r.map((x) => x.monthKey)).toEqual(['2026-05', '2026-08'])
  })

  it('không dòng nào → mảng rỗng', () => {
    expect(pensionByMonth([])).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

Run: `npx vitest run src/features/assets/retirementRows.test.ts`
Expected: FAIL — `Failed to resolve import "./retirementRows"`

- [ ] **Step 3: Viết `retirementRows.ts`**

```ts
// src/features/assets/retirementRows.ts
// Nhặt dòng 厚生年金保険 ra khỏi phiếu lương đã nhập, theo tháng — THUẦN.
//
// LƯU Ý QUAN TRỌNG: những dòng này mang `exclude_from_stats = true` (xem nhap.ts) nên
// mọi báo cáo và tool truy vấn của app đều BỎ QUA chúng. Đọc bảng gốc thì thấy. Đây là
// lý do MCP `truy_van` trả rỗng khi thử đo mức giảm 社会保険料.
import { standardMonthlyFromPension } from '../tax/shakaiHoken'

/** Danh mục mà `nhap.ts` gán cho CẢ 厚生年金保険 và 厚生年金基金. */
export const PENSION_CATEGORY = 'Hưu trí (年金)'

export interface PensionTx {
  /** Khoá tháng do tầng gọi tính bằng `monthKeyForDate(occurred_on, monthStartDay)`. */
  monthKey: string
  category: string
  amount: number
}

export interface MonthPension {
  monthKey: string
  /** Tổng mọi dòng 年金 của tháng đó. */
  pensionPremium: number
  /** true = tháng đó có nhiều hơn một dòng 年金 → nghi 厚生年金基金. */
  hasKikinLine: boolean
  /** null = không suy được (xem `standardMonthlyFromPension`). */
  standardMonthly: number | null
}

/**
 * Gom theo tháng rồi suy 標準報酬月額.
 *
 * Nhiều hơn MỘT dòng 年金 trong một tháng là dấu hiệu 厚生年金基金: `nhap.ts` map cả
 * `厚生年金保険` và `厚生年金基金` vào cùng một danh mục, nên hai dòng nghĩa là phiếu có cả
 * hai khoản. Lúc đó tổng KHÔNG bằng `標準報酬月額 × 9,15%` và phép suy phải im.
 */
export function pensionByMonth(txs: PensionTx[]): MonthPension[] {
  const theoThang = new Map<string, { total: number; count: number }>()
  for (const t of txs) {
    if (t.category !== PENSION_CATEGORY) continue
    const cur = theoThang.get(t.monthKey) ?? { total: 0, count: 0 }
    cur.total += t.amount
    cur.count += 1
    theoThang.set(t.monthKey, cur)
  }
  return [...theoThang.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, v]) => {
      const hasKikinLine = v.count > 1
      return {
        monthKey,
        pensionPremium: v.total,
        hasKikinLine,
        standardMonthly: standardMonthlyFromPension(v.total, hasKikinLine),
      }
    })
}
```

- [ ] **Step 4: Chạy để chắc nó xanh**

Run: `npx vitest run src/features/assets/retirementRows.test.ts`
Expected: PASS, 5 test

- [ ] **Step 5: Viết `useRetirementData.ts`**

Hook, không có test riêng (repo này test phần thuần export ra từ file hook — xem `useInvestPnl.test.ts`). Trách nhiệm:

- `useAccounts()` → tìm tài khoản tên đúng `退職金` (`TEN_TK_HUU` từ `../phieu-luong/nhap`, khớp CHÍNH XÁC như `ImportPhieuLuongPage` đang làm; regex lỏng tay sẽ nhận bừa tài khoản khác).
- `useAccountBalances()` → `value = market_value ?? balance ?? 0`.
- `useProfile()` → `monthStartDay`, `birth_year`, `kikin_give_rate_bps ?? KIKIN_GIVE_RATE_BPS_2025`, `kikin_sheet ?? SHEET_2025_08`.
- `useRangeTransactions()` khoảng **60 tháng** gần nhất (phiếu lương có từ 12/2021; 5 năm đủ để thấy bậc trước/sau mà không kéo cả bảng), `enabled` khi đã tìm được tài khoản.
- `useCategories()` để đổi `category_id` → tên, rồi dựng `PensionTx[]`.
- `measureMonthlyContribution` trên các khoản **thu** vào tài khoản 退職金 (12 tháng gần nhất).
- `useLifePhases()` → chặng cuối → `toYear` + `phaseLabel`.
- `projectBalance(value, contribution, toYear, thangNay, rateBps)`.
- `benefitAt(contribution.minorPerMonth, sheetPoints)`.
- Tụt bậc: so `standardMonthly` của tháng mới nhất với tháng trước khi bắt đầu đóng. **Chưa tụt** thì trả `null` và cờ `waitingFor: '2026-09'`.
- `annualPensionLoss(standardDrop, monthsToRetirement)` — chỉ khi thật sự đã tụt bậc.
- Cờ `turns40In: string | null` — nếu `birth_year` cho thấy người dùng bước sang 40 trong khoảng đang xem, bật cờ để màn hình nói ra (R4: 介護保険 1,62% làm 健康保険料 nhảy, không phải do 掛金).

Trả về một object phẳng, mỗi trường có JSDoc nói **loại số** (đo / sàn / ước).

- [ ] **Step 6: Kiểm biên dịch + cả bộ test**

Run: `npx tsc --noEmit && npm test`
Expected: xanh.

- [ ] **Step 7: Commit**

```bash
git add src/features/assets/retirementRows.ts src/features/assets/retirementRows.test.ts src/features/assets/useRetirementData.ts src/hooks/queries.ts
git commit -m "feat(dau-tu): hook gom du lieu man 退職金

pensionByMonth nhat dong 厚生年金保険 ra khoi phieu luong theo thang roi suy
標準報酬月額. Nhieu hon MOT dong 年金 trong mot thang la dau hieu 厚生年金基金
(nhap.ts map ca hai khoan vao cung danh muc) -> khong suy, tra null.

Nhung dong nay mang exclude_from_stats nen moi bao cao cua app bo qua chung —
doc bang goc thi thay.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Trang `/assets/retirement`

**Files:**
- Create: `src/features/assets/RetirementPage.tsx`
- Modify: `src/App.tsx` (route lazy, cạnh `/assets/account/:accountId`)
- Modify: `src/features/assets/InvestFundsTab.tsx` (dòng 退職金 dẫn sang trang mới thay vì trang chi tiết tài khoản)

**Interfaces:**
- Consumes: Task 6 `useRetirementData()`.
- Produces: route `/assets/retirement`.

- [ ] **Step 1: Đọc sổ tra cứu giao diện TRƯỚC khi viết JSX**

Đọc [docs/design-system.md](../../design-system.md) Phần I — công thức tám bước và khuôn màn dán-là-chạy. Ba luật hay bị vi phạm nhất: không giá trị tuỳ ý, không tự viết `<h1>`/`<select>`/nút nền xanh, mọi số qua `<Money>`/`<Num>`.

- [ ] **Step 2: Viết trang theo khuôn, năm khối**

Thứ tự khối và nội dung: xem mục "Màn hình" trong spec. Quy tắc dán vào từng con số:

| Khối | Loại số | Hiện thế nào |
|---|---|---|
| Đang có | đo | `<Money>` trần |
| Tới lúc nghỉ — "ít nhất" | sàn | `<Money>` + chữ "ít nhất" |
| Tới lúc nghỉ — có lãi | ước | `<Money>` + `<EstimateMark reason="給付利率 事業年度 2025 = 0,30%. 基金 đặt lại mỗi năm, không bảo đảm." />` |
| Đã giảm được — 社会保険料 | đo (hoặc chưa có) | số bậc tụt qua `<Num>`; chưa tụt thì câu "chờ phiếu 09/2026" |
| Đã giảm được — thuế | ước | `<Money>` + `<EstimateMark>` nêu ngày sheet |
| Đánh đổi | ước | `<Money>` + `<EstimateMark>` nêu điều kiện "chỉ khi tụt bậc" |
| Thử mức đóng khác | ước | mọi số `<EstimateMark>`; ngoài khoảng neo thì thêm câu "vượt mức sheet đã đo" |

- [ ] **Step 3: Thêm route**

```tsx
// src/App.tsx — cạnh dòng /assets/account/:accountId
const RetirementPage = lazy(() =>
  import('./features/assets/RetirementPage').then((m) => ({ default: m.RetirementPage })),
)
// ...
<Route path="/assets/retirement" element={lazyRoute(<RetirementPage />)} />
```

- [ ] **Step 4: Đổi đích của dòng 退職金 ở tab Quỹ Nhật**

Trong `InvestFundsTab.tsx`, khối "Tính theo số dư": tài khoản tên đúng `退職金` thì `<Link to="/assets/retirement">`, còn lại giữ `/assets/account/${b.accountId}`.

- [ ] **Step 5: Kiểm biên dịch + cả bộ test**

Run: `npx tsc --noEmit && npm test`
Expected: xanh, kể cả `tests/designSystem.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/RetirementPage.tsx src/App.tsx src/features/assets/InvestFundsTab.tsx
git commit -m "feat(dau-tu): trang 退職金 — duoc gi, mat gi, toi luc nghi bao nhieu

Trang rieng chu khong nhet vao trang chi tiet tai khoan: day la cau 'che do nay
lai lo the nao', khong phai 'tai khoan nay co gi' — cung ly do InvestPage tach
khoi AccountDetailPage.

Moi con so noi ro no la so DO, so SAN, hay so UOC.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Kiểm bằng mắt — ba thứ `npm test` không thấy

**Files:** không sửa gì nếu không tìm ra lỗi.

- [ ] **Step 1: Dựng dữ liệu demo có hình dạng thật**

Chạy `preview_start` với cấu hình `so-chi-tieu-demo`, rồi tiêm vào `localStorage` khoá `sct-demo-db-v18`: tài khoản `退職金` (investment/JPY, số dư ¥50.000), bốn khoản thu ¥20.000/¥10.000/¥10.000/¥10.000 (5→8/2026), các dòng chi `Hưu trí (年金)` ¥27.450 cho vài tháng, và một `lifePhases` có chặng cuối `Nghỉ hưu` năm 2056. **Không sửa `demoRepo.ts`** — tiêm qua trình duyệt rồi xoá khoá sau khi xem, như đợt 2026-08-26.

- [ ] **Step 2: Chế độ Sáng**

`resize_window` với `colorScheme: 'light'` **không đủ** — app lưu chủ đề trong `localStorage.theme` và gắn class `dark` lên `<html>` (`src/lib/theme.ts`). Phải: `localStorage.setItem('theme','light')` + `document.documentElement.classList.remove('dark')`.

Kiểm bằng `getComputedStyle`, **không tin danh sách class**: nền thẻ, màu chữ, màu viền của cả năm khối.

- [ ] **Step 3: Cỡ chữ 1,25× ở 375px**

`resize_window` preset `mobile`, rồi `document.documentElement.style.fontSize = '20px'`.
Kiểm: `document.documentElement.scrollWidth - clientWidth === 0` và mọi khối `scrollWidth - clientWidth === 0`. Khối "Thử mức đóng khác" có ô nhập nên là chỗ dễ tràn nhất.

- [ ] **Step 4: Biểu thức JSX bị biến thành chuỗi**

Đọc `get_page_text` và soi từng con số: không được thấy `{`, `}`, hay tên biến. Đây là lỗi `tsc` xanh mà trang vẫn in ra `{debt.counterparty}`.

- [ ] **Step 5: Đối chiếu số trên màn với số đã tính tay**

Với dữ liệu demo ở Step 1, màn phải hiện: đóng `¥10.000/tháng`; ít nhất `¥3.570.000`; có lãi `¥3.745.050`; 社会保険料 `chờ phiếu 09/2026`. Lệch thì **đừng sửa số mong đợi trong test** — tìm lý do.

- [ ] **Step 6: Xoá dữ liệu tiêm, đặt lại khung nhìn, tắt server**

`localStorage.removeItem('sct-demo-db-v18')`, `resize_window` preset `desktop`, `preview_stop`.

- [ ] **Step 7: `detect_changes` rồi commit (nếu có sửa)**

Run: `detect_changes({scope: 'all'})` — kiểm phạm vi đúng số file dự kiến, không file lạ. `risk: critical` ở repo này là tiếng ồn fan-out import, không phải người gọi thật; kiểm người gọi thật bằng `grep`.

---

## Self-Review

**Spec coverage:**

| Mục trong spec | Task |
|---|---|
| ① 標準報酬月額 suy từ phiếu | 1 |
| ② Thang 32 bậc, biên trung điểm, hai đầu hở, kẹp ¥88k–¥650k | 1 |
| ③ Công thức mất lương hưu, ¥1.315 | 2 |
| ④ Thuế hiệu chuẩn theo ba điểm, ¥63.072 / ¥193.680 | 3 |
| Lãi hiệu chuẩn theo đồ thị (Q2) | 4 |
| Hai tham số lưu vào `profile` (Q1) | 5 |
| R1 dòng 厚生年金基金 | 1 (`standardMonthlyFromPension`), 6 (`pensionByMonth` phát hiện hai dòng) |
| R2 定時決定 chưa tới → "chờ phiếu 09/2026" | 6 (cờ `waitingFor`), 7 (hiện câu đó) |
| R3 sheet cũ đi khi lương đổi | 5 (`kikin_sheet.dated`), 7 (hiện ngày sheet) |
| R4 bước sang 40 tuổi | 6 (cờ `turns40In`, và khối "đã giảm được" chỉ đọc 標準報酬月額) |
| R5 sheet không tính 子ども・子育て支援金 | 3 (JSDoc), 7 (câu chú thích) |
| R6 lãi là mức một năm tài chính | 4, 5, 7 |
| Ba loại số, ba cách hiện | 7 (bảng ở Step 2) |
| Không khuyên mức đóng | Global Constraints |
| Kiểm mắt: Sáng, 1,25× @375, JSX-thành-chuỗi | 8 |

Không mục nào hở.

**Placeholder scan:** không có "TBD"/"TODO"/"tương tự Task N". Task 6 Step 5 và Task 7 Step 2 mô tả trách nhiệm thay vì dán sẵn toàn bộ code — cố ý: một hook 150 dòng và một trang 400 dòng dán vào kế hoạch sẽ lệch khỏi `design-system.md` ngay khi sổ tra cứu đó đổi. Bù lại: mọi **chữ ký hàm**, mọi **con số mong đợi**, và bảng loại-số-hiện-thế-nào đều nằm sẵn ở đây.

**Type consistency:** `standardMonthlyFromPension(premium, hasKikinLine)` — dùng cùng thứ tự tham số ở Task 1 và Task 6. `benefitAt(monthly, points)` — Task 3 và Task 6. `projectBalance(value, c, toYear, now, annualRateBps?)` — Task 4 thêm tham số thứ 5 **tuỳ chọn** nên caller cũ ở `useFundInvestData.ts` không phải sửa. `MonthlyContribution` giữ nguyên hình dạng `{ minorPerMonth, monthsObserved }` xuyên suốt.
