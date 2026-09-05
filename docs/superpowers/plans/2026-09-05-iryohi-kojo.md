# Khoản ⑤ 医療費控除 — kế hoạch thi công

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn Quyền lợi có khối ⑤ — chi y tế so với ngưỡng ¥100.000, hai nhánh khấu trừ chọn
một, và việc-cần-làm "giữ hoá đơn, khai cùng 確定申告" khi vượt.

**Architecture:** Đúng khuôn bốn khoản trước: hằng số luật vào `rules/2026.ts`/`2022.ts` (kèm
nguồn + test đối chiếu), một bộ kiểm thuần `iryohi.ts` trả `KetLuan`, `tinhQuyenLoi` gom vào
mảng kết luận, một khối trên trang, một mục trong `benefitRules`. Cái RIÊNG của khoản này:
phải thêm Thuốc/Bệnh viện vào **bộ lọc giao dịch ở CẢ HAI đầu** (`useQuyenLoi` trình duyệt +
`loadInput.ts` push) — quên một đầu là máy tính trên tập rỗng và hai nơi nói hai câu.

**Tech Stack:** TypeScript · Vitest · (không React trong tầng tính)

**Spec:** [docs/superpowers/specs/2026-09-05-iryohi-kojo-design.md](../specs/2026-09-05-iryohi-kojo-design.md)

## Global Constraints

- Không đổi schema, không đụng `src/mcp/`, không sửa bốn bộ kiểm cũ.
- Mọi số ước mang `≈` (`<EstimateMark>`); vế 5% cố ý bỏ → mọi số là **cận dưới**, `ly_do`
  phải nói.
- Bộ kiểm và luật THUẦN (không React/Date/window) — `purity.test.ts` canh; chúng vào bundle
  edge nên **kết thúc bằng `npm run bundle:rules` + commit `_rules.js`**.
- Hằng số luật gắn nguồn URL + test đối chiếu (khuôn `luat.test.ts`).
- Trục thời gian: **năm dương lịch** (`calendarYearRange`), không phải `month_start_day`.
- Kiểm: `npx tsc -b` (không `--noEmit`), `npm test`, `npm run lint`, không prettier;
  file CRLF/LF lẫn — sửa chuỗi phải dò EOL.
- Nhánh: `feat/iryohi-kojo` từ `master`.

---

### Task 1: Hằng số luật `iryohi` + test đối chiếu

**Files:**
- Modify: `src/features/quyen-loi/rules/luat.ts` (thêm khối vào `LuatNam`)
- Modify: `src/features/quyen-loi/rules/2026.ts`, `src/features/quyen-loi/rules/2022.ts`
- Test: `src/features/quyen-loi/rules/luat.test.ts`

**Interfaces — Produces:**

```ts
// trong LuatNam
  iryohi: {
    /** Ngưỡng trừ nhánh chính (yên). Vế min-5%-tổng-thu-nhập cố ý bỏ — xem spec §4. */
    nguong: number
    tranKhauTru: number
    selfMed: {
      nguong: number
      tran: number
      /** ISO ngày cuối hiệu lực; null = không hạn. */
      hetHan: string | null
    }
  }
```

- [ ] **Step 1: Test đối chiếu (đỏ trước).** Thêm vào `luat.test.ts`, trong describe LUAT_2026:

```ts
  it('医療費控除: ngưỡng 10万, trần 200万 (No.1120); self-med 1,2万/8,8万 hết hạn 2026-12-31 (No.1132)', () => {
    expect(LUAT_2026.iryohi).toEqual({
      nguong: 100_000,
      tranKhauTru: 2_000_000,
      selfMed: { nguong: 12_000, tran: 88_000, hetHan: '2026-12-31' },
    })
    expect(LUAT_2022.iryohi).toEqual(LUAT_2026.iryohi)
  })
```

- [ ] **Step 2: Chạy đỏ** — `npx vitest run src/features/quyen-loi/rules/luat.test.ts`
  (đỏ kiểu TS2339 hoặc assert fail).

- [ ] **Step 3: Cài.** `luat.ts`: thêm khối `iryohi` vào interface (chép JSDoc ở trên).
  `2026.ts` và `2022.ts`: thêm cùng giá trị (luật hai nhánh không đổi trong cửa sổ 5 năm
  khoản ② soát; self-med có từ 2017, gia hạn 令和4年度改正 tới hết 2026):

```ts
  iryohi: {
    nguong: 100_000,
    tranKhauTru: 2_000_000,
    selfMed: { nguong: 12_000, tran: 88_000, hetHan: '2026-12-31' },
  },
```

  Thêm vào mảng `nguon` của `2026.ts`:

```ts
    // 医療費控除 — ngưỡng min(10万, 5%総所得), trần 200万
    'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1120.htm',
    // セルフメディケーション税制 — ngưỡng 1,2万, trần 8,8万, hết 2026-12-31, cần 一定の取組
    'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1132.htm',
```

- [ ] **Step 4: Chạy xanh** cả file + `npx tsc -b`.

- [ ] **Step 5: Commit** — `feat(quyen-loi): hang so luat iryohi kojo + doi chieu nguon`

---

### Task 2: Bộ kiểm thuần `iryohi.ts`

**Files:**
- Create: `src/features/quyen-loi/iryohi.ts`
- Create: `src/features/quyen-loi/iryohi.test.ts`
- Modify: `src/features/quyen-loi/ketLuan.ts` (thêm `'iryohi'` vào `KetLuanId`)

**Interfaces:**
- Consumes: `luatChoNam` (Task 1), `tienTietKiem` từ `./marginalRate`, `calendarYearOf`,
  `calendarYearRange` từ `../../lib/dates`, `KetLuan` từ `./ketLuan`.
- Produces:

```ts
export const IRYOHI_CATEGORY_NAMES = ['Thuốc', 'Bệnh viện'] as const

export interface IryohiInput {
  year: number
  todayISO: string
  categories: CategoryRow[]
  txs: TransactionRow[]
  suatBien: number | null
  /** Khoản ①/② đang đề xuất nộp 確定申告 năm nay — câu việc nhắc "khai cùng tờ đó". */
  deXuatKhaiThue: boolean
  fmt: (minorJpy: number) => string
}

export interface IryohiKetQua {
  ketLuan: KetLuan
  /** Σ Thuốc + Bệnh viện trong năm dương lịch (hoàn tiền trừ ra). */
  chi_y: number
  /** Σ riêng Thuốc — đầu vào nhánh self-med. */
  chi_thuoc: number
  nguong: number
  khau_tru_chinh: number
  khau_tru_self: number
  /** max của hai nhánh (luật cấm cộng dồn). */
  khau_tru: number
  /** Nhánh thắng; null khi cả hai bằng 0. */
  nhanh: 'chinh' | 'self' | null
  co_danh_muc: boolean
}

export function tinhIryohi(input: IryohiInput): IryohiKetQua
```

- [ ] **Step 1: Test đỏ trước.** Khuôn helper chép từ đầu `furusato.test.ts` (mở file lấy
  đúng cách dựng `cat()`/`tx()` — hai bộ test cùng thư mục phải cùng giọng). Các ca:

```ts
const CATS = [cat('thuoc', 'Thuốc'), cat('bv', 'Bệnh viện'), cat('an', 'Cơm ngoài')]
const chay = (txs, p = {}) =>
  tinhIryohi({ year: 2026, todayISO: '2026-09-05', categories: CATS, txs,
    suatBien: 0.1, deXuatKhaiThue: true, fmt: (m) => `¥${m}`, ...p })

it('dưới ngưỡng → du, khấu trừ 0, vẫn báo tiến độ trong chi_y', () => {
  const r = chay([tx('thuoc', 30_000, '2026-02-01')])
  expect(r.chi_y).toBe(30_000)
  expect(r.khau_tru).toBe(0)
  expect(r.ketLuan.trang_thai).toBe('du')
})

it('vượt ngưỡng → thieu, khấu trừ = chi − 100k, hạn 15/3 năm sau', () => {
  const r = chay([tx('thuoc', 70_000, '2026-02-01'), tx('bv', 60_000, '2026-03-01')])
  expect(r.khau_tru_chinh).toBe(30_000)
  expect(r.nhanh).toBe('chinh')
  expect(r.ketLuan.trang_thai).toBe('thieu')
  expect(r.ketLuan.han).toBe('2027-03-15')
  // tiết kiệm = tienTietKiem(30k, 30k, 0.1, luật) — đối chiếu bằng chính hàm đó
})

it('trần 2M: chi 3M → khấu trừ kẹp 2M', () => {
  const r = chay([tx('bv', 3_000_000, '2026-01-15')])
  expect(r.khau_tru_chinh).toBe(2_000_000)
})

it('self-med thắng khi tổng dưới 100k mà thuốc cao: thuốc 60k → self 48k, chính 0', () => {
  const r = chay([tx('thuoc', 60_000, '2026-02-01')])
  expect(r.khau_tru_self).toBe(48_000)
  expect(r.nhanh).toBe('self')
  // self-med chỉ đếm Thuốc: thêm bệnh viện 30k không đổi khau_tru_self
})

it('self-med trần 88k: thuốc 120k một mình → self kẹp 88k, nhưng chính = 20k → self thắng', () => {
  const r = chay([tx('thuoc', 120_000, '2026-02-01')])
  expect(r.khau_tru_self).toBe(88_000)
  expect(r.khau_tru_chinh).toBe(20_000)
  expect(r.nhanh).toBe('self')
})

it('năm 2027 self-med hết hạn → nhánh self = 0', () => {
  const r = chay([tx('thuoc', 60_000, '2027-02-01')], { year: 2027, todayISO: '2027-09-05' })
  expect(r.khau_tru_self).toBe(0)
  expect(r.nhanh).toBeNull()
})

it('hoàn tiền trừ ra; ranh giới năm dương lịch', () => {
  const r = chay([
    tx('thuoc', 50_000, '2026-12-31'),
    { ...tx('thuoc', 10_000, '2026-06-01'), is_refund: true },
    tx('thuoc', 99_999, '2027-01-01'), // năm sau, không đếm
  ])
  expect(r.chi_y).toBe(40_000)
})

it('suatBien null → tiet_kiem_uoc null nhưng khấu trừ vẫn có', () => {
  const r = chay([tx('bv', 200_000, '2026-02-01')], { suatBien: null })
  expect(r.khau_tru).toBe(100_000)
  expect(r.ketLuan.tiet_kiem_uoc).toBeNull()
})

it('năm cũ → het-han khi có khấu trừ, không thành việc-cần-làm', () => {
  const r = chay([tx('bv', 200_000, '2025-02-01')], { year: 2025 })
  expect(r.ketLuan.trang_thai).toBe('het-han')
})

it('không có danh mục y tế nào → co_danh_muc false, ly_do nói ra', () => {
  const r = tinhIryohi({ year: 2026, todayISO: '2026-09-05',
    categories: [cat('an', 'Cơm ngoài')], txs: [], suatBien: 0.1,
    deXuatKhaiThue: false, fmt: (m) => `¥${m}` })
  expect(r.co_danh_muc).toBe(false)
})
```

- [ ] **Step 2: Chạy đỏ.**

- [ ] **Step 3: Cài `iryohi.ts`.** Khung (chép `idsTheoTen`/`tong` theo furusato.ts —
  chúng là hàm cục bộ của file đó, khoản ⑤ chép sang chứ không export chéo; hai bản nhỏ
  hơn một mối phụ thuộc ngang):

```ts
export function tinhIryohi(input: IryohiInput): IryohiKetQua {
  const luat = luatChoNam(input.year)
  const namNay = calendarYearOf(input.todayISO)
  const nam = calendarYearRange(input.year)

  const idsY = idsTheoTen(input.categories, IRYOHI_CATEGORY_NAMES)      // cả hai tên
  const idsThuoc = idsTheoTen(input.categories, ['Thuốc'])
  const co_danh_muc = idsY.size > 0

  const chi_y = tong(input.txs, idsY, nam.start, nam.end).tong
  const chi_thuoc = tong(input.txs, idsThuoc, nam.start, nam.end).tong

  const khau_tru_chinh = clamp(chi_y - luat.iryohi.nguong, 0, luat.iryohi.tranKhauTru)
  const selfConHieuLuc =
    luat.iryohi.selfMed.hetHan === null || `${input.year}-12-31` <= luat.iryohi.selfMed.hetHan
  const khau_tru_self = selfConHieuLuc
    ? clamp(chi_thuoc - luat.iryohi.selfMed.nguong, 0, luat.iryohi.selfMed.tran)
    : 0
  const khau_tru = Math.max(khau_tru_chinh, khau_tru_self)
  const nhanh = khau_tru === 0 ? null : khau_tru === khau_tru_chinh ? 'chinh' : 'self'

  const tiet_kiem_uoc =
    khau_tru > 0 && input.suatBien !== null
      ? tienTietKiem(khau_tru, khau_tru, input.suatBien, luat)
      : null
  // ... ly_do (3 méo mó spec §3 + self-med cần 健康診断 khi nhanh==='self'),
  // trạng thái: khau_tru>0 && year===namNay → 'thieu' (han `${year+1}-03-15`,
  //   viec nhắc giữ hoá đơn + (deXuatKhaiThue ? 'khai cùng tờ 確定申告 của khoản ①②' : 'khai 確定申告'));
  // khau_tru>0 && year<namNay → 'het-han'; còn lại 'du' với viec nêu tiến độ
  //   `Chi y tế ${fmt(chi_y)} / ngưỡng ${fmt(nguong)}`. muc: 'low'.
}
```

  (Đoạn `...` ở trên là chỗ DUY NHẤT executor tự viết chữ — mọi ngưỡng/hình dạng đã chốt
  trong test Step 1; viết xong phải làm 11 test xanh, không có tự do nào khác.)

  `ketLuan.ts`: `'iryohi'` vào union `KetLuanId`.

- [ ] **Step 4: Chạy xanh + tsc.**
- [ ] **Step 5: Commit** — `feat(quyen-loi): bo kiem iryohi — hai nhanh chon mot, can duoi co chu y`

---

### Task 3: Nối orchestrator + HAI bộ lọc giao dịch

**Files:**
- Modify: `src/features/quyen-loi/quyenLoi.ts` (gọi `tinhIryohi`, thêm vào `QuyenLoiKetQua`
  + mảng `ketLuan` — sau `shelter.ketLuan`)
- Modify: `src/features/quyen-loi/useQuyenLoi.ts:52` (filter: thêm ids của
  `IRYOHI_CATEGORY_NAMES`)
- Modify: `supabase/functions/push-notify/loadInput.ts:257` (cùng bổ sung đó phía push)

**Interfaces:**
- Produces: `QuyenLoiKetQua.iryohi: IryohiKetQua`; `ketQua.ketLuan` dài 6.

- [ ] **Step 1:** `quyenLoi.ts` — trong `tinhQuyenLoi`, sau dòng `const shelter = ...`:

```ts
  const iryohi = tinhIryohi({
    year: input.year,
    todayISO: input.todayISO,
    categories: input.categories,
    txs: input.txs,
    suatBien,
    deXuatKhaiThue,
    fmt: input.fmt,
  })
```

  thêm `iryohi` vào object trả về và `iryohi.ketLuan` vào CUỐI mảng `ketLuan` (thứ tự
  tiền: ⑤ đứng sau ④). Sửa JSDoc "5 kết luận" → "6 kết luận".

- [ ] **Step 2:** `useQuyenLoi.ts` — trong memo filter (dòng ~52):

```ts
    for (const ten of IRYOHI_CATEGORY_NAMES) {
      const c = categories.find((x) => x.type === 'expense' && x.name === ten)
      if (c) ids.push(c.id)
    }
```

  (import `IRYOHI_CATEGORY_NAMES` từ `./iryohi`.)

- [ ] **Step 3:** `loadInput.ts` — cạnh dòng 257–258 (khối dựng `benefitCategoryIds`),
  cùng bổ sung với cùng comment ngắn: *"Khoản ⑤ đếm hai danh mục y tế — thiếu dòng này
  thì push tính iryohi trên tập rỗng trong khi màn hình có số."* Mở file xem cách nó
  import từ bundle (`_rules.js`) — `IRYOHI_CATEGORY_NAMES` phải được export tới đó qua
  serverBundle; kiểm bằng `npm run bundle:rules` + grep tên hằng trong `_rules.js`.

- [ ] **Step 4:** `npx tsc -b` + `npx vitest run src/features/quyen-loi` — các test cũ của
  quyenLoi.test.ts có thể khẳng định mảng ketLuan dài 5 → sửa **test đó** thành 6 là hợp lệ
  (hành vi mới có chủ ý, khác với mọi lần trước cấm sửa test cũ — nói rõ trong commit).

- [ ] **Step 5: Commit** — `feat(quyen-loi): noi iryohi vao tinhQuyenLoi + hai bo loc giao dich`

---

### Task 4: Khối ⑤ trên trang

**Files:**
- Modify: `src/features/quyen-loi/QuyenLoiPage.tsx` (khối mới sau khối ④, ~dòng 226+)

- [ ] **Step 1:** Chép khuôn khối ③ (Card + `<TrangThaiChu k={...} />` + câu `viec` + `<dl>`
  ba cột + `ly_do` list). Nội dung ba cột: **Chi y tế** (`chi_y`) · **Ngưỡng** (`nguong`) ·
  **Khấu trừ ≈** (`khau_tru`, kèm `<EstimateMark reason={ketLuan.ly_do[0]}>`). Dưới đó một
  dòng khi `nhanh === 'self'`: nhánh OTC thắng + cần 健康診断 + chỉ ★OTC được tính; khi
  `nhanh === 'chinh'` và `khau_tru_self > 0`: một dòng "nhánh OTC được ¥X nhưng nhánh chính
  lợi hơn". Mọi số qua `<Money>`; chữ DẠY bọc `<Guide>`, dòng DỮ LIỆU thì không; coi chừng
  trần PROSE_MAX (nếu đỏ: xét dạy-hay-dữ-liệu rồi mới quyết).

- [ ] **Step 2:** `npx tsc -b`, `npx vitest run`, lint. Commit —
  `feat(quyen-loi): khoi 5 iryohi tren trang Quyen loi`

---

### Task 5: Thông báo `benefit-iryohi`

**Files:**
- Modify: `src/features/notifications/types.ts` (union + `NOTIFICATION_TYPES` cạnh
  `benefit-year-end` + META)
- Modify: `src/features/notifications/rules/benefitRules.ts`
- Test: `src/features/notifications/rules/benefitRules.test.ts` (thêm case)
- Modify: `supabase/functions/push-notify/_rules.js` (sinh bởi bundle)

- [ ] **Step 1:** META:

```ts
  'benefit-iryohi': {
    cta: 'Xem quyền lợi',
    badge: 'Y TẾ',
    source: 'Quyền lợi',
    kind: 'action',
    label: 'Chi y tế vượt ngưỡng khấu trừ',
    hint: 'Chi y tế trong năm đã vượt ¥100.000 — giữ hoá đơn và khai 医療費控除 trong 確定申告.',
  },
```

- [ ] **Step 2:** `benefitRules.ts` — chép đúng khuôn khối `fuyo`:

```ts
  const iryohi = boi('iryohi')
  if (iryohi?.trang_thai === 'thieu')
    out.push({
      key: 'benefit-iryohi:all',
      kind: 'action',
      type: 'benefit-iryohi',
      severity: iryohi.muc,
      title: iryohi.viec,
      detail: iryohi.ly_do[0],
      onISO: iryohi.han ?? undefined,
      to: TO,
    })
```

- [ ] **Step 3:** Test — mở `benefitRules.test.ts` chép khuôn KetLuan giả, thêm: 'iryohi'
  trạng thái 'thieu' → 1 tin action đúng type; 'du' → im.

- [ ] **Step 4:** `npm run bundle:rules` → `npx vitest run tests/pushBundle.test.ts` +
  toàn suite + lint. Commit —
  `feat(thong-bao): tin benefit-iryohi — giu hoa don khi vuot nguong`

---

### Task 6: Xem bằng mắt + chốt

- [ ] **Step 1:** Demo (`tabs_context` — server có thể còn): `/quyen-loi` phải có khối ⑤.
  Demo có danh mục Thuốc (đã thấy "Thuốc cảm ¥1.200"). Nhập thêm qua UI một khoản Bệnh viện
  ¥120.000 hôm nay → khối chuyển 'thieu', chuông có việc "giữ hoá đơn", tiến độ đổi.
- [ ] **Step 2:** Sáng/Tối + 375×1,25 trên khối ⑤. Console không lỗi mới.
- [ ] **Step 3:** `node .gitnexus/run.cjs analyze` (FTS hỏng thì `--repair-fts` — đã hai
  lần hôm nay) + `detect_changes({scope:"compare", base_ref:"master"})`: phạm vi =
  quyen-loi + notifications + loadInput + _rules.js + tests. Không `src/mcp/`, không
  `src/data/`. Chore commit CLAUDE.md/AGENTS.md như lệ.
- [ ] **Step 4:** finishing-a-development-branch. **Ghi chú bàn giao:** `loadInput.ts` là
  code edge function — muốn PUSH (điện thoại) biết khoản ⑤ thì `supabase functions deploy
  push-notify` (hỏi user đường deploy quen dùng); chuông trong app thì hoạt động ngay
  không cần gì.

---

## Tự soát kế hoạch

**Phủ spec:** §2 luật → Task 1 · §3 phạm vi đếm + méo mó → Task 2 (IRYOHI_CATEGORY_NAMES,
ly_do) · §4 phép tính cận dưới → Task 2 · §5 nối khuôn → Task 3+4+5 · §6 ca biên → 11 test
Task 2 · loadInput hai đầu → Task 3.

**Điểm tra tại chỗ:** khuôn `cat()`/`tx()` của furusato.test.ts · cách loadInput import từ
bundle · khuôn KetLuan giả trong benefitRules.test.ts · vị trí chính xác khối ④ kết thúc
trong QuyenLoiPage.

**Nhất quán tên:** `tinhIryohi` / `IryohiKetQua` / `IRYOHI_CATEGORY_NAMES` / `'iryohi'`
(KetLuanId) / `'benefit-iryohi'` (NotificationType) — đúng bộ này ở cả 6 task.
