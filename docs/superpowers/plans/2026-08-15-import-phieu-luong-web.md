# Nhập phiếu lương PDF trên web app — Kế hoạch thi công

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa việc nhập phiếu lương PDF từ script dòng lệnh lên web app, và gộp hai bản luật bóc chữ (Python + JS) thành **một bản TypeScript duy nhất** mà cả web lẫn CLI đều dùng.

**Architecture:** Luật bóc chữ chuyển sang `src/features/phieu-luong/boc.ts` — thuần, nhận danh sách ô chữ đã đọc sẵn, **không** import `pdfjs-dist`. Hai adapter mỏng đọc PDF và lật trục `y`: một cho trình duyệt (`docPdfWeb.ts`), một cho Node (`docPdfNode.mjs`). Logic dựng bút toán chuyển từ `logic.mjs` sang `nhap.ts`. `boc.py` bị xoá, nhưng **chỉ sau khi** chốt di trú chứng minh 60/60 khớp ở cả hai phía.

**Tech Stack:** TypeScript · React 19 · Vite 8 · `pdfjs-dist` 6.2.108 · vitest 4 · Supabase JS · Node 24 (bóc kiểu `.ts` trực tiếp)

**Spec:** [docs/superpowers/specs/2026-08-15-import-phieu-luong-web-design.md](../specs/2026-08-15-import-phieu-luong-web-design.md)
Spec nền (bút toán, bộ nhãn, sáu chốt): [docs/superpowers/specs/2026-08-14-nhap-phieu-luong-design.md](../specs/2026-08-14-nhap-phieu-luong-design.md)

## Global Constraints

- **Hằng số hình học giữ NGUYÊN, không đổi một số nào:** `YROW=3.0` · `YMAX=64.0` · `XMAX=72.0` · `XSLACK=6.0`. Chúng đã được tinh chỉnh qua bốn vòng debug; đổi là hỏng cả 60 file.
- **`boc.ts` KHÔNG được import `pdfjs-dist`.** Nhận `OChu[]` đã đọc sẵn.
- **Phép lật `y` nằm trong adapter, KHÔNG nằm trong `boc.ts`.** `boc.ts` làm việc trong hệ "y tăng lên trên" (hệ của `pypdf`).
- **`tsconfig.app.json` đã bật `erasableSyntaxOnly` + `verbatimModuleSyntax`:** không dùng `enum`, `namespace`, parameter property; import kiểu phải viết `import type`.
- **Số test không được giảm:** `logic.test.mjs` có đúng **30** test. `nhap.test.ts` phải có **≥ 30**.
- **Không có số lương thật trong code hay test.** Dùng số minh hoạ. Toạ độ `x` là thật (hình học trang, không phải tiền).
- **Chốt di trú là điều kiện bắt buộc để xoá `boc.py`:** 60/60 khớp tuyệt đối, ở **cả** Node **và** trình duyệt.
- Chạy `npx vitest run` · `npx tsc -b` · `npx oxlint` trước mỗi commit.

---

### Task 1: `boc.ts` — luật ghép toạ độ, thuần và test được không cần PDF

**Files:**
- Create: `src/features/phieu-luong/boc.ts`
- Test: `src/features/phieu-luong/boc.test.ts`
- Read for reference: `scripts/phieu-luong/boc.py`

**Interfaces:**
- Consumes: không gì (task đầu)
- Produces:
  ```ts
  export interface OChu { text: string; x: number; y: number }
  export interface Phieu {
    file: string
    empno: string | null
    period: string | null      // 'YYYYMM'
    kind: 'K' | 'S' | null
    nguonKy: 'noi-dung' | 'ten-file'
    canhBao: string[]
    gross: number | null
    deductTotal: number | null
    net: number | null
    bank: number | null
    tru: Record<string, number>
    ngoaiTong: Record<string, number>
    nhanLa: string[]
    loi: string[]
  }
  export function ghep(oChu: OChu[]): Record<string, number>
  export function bocPhieu(oChu: OChu[], tenFile: string): Phieu
  ```

- [ ] **Step 1: Viết test cho ba cái bẫy của luật ghép**

Tạo `src/features/phieu-luong/boc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ghep, type OChu } from './boc'

/**
 * Hàng khấu trừ của một phiếu 2022: SÁU nhãn, NĂM số, `厚生年金基金` bỏ trống.
 * Toạ độ `x` là số ĐO THẬT; số tiền là số minh hoạ.
 *
 * Số canh PHẢI, nhãn canh TRÁI → độ lệch thay đổi theo độ rộng số:
 * `333` (ba chữ số) lệch 43,8pt khỏi nhãn của nó, còn `11,111` chỉ lệch 25,8pt.
 * Ngưỡng quá chặt là rơi nhãn `雇用保険料` trong im lặng.
 */
const HANG_TRU: OChu[] = [
  { text: '11,111', x: 95.2, y: 309.5 },
  { text: '22,222', x: 168.9, y: 309.5 },
  { text: '333', x: 335.7, y: 309.5 },
  { text: '4,444', x: 395.5, y: 309.5 },
  { text: '5,555', x: 469.2, y: 309.5 },
  { text: '健康保険料', x: 69.4, y: 283.3 },
  { text: '厚生年金保険', x: 138.1, y: 283.3 },
  { text: '厚生年金基金', x: 211.8, y: 283.3 },
  { text: '雇用保険料', x: 291.9, y: 283.3 },
  { text: '所得税', x: 375.6, y: 283.3 },
  { text: '住民税', x: 447.9, y: 283.3 },
]

describe('ghep — luật nhãn gần nhất về phía trái', () => {
  it('ghép đúng cả năm số, kể cả số ba chữ số lệch 43,8pt', () => {
    expect(ghep(HANG_TRU)).toEqual({
      健康保険料: 11111,
      厚生年金保険: 22222,
      雇用保険料: 333,
      所得税: 4444,
      住民税: 5555,
    })
  })

  it('nhãn bỏ trống không nhận gì', () => {
    expect('厚生年金基金' in ghep(HANG_TRU)).toBe(false)
  })

  /**
   * Chữ khối dựng dọc ở lề trái (`控` ở x≈42) cách số cột đầu (x=95.2) đúng 53,2pt
   * — TRONG ngưỡng 72pt — nên nếu không loại trước khi ghép, nó GIÀNH mất số của
   * `健康保険料` rồi vòng lặp dừng. Lỗi này từng nằm sẵn và bị một lỗi khác che.
   */
  it('chữ khối dựng dọc không giành được số', () => {
    const co控: OChu[] = [...HANG_TRU, { text: '控', x: 42.1, y: 296.0 }]
    expect(ghep(co控).健康保険料).toBe(11111)
    expect('控' in ghep(co控)).toBe(false)
  })

  /**
   * Layout từ 2026/06 chèn một hàng mục con giữa hàng số và hàng nhãn tổng, nên
   * phải duyệt NHIỀU hàng nhãn bên dưới. Hàng cách nhau ~26pt, hai hàng ~52pt,
   * vẫn trong YMAX=64.
   */
  it('nhãn trải hai dòng: bỏ qua hàng không có nhãn ở tầm, xuống hàng tiếp', () => {
    const haiHang: OChu[] = [
      { text: '77,777', x: 300.0, y: 364.1 },
      { text: '一般保険料', x: 60.0, y: 338.0 },
      { text: '子育支援金', x: 130.0, y: 338.0 },
      { text: '総支給金額', x: 290.0, y: 312.0 },
    ]
    expect(ghep(haiHang)).toEqual({ 総支給金額: 77777 })
  })

  it('bỏ giờ và ngày công, chỉ lấy tiền', () => {
    const conCham: OChu[] = [
      { text: '176:50', x: 95.2, y: 309.5 },
      { text: '22.0', x: 168.9, y: 309.5 },
      { text: '出勤時間', x: 69.4, y: 283.3 },
      { text: '出勤日数', x: 138.1, y: 283.3 },
    ]
    expect(ghep(conCham)).toEqual({})
  })

  it('số âm vẫn ghép được (DB掛金, 過不足税額)', () => {
    const am: OChu[] = [
      { text: '-10,000', x: 95.2, y: 309.5 },
      { text: 'DB掛金', x: 69.4, y: 283.3 },
    ]
    expect(ghep(am)).toEqual({ 'DB掛金': -10000 })
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận nó fail đúng lý do**

Run: `npx vitest run src/features/phieu-luong/boc.test.ts`
Expected: FAIL — `Failed to resolve import "./boc"`

- [ ] **Step 3: Viết `boc.ts` — phần bộ nhãn và `ghep`**

Tạo `src/features/phieu-luong/boc.ts`. Port nguyên văn từ `scripts/phieu-luong/boc.py`, **không dọn dẹp gì**:

```ts
// Luật bóc phiếu lương 給与明細 — THUẦN, không đọc PDF.
// Xem docs/superpowers/specs/2026-08-15-import-phieu-luong-web-design.md
//
// Vì sao nhận OChu[] thay vì tự đọc PDF: một phần để chạy được cả trong trình duyệt
// lẫn Node, nhưng lý do quan trọng hơn là TEST KHÔNG CẦN FILE PDF NÀO — bơm ô chữ
// giả với toạ độ đã biết là kiểm được luật ghép trực tiếp, và một lỗi ghép không bị
// lẫn với một lỗi đọc.
//
// Hệ quy chiếu: y TĂNG LÊN TRÊN (hệ của pypdf). Adapter phải lật trước khi gọi vào
// đây — mọi hằng số dưới đây đã tinh chỉnh theo hệ này.

export interface OChu {
  text: string
  x: number
  y: number
}

const MONEY = /^-?\d{1,3}(?:,\d{3})*$|^-?\d+$/
/** Giờ (176:50) và ngày công (22.0) thuộc khối 勤怠, KHÔNG phải tiền. */
const TIMEISH = /\d+:\d\d|^\d+\.\d$/
const HAS_CJK = /[\u3040-\u9fff]/

/** Khối 控除 — cộng vào 控除合計額. Hai nhãn cuối KHÔNG phải thuế (xem nhap.ts). */
export const KHAU_TRU = [
  '健康保険料', '厚生年金保険', '厚生年金基金', '雇用保険料',
  '所得税', '住民税', '社内販売精算', 'その他',
] as const
/** Mục CON của 健康保険料 (layout từ 2026/06). KHÔNG cộng: đã nằm trong 健康保険料. */
export const MUC_CON = ['一般保険料', '子育支援金'] as const
/** NGOÀI 控除合計額 nhưng VẪN đổi tiền thật → ghi thành dòng riêng, không được bỏ. */
export const NGOAI_TONG = ['過不足税額'] as const
/** Sổ theo dõi phần ĐƯỢC GIẢM, không phải khoản bị trừ. Coi là khoản trừ làm thuế
 *  một tháng phồng lên bằng cả tổng bộ ba. */
export const DINH_MUC_GIAM = ['月次減税額', '定額減税額(所得税)', '定額減税未済額'] as const
const TONG = ['総支給金額', '控除合計額', '差引支給額', '銀行１振込額'] as const
/** Phía 支給 — không dùng để dựng bút toán, nhưng phải biết tên để không báo "nhãn lạ". */
const CAP = [
  '基本給', '残業手当', '通勤手当', '立替経費精算', '立替経費',
  '不就労控除', '基本賞与', 'DB掛金',
] as const
const KHONG_PHAI_TIEN = [
  '出勤時間', '遅早時間', '残業時間', '深夜残業時間', '休出残業時間', '欠勤時間',
  '出勤日数', '休出日数', '有休日数', '欠勤日数', '有休残', '時間有休残', '特休日数',
  '残業予備２', '残業予備３', '残業予備４', '残業予備５',
  '現金支給額', '翌月繰越額', '前月繰越額', '社員番号',
] as const
/**
 * Chữ KHỐI dựng dọc ở lề trái (支給/控除/勤怠...) và chữ header. KHÔNG BAO GIỜ mang
 * số, nhưng nằm ở x≈42 nên cách số cột đầu (x=95.2) đúng 53,2pt — TRONG ngưỡng 72pt
 * — nên chúng GIÀNH mất số của 健康保険料 rồi vòng lặp dừng. Phải loại TRƯỚC khi ghép.
 */
const MARKERS = new Set(['支', '給', '控', '除', '勤', '怠', '他', '氏', '名', '所', '属', '様', '氏名'])
const BIET_HET = new Set<string>([
  ...KHAU_TRU, ...MUC_CON, ...NGOAI_TONG, ...DINH_MUC_GIAM,
  ...TONG, ...CAP, ...KHONG_PHAI_TIEN, ...MARKERS,
])

// Đã chạy đúng 60/60. KHÔNG đổi.
const YROW = 3.0
const YMAX = 64.0
const XMAX = 72.0
const XSLACK = 6.0

function tach(oChu: OChu[]): { so: OChu[]; nhan: OChu[] } {
  const so: OChu[] = []
  const nhan: OChu[] = []
  for (const o of oChu) {
    const t = o.text.replace(/ /g, '')
    if (!t || TIMEISH.test(t)) continue
    if (MONEY.test(t)) so.push({ ...o, text: t })
    else if (HAS_CJK.test(t)) nhan.push({ ...o, text: t })
  }
  return { so, nhan }
}

/** Gom theo y thành các hàng, giảm dần theo y (trên trang: từ trên xuống). */
function gomHang(items: OChu[]): { y: number; items: OChu[] }[] {
  const hang: { y: number; items: OChu[] }[] = []
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const cuoi = hang[hang.length - 1]
    if (cuoi && Math.abs(cuoi.y - it.y) <= YROW) cuoi.items.push(it)
    else hang.push({ y: it.y, items: [it] })
  }
  return hang
}

/**
 * {nhãn: số} theo luật: một số thuộc về NHÃN GẦN NHẤT VỀ PHÍA TRÁI nó, trong hàng
 * nhãn gần nhất BÊN DƯỚI mà có nhãn hợp lệ ở tầm.
 *
 * Phải duyệt NHIỀU hàng: layout từ 2026/06 chèn một hàng mục con giữa hàng số và
 * hàng nhãn tổng.
 */
export function ghep(oChu: OChu[]): Record<string, number> {
  const { so, nhan } = tach(oChu)
  const hangNhan = gomHang(nhan.filter((n) => !MARKERS.has(n.text)))
  const res: Record<string, number> = {}
  for (const s of so) {
    for (const h of hangNhan) {
      if (h.y >= s.y || s.y - h.y > YMAX) continue
      const ung = h.items.filter((n) => s.x - n.x >= -XSLACK && s.x - n.x <= XMAX)
      if (ung.length === 0) continue
      const n = ung.reduce((a, b) => (b.x > a.x ? b : a))
      if (!(n.text in res)) res[n.text] = Number(s.text.replace(/,/g, ''))
      break
    }
  }
  return res
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `npx vitest run src/features/phieu-luong/boc.test.ts`
Expected: PASS — 6 test

- [ ] **Step 5: Commit**

```bash
git add src/features/phieu-luong/boc.ts src/features/phieu-luong/boc.test.ts
git commit -m "feat(phieu-luong): port luat ghep toa do sang boc.ts

Thuan, khong import pdfjs. Test bom o chu gia nen khong can file PDF nao —
va mot loi ghep khong bi lan voi mot loi doc.

Phu ba cai bay da tra gia: so canh phai nen so ba chu so lech 43,8pt (nguong
qua chat la roi nhan trong im lang), nhan trai hai dong tu layout 2026/06, va
chu khoi dung doc o x~42 gianh so cua nhan cot dau.

Hang so YROW/YMAX/XMAX/XSLACK giu nguyen — chung da tinh chinh qua bon vong
debug tren 60 file that."
```

---

### Task 2: `boc.ts` — đọc kỳ, phân loại nhãn, hai đẳng thức tự kiểm

**Files:**
- Modify: `src/features/phieu-luong/boc.ts` (thêm vào cuối)
- Modify: `src/features/phieu-luong/boc.test.ts` (thêm describe mới)

**Interfaces:**
- Consumes: `ghep`, `OChu`, các hằng nhãn từ Task 1
- Produces: `bocPhieu(oChu, tenFile) → Phieu` (kiểu `Phieu` như khai báo ở Task 1)

- [ ] **Step 1: Viết test cho `bocPhieu`**

Thêm vào `boc.test.ts`:

```ts
import { bocPhieu } from './boc'

/** Phiếu minh hoạ: gộp 400.000 − trừ 78.000 = ròng 322.000. */
function phieuDu(): OChu[] {
  return [
    { text: '2026年', x: 598.1, y: 87.3 },
    { text: '8月分', x: 632.3, y: 87.3 },
    { text: '給与', x: 661.5, y: 87.3 },
    // hàng số của khối 控除
    { text: '20,000', x: 95.2, y: 309.5 },
    { text: '36,000', x: 168.9, y: 309.5 },
    { text: '2,000', x: 335.7, y: 309.5 },
    { text: '4,000', x: 395.5, y: 309.5 },
    { text: '16,000', x: 469.2, y: 309.5 },
    { text: '健康保険料', x: 69.4, y: 283.3 },
    { text: '厚生年金保険', x: 138.1, y: 283.3 },
    { text: '雇用保険料', x: 291.9, y: 283.3 },
    { text: '所得税', x: 375.6, y: 283.3 },
    { text: '住民税', x: 447.9, y: 283.3 },
    // hàng tổng
    { text: '400,000', x: 220.0, y: 364.1 },
    { text: '78,000', x: 295.0, y: 364.1 },
    { text: '322,000', x: 370.0, y: 364.1 },
    { text: '322,000', x: 440.0, y: 364.1 },
    { text: '総支給金額', x: 217.0, y: 338.0 },
    { text: '控除合計額', x: 292.0, y: 338.0 },
    { text: '差引支給額', x: 366.0, y: 338.0 },
    { text: '銀行１振込額', x: 433.0, y: 338.0 },
  ]
}

describe('bocPhieu', () => {
  it('phiếu đủ thì không lỗi, đọc kỳ từ nội dung', () => {
    const p = bocPhieu(phieuDu(), '(0101)202608K.pdf')
    expect(p.loi).toEqual([])
    expect(p.period).toBe('202608')
    expect(p.kind).toBe('K')
    expect(p.nguonKy).toBe('noi-dung')
    expect(p.empno).toBe('0101')
    expect(p.gross).toBe(400000)
    expect(p.deductTotal).toBe(78000)
    expect(p.net).toBe(322000)
    expect(p.tru).toEqual({
      健康保険料: 20000, 厚生年金保険: 36000, 雇用保険料: 2000,
      所得税: 4000, 住民税: 16000,
    })
  })

  it('bắt lệch khi tổng mục trừ != 控除合計額', () => {
    const xau = phieuDu().map((o) => (o.text === '16,000' ? { ...o, text: '15,000' } : o))
    const p = bocPhieu(xau, '(0101)202608K.pdf')
    expect(p.loi.join(' ')).toMatch(/tổng mục trừ/)
  })

  it('bắt lệch khi gộp − trừ − 過不足 != ròng', () => {
    const xau = phieuDu().map((o) => (o.text === '400,000' ? { ...o, text: '401,000' } : o))
    const p = bocPhieu(xau, '(0101)202608K.pdf')
    expect(p.loi.join(' ')).toMatch(/差引支給/)
  })

  /**
   * 過不足税額 KHÔNG nằm trong 控除合計額 nhưng VẪN đổi tiền thật. Đẳng thức đúng là
   * gộp − 控除合計額 − 過不足税額 = ròng. Bỏ nó là mất khoản hoàn/nộp thêm cuối năm.
   */
  it('過不足税額 nằm ngoài tổng khấu trừ mà vẫn vào đẳng thức', () => {
    const t12: OChu[] = [
      ...phieuDu().filter((o) => o.text !== '322,000'),
      { text: '342,000', x: 370.0, y: 364.1 },
      { text: '342,000', x: 440.0, y: 364.1 },
      { text: '-20,000', x: 95.2, y: 340.0 },
      { text: '過不足税額', x: 69.4, y: 314.0 },
    ]
    const p = bocPhieu(t12, '(0101)202612K.pdf')
    expect(p.ngoaiTong).toEqual({ 過不足税額: -20000 })
    expect(p.loi).toEqual([])
  })

  it('nhãn lạ thì từ chối cả file và gọi tên nhãn đó ra', () => {
    const la = [...phieuDu(), { text: '9,999', x: 95.2, y: 250.0 }, { text: '謎の控除', x: 69.4, y: 224.0 }]
    const p = bocPhieu(la, '(0101)202608K.pdf')
    expect(p.nhanLa).toContain('謎の控除')
    expect(p.loi.join(' ')).toMatch(/謎の控除/)
  })

  /**
   * Ca thật: (0004)202209S.pdf tên ghi 202209 nhưng nội dung ghi 2022年7月分賞与.
   * Nội dung thắng, và phải BÁO.
   */
  it('tên file lệch nội dung: lấy nội dung và báo', () => {
    const p = bocPhieu(phieuDu(), '(0004)202209K.pdf')
    expect(p.period).toBe('202608')
    expect(p.canhBao.join(' ')).toMatch(/lệch/)
  })

  /** Hai file thật không đọc được kỳ từ nội dung → rơi về tên file. */
  it('không đọc được kỳ từ nội dung thì rơi về tên file', () => {
    const khongNgay = phieuDu().filter((o) => !o.text.includes('年') && !o.text.includes('月分'))
    const p = bocPhieu(khongNgay, '(0004)202308S.pdf')
    expect(p.period).toBe('202308')
    expect(p.kind).toBe('S')
    expect(p.nguonKy).toBe('ten-file')
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run src/features/phieu-luong/boc.test.ts`
Expected: FAIL — `bocPhieu is not a function`

- [ ] **Step 3: Viết `bocPhieu` và `kiem`**

Thêm vào cuối `src/features/phieu-luong/boc.ts`:

```ts
const KY_TRONG_PDF = /(\d{4})\s*年\s*(\d{1,2})\s*月分\s*(給与|賞与)?/
const TEN_FILE = /\((\d+)\)(\d{4})(\d{2})?([KS])/

export interface Phieu {
  file: string
  empno: string | null
  period: string | null
  kind: 'K' | 'S' | null
  nguonKy: 'noi-dung' | 'ten-file'
  canhBao: string[]
  gross: number | null
  deductTotal: number | null
  net: number | null
  bank: number | null
  tru: Record<string, number>
  ngoaiTong: Record<string, number>
  nhanLa: string[]
  loi: string[]
}

/**
 * Kỳ: ưu tiên NỘI DUNG PDF, dự phòng tên file, lệch nhau thì báo.
 *
 * Vì sao cần cả hai: một file thật có tên ghi `202209` nhưng nội dung ghi
 * `2022年7月分賞与`, và khoản thật nằm ở 2022-07-08. Nhưng hai file khác lại KHÔNG
 * đọc được kỳ từ nội dung, và ở đó tên file mới đúng. Không nguồn nào đủ một mình.
 */
function docKy(oChu: OChu[], tenFile: string) {
  const fn = TEN_FILE.exec(tenFile)
  const tenKy = fn ? fn[2] + (fn[3] ?? '') : null
  const kind = (fn?.[4] as 'K' | 'S' | undefined) ?? null
  const m = KY_TRONG_PDF.exec(oChu.map((o) => o.text).join(''))
  const noiKy = m ? `${m[1]}${String(Number(m[2])).padStart(2, '0')}` : null
  const loaiPdf = m?.[3] ?? null

  const canhBao: string[] = []
  if (loaiPdf) {
    const mongDoi = kind === 'K' ? '給与' : '賞与'
    if (loaiPdf !== mongDoi) canhBao.push(`tên file '${kind}' nhưng nội dung '${loaiPdf}'`)
  }
  if (noiKy && tenKy && noiKy !== tenKy) {
    canhBao.push(`kỳ lệch: tên=${tenKy} nội-dung=${noiKy}`)
  }
  return {
    period: noiKy ?? tenKy,
    kind,
    empno: fn?.[1] ?? null,
    nguonKy: (noiKy ? 'noi-dung' : 'ten-file') as 'noi-dung' | 'ten-file',
    canhBao,
  }
}

/**
 * Hai đẳng thức tự kiểm + nhãn lạ. Rỗng = qua hết.
 *
 * Đẳng thức thứ hai là `gộp − 控除合計額 − 過不足税額 = ròng`, KHÔNG phải
 * `gộp − trừ = ròng`: 過不足税額 (quyết toán năm) nằm ngoài tổng khấu trừ nhưng vẫn
 * đổi tiền thật. Đo trên cả bốn phiếu tháng 12 của bộ dữ liệu, khớp tới từng đơn vị.
 */
function kiem(p: Omit<Phieu, 'loi'>): string[] {
  const loi: string[] = []
  const q = Object.values(p.ngoaiTong).reduce((s, v) => s + v, 0)
  if (p.deductTotal === null) loi.push('thiếu 控除合計額')
  else {
    const s = Object.values(p.tru).reduce((a, v) => a + v, 0)
    if (s !== p.deductTotal) {
      loi.push(`tổng mục trừ ${s} != 控除合計額 ${p.deductTotal} (lệch ${s - p.deductTotal})`)
    }
  }
  if (p.gross === null || p.deductTotal === null || p.net === null) {
    loi.push('thiếu một trong 総支給/控除合計/差引支給')
  } else if (p.gross - p.deductTotal - q !== p.net) {
    loi.push(
      `総支給−控除合計−過不足 != 差引支給 (${p.gross}−${p.deductTotal}−${q}=` +
        `${p.gross - p.deductTotal - q}, thực=${p.net})`,
    )
  }
  if (p.net !== null && p.bank !== null && p.net !== p.bank) {
    loi.push(`差引支給 ${p.net} != 銀行１振込額 ${p.bank}`)
  }
  if (p.nhanLa.length) loi.push('nhãn lạ (không có trong bộ nhãn): ' + p.nhanLa.join(', '))
  if (!p.period || !p.kind) loi.push('không đọc được kỳ/loại')
  return loi
}

export function bocPhieu(oChu: OChu[], tenFile: string): Phieu {
  const f = ghep(oChu)
  const ky = docKy(oChu, tenFile)
  const tru: Record<string, number> = {}
  for (const k of KHAU_TRU) if (k in f) tru[k] = f[k]
  const ngoaiTong: Record<string, number> = {}
  for (const k of NGOAI_TONG) if (k in f) ngoaiTong[k] = f[k]
  const than: Omit<Phieu, 'loi'> = {
    file: tenFile,
    empno: ky.empno,
    period: ky.period,
    kind: ky.kind,
    nguonKy: ky.nguonKy,
    canhBao: ky.canhBao,
    gross: f['総支給金額'] ?? null,
    deductTotal: f['控除合計額'] ?? null,
    net: f['差引支給額'] ?? null,
    bank: f['銀行１振込額'] ?? null,
    tru,
    ngoaiTong,
    nhanLa: Object.keys(f).filter((k) => !BIET_HET.has(k)).sort(),
  }
  return { ...than, loi: kiem(than) }
}
```

- [ ] **Step 4: Chạy test và toàn bộ kiểm**

Run: `npx vitest run src/features/phieu-luong/boc.test.ts && npx tsc -b && npx oxlint`
Expected: PASS — 14 test; `tsc` và `oxlint` không lỗi

- [ ] **Step 5: Commit**

```bash
git add src/features/phieu-luong/boc.ts src/features/phieu-luong/boc.test.ts
git commit -m "feat(phieu-luong): bocPhieu — doc ky, phan loai nhan, hai dang thuc

Ky uu tien NOI DUNG PDF, du phong ten file, lech nhau thi bao: mot file that
co ten 202209 nhung noi dung 2022年7月分, con hai file khac khong doc duoc ky
tu noi dung va o do ten file moi dung. Khong nguon nao du mot minh.

Dang thuc thu hai la gop - 控除合計額 - 過不足税額 = rong. 過不足税額 nam
NGOAI tong khau tru nhung van doi tien that; bo no la mat khoan hoan/nop them
cuoi nam."
```

---

### Task 3: `nhap.ts` — port `logic.mjs` sang TypeScript, giữ đủ 30 test

**Files:**
- Create: `src/features/phieu-luong/nhap.ts`
- Create: `src/features/phieu-luong/nhap.test.ts`
- Read for reference: `scripts/phieu-luong/logic.mjs`, `scripts/phieu-luong/logic.test.mjs`

**Interfaces:**
- Consumes: `type Phieu` từ Task 2
- Produces:
  ```ts
  export interface DongMoi {
    type: 'income' | 'expense'
    amount: number
    to_amount: null
    category_id: string | null
    account_id: string
    to_account_id: null
    occurred_on: string
    note: string
    is_refund: boolean
    exclude_from_stats: boolean
  }
  export interface KhoanNeo {
    id: string; occurred_on: string; amount: number
    account_id: string; category_id: string | null
  }
  export const MAP_THUE: Record<string, string>
  export const MAP_KHAC: Record<string, string>
  export const DANH_MUC_THUE_CHA: string
  export const DANH_MUC_THUE_CON: { name: string; icon: string; need_level: 'essential'; cost_type: 'fixed' | 'variable' }[]
  export function mapNhan(nhan: string): { nhom: 'thue' | 'khac'; danhMuc: string }
  export function dauGhiChu(ngayISO: string, kind: 'K' | 'S'): string
  export function cuaSoNeo(period: string): { tu: string; den: string }
  export function timNeo(khoanThu: KhoanNeo[], phieu: Phieu, yuchoId: string, daDung?: Set<string>):
    { ok: true; row: KhoanNeo } | { ok: false; lyDo: string }
  export function gomTrung(ds: Phieu[]): { giu: Phieu[]; daGop: { key: string; files: string[] }[]; boQua: { key: string; files: string[]; lyDo: string }[] }
  export function dungDong(phieu: Phieu, neo: KhoanNeo, idTheoTen: Map<string, string>):
    { thu: DongMoi; thuKhac: DongMoi | null; chi: DongMoi[] }
  export function kiemDong(phieu: Phieu, thu: DongMoi, chi: DongMoi[], thuKhac?: DongMoi | null): string[]
  ```

- [ ] **Step 1: Chép test cũ sang TS, đổi import và tên trường**

Tạo `src/features/phieu-luong/nhap.test.ts` bằng cách chép nguyên `scripts/phieu-luong/logic.test.mjs`, rồi đổi đúng bốn thứ:

1. `from './logic.mjs'` → `from './nhap'`
2. Thêm `import type { Phieu } from './boc'` và gắn kiểu cho các hằng phiếu mẫu
3. `deduct_total` → `deductTotal`, `ngoai_tong` → `ngoaiTong` (theo kiểu `Phieu` ở Task 2)
4. `r.ly_do` → `r.lyDo`

Các hằng phiếu mẫu cần thêm trường mà `Phieu` đòi. Ví dụ cho `P202608`:

```ts
const P202608: Phieu = {
  file: '(0101)202608K.pdf', empno: '0101', period: '202608', kind: 'K',
  nguonKy: 'noi-dung', canhBao: [],
  gross: 500000, deductTotal: 100000, net: 400000, bank: 400000,
  tru: { 健康保険料: 20000, 厚生年金保険: 50000, 雇用保険料: 3000, 所得税: 7000, 住民税: 20000 },
  ngoaiTong: {}, nhanLa: [], loi: [],
}
```

**Giữ nguyên toàn bộ 30 `it(...)` và mọi ghi chú giải thích vì sao từng ca tồn tại.** Đó là ký ức của sáu lỗi đã mắc; xoá là mất.

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run src/features/phieu-luong/nhap.test.ts`
Expected: FAIL — `Failed to resolve import "./nhap"`

- [ ] **Step 3: Port `logic.mjs` sang `nhap.ts`**

Chép nguyên `scripts/phieu-luong/logic.mjs` sang `src/features/phieu-luong/nhap.ts`, **giữ nguyên mọi ghi chú**, rồi:

- Thêm kiểu theo khối `Produces` ở trên
- `phieu.deduct_total` → `phieu.deductTotal`, `phieu.ngoai_tong` → `phieu.ngoaiTong`
- `ly_do` → `lyDo`
- `DANH_MUC_THUE_CON` giữ đúng `cost_type` chia hai: `所得税`/`雇用保険` là `variable`, `住民税`/`健保`/`年金` là `fixed`
- **Không** đổi logic, **không** dọn dẹp, **không** gộp hàm

Bốn ghi chú BẮT BUỘC phải mang sang nguyên văn (chúng là lý do tồn tại của từng dòng):

1. `社内販売精算` nằm trong `控除合計額` nhưng không phải thuế, và không được là con của `Thuế & An sinh` vì `taxCategoryIds` gom mọi con
2. `is_refund: false` tường minh trên dòng thu — PostgREST insert mảng thì hợp nhất tập khoá nên khoá thiếu thành `NULL` chứ không lấy `DEFAULT`
3. `exclude_from_stats` chỉ đặt cho nhóm thuế, không đặt cho `社内販売精算`
4. `kiemDong` kiểm cân bằng **trong từng phạm vi** và kiểm **dấu** — bất biến số học báo đúng cho ca ròng > gộp vì cả ba số đều âm bằng nhau

- [ ] **Step 4: Chạy test và toàn bộ kiểm, đếm số test**

Run: `npx vitest run src/features/phieu-luong/nhap.test.ts && npx tsc -b && npx oxlint`
Expected: PASS — **≥ 30 test**. Nếu ít hơn 30 thì có ca bị mất trong lúc chép; tìm lại.

- [ ] **Step 5: Commit**

```bash
git add src/features/phieu-luong/nhap.ts src/features/phieu-luong/nhap.test.ts
git commit -m "feat(phieu-luong): port logic.mjs sang nhap.ts, giu du 30 test

Port nguyen van, khong don dep: giu moi ghi chu vi chung la ky uc cua sau loi
da mac (社内販売精算 khong phai thue, PostgREST hop nhat tap khoa nen is_refund
phai tuong minh, exclude_from_stats chi cho nhom thue, va chot DAU vi bat bien
so hoc bao dung cho ca rong > gop).

logic.mjs chua xoa — se xoa o task doi CLI, sau khi chot di tru xanh."
```

---

### Task 4: Adapter Node + chốt di trú phía Node (60/60)

**Files:**
- Create: `scripts/phieu-luong/docPdfNode.mjs`
- Create: `scripts/phieu-luong/chot-di-tru.mjs`
- Modify: `package.json` (thêm `pdfjs-dist` vào `devDependencies`, thêm script)

**Interfaces:**
- Consumes: `bocPhieu`, `type OChu` từ Task 2
- Produces: `docPdfNode(duongDan) → Promise<OChu[]>` — đã lật `y`

- [ ] **Step 1: Cài `pdfjs-dist` làm devDependency**

```bash
npm install --save-dev pdfjs-dist@6.2.108
```

Xác nhận: `grep pdfjs-dist package.json` phải thấy trong `devDependencies`.

- [ ] **Step 2: Viết adapter Node**

Tạo `scripts/phieu-luong/docPdfNode.mjs`:

```js
// Adapter Node: doc PDF -> OChu[] da LAT y. Ban legacy vi chay trong Node.
//
// Vi sao lat y o DAY chu khong trong boc.ts: pdf.js do y tu DINH trang, pypdf tu
// DAY. Do that tren mot phieu 2022: nhan y=283.3 (pypdf) <-> y=311.7 (pdf.js), so
// y=309.5 <-> y=285.5 — ca hai cap cong lai dung 595 = chieu cao trang.
// boc.ts lam viec trong he "y tang len tren" cua pypdf, va MOI hang so da tinh
// chinh theo he do. Dua phep lat vao boc.ts la tron hai viec, va nguoi sua sau
// khong biet hang so thuoc he nao.
import { readFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

/** @returns {Promise<{text:string,x:number,y:number}[]>} */
export async function docPdfNode(duongDan) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(duongDan)),
    // PDF phieu luong ma hoa AES voi mat khau RONG
    password: '',
    isEvalSupported: false,
  }).promise
  const page = await doc.getPage(1)
  const caoTrang = page.getViewport({ scale: 1 }).viewBox[3]
  const tc = await page.getTextContent({ includeMarkedContent: false })
  return tc.items
    .map((it) => ({ text: (it.str || '').trim(), x: it.transform[4], y: caoTrang - it.transform[5] }))
    .filter((o) => o.text !== '')
}
```

- [ ] **Step 3: Viết chốt di trú**

Tạo `scripts/phieu-luong/chot-di-tru.mjs`:

```js
// CHOT DI TRU — dieu kien BAT BUOC de duoc xoa boc.py.
//
// So ban TS voi phieu-luong.json do pypdf sinh. Phai 60/60 khop TUYET DOI tung con
// so. Khong dat thi KHONG xoa boc.py.
//
// Chay:
//   python scripts/phieu-luong/boc.py "<thu muc>" -o /tmp/pypdf.json   (ban chuan)
//   node scripts/phieu-luong/chot-di-tru.mjs "<thu muc>" /tmp/pypdf.json
import { readFileSync, readdirSync } from 'node:fs'
import { docPdfNode } from './docPdfNode.mjs'

const { bocPhieu } = await import('../../src/features/phieu-luong/boc.ts')

const [thuMuc, duongChuan] = process.argv.slice(2)
if (!thuMuc || !duongChuan) {
  console.error('Dung: node scripts/phieu-luong/chot-di-tru.mjs <thu-muc-pdf> <pypdf.json>')
  process.exit(1)
}
const chuan = JSON.parse(readFileSync(duongChuan, 'utf8'))
const files = readdirSync(thuMuc).filter((f) => f.endsWith('.pdf')).sort()

// pypdf dung snake_case, boc.ts dung camelCase — so tung truong, khong so ca doi tuong.
const sanh = (ts, py) =>
  ts.gross === py.gross && ts.deductTotal === py.deduct_total &&
  ts.net === py.net && ts.bank === py.bank &&
  JSON.stringify(ts.tru, Object.keys(ts.tru).sort()) ===
    JSON.stringify(py.tru, Object.keys(py.tru).sort()) &&
  JSON.stringify(ts.ngoaiTong, Object.keys(ts.ngoaiTong).sort()) ===
    JSON.stringify(py.ngoai_tong, Object.keys(py.ngoai_tong).sort()) &&
  ts.period === py.period && ts.kind === py.kind

let khop = 0
const lech = []
for (const f of files) {
  const py = chuan.find((r) => r.file === f)
  if (!py) { lech.push([f, 'khong co trong ban chuan pypdf']); continue }
  try {
    const ts = bocPhieu(await docPdfNode(`${thuMuc}/${f}`), f)
    if (sanh(ts, py)) khop++
    else lech.push([f, JSON.stringify({ ts, py }).slice(0, 500)])
  } catch (e) {
    lech.push([f, `EXC ${e.name}: ${e.message}`])
  }
}
console.log(`\n=== CHOT DI TRU: ${khop}/${files.length} khop tuyet doi ===\n`)
for (const [f, r] of lech) console.log(`X ${f}\n   ${r}`)
process.exit(khop === files.length ? 0 : 1)
```

- [ ] **Step 4: Chạy chốt di trú, phải 60/60**

```bash
python scripts/phieu-luong/boc.py "C:/Users/TranTriNguyen/Downloads/Bang luong" -o pypdf-chuan.json
node scripts/phieu-luong/chot-di-tru.mjs "C:/Users/TranTriNguyen/Downloads/Bang luong" pypdf-chuan.json
echo "exit=$?"
```

Expected: `=== CHOT DI TRU: 60/60 khop tuyet doi ===` và `exit=0`

**Nếu không đạt 60/60: DỪNG.** Không sang task sau. So từng file lệch, sửa `boc.ts`, chạy lại. Đây là chốt duy nhất chứng minh bản TS không làm mất gì.

- [ ] **Step 5: Thêm `pypdf-chuan.json` vào `.gitignore` và commit**

```bash
printf '\npypdf-chuan.json\n' >> .gitignore
git add scripts/phieu-luong/docPdfNode.mjs scripts/phieu-luong/chot-di-tru.mjs package.json package-lock.json .gitignore
git commit -m "feat(phieu-luong): adapter Node + chot di tru 60/60

docPdfNode lat y tai ADAPTER, khong trong boc.ts: pdf.js do y tu dinh trang,
pypdf tu day (do that: 283.3 <-> 311.7 va 309.5 <-> 285.5, ca hai cap cong lai
dung 595 = chieu cao trang). boc.ts lam viec trong he cua pypdf va moi hang so
da tinh chinh theo he do.

chot-di-tru.mjs la dieu kien BAT BUOC de duoc xoa boc.py: so tung con so voi
ban pypdf, phai 60/60, exit code khac 0 neu khong dat."
```

---

### Task 5: CLI đổi sang mô-đun TS, xoá `boc.py` và `logic.mjs`

**Files:**
- Modify: `scripts/nhap-phieu-luong.mjs` (import + phần đọc PDF)
- Delete: `scripts/phieu-luong/boc.py`
- Delete: `scripts/phieu-luong/logic.mjs`
- Delete: `scripts/phieu-luong/logic.test.mjs`
- Modify: `package.json` (bỏ script `boc:phieu-luong`)

**Interfaces:**
- Consumes: `bocPhieu` (Task 2), `nhap.ts` (Task 3), `docPdfNode` (Task 4)
- Produces: CLI làm một việc thay vì hai — tự bóc PDF rồi ghi, không cần `phieu-luong.json` ở giữa

- [ ] **Step 1: Đổi import trong CLI**

Trong `scripts/nhap-phieu-luong.mjs`, thay:

```js
import { ... } from './phieu-luong/logic.mjs'
```

bằng:

```js
const { DANH_MUC_THUE_CHA, DANH_MUC_THUE_CON, dauGhiChu, dungDong, gomTrung, kiemDong, timNeo } =
  await import('../src/features/phieu-luong/nhap.ts')
const { bocPhieu } = await import('../src/features/phieu-luong/boc.ts')
const { docPdfNode } = await import('./phieu-luong/docPdfNode.mjs')
```

Dùng `await import` động vì Node bóc kiểu `.ts` qua đường ESM động; đặt ở đầu file, trên mọi hàm dùng chúng.

- [ ] **Step 2: Cho CLI nhận thư mục PDF thay vì file JSON**

Thay phần đọc `phieu-luong.json`:

```js
const phieuList = JSON.parse(readFileSync(duong, 'utf8'))
```

bằng:

```js
// Nhan THU MUC PDF, tu boc — khong con buoc trung gian phieu-luong.json.
const { readdirSync, statSync } = await import('node:fs')
if (!statSync(duong).isDirectory()) thoat(`Khong phai thu muc: ${duong}`)
const tenFiles = readdirSync(duong).filter((f) => f.endsWith('.pdf')).sort()
if (tenFiles.length === 0) thoat(`Khong co file .pdf nao trong ${duong}`)
const phieuList = []
for (const f of tenFiles) {
  try {
    phieuList.push(bocPhieu(await docPdfNode(`${duong}/${f}`), f))
  } catch (e) {
    phieuList.push({ file: f, loi: [`doc PDF loi: ${e.message}`], tru: {}, ngoaiTong: {} })
  }
}
console.log(`Da boc ${phieuList.length} file tu ${duong}`)
```

Đổi dòng hướng dẫn ở đầu file cho khớp:

```js
//   node scripts/nhap-phieu-luong.mjs "<thu-muc-pdf>"           xem truoc
//   node scripts/nhap-phieu-luong.mjs "<thu-muc-pdf>" --ghi     ghi that
```

- [ ] **Step 3: Chạy CLI ở chế độ xem trước, so với kết quả đã biết**

```bash
node scripts/nhap-phieu-luong.mjs "C:/Users/TranTriNguyen/Downloads/Bang luong"
```

Expected: `58 phiếu sẵn sàng · 1 phiếu bỏ qua`, tổng `349 dòng`, kèm dòng `i trung byte, gop lam mot`. Con số khác thế nghĩa là port làm mất gì đó — **dừng và tìm**.

(Chưa cần token nếu chỉ xem trước không được — script hỏi token trước khi đọc DB. Dán token từ DevTools như cũ.)

- [ ] **Step 4: Xoá ba file cũ, bỏ script `boc:phieu-luong`**

```bash
git rm scripts/phieu-luong/boc.py scripts/phieu-luong/logic.mjs scripts/phieu-luong/logic.test.mjs
node -e "const p=require('./package.json'); delete p.scripts['boc:phieu-luong']; p.scripts['nhap:phieu-luong']='node scripts/nhap-phieu-luong.mjs'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')"
```

- [ ] **Step 5: Chạy toàn bộ kiểm và commit**

Run: `npx vitest run && npx tsc -b && npx oxlint`
Expected: PASS — số test không giảm so với trước (30 test cũ giờ nằm ở `nhap.test.ts`)

```bash
git add -A
git commit -m "refactor(phieu-luong): mot ban duy nhat — xoa boc.py va logic.mjs

CLI gio import chinh mo-dun TS trong src/ (Node 24 boc kieu truc tiep, va
tsconfig da bat erasableSyntaxOnly nen khong them rang buoc moi nao). Nhan
THU MUC PDF va tu boc — bo buoc trung gian phieu-luong.json.

Duoc xoa boc.py vi chot di tru da xanh 60/60. Layout phieu luong da doi it
nhat ba lan trong 4,5 nam nen luat nay SE phai sua; giu hai ban la chac chan
phai sua hai cho va kiem hai lan."
```

---

### Task 6: Adapter trình duyệt + chốt di trú phía trình duyệt

**Files:**
- Create: `src/features/phieu-luong/docPdfWeb.ts`
- Create: `src/features/phieu-luong/docPdfWeb.test.ts`

**Interfaces:**
- Consumes: `type OChu` từ Task 1
- Produces: `docPdfWeb(file: File) → Promise<OChu[]>` — nạp `pdfjs-dist` **động**, đã lật `y`

- [ ] **Step 1: Viết test cho phép lật y (không cần PDF)**

Tạo `src/features/phieu-luong/docPdfWeb.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { latY } from './docPdfWeb'

/**
 * pdf.js đo y từ ĐỈNH trang, boc.ts làm việc trong hệ của pypdf (y tăng lên trên).
 * Đo thật trên một phiếu 2022: nhãn y=283.3 (pypdf) ⇄ y=311.7 (pdf.js), số
 * y=309.5 ⇄ y=285.5. Cả hai cặp cộng lại đúng 595 = chiều cao trang.
 */
describe('latY', () => {
  it('lật đúng theo chiều cao trang', () => {
    expect(latY(311.7, 595)).toBeCloseTo(283.3, 1)
    expect(latY(285.5, 595)).toBeCloseTo(309.5, 1)
  })

  it('sau khi lật, số nằm TRÊN nhãn (y lớn hơn)', () => {
    const yNhan = latY(311.7, 595)
    const ySo = latY(285.5, 595)
    expect(ySo).toBeGreaterThan(yNhan)
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run src/features/phieu-luong/docPdfWeb.test.ts`
Expected: FAIL — `Failed to resolve import "./docPdfWeb"`

- [ ] **Step 3: Viết adapter trình duyệt**

Tạo `src/features/phieu-luong/docPdfWeb.ts`:

```ts
// Adapter trinh duyet: File -> OChu[] da lat y.
//
// pdfjs-dist NAP DONG: chunk pdf.js nang 1,8 MB (0,5 minified + 1,3 worker), trong
// khi toan bo dist/assets hien tai la 2,0 MB. Import cung la gan gap doi trong luong
// app cho MOI nguoi dung, ke ca ai khong bao gio mo trang nay.
import type { OChu } from './boc'

/** pdf.js do y tu DINH trang; boc.ts lam viec trong he cua pypdf (y tang len tren). */
export function latY(y: number, caoTrang: number): number {
  return caoTrang - y
}

export async function docPdfWeb(file: File): Promise<OChu[]> {
  const pdfjs = await import('pdfjs-dist')
  // Worker phai tro dung file trong bundle; Vite giai `?url` thanh duong dan da build.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // PDF phieu luong ma hoa AES voi mat khau RONG
    password: '',
    isEvalSupported: false,
  }).promise
  try {
    const page = await doc.getPage(1)
    const caoTrang = page.getViewport({ scale: 1 }).viewBox[3]
    const tc = await page.getTextContent({ includeMarkedContent: false })
    const out: OChu[] = []
    for (const it of tc.items) {
      if (!('str' in it)) continue
      const text = it.str.trim()
      if (text) out.push({ text, x: it.transform[4], y: latY(it.transform[5], caoTrang) })
    }
    return out
  } finally {
    await doc.cleanup()
  }
}
```

- [ ] **Step 4: Chạy test, chạy typecheck**

Run: `npx vitest run src/features/phieu-luong/docPdfWeb.test.ts && npx tsc -b`
Expected: PASS — 2 test; `tsc` không lỗi

Nếu `tsc` báo không tìm được `pdfjs-dist/build/pdf.worker.min.mjs?url`: thêm khai báo vào `src/vite-env.d.ts` (hoặc tạo file đó):

```ts
declare module '*?url' {
  const src: string
  export default src
}
```

- [ ] **Step 5: Chốt di trú phía TRÌNH DUYỆT — chỗ chưa có bằng chứng**

Bằng chứng 60/60 hiện có **chỉ đúng cho bản `legacy` trong Node**. Bản trình duyệt chưa được đo. Chạy trong trình duyệt:

1. `npx vite` (hoặc dùng preview đang chạy)
2. Mở app, vào DevTools Console
3. Dán đoạn sau, chọn cả 60 file khi hộp thoại mở:

```js
const { docPdfWeb } = await import('/src/features/phieu-luong/docPdfWeb.ts')
const { bocPhieu } = await import('/src/features/phieu-luong/boc.ts')
const inp = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: 'application/pdf' })
inp.click()
await new Promise((r) => (inp.onchange = r))
const ket = []
for (const f of inp.files) ket.push(bocPhieu(await docPdfWeb(f), f.name))
console.log('so file:', ket.length, '| qua het chot:', ket.filter((p) => !p.loi.length).length)
console.table(ket.filter((p) => p.loi.length).map((p) => ({ file: p.file, loi: p.loi.join(' ; ') })))
copy(JSON.stringify(ket))
```

Expected: `so file: 60 | qua het chot: 60`

Dán JSON vừa copy vào một file rồi so với bản Node:

```bash
node -e "
const a=require('./web.json'), b=require('./pypdf-chuan.json');
const k=(x)=>JSON.stringify([x.gross,x.deductTotal,x.net,x.bank,x.period,x.kind,Object.entries(x.tru).sort(),Object.entries(x.ngoaiTong).sort()]);
const kp=(x)=>JSON.stringify([x.gross,x.deduct_total,x.net,x.bank,x.period,x.kind,Object.entries(x.tru).sort(),Object.entries(x.ngoai_tong).sort()]);
let n=0; for(const w of a){const p=b.find(y=>y.file===w.file); if(p&&k(w)===kp(p))n++; else console.log('LECH',w.file)}
console.log(n+'/'+a.length);
"
```

Expected: `60/60`

**Không đạt: DỪNG.** Bản trình duyệt và bản `legacy` cho toạ độ khác nhau, và toàn bộ thiết kế phải xét lại.

- [ ] **Step 6: Commit**

```bash
git add src/features/phieu-luong/docPdfWeb.ts src/features/phieu-luong/docPdfWeb.test.ts
git commit -m "feat(phieu-luong): adapter trinh duyet, nap pdfjs dong

Nap dong vi chunk pdf.js nang 1,8 MB trong khi toan bo dist/assets hien tai
la 2,0 MB — import cung la gan gap doi trong luong app cho MOI nguoi dung,
ke ca ai khong bao gio mo trang nay.

Da chay chot di tru o CA phia trinh duyet: 60/60. Truoc do bang chung 60/60
chi dung cho ban legacy trong Node."
```

---

### Task 7: Trang giao diện — chọn file và xem trước

**Files:**
- Create: `src/features/phieu-luong/ImportPhieuLuongPage.tsx`
- Modify: `src/App.tsx` (thêm lazy import + route)
- Modify: `src/features/settings/DataPage.tsx:154-168` (thêm link vào mục "Nhập dữ liệu")

**Interfaces:**
- Consumes: `bocPhieu`, `docPdfWeb`, `gomTrung`, `timNeo`, `dungDong`, `kiemDong`, `dauGhiChu`, `DANH_MUC_THUE_CON`
- Produces: route `/settings/nhap-phieu-luong`

- [ ] **Step 1: Tách phần dựng kế hoạch thành hàm thuần và viết test cho nó**

Thêm vào `src/features/phieu-luong/nhap.ts`:

```ts
export interface DongKeHoach {
  phieu: Phieu
  neo: KhoanNeo | null
  dau: string
  thu: DongMoi | null
  thuKhac: DongMoi | null
  chi: DongMoi[]
  trangThai: 'dat' | 'da-nhap' | 'tu-choi'
  lyDo: string
}

/**
 * Dung ke hoach cho ca lo. THUAN — nhan du lieu so da doc san, khong goi DB.
 *
 * Trang thai phai phan biet BA ca, khong duoc gop hai ca sau thanh "loi": nguoi
 * dung can biet "da nhap roi" (khong phai loi, khong can lam gi) khac "tu choi"
 * (co the phai xu tay).
 */
export function dungKeHoach(
  phieuList: Phieu[],
  khoanThu: KhoanNeo[],
  yuchoId: string,
  idTheoTen: Map<string, string>,
  dauDaCo: Set<string>,
): DongKeHoach[] {
  const trung = gomTrung(phieuList)
  const out: DongKeHoach[] = []
  const rong = (p: Phieu, tt: DongKeHoach['trangThai'], lyDo: string): DongKeHoach => ({
    phieu: p, neo: null, dau: '', thu: null, thuKhac: null, chi: [], trangThai: tt, lyDo,
  })
  for (const g of trung.boQua) {
    out.push(rong({ ...phieuList[0], file: g.files.join(' + ') }, 'tu-choi', g.lyDo))
  }
  const daDung = new Set<string>()
  for (const p of trung.giu) {
    if (p.loi.length) { out.push(rong(p, 'tu-choi', p.loi.join(' ; '))); continue }
    const neo = timNeo(khoanThu, p, yuchoId, daDung)
    if (!neo.ok) { out.push(rong(p, 'tu-choi', neo.lyDo)); continue }
    const dau = dauGhiChu(neo.row.occurred_on, p.kind as 'K' | 'S')
    if (dauDaCo.has(dau)) { out.push({ ...rong(p, 'da-nhap', `đã nhập rồi (${dau})`), dau }); continue }
    let d
    try { d = dungDong(p, neo.row, idTheoTen) } catch (e) {
      out.push(rong(p, 'tu-choi', (e as Error).message)); continue
    }
    const loi = kiemDong(p, d.thu, d.chi, d.thuKhac)
    if (loi.length) { out.push(rong(p, 'tu-choi', loi.join(' ; '))); continue }
    daDung.add(neo.row.id)
    out.push({ phieu: p, neo: neo.row, dau, ...d, trangThai: 'dat', lyDo: '' })
  }
  return out
}
```

Thêm test vào `nhap.test.ts`:

```ts
describe('dungKeHoach', () => {
  const IDS_DU = new Map([...IDS])
  const THU: KhoanNeo[] = [NEO_202608]

  it('phiếu đạt thì có dòng, phiếu đã nhập thì không', () => {
    const kh = dungKeHoach([P202608], THU, YUCHO, IDS_DU, new Set())
    expect(kh).toHaveLength(1)
    expect(kh[0].trangThai).toBe('dat')
    expect(kh[0].chi).toHaveLength(5)

    const kh2 = dungKeHoach([P202608], THU, YUCHO, IDS_DU, new Set(['給与 2026/08K']))
    expect(kh2[0].trangThai).toBe('da-nhap')
    expect(kh2[0].chi).toHaveLength(0)
  })

  // Ba trang thai phai phan biet duoc: "da nhap roi" KHONG phai loi.
  it('phân biệt ba trạng thái, không gộp', () => {
    const xau: Phieu = { ...P202608, file: 'x.pdf', loi: ['nhãn lạ: 謎'] }
    const kh = dungKeHoach([P202608, xau], THU, YUCHO, IDS_DU, new Set())
    const tt = kh.map((k) => k.trangThai).sort()
    expect(tt).toEqual(['dat', 'tu-choi'])
    expect(kh.find((k) => k.trangThai === 'tu-choi')!.lyDo).toMatch(/謎/)
  })

  it('không để hai phiếu giành cùng một khoản neo', () => {
    const hai = [P202608, { ...P202608, file: 'y.pdf' }]
    const kh = dungKeHoach(hai, THU, YUCHO, IDS_DU, new Set())
    // gomTrung gộp hai bản trùng nội dung thành một
    expect(kh.filter((k) => k.trangThai === 'dat')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận fail rồi xanh**

Run: `npx vitest run src/features/phieu-luong/nhap.test.ts`
Expected: FAIL (`dungKeHoach is not exported`) → sau khi thêm hàm → PASS ≥ 33 test

- [ ] **Step 3: Viết trang giao diện**

Tạo `src/features/phieu-luong/ImportPhieuLuongPage.tsx`:

```tsx
import { useState } from 'react'
import { FileUp } from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import { useAccounts, useCategories } from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import { showToast } from '../../lib/dialog'
import { repo } from '../../data'
import { bocPhieu, type Phieu } from './boc'
import { docPdfWeb } from './docPdfWeb'
import { DANH_MUC_THUE_CON, dungKeHoach, type DongKeHoach, type KhoanNeo } from './nhap'

const TEN_YUCHO = /yucho/i

export function ImportPhieuLuongPage() {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const [keHoach, setKeHoach] = useState<DongKeHoach[] | null>(null)
  const [dangBoc, setDangBoc] = useState(false)

  const yucho = accounts.find((a) => TEN_YUCHO.test(a.name))
  const chiPhi = categories.filter((c) => c.type === 'expense')
  const thieuDanhMuc = DANH_MUC_THUE_CON.map((c) => c.name).filter(
    (n) => !chiPhi.some((c) => c.name === n),
  )

  async function chonFile(files: FileList | null) {
    if (!files?.length || !yucho) return
    setDangBoc(true)
    try {
      const phieuList: Phieu[] = []
      for (const f of Array.from(files)) {
        try {
          phieuList.push(bocPhieu(await docPdfWeb(f), f.name))
        } catch (e) {
          phieuList.push({
            file: f.name, empno: null, period: null, kind: null, nguonKy: 'ten-file',
            canhBao: [], gross: null, deductTotal: null, net: null, bank: null,
            tru: {}, ngoaiTong: {}, nhanLa: [], loi: [`đọc PDF lỗi: ${(e as Error).message}`],
          })
        }
      }
      const thu = (await repo.listYuchoIncome(yucho.id)) as KhoanNeo[]
      const dauDaCo = new Set(await repo.listDauPhieuLuong())
      const idTheoTen = new Map(chiPhi.map((c) => [c.name, c.id]))
      setKeHoach(dungKeHoach(phieuList, thu, yucho.id, idTheoTen, dauDaCo))
    } finally {
      setDangBoc(false)
    }
  }

  if (!yucho) {
    return (
      <div className="p-3">
        <BackLink to="/settings/data" label="Dữ liệu" />
        <p className="mt-3 text-sm text-money-out">Không tìm thấy tài khoản Yucho Bank.</p>
      </div>
    )
  }

  const dat = keHoach?.filter((k) => k.trangThai === 'dat') ?? []
  const soDong = dat.reduce((s, k) => s + 1 + (k.thuKhac ? 1 : 0) + k.chi.length, 0)

  return (
    <div className="flex flex-col gap-3 p-3">
      <BackLink to="/settings/data" label="Dữ liệu" />
      <h1 className="text-base font-semibold text-fg-primary">Nhập phiếu lương từ PDF</h1>

      {thieuDanhMuc.length > 0 && (
        <div className="rounded-xl bg-surface p-3 shadow-sm">
          <p className="text-xs text-money-out">
            Thiếu {thieuDanhMuc.length} danh mục Thuế &amp; An sinh. Phải tạo trước khi nhập.
          </p>
          <ul className="mt-1 text-xs text-fg-secondary">
            {thieuDanhMuc.map((n) => <li key={n}>· {n}</li>)}
          </ul>
          <button
            type="button"
            onClick={async () => {
              const cha = await repo.createCategory({
                name: 'Thuế & An sinh', type: 'expense', icon: '🏛️', parent_id: null,
              })
              for (const c of DANH_MUC_THUE_CON) {
                if (chiPhi.some((x) => x.name === c.name)) continue
                await repo.createCategory({ ...c, type: 'expense', parent_id: cha.id })
              }
              showToast('Đã tạo danh mục')
            }}
            className="mt-2 min-h-9 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
          >
            Tạo 6 danh mục
          </button>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-surface p-3 shadow-sm">
        <FileUp className="h-5 w-5 text-fg-muted" />
        <span className="flex-1 text-sm text-fg-primary">
          {dangBoc ? 'Đang bóc…' : 'Chọn file PDF (chọn được nhiều file)'}
        </span>
        <input
          type="file" multiple accept="application/pdf" className="hidden"
          disabled={dangBoc || thieuDanhMuc.length > 0}
          onChange={(e) => chonFile(e.target.files)}
        />
      </label>

      {keHoach && (
        <div className="rounded-xl bg-surface p-3 shadow-sm">
          <p className="text-sm font-semibold text-fg-primary">
            {dat.length} phiếu sẵn sàng · {soDong} dòng
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Số dư không đổi: thu vào chi ra cùng ngày cùng tài khoản, triệt tiêu.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {keHoach.map((k) => (
              <li key={k.phieu.file} className="border-t border-gray-100 pt-2 text-xs dark:border-gray-800">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-fg-primary">{k.dau || k.phieu.file}</span>
                  <span className={
                    k.trangThai === 'dat' ? 'text-money-in'
                      : k.trangThai === 'da-nhap' ? 'text-fg-muted' : 'text-money-out'
                  }>
                    {k.trangThai === 'dat' ? 'sẵn sàng'
                      : k.trangThai === 'da-nhap' ? 'đã nhập rồi' : 'từ chối'}
                  </span>
                </div>
                {k.lyDo && <p className="mt-0.5 text-fg-secondary">{k.lyDo}</p>}
                {k.trangThai === 'dat' && k.neo && (
                  <p className="mt-0.5 text-fg-muted">
                    neo {k.neo.occurred_on} · giữ lại {formatMoney(k.thu!.amount, 'JPY')}
                    {k.thuKhac && ` · mua hàng ${formatMoney(k.thuKhac.amount, 'JPY')}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Thêm hai phương thức repo mà trang cần**

Thêm vào `src/data/repo.ts` (interface) và `src/data/supabaseRepo.ts` + `src/data/demoRepo.ts` (hiện thực):

```ts
// repo.ts
/** Khoản thu trên Yucho, để neo phiếu lương. */
listYuchoIncome(accountId: string): Promise<
  { id: string; occurred_on: string; amount: number; account_id: string; category_id: string | null }[]
>
/** Các dấu ghi chú `給与 …` đã có, để chống nhập trùng. */
listDauPhieuLuong(): Promise<string[]>
```

```ts
// supabaseRepo.ts
async listYuchoIncome(accountId: string) {
  const { data, error } = await getSupabase()
    .from('transactions')
    .select('id,occurred_on,amount,account_id,category_id')
    .eq('type', 'income').eq('account_id', accountId).order('occurred_on')
  if (error) throw error
  return data
},
async listDauPhieuLuong() {
  const { data, error } = await getSupabase()
    .from('transactions').select('note').like('note', '給与 %')
  if (error) throw error
  // Dấu là phần trước ' · ' đầu tiên
  return [...new Set(data.map((t) => t.note.split(' · ')[0]))]
},
```

```ts
// demoRepo.ts — dữ liệu giả, trả rỗng là đủ cho chế độ demo
async listYuchoIncome() { return [] },
async listDauPhieuLuong() { return [] },
```

- [ ] **Step 5: Nối route và link**

`src/App.tsx` — thêm cạnh `ImportCsvPage`:

```tsx
const ImportPhieuLuongPage = lazy(() =>
  import('./features/phieu-luong/ImportPhieuLuongPage').then((m) => ({ default: m.ImportPhieuLuongPage })),
)
```

và cạnh route `/settings/import`:

```tsx
<Route path="/settings/nhap-phieu-luong" element={lazyRoute(<ImportPhieuLuongPage />, 'list')} />
```

`src/features/settings/DataPage.tsx` — thêm ngay dưới link CSV, trong cùng `<div className="mt-1">`:

```tsx
<Link
  to="/settings/nhap-phieu-luong"
  className="flex items-center gap-3 px-3 py-3 text-sm text-fg-primary hover:bg-gray-50 dark:hover:bg-gray-800"
>
  <FileUp className="h-5 w-5 text-fg-muted" />
  <span className="flex-1">Nhập phiếu lương từ PDF</span>
  <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
</Link>
```

- [ ] **Step 6: Kiểm bằng trình duyệt thật**

1. `npx vite`
2. Vào **Cài đặt → Dữ liệu → Nhập phiếu lương từ PDF**
3. Chọn 3 file PDF bất kỳ trong thư mục phiếu lương
4. Phải thấy đúng 3 dòng, mỗi dòng có dấu `給与 YYYY/MMK|S`, trạng thái, ngày neo, số giữ lại
5. Chọn lại **cùng** 3 file lần nữa → phải hiện `đã nhập rồi` nếu chúng đã có trong sổ, hoặc `sẵn sàng` nếu chưa

Run: `npx vitest run && npx tsc -b && npx oxlint`
Expected: tất cả PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(phieu-luong): trang nhap PDF — chon file va xem truoc

dungKeHoach tach thanh ham THUAN trong nhap.ts nen test duoc khong can DB.
Trang thai phan biet BA ca (dat / da-nhap / tu-choi kem ly do): gop hai ca sau
thanh 'loi' la mat thong tin nguoi dung can — 'da nhap roi' khong phai loi.

Chua co duong ghi; task sau."
```

---

### Task 8: Đường ghi, gỡ lô, và loại `pdf.js` khỏi precache PWA

**Files:**
- Modify: `src/features/phieu-luong/ImportPhieuLuongPage.tsx`
- Modify: `vite.config.ts:31-42` (thêm `workbox.globIgnores`)

**Interfaces:**
- Consumes: `DongKeHoach` từ Task 7
- Produces: tính năng hoàn chỉnh

- [ ] **Step 1: Thêm nút Ghi và nút Gỡ lô vào trang**

Thêm state và hai hàm vào `ImportPhieuLuongPage.tsx`:

```tsx
const [dangGhi, setDangGhi] = useState(false)
const [daGhi, setDaGhi] = useState<{ phieu: number; dong: number } | null>(null)

async function ghi() {
  if (!(await confirmDialog(`Ghi ${soDong} dòng vào sổ?`))) return
  setDangGhi(true)
  try {
    let nPhieu = 0
    let nDong = 0
    for (const k of dat) {
      for (const row of [k.thu!, ...(k.thuKhac ? [k.thuKhac] : []), ...k.chi]) {
        await repo.createTransaction(row)
        nDong += 1
      }
      nPhieu += 1
    }
    setDaGhi({ phieu: nPhieu, dong: nDong })
    setKeHoach(null)
    showToast(`Đã ghi ${nPhieu} phiếu · ${nDong} dòng`)
  } finally {
    setDangGhi(false)
  }
}

async function goLo() {
  const dau = [...new Set(dat.map((k) => k.dau))]
  if (!(await confirmDialog('Xoá mọi dòng mang dấu 給与 … ?'))) return
  const n = await repo.xoaPhieuLuong(dau.length ? dau : null)
  showToast(`Đã xoá ${n} dòng`)
  setDaGhi(null)
}
```

Import thêm `confirmDialog` từ `../../lib/dialog`.

Nút Ghi, đặt dưới danh sách kế hoạch:

```tsx
{dat.length > 0 && (
  <button
    type="button" disabled={dangGhi} onClick={ghi}
    className="min-h-11 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white active:scale-95 disabled:opacity-40"
  >
    {dangGhi ? 'Đang ghi…' : `Ghi ${soDong} dòng`}
  </button>
)}
{daGhi && (
  <div className="rounded-xl bg-surface p-3 shadow-sm">
    <p className="text-sm text-money-in">Đã ghi {daGhi.phieu} phiếu · {daGhi.dong} dòng.</p>
    <button
      type="button" onClick={goLo}
      className="mt-2 min-h-9 rounded-lg border border-money-out px-3 py-1.5 text-xs font-semibold text-money-out active:scale-95"
    >
      Gỡ lô này
    </button>
  </div>
)}
```

- [ ] **Step 2: Thêm `xoaPhieuLuong` vào repo**

`src/data/repo.ts`:

```ts
/** Xoá dòng nhập từ phiếu lương. `dau = null` xoá TOÀN BỘ lô mang tiền tố `給与 `. */
xoaPhieuLuong(dau: string[] | null): Promise<number>
```

`src/data/supabaseRepo.ts`:

```ts
async xoaPhieuLuong(dau: string[] | null) {
  const sb = getSupabase()
  // Khong co cot import_batch nen dau trong `note` la tay cam duy nhat de go lo nhap.
  let q = sb.from('transactions').delete({ count: 'exact' })
  if (dau && dau.length) {
    q = q.or(dau.map((d) => `note.like.${d} · %`).join(','))
  } else {
    q = q.like('note', '給与 %')
  }
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
},
```

`src/data/demoRepo.ts`:

```ts
async xoaPhieuLuong() { return 0 },
```

- [ ] **Step 3: Loại chunk `pdf.js` khỏi precache PWA**

`vite.config.ts`, trong khối `workbox`, thêm ngay dưới `globPatterns`:

```ts
        // Chunk pdf.js nang 1,8 MB — gan gap doi trong luong app. Tinh nang nhap
        // phieu luong CHI dung o may tinh, nen khong dua vao precache: neu khong,
        // moi lan cap nhat PWA tren dien thoai ton them 1,8 MB cho thu khong dung.
        // Trang do nap dong nen tai theo yeu cau, va offline khong can no.
        globIgnores: ['**/pdf.worker*.js', '**/pdf.worker*.mjs', '**/pdfjs*.js'],
```

**Không** đổi `importScripts: ['/push-sw.js']` và **không** chuyển sang `injectManifest` — ghi chú tại chỗ đó đã cảnh báo rằng làm vậy bắt phải tự dựng lại phần precache + `navigateFallback`, và làm sai là mất chế độ offline mà không test nào bắt được.

- [ ] **Step 4: Build và xác nhận chunk tách riêng, không vào precache**

```bash
npx vite build
echo "=== chunk pdf.js co ton tai rieng? ==="
ls -la dist/assets/ | grep -iE "pdf"
echo "=== co nam trong precache manifest khong? ==="
grep -o "pdf[^\"]*" dist/sw.js | head
echo "(trong = da loai dung)"
```

Expected: có file `dist/assets/pdf.worker-*.mjs` (chunk riêng), và `grep` trong `dist/sw.js` **không** ra dòng nào.

- [ ] **Step 5: Kiểm đầu-cuối trên trình duyệt thật**

1. `npx vite`
2. Ghi lại số dư Yucho hiện tại (Cài đặt → Tài khoản, hoặc trang Tài sản)
3. Vào **Cài đặt → Dữ liệu → Nhập phiếu lương từ PDF**
4. Chọn **một** file PDF chưa nhập, bấm Ghi
5. Xác nhận: số dư Yucho **không đổi**; Sổ GD ngày đó có dòng thu `給与 … · phần bị giữ lại` và các dòng chi thuế, tất cả hiện **màu xám**
6. Bấm **Gỡ lô này** → các dòng đó biến mất, số dư vẫn không đổi

Run: `npx vitest run && npx tsc -b && npx oxlint`
Expected: tất cả PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(phieu-luong): duong ghi, go lo, va loai pdf.js khoi precache PWA

Ghi qua repo.createTransaction nen user_id va sort_order tu dung, va KHONG can
token — trang da dang nhap. Day la cai loi lon nhat so voi CLI.

globIgnores loai chunk pdf.js khoi precache: 1,8 MB gan gap doi trong luong
app, cho mot tinh nang chi dung o may tinh. Trang nap dong nen tai theo yeu
cau, va offline khong can no. KHONG doi sang injectManifest — ghi chu tai cho
do da canh bao lam vay la de mat che do offline ma khong test nao bat duoc.

Da kiem dau-cuoi tren trinh duyet: so du Yucho khong doi truoc/sau, dong thue
hien mau xam, va nut Go lo xoa sach."
```

---

## Self-Review

**1. Spec coverage** — đối chiếu từng mục của spec:

| Mục spec | Task |
|---|---|
| Luật ghép toạ độ, hằng số giữ nguyên | 1 |
| Bộ nhãn, hai đẳng thức, đọc kỳ | 2 |
| `boc.ts` không import pdfjs, test không cần PDF | 1 (thiết kế) + 1, 2 (test) |
| Port `logic.mjs` → `nhap.ts`, ≥ 30 test | 3 |
| Adapter Node, lật y ở adapter | 4 |
| Chốt di trú 60/60 phía Node | 4 |
| Xoá `boc.py`, một bản duy nhất, CLI dùng chung | 5 |
| Adapter trình duyệt, nạp động | 6 |
| Chốt di trú 60/60 phía **trình duyệt** | 6 Step 5 |
| Trang, route, link từ DataPage | 7 |
| Ba trạng thái ở màn xem trước | 7 (`dungKeHoach` + test) |
| Tạo 6 danh mục trong trang | 7 |
| Đường ghi qua `repo`, không cần token | 8 |
| Gỡ lô | 8 |
| `globIgnores` loại pdf.js khỏi precache | 8 Step 3 |
| Sáu chốt chặn | port trong Task 3 (`kiemDong`, `timNeo`, `gomTrung`) + Task 7 (`dungKeHoach`) + Task 8 (hộp xác nhận) |

Không còn mục nào của spec thiếu task.

**2. Placeholder scan** — không có "TBD"/"TODO"/"xử lý lỗi phù hợp". Mọi bước có code thật.

**3. Type consistency** — kiểm chéo:
- `Phieu` dùng `deductTotal`/`ngoaiTong` (camelCase) ở Task 2, và Task 3–8 dùng đúng vậy. `chot-di-tru.mjs` ở Task 4 so tường minh `ts.deductTotal` với `py.deduct_total` — đúng, vì bản Python vẫn snake_case.
- `timNeo` trả `{ok:false, lyDo}` (không phải `ly_do`) — dùng nhất quán ở Task 3 và 7.
- `DongMoi` có `exclude_from_stats` (snake_case) vì nó là hàng DB, khác với `Phieu` là kiểu nội bộ. Cố ý, không phải lẫn.
- `dungDong` trả `{thu, thuKhac, chi}` ở Task 3, và Task 7–8 dùng đúng ba tên đó.
- `docPdfWeb(file: File)` vs `docPdfNode(duongDan: string)` — khác chữ ký vì khác nguồn dữ liệu, cả hai trả `OChu[]`.

## Rủi ro thi công

**Task 4 và Task 6 là hai cửa ải.** Không đạt 60/60 thì dừng, không đi tiếp. Task 6 Step 5 là chỗ **chưa có bằng chứng nào** — bản `legacy` trong Node đã xanh, bản trình duyệt chưa từng được đo.

**Đừng dọn dẹp khi port.** Luật này có tiền sử hai lỗi che nhau: sửa một cái làm cả 60 file hỏng cùng lúc. Port nguyên văn, chốt di trú xanh, rồi mới nói đến sửa sang.

**`repo.xoaPhieuLuong` dùng `.or()` với `note.like`** — cú pháp PostgREST cho `or` cần chuỗi không có dấu phẩy trong giá trị. Dấu ghi chú (`給与 2026/08K`) không chứa dấu phẩy nên an toàn, nhưng nếu sau này đổi định dạng dấu thì phải xét lại.
