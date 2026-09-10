# Đối chiếu sao kê thẻ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel thẻ hiện đúng con số nhà thẻ đòi, và chỉ ra từng dòng lệch giữa sổ và sao kê.

**Architecture:** Một bảng `card_bills` lưu tổng hoá đơn mỗi kỳ (không lưu từng dòng). Hai module toán thuần — `paypayStatement.ts` đọc CSV PayPay, `statementReconcile.ts` ghép dòng sao kê với giao dịch trong sổ — đứng ngoài React và có unit test. UI chỉ đọc kết quả của chúng.

**Tech Stack:** TypeScript, React 19, TanStack Query, Supabase/PostgREST, Vitest, Tailwind + design tokens của repo.

**Spec:** [docs/superpowers/specs/2026-09-10-doi-chieu-sao-ke-the-design.md](../specs/2026-09-10-doi-chieu-sao-ke-the-design.md)

## Global Constraints

Mọi task đều chịu các ràng buộc sau (từ `CLAUDE.md` và spec):

- **Không gọi `repo` trực tiếp** trong `src/features/` — đi qua hook trong `src/hooks/queries.ts`. Import `type` từ `data/repo` thì được.
- **Mỗi `mutationFn` phải có invalidation nằm ngay cạnh nó** trong `queries.ts`.
- **Đổi schema là đổi hai file cùng một commit**: migration + `src/types/database.types.ts` (viết tay, không codegen).
- **Hai bản `Repo` phải cùng thoả interface** — thêm method một bên mà quên bên kia là lỗi biên dịch.
- **Đọc trọn bảng phải qua `fetchAllPages`** (`src/data/paging.ts`) — PostgREST chặn ở 1000 dòng.
- **Không dùng float cho tiền.** Mọi số tiền là minor units (`number` nguyên).
- **Giao diện:** không chêm giá trị tuỳ ý (màu/cỡ chữ/bán kính/thời lượng phải là token đã đặt tên trong `src/index.css`); không tự viết `<h1>/<h2>/<select>`/nút nền xanh — dùng `<PageHeader>`, `<SectionTitle>`, `<Select>`, `<ActionButton>`; mọi số tiền qua `<Money>`, mọi số đếm/phần trăm qua `<Num>`. `tests/designSystem.test.ts` là ban cứng.
- **Toán thuần nằm ngoài React**: file `.ts`, không JSX, có unit test.
- **Kiểm kiểu bằng `tsc -b`**, KHÔNG phải `tsc --noEmit` (lệnh kia xanh giả ở repo này).
- **Không chạy prettier** — repo không có, `--write` sẽ viết lại cả file sai style.
- **Không đụng** `cardStatementSplit`, `cardMonthCharge`, `cardBillingRange`, `runCardAutopayCatchUp` → không cần `npm run bundle:rules`. Không đụng `src/mcp/` → không cần `npm run bundle:mcp`.
- **Commit:** cây làm việc đang có phiên Claude khác gõ vào. **TUYỆT ĐỐI KHÔNG `git add -A`**, không `git checkout -- <file>`, không đổi nhánh. Chỉ `git add` đúng file của mình; nếu index đã có file lạ, commit bằng pathspec: `git commit -F msg.txt -- <file1> <file2>`.
- Test chạy bằng `npx vitest run <path>`; cả bộ là `npm test`.

---

### Task 1: Bảng `card_bills` — migration + kiểu

**Files:**
- Create: `supabase/migrations/0070_card_bills.sql`
- Modify: `src/types/database.types.ts` (thêm `CardBillRow` cạnh `AccountValuationRow` ở ~`:435`; thêm nhánh `card_bills` vào `Database.public.Tables` cạnh `account_valuations` ở ~`:1286`)

**Interfaces:**
- Consumes: `InsertOf<Row, Required, Optional>` (`database.types.ts:981`)
- Produces: `CardBillRow` — dùng bởi Task 2, 3, 6, 7

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/0070_card_bills.sql`:

```sql
-- ============================================================
-- Sổ Gạo — Migration 0070: Hoá đơn thẻ tín dụng do NHÀ THẺ đòi
--
-- VÌ SAO CẦN: app tự tính "quẹt trong kỳ" từ giao dịch trong sổ, nhưng con số đó
-- KHÔNG BAO GIỜ bằng số nhà thẻ đòi, kể cả khi sổ hoàn hảo. Đo trên 8 kỳ PayPay
-- (1-8/2026): hoàn tiền bị nhà thẻ cấn ở kỳ TRƯỚC kỳ mà sổ ghi, `チャージ` nạp ví là
-- khoản quẹt với thẻ nhưng là chuyển tiền nội bộ với sổ, và ranh giới ngày lệch nhau.
-- Ba thứ đó là khác biệt cấu trúc giữa hai cách đếm, không phải lỗi ghi chép.
-- ⇒ Muốn hiện đúng số nhà thẻ thì phải LƯU nó, không thể suy ra.
--
-- TÊN `card_bills` chứ không `card_statements`: repo đã có `cardStatement.ts` và
-- `useCardStatements.ts` mang nghĩa khác hẳn (chia dư nợ hôm nay thành đã chốt/chưa
-- chốt). Thứ lưu ở đây là SỐ TIỀN BỊ ĐÒI = hoá đơn.
--
-- Xem thêm: docs/superpowers/specs/2026-09-10-doi-chieu-sao-ke-the-design.md
-- ============================================================

create table public.card_bills (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  close_date date   not null,
  due_date   date   not null,
  total      bigint not null,
  created_at timestamptz not null default now(),
  unique (account_id, close_date)
);

alter table public.card_bills enable row level security;

create policy "own rows" on public.card_bills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on column public.card_bills.close_date is
  'Ngày chốt kỳ — danh tính của kỳ. Khoá theo ngày chốt chứ không theo tháng: tháng là khái niệm của màn hình, và thẻ đổi ngày chốt giữa chừng sẽ làm khoá-theo-tháng gộp nhầm hai kỳ.';
comment on column public.card_bills.due_date is
  'Ngày tiền rời tài khoản, ĐÃ dời T7/CN sang ngày làm việc.';
comment on column public.card_bills.total is
  'Số hoá đơn nhà thẻ đòi, minor units. CHO PHÉP ÂM: kỳ được hoàn nhiều hơn tiêu là trạng thái có thật.';
```

- [ ] **Step 2: Thêm kiểu hàng**

Trong `src/types/database.types.ts`, ngay sau khối `AccountValuationRow` (kết thúc ~`:446`):

```ts
/**
 * Hoá đơn một kỳ do NHÀ THẺ đòi (migration 0070) — con số in trên app của nhà thẻ.
 *
 * Khác `cardMonthCharge()`: hàm kia cộng giao dịch TRONG SỔ. Hai số lệch nhau vì lý do
 * cấu trúc (hoàn tiền lệch kỳ, nạp ví, ranh giới ngày), không phải vì ai ghi sai.
 */
export type CardBillRow = {
  id: string
  user_id: string
  account_id: string
  /** Ngày chốt kỳ — danh tính của kỳ, khớp `cardBillingRange().closeISO`. */
  close_date: string
  /** Ngày bị rút, đã dời T7/CN. */
  due_date: string
  /** minor units. Âm = kỳ được hoàn nhiều hơn tiêu. */
  total: number
  created_at: string
}
```

- [ ] **Step 3: Đăng ký bảng vào `Database`**

Trong cùng file, ngay sau nhánh `account_valuations` (kết thúc `:1295`):

```ts
      card_bills: {
        Row: CardBillRow
        Insert: InsertOf<
          CardBillRow,
          'user_id' | 'account_id' | 'close_date' | 'due_date' | 'total',
          'id'
        >
        Update: Partial<Pick<CardBillRow, 'due_date' | 'total'>>
        Relationships: []
      }
```

- [ ] **Step 4: Kiểm kiểu**

Run: `npx tsc -b`
Expected: PASS (không lỗi mới). Đây là bước duy nhất kiểm được Task 1 — chưa có runtime code nào dùng bảng.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0070_card_bills.sql src/types/database.types.ts
git commit -m "feat(the): bang card_bills luu hoa don nha the doi"
```

---

### Task 2: Tầng dữ liệu — repo + hook

**Files:**
- Modify: `src/data/repo.ts` (thêm `NewCardBill` cạnh `NewValuation` ở `:428`; thêm 2 method vào `interface Repo` cạnh `:696`; thêm `cardBills?` vào `BackupData` cạnh `:90`)
- Modify: `src/data/supabaseRepo.ts` (2 method, cạnh `getAccountValuations` ở `:530`)
- Modify: `src/data/demoRepo.ts` (2 method, cạnh `:1435`; thêm `cardBills` vào kiểu DB nội bộ cạnh `:226`)
- Modify: `src/hooks/queries.ts` (2 hook, cạnh `useAccountValuations` ở `:569`)
- Test: `src/data/demoRepo.test.ts` (thêm 1 test)

**Interfaces:**
- Consumes: `CardBillRow` (Task 1), `fetchAllPages` (`src/data/paging.ts`), `currentUserId()` (`supabaseRepo.ts`)
- Produces:
  - `NewCardBill = { account_id: string; close_date: string; due_date: string; total: number }`
  - `repo.getCardBills(): Promise<CardBillRow[]>`
  - `repo.upsertCardBills(rows: NewCardBill[]): Promise<CardBillRow[]>`
  - `useCardBills(): UseQueryResult<CardBillRow[]>` — queryKey `['cardBills']`
  - `useUpsertCardBills()` — mutation nhận `NewCardBill[]`
  - Dùng bởi Task 6, 7

- [ ] **Step 1: Viết test thất bại (demoRepo)**

Thêm vào cuối `src/data/demoRepo.test.ts`:

```ts
describe('card_bills', () => {
  it('upsert nhieu ky mot lan, va de theo (account_id, close_date)', async () => {
    const accs = await demoRepo.getAccounts()
    const card = accs.find((a) => a.type === 'card')!

    await demoRepo.upsertCardBills([
      { account_id: card.id, close_date: '2026-06-30', due_date: '2026-07-27', total: 158429 },
      { account_id: card.id, close_date: '2026-07-31', due_date: '2026-08-27', total: 191925 },
    ])
    let bills = await demoRepo.getCardBills()
    expect(bills.filter((b) => b.account_id === card.id)).toHaveLength(2)

    // Nạp lại cùng kỳ với số khác → ĐÈ, không thêm hàng mới
    await demoRepo.upsertCardBills([
      { account_id: card.id, close_date: '2026-06-30', due_date: '2026-07-27', total: 999 },
    ])
    bills = await demoRepo.getCardBills()
    expect(bills.filter((b) => b.account_id === card.id)).toHaveLength(2)
    expect(bills.find((b) => b.close_date === '2026-06-30')!.total).toBe(999)
  })

  it('total am duoc giu nguyen', async () => {
    const accs = await demoRepo.getAccounts()
    const card = accs.find((a) => a.type === 'card')!
    await demoRepo.upsertCardBills([
      { account_id: card.id, close_date: '2026-05-31', due_date: '2026-06-29', total: -4200 },
    ])
    const bills = await demoRepo.getCardBills()
    expect(bills.find((b) => b.close_date === '2026-05-31')!.total).toBe(-4200)
  })
})
```

- [ ] **Step 2: Chạy test cho chắc là đỏ**

Run: `npx vitest run src/data/demoRepo.test.ts -t card_bills`
Expected: FAIL — `demoRepo.upsertCardBills is not a function`

- [ ] **Step 3: Khai báo ở `repo.ts`**

Sau `interface NewValuation` (`:434`):

```ts
/** Một kỳ hoá đơn thẻ do nhà thẻ đòi. `user_id` do tầng repo tự điền. */
export interface NewCardBill {
  account_id: string
  /** Ngày chốt kỳ, khớp `cardBillingRange().closeISO`. */
  close_date: string
  /** Ngày bị rút, đã dời T7/CN. */
  due_date: string
  /** minor units; âm là hợp lệ. */
  total: number
}
```

Trong `interface BackupData`, cạnh `accountValuations?` (`:90`):

```ts
  /** Hoá đơn thẻ do nhà thẻ đòi (migration 0070); vắng mặt ở mọi backup trước đó. */
  cardBills?: CardBillRow[]
```

Trong `interface Repo`, cạnh `getAccountValuations` (`:696`):

```ts
  getCardBills(): Promise<CardBillRow[]>
  /** Đè theo (account_id, close_date). Trả về các hàng sau khi ghi. */
  upsertCardBills(rows: NewCardBill[]): Promise<CardBillRow[]>
```

Thêm `CardBillRow` vào khối `import type { ... } from '../types/database.types'` ở đầu file (danh sách đang xếp theo alphabet — chèn sau `BudgetRow`).

- [ ] **Step 4: Cài ở `supabaseRepo.ts`**

Sau `getAccountValuations` (`:542`):

```ts
  async getCardBills() {
    // Phân trang: mỗi (thẻ × kỳ) một dòng. Vài thẻ × vài năm chưa chạm 1.000, nhưng
    // đi qua fetchAllPages là luật của repo — và bị cắt ở đây thì panel im lặng rơi
    // về "chưa có sao kê" cho các kỳ cũ, một kiểu sai không ai nhìn ra.
    return await fetchAllPages<CardBillRow>(async (from, to) =>
      getSupabase()
        .from('card_bills')
        .select('*')
        .order('close_date', { ascending: false })
        .order('id')
        .range(from, to),
    )
  },

  async upsertCardBills(rows: NewCardBill[]) {
    if (rows.length === 0) return []
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('card_bills')
      .upsert(
        rows.map((r) => ({
          user_id,
          account_id: r.account_id,
          close_date: r.close_date,
          due_date: r.due_date,
          total: r.total,
        })),
        { onConflict: 'account_id,close_date' },
      )
      .select()
    if (error) throw error
    return data as CardBillRow[]
  },
```

Thêm `CardBillRow` và `NewCardBill` vào các khối import sẵn có ở đầu file.

- [ ] **Step 5: Cài ở `demoRepo.ts`**

Thêm vào kiểu DB nội bộ cạnh `accountValuations: AccountValuationRow[]` (`:226`):

```ts
  cardBills: CardBillRow[]
```

Sau `getAccountValuations` (`:1440`):

```ts
  async getCardBills() {
    return (load().cardBills ?? [])
      .slice()
      .sort((a, b) => b.close_date.localeCompare(a.close_date))
  },

  async upsertCardBills(rows: NewCardBill[]) {
    const db = load()
    db.cardBills ??= []
    const out: CardBillRow[] = []
    for (const r of rows) {
      // Đè theo (account_id, close_date) — khớp unique của Postgres
      const existing = db.cardBills.find(
        (b) => b.account_id === r.account_id && b.close_date === r.close_date,
      )
      if (existing) {
        existing.due_date = r.due_date
        existing.total = r.total
        out.push(existing)
        continue
      }
      const row: CardBillRow = {
        id: uuid(),
        user_id: DEMO_USER,
        account_id: r.account_id,
        close_date: r.close_date,
        due_date: r.due_date,
        total: r.total,
        created_at: new Date().toISOString(),
      }
      db.cardBills.push(row)
      out.push(row)
    }
    save(db)
    return out
  },
```

Trong `exportAll()` thêm `cardBills: db.cardBills ?? []`, và trong `importAll()` nhận `data.cardBills ?? []` — đi theo đúng cách `accountValuations` đang làm ở hai hàm đó.

- [ ] **Step 6: Chạy test cho chắc là xanh**

Run: `npx vitest run src/data/demoRepo.test.ts -t card_bills`
Expected: PASS (2 test)

- [ ] **Step 7: Thêm hook**

Trong `src/hooks/queries.ts`, sau `useAccountValuations` (`:575`):

```ts
// --- Thẻ tín dụng: hoá đơn nhà thẻ đòi (migration 0070) ---

export function useCardBills() {
  return useQuery({
    queryKey: ['cardBills'],
    queryFn: () => repo.getCardBills(),
    staleTime: 60_000,
  })
}

export function useUpsertCardBills() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: NewCardBill[]) => repo.upsertCardBills(rows),
    // CHỈ 'cardBills': hoá đơn không đụng số dư, không đụng giao dịch. Invalidate
    // rộng hơn là bắt cả app tải lại vì một con số chỉ panel thẻ đọc.
    onSettled: () => qc.invalidateQueries({ queryKey: ['cardBills'] }),
  })
}
```

Thêm `NewCardBill` vào khối `import type { ... } from '../data/repo'` sẵn có.

- [ ] **Step 8: Kiểm kiểu + cả bộ test**

Run: `npx tsc -b && npm test`
Expected: PASS. `tsc -b` là chỗ bắt việc quên cài method ở một trong hai repo.

- [ ] **Step 9: Commit**

```bash
git add src/data/repo.ts src/data/supabaseRepo.ts src/data/demoRepo.ts src/data/demoRepo.test.ts src/hooks/queries.ts
git commit -m "feat(the): tang du lieu cho hoa don the (repo + hook + sao luu)"
```

---

### Task 3: Đọc file sao kê PayPay

**Files:**
- Create: `src/features/assets/paypayStatement.ts`
- Test: `src/features/assets/paypayStatement.test.ts`

**Interfaces:**
- Consumes: `parseCsvText` (`src/features/import/csvImport.ts`), `cardBillingRange` + `CardBillingRange` (`./cardMonthCharge`), `MonthKey` (`src/lib/dates`)
- Produces:
  ```ts
  export interface StatementLine {
    /** ISO. Dòng không có ngày (再計算) nhận closeISO của kỳ. */
    iso: string
    /** minor units. Âm = dòng 調整額 hoặc khoản hoàn. */
    amount: number
    /** Tên cửa hàng, hoặc nhãn dòng ảo của 調整額. */
    name: string
    /** true = dòng ảo dựng từ cột 調整額, không phải một lần quẹt. */
    isAdjustment: boolean
  }
  export interface ParsedStatement {
    range: CardBillingRange
    /** Ngày ghi ở cột 当月お支払日 của file (đã dời cuối tuần). */
    dueDateFromFile: string
    /** Σ当月支払金額 + Σ調整額 — số nhà thẻ đòi. */
    total: number
    lines: StatementLine[]
    /** true khi range.dueISO ≠ dueDateFromFile ⇒ ngày chốt/ngày trả khai sai. */
    dueDateMismatch: boolean
  }
  export function parsePaypayStatement(
    text: string,
    card: { statementDay: number | null; paymentDueDay: number | null },
  ): ParsedStatement | null
  ```
  Dùng bởi Task 4, 5, 6

- [ ] **Step 1: Viết test thất bại**

Tạo `src/features/assets/paypayStatement.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parsePaypayStatement } from './paypayStatement'

const CARD = { statementDay: 31, paymentDueDay: 27 }
const HEAD =
  '"利用日/キャンセル日","利用店名・商品名","利用者","決済方法","支払区分","利用金額","手数料","支払総額","当月支払金額","翌月以降繰越金額","調整額","当月お支払日"'
/** cols: ngay, ten, nguoi, , , 利用金額, , , 当月支払金額, , 調整額, 当月お支払日 */
const row = (ngay: string, ten: string, riyou: string, thu: string, dieuChinh: string, tra: string) =>
  `"${ngay}","${ten}","${thu ? '本人*' : '本人'}","PayPayクレジット","1回","${riyou}","0","${riyou}","${thu}","0","${dieuChinh}","${tra}"`

describe('parsePaypayStatement', () => {
  it('total = tong 当月支払金額 + tong 調整額, KHONG phai tong 利用金額', () => {
    const csv = [
      HEAD,
      row('2026/1/3', '極楽茶屋', '8215', '8215', '-7951', '2026/2/27'),
      row('2026/1/6', '野方ホープ', '2160', '2160', '0', '2026/2/27'),
      row('2026/2/3', 'ＴＥＭＵ', '-961', '', '0', '2026/2/27'),
    ].join('\n')
    const p = parsePaypayStatement(csv, CARD)!
    // 8215 + 2160 - 7951 = 2424.  Tong 利用金額 la 9414 — con so SAI.
    expect(p.total).toBe(2424)
  })

  it('bo dong khong thu, va dung 調整額 thanh dong ao am', () => {
    const csv = [
      HEAD,
      row('2026/1/3', '極楽茶屋', '8215', '8215', '-7951', '2026/2/27'),
      row('2026/2/3', 'ＴＥＭＵ', '-961', '', '0', '2026/2/27'),
    ].join('\n')
    const p = parsePaypayStatement(csv, CARD)!
    expect(p.lines).toHaveLength(2)
    expect(p.lines.filter((l) => !l.isAdjustment)).toEqual([
      { iso: '2026-01-03', amount: 8215, name: '極楽茶屋', isAdjustment: false },
    ])
    const adj = p.lines.find((l) => l.isAdjustment)!
    expect(adj.amount).toBe(-7951)
    expect(adj.iso).toBe('2026-01-03')
  })

  it('ky suy tu THANG cua 当月お支払日, khong tu ngay da doi cuoi tuan', () => {
    // 27/6/2026 roi Chu nhat ⇒ file ghi 2026/6/29. Ky quet van la 1/5-31/5.
    const csv = [HEAD, row('2026/5/2', '東京湾フェリー', '4000', '4000', '0', '2026/6/29')].join('\n')
    const p = parsePaypayStatement(csv, CARD)!
    expect(p.range.start).toBe('2026-05-01')
    expect(p.range.closeISO).toBe('2026-05-31')
    expect(p.range.dueISO).toBe('2026-06-29')
    expect(p.dueDateFromFile).toBe('2026-06-29')
    expect(p.dueDateMismatch).toBe(false)
  })

  it('dong khong co ngay (再計算) nhan closeISO cua ky', () => {
    const csv = [HEAD, row('', 'ＴＥＭＵ（再計算）', '3476', '3476', '0', '2026/6/29')].join('\n')
    const p = parsePaypayStatement(csv, CARD)!
    expect(p.lines[0].iso).toBe('2026-05-31')
  })

  it('bat duoc ngay chot/ngay tra khai sai', () => {
    const csv = [HEAD, row('2026/5/2', 'X', '4000', '4000', '0', '2026/6/29')].join('\n')
    const p = parsePaypayStatement(csv, { statementDay: 15, paymentDueDay: 10 })!
    expect(p.dueDateMismatch).toBe(true)
  })

  it('file khong phai PayPay tra null', () => {
    expect(parsePaypayStatement('"ngay","so tien"\n"2026/1/1","100"', CARD)).toBeNull()
  })

  it('the thieu ngay chot tra null', () => {
    const csv = [HEAD, row('2026/5/2', 'X', '4000', '4000', '0', '2026/6/29')].join('\n')
    expect(parsePaypayStatement(csv, { statementDay: null, paymentDueDay: 27 })).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test cho chắc là đỏ**

Run: `npx vitest run src/features/assets/paypayStatement.test.ts`
Expected: FAIL — không tìm thấy module `./paypayStatement`

- [ ] **Step 3: Viết module**

Tạo `src/features/assets/paypayStatement.ts`:

```ts
// Đọc một file sao kê PayPay Card thành HOÁ ĐƠN của một kỳ.
//
// Con số nhà thẻ đòi = Σ当月支払金額 + Σ調整額 — KHÔNG phải Σ利用金額. Đã đối chiếu
// 8 kỳ (hoá đơn 1-8/2026) với ảnh chụp app PayPay: khớp tuyệt đối cả 8.
//
// Cột 調整額 là chỗ PayPay trả lại tiền hoàn, và nó GẮN VÀO MỘT DÒNG KHÔNG LIÊN QUAN,
// có khi xẻ nhỏ ra nhiều dòng. Bỏ quên cột này là bẫy đã sập một lần trong lúc điều
// tra: lọc theo 当月支払金額 rồi cộng, ra số đúng ở 5/8 kỳ và sai ở 3 kỳ còn lại.
//
// Thuần, không phụ thuộc React, để unit-test được.

import { parseCsvText } from '../import/csvImport'
import { cardBillingRange, type CardBillingRange } from './cardMonthCharge'

/** Bố cục cột đã xác minh trên 13 file thật (2025-08 → 2026-08). */
const COL = { date: 0, name: 1, billed: 8, adjust: 10, dueDate: 11 } as const
/** Dòng tiêu đề phải chứa đủ hai mẩu này thì mới nhận là sao kê PayPay. */
const NEEDLES = ['利用日/キャンセル日', '決済方法']

export interface StatementLine {
  /** ISO. Dòng không có ngày (再計算) nhận closeISO của kỳ. */
  iso: string
  /** minor units. Âm = dòng 調整額 hoặc khoản hoàn. */
  amount: number
  name: string
  /** true = dòng ảo dựng từ cột 調整額, không phải một lần quẹt. */
  isAdjustment: boolean
}

export interface ParsedStatement {
  range: CardBillingRange
  dueDateFromFile: string
  total: number
  lines: StatementLine[]
  dueDateMismatch: boolean
}

/** Quy chữ rộng (ＡＢＣ) về chữ hẹp, bỏ trắng, hạ thường — sao kê Nhật trộn hai bề rộng. */
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
const num = (s: string) => Number(String(s ?? '').replace(/[,\s]/g, '')) || 0

const toISO = (s: string): string | null => {
  const m = String(s ?? '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/**
 * `null` khi: không phải file PayPay, file rỗng, hoặc thẻ chưa khai đủ ngày chốt +
 * ngày trả (không dựng được kỳ ⇒ không biết hoá đơn này thuộc về đâu).
 */
export function parsePaypayStatement(
  text: string,
  card: { statementDay: number | null; paymentDueDay: number | null },
): ParsedStatement | null {
  const rows = parseCsvText(text)
  const header = rows[0]
  if (!header) return null
  const joined = header.map(norm).join('|')
  if (!NEEDLES.every((n) => joined.includes(norm(n)))) return null

  const data = rows.slice(1)
  const dueRaw = data.map((r) => toISO(r[COL.dueDate] ?? '')).find((d) => d != null)
  if (!dueRaw) return null

  // CHỈ lấy năm + tháng của 当月お支払日, rồi để cardBillingRange dựng kỳ từ cài đặt của
  // chính thẻ. KHÔNG đưa thẳng ngày này cho statementCloseFor: nó là ngày ĐÃ DỜI cuối
  // tuần (27/6/2026 rơi CN nên file ghi 29/6), còn statementCloseFor đòi ngày CHƯA dời.
  const [y, m] = dueRaw.split('-').map(Number)
  const range = cardBillingRange({
    monthKey: { year: y, month: m },
    statementDay: card.statementDay,
    paymentDueDay: card.paymentDueDay,
  })
  if (!range) return null

  const lines: StatementLine[] = []
  for (const r of data) {
    // Dòng CÓ THU = cột 当月支払金額 không rỗng. Tương đương dấu '*' ở cột 利用者
    // (`本人*`) — đúng 100% trên 13 file — nhưng cột số là bằng chứng, dấu sao là
    // quy ước hiển thị.
    const billedRaw = r[COL.billed] ?? ''
    const iso = toISO(r[COL.date] ?? '') ?? range.closeISO
    const name = (r[COL.name] ?? '').trim()
    if (billedRaw !== '') lines.push({ iso, amount: num(billedRaw), name, isAdjustment: false })
    const adj = num(r[COL.adjust] ?? '')
    if (adj !== 0)
      lines.push({ iso, amount: adj, name: `調整額 · ${name}`, isAdjustment: true })
  }

  return {
    range,
    dueDateFromFile: dueRaw,
    total: lines.reduce((a, l) => a + l.amount, 0),
    lines,
    // Lệch ⇒ ngày chốt / ngày trả khai trong app không khớp thực tế của thẻ. Nói ra,
    // đừng lưu im lặng: sai mốc là mọi kỳ về sau đều xếp nhầm chỗ.
    dueDateMismatch: range.dueISO !== dueRaw,
  }
}
```

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `npx vitest run src/features/assets/paypayStatement.test.ts`
Expected: PASS (7 test)

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/paypayStatement.ts src/features/assets/paypayStatement.test.ts
git commit -m "feat(the): doc file sao ke PayPay thanh hoa don mot ky"
```

---

### Task 4: Ghép dòng sao kê với sổ

**Files:**
- Create: `src/features/assets/statementReconcile.ts`
- Test: `src/features/assets/statementReconcile.test.ts`

**Interfaces:**
- Consumes: `StatementLine` (Task 3), `CARD_RECONCILE_NOTE` (`./reconcile`), `BalanceTxLike` (`src/lib/cardBalance`)
- Produces:
  ```ts
  export interface LedgerTx {
    id: string
    occurred_on: string
    amount: number
    type: 'expense' | 'income' | 'transfer'
    is_refund: boolean
    to_account_id: string | null
    note: string | null
  }
  export type ExplainedCause = 'refund-shifted' | 'wallet-topup' | 'date-edge' | 'recalculated'
  export interface ReconcileResult {
    matchedCount: number
    /** Có trong sổ, không có trên sao kê — chưa giải thích được. */
    extraInLedger: { tx: LedgerTx; amount: number }[]
    /** Có trên sao kê, không có trong sổ — chưa giải thích được. */
    missingFromLedger: StatementLine[]
    /** Đã nhận ra nguyên nhân cấu trúc — không cần người dùng làm gì. */
    explained: { cause: ExplainedCause; label: string; amount: number }[]
  }
  export function reconcileStatement(
    lines: StatementLine[],
    ledger: LedgerTx[],
    cardId: string,
    neighbours: { lines: StatementLine[] }[],
  ): ReconcileResult
  ```
  Dùng bởi Task 6

- [ ] **Step 1: Viết test thất bại**

Tạo `src/features/assets/statementReconcile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { reconcileStatement, type LedgerTx } from './statementReconcile'
import type { StatementLine } from './paypayStatement'
import { CARD_RECONCILE_NOTE } from './reconcile'

const CARD = 'card-1'
const line = (iso: string, amount: number, name = 'X', isAdjustment = false): StatementLine => ({
  iso, amount, name, isAdjustment,
})
const tx = (iso: string, amount: number, p: Partial<LedgerTx> = {}): LedgerTx => ({
  id: `t-${iso}-${amount}`,
  occurred_on: iso,
  amount,
  type: 'expense',
  is_refund: false,
  to_account_id: null,
  note: null,
  ...p,
})

describe('reconcileStatement', () => {
  it('ghep duoc thi khong ai vao danh sach lech', () => {
    const r = reconcileStatement([line('2026-06-02', 4950)], [tx('2026-06-02', 4950)], CARD, [])
    expect(r.matchedCount).toBe(1)
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.missingFromLedger).toHaveLength(0)
  })

  it('lech ngay trong 4 ngay van ghep', () => {
    const r = reconcileStatement([line('2026-06-07', 2200)], [tx('2026-06-06', 2200)], CARD, [])
    expect(r.matchedCount).toBe(1)
  })

  it('moi dong chi ghep mot lan — so co 4 lan 4950, the co 3', () => {
    const lines = [line('2026-06-02', 4950), line('2026-06-08', 4950), line('2026-06-16', 4950)]
    const led = [
      tx('2026-06-02', 4950), tx('2026-06-08', 4950),
      tx('2026-06-14', 4950), tx('2026-06-16', 4950),
    ]
    const r = reconcileStatement(lines, led, CARD, [])
    expect(r.matchedCount).toBe(3)
    expect(r.extraInLedger).toHaveLength(1)
  })

  it('hoan tien trong so mang dau am (is_refund, KHONG phai income)', () => {
    const r = reconcileStatement(
      [line('2026-03-06', -539, '調整額 · ChargeSPOT', true)],
      [tx('2026-03-27', 539, { is_refund: true })],
      CARD, [],
    )
    expect(r.matchedCount).toBe(1)
  })

  it('loai tra no the va khoan Dieu chinh so no khoi ro so', () => {
    const led = [
      tx('2026-06-05', 50000, { type: 'transfer', to_account_id: CARD }),
      tx('2026-06-06', 92158, { note: CARD_RECONCILE_NOTE }),
    ]
    const r = reconcileStatement([], led, CARD, [])
    expect(r.extraInLedger).toHaveLength(0)
  })

  it('nhan ra hoan tien lech ky: khop mot 調整額 o ky lien ke', () => {
    const r = reconcileStatement(
      [], [tx('2026-02-03', 961, { is_refund: true })], CARD,
      [{ lines: [line('2026-01-03', -961, '調整額 · 極楽茶屋', true)] }],
    )
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.explained.map((e) => e.cause)).toEqual(['refund-shifted'])
  })

  it('nhan ra nap vi PayPay', () => {
    const r = reconcileStatement([line('2026-01-08', 4000, 'チャージ')], [], CARD, [])
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.explained.map((e) => e.cause)).toEqual(['wallet-topup'])
  })

  it('nhan ra lech ranh gioi ngay: khop mot dong the o ky lien ke', () => {
    const r = reconcileStatement(
      [], [tx('2026-06-30', 5060)], CARD,
      [{ lines: [line('2026-07-03', 5060, 'ユニクロオンラインストア')] }],
    )
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.explained.map((e) => e.cause)).toEqual(['date-edge'])
  })

  it('nhan ra dong 再計算', () => {
    const r = reconcileStatement([line('2026-05-31', 3476, 'ＴＥＭＵ（再計算）')], [], CARD, [])
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.explained.map((e) => e.cause)).toEqual(['recalculated'])
  })
})
```

- [ ] **Step 2: Chạy test cho chắc là đỏ**

Run: `npx vitest run src/features/assets/statementReconcile.test.ts`
Expected: FAIL — không tìm thấy module `./statementReconcile`

- [ ] **Step 3: Viết module**

Tạo `src/features/assets/statementReconcile.ts`:

```ts
// Ghép từng dòng sao kê với từng giao dịch trong sổ, rồi chia phần lệch làm hai:
// thứ NGƯỜI DÙNG cần xem, và thứ giải thích được bằng khác biệt cấu trúc.
//
// Vì sao phải chia: đo trên 8 kỳ PayPay, ~200 dòng, chỉ 4 dòng là ghi sai thật. Nếu
// đổ hết phần lệch vào một danh sách thì 4 dòng đáng sửa nằm lẫn giữa hàng chục dòng
// vô hại, và người đọc bỏ qua cả cụm.
//
// Thuần, không phụ thuộc React, để unit-test được.

import type { StatementLine } from './paypayStatement'
import { CARD_RECONCILE_NOTE } from './reconcile'

export interface LedgerTx {
  id: string
  occurred_on: string
  amount: number
  type: 'expense' | 'income' | 'transfer'
  is_refund: boolean
  to_account_id: string | null
  note: string | null
}

export type ExplainedCause = 'refund-shifted' | 'wallet-topup' | 'date-edge' | 'recalculated'

export interface ReconcileResult {
  matchedCount: number
  extraInLedger: { tx: LedgerTx; amount: number }[]
  missingFromLedger: StatementLine[]
  explained: { cause: ExplainedCause; label: string; amount: number }[]
}

const MATCH_WINDOW_DAYS = 4
const dayGap = (a: string, b: string) =>
  Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000))

/**
 * Dấu của một dòng sổ theo cách repo ghi tiền: hoàn tiền là `expense` + `is_refund`,
 * KHÔNG phải `income` (xem `aggregate.ts: expenseSign`). Đọc nhầm chỗ này là mọi khoản
 * hoàn đảo dấu và không dòng nào ghép được.
 */
const signedAmount = (t: LedgerTx) => (t.is_refund ? -t.amount : t.amount)

/**
 * Rổ sổ dùng để đối chiếu, loại đúng những gì `cardMonthCharge` loại — hai chỗ phải nói
 * cùng một kiểu, kẻo panel báo lệch mà bảng đối chiếu bảo khớp.
 */
const inScope = (t: LedgerTx, cardId: string) =>
  !(t.type === 'transfer' && t.to_account_id === cardId) && t.note !== CARD_RECONCILE_NOTE

const nfkc = (s: string) => s.normalize('NFKC')
const isTopUp = (l: StatementLine) => nfkc(l.name).includes('チャージ')
const isRecalculated = (l: StatementLine) => nfkc(l.name).includes('(再計算)')

export function reconcileStatement(
  lines: StatementLine[],
  ledger: LedgerTx[],
  cardId: string,
  neighbours: { lines: StatementLine[] }[],
): ReconcileResult {
  const stmt = lines.map((l) => ({ l, used: false }))
  const led = ledger
    .filter((t) => inScope(t, cardId))
    .map((t) => ({ t, amount: signedAmount(t), used: false }))

  // Vòng 1: ghép theo số tiền, ưu tiên lệch ngày ít nhất trong cửa sổ.
  for (const a of led) {
    let best: { s: (typeof stmt)[number]; gap: number } | null = null
    for (const s of stmt) {
      if (s.used || s.l.amount !== a.amount) continue
      const gap = dayGap(a.t.occurred_on, s.l.iso)
      if (gap > MATCH_WINDOW_DAYS) continue
      if (!best || gap < best.gap) best = { s, gap }
    }
    if (best) {
      best.s.used = true
      a.used = true
    }
  }
  // Vòng 2: bỏ giới hạn ngày, vẫn trong cùng kỳ. Sao kê hay dời ngày vài hôm.
  for (const a of led) {
    if (a.used) continue
    const s = stmt.find((s) => !s.used && s.l.amount === a.amount)
    if (s) {
      s.used = true
      a.used = true
    }
  }

  const matchedCount = stmt.filter((s) => s.used).length
  const explained: ReconcileResult['explained'] = []
  const extraInLedger: ReconcileResult['extraInLedger'] = []
  const missingFromLedger: StatementLine[] = []

  // Dòng của các kỳ LIỀN KỀ, để nhận ra hai nguyên nhân "lệch một kỳ". Đây là lý do
  // màn nạp cho chọn nhiều file cùng lúc: một file lẻ không đủ dữ kiện.
  const near = neighbours.flatMap((n) => n.lines.map((l) => ({ l, used: false })))

  for (const a of led) {
    if (a.used) continue
    // Hoàn tiền sổ ghi ở kỳ này, nhà thẻ cấn qua 調整額 ở kỳ liền kề.
    const adj = near.find((n) => !n.used && n.l.isAdjustment && n.l.amount === a.amount)
    if (adj) {
      adj.used = true
      explained.push({ cause: 'refund-shifted', label: `Hoàn tiền nhà thẻ cấn ở kỳ khác`, amount: a.amount })
      continue
    }
    // Cùng một lần mua, hai bên ghi hai ngày, rơi hai kỳ.
    const edge = near.find((n) => !n.used && !n.l.isAdjustment && n.l.amount === a.amount)
    if (edge) {
      edge.used = true
      explained.push({ cause: 'date-edge', label: `${edge.l.name} — thẻ ghi ${edge.l.iso}`, amount: a.amount })
      continue
    }
    extraInLedger.push({ tx: a.t, amount: a.amount })
  }

  for (const s of stmt) {
    if (s.used) continue
    if (isTopUp(s.l)) {
      explained.push({ cause: 'wallet-topup', label: 'Nạp ví PayPay bằng thẻ', amount: s.l.amount })
      continue
    }
    if (isRecalculated(s.l)) {
      explained.push({ cause: 'recalculated', label: `${s.l.name} — nhà thẻ tính lại`, amount: s.l.amount })
      continue
    }
    missingFromLedger.push(s.l)
  }

  return { matchedCount, extraInLedger, missingFromLedger, explained }
}
```

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `npx vitest run src/features/assets/statementReconcile.test.ts`
Expected: PASS (9 test)

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/statementReconcile.ts src/features/assets/statementReconcile.test.ts
git commit -m "feat(the): ghep dong sao ke voi so, tach phan giai thich duoc"
```

---

### Task 5: Panel thẻ hiện số hoá đơn thật

**Files:**
- Modify: `src/features/assets/AccountDetailPage.tsx` (thêm hook + 2 dòng panel; khối panel bắt đầu `:770`, tổng "Quẹt" ở `:772-787`)
- Test: `src/features/assets/billForRange.test.ts` (mới — logic chọn hoá đơn tách ra khỏi JSX)
- Create: `src/features/assets/billForRange.ts`

**Interfaces:**
- Consumes: `CardBillRow` (Task 1), `useCardBills` (Task 2), `CardBillingRange` (`./cardMonthCharge`)
- Produces: `billForRange(bills: CardBillRow[], accountId: string, range: CardBillingRange | null): CardBillRow | null`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/features/assets/billForRange.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { billForRange } from './billForRange'
import type { CardBillRow } from '../../types/database.types'

const bill = (account_id: string, close_date: string, total: number): CardBillRow => ({
  id: `${account_id}-${close_date}`,
  user_id: 'u',
  account_id,
  close_date,
  due_date: '2026-07-27',
  total,
  created_at: '',
})
const range = (closeISO: string) => ({ start: '', end: '', closeISO, dueISO: '' })

describe('billForRange', () => {
  it('tra dung hoa don cua ky dang xem', () => {
    const bills = [bill('c1', '2026-05-31', 104380), bill('c1', '2026-06-30', 158429)]
    expect(billForRange(bills, 'c1', range('2026-06-30'))!.total).toBe(158429)
  })

  it('khong lay nham hoa don cua the khac', () => {
    const bills = [bill('c2', '2026-06-30', 999)]
    expect(billForRange(bills, 'c1', range('2026-06-30'))).toBeNull()
  })

  it('ky chua nap sao ke tra null', () => {
    expect(billForRange([bill('c1', '2026-05-31', 1)], 'c1', range('2026-06-30'))).toBeNull()
  })

  it('the chua khai ngay chot (range null) tra null', () => {
    expect(billForRange([bill('c1', '2026-06-30', 1)], 'c1', null)).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test cho chắc là đỏ**

Run: `npx vitest run src/features/assets/billForRange.test.ts`
Expected: FAIL — không tìm thấy module `./billForRange`

- [ ] **Step 3: Viết module**

Tạo `src/features/assets/billForRange.ts`:

```ts
// Chọn hoá đơn ứng với kỳ đang xem trên panel thẻ.
//
// Tách khỏi JSX vì đây là chỗ dễ sai lặng lẽ: lấy nhầm hoá đơn của thẻ khác, hoặc của
// kỳ liền kề, đều ra một con số trông rất hợp lý bên cạnh chữ "Hoá đơn PayPay".

import type { CardBillRow } from '../../types/database.types'
import type { CardBillingRange } from './cardMonthCharge'

/** `null` = kỳ này chưa nạp sao kê ⇒ panel giữ nguyên như cũ, KHÔNG bịa số. */
export function billForRange(
  bills: CardBillRow[],
  accountId: string,
  range: Pick<CardBillingRange, 'closeISO'> | null,
): CardBillRow | null {
  if (!range) return null
  return (
    bills.find((b) => b.account_id === accountId && b.close_date === range.closeISO) ?? null
  )
}
```

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `npx vitest run src/features/assets/billForRange.test.ts`
Expected: PASS (4 test)

- [ ] **Step 5: Nối vào panel**

Trong `src/features/assets/AccountDetailPage.tsx`:

Thêm import (cạnh các import `./` sẵn có):
```ts
import { billForRange } from './billForRange'
```
và thêm `useCardBills` vào khối import từ `'../../hooks/queries'` đã có.

Sau `const carried = carriedDebt({...})` (`:290`):

```ts
  // Hoá đơn NHÀ THẺ đòi cho kỳ đang xem. Khác `monthCharged` (app tự cộng từ sổ) vì
  // lý do cấu trúc, không phải vì ai ghi sai — xem spec 2026-09-10 §2.
  const { data: cardBills = [] } = useCardBills()
  const bill = isCard ? billForRange(cardBills, accountId, billing) : null
  const billGap = bill ? monthCharged - bill.total : null
```

Ngay TRƯỚC dòng `<div className="flex items-center justify-between gap-2 text-sm">` mở khối "Quẹt" (`:772`), chèn:

```tsx
          {bill && (
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-border-subtle pb-2 text-sm">
              <span className="text-fg-muted">Hoá đơn nhà thẻ</span>
              <Money
                amount={bill.total}
                currency={currency}
                tone={bill.total > 0 ? 'out' : 'neutral'}
                className="text-base font-bold"
              />
            </div>
          )}
```

Ngay SAU khối "Quẹt" (đóng ở `:788`), chèn:

```tsx
          {billGap != null && billGap !== 0 && (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
              <span className="text-fg-muted">Lệch so với hoá đơn</span>
              <Money
                amount={Math.abs(billGap)}
                currency={currency}
                tone={billGap > 0 ? 'out' : 'in'}
                showSign
                className="font-medium"
              />
            </div>
          )}
```

- [ ] **Step 6: Kiểm kiểu + guardrail giao diện**

Run: `npx tsc -b && npx vitest run tests/designSystem.test.ts`
Expected: PASS. `designSystem.test.ts` bắt giá trị tuỳ ý; mọi class trên đều là token sẵn có (`border-border-subtle`, `text-fg-muted`, `text-base`).

- [ ] **Step 7: Kiểm bằng mắt trên app thật**

`npm test` KHÔNG thấy ba thứ: chế độ Sáng, cỡ chữ 1,25× ở 375px, và biểu thức JSX bị biến thành chuỗi. Phải mở app.

Mở app ở chế độ demo, vào một thẻ, xác nhận: kỳ chưa có hoá đơn thì panel y như cũ; kỳ có hoá đơn thì hiện đủ ba dòng và **không dòng nào in ra `{bill.total}` dạng chữ**.

- [ ] **Step 8: Commit**

```bash
git add src/features/assets/billForRange.ts src/features/assets/billForRange.test.ts src/features/assets/AccountDetailPage.tsx
git commit -m "feat(the): panel hien hoa don nha the doi va phan lech"
```

---

### Task 6: Màn nạp sao kê

**Files:**
- Create: `src/features/assets/ImportStatementSheet.tsx`
- Modify: `src/features/assets/AccountDetailPage.tsx` (nút mở sheet cạnh "Chỉnh cho khớp" `:858`; state `showImportStatement`)

**Interfaces:**
- Consumes: `parsePaypayStatement` + `ParsedStatement` (Task 3), `reconcileStatement` + `LedgerTx` (Task 4), `useUpsertCardBills` (Task 2), `useSearchTransactions` (`src/hooks/queries`)
- Produces: `<ImportStatementSheet card={...} open={...} onClose={...} />`

- [ ] **Step 1: Tách phần ghép kỳ liền kề ra module thuần**

Việc chọn "kỳ liền kề" là logic, không phải giao diện — và nó là chỗ sai lặng lẽ nhất
(ghép nhầm kỳ thì bốn luật "giải thích được" nhận nhầm hoặc bỏ sót). Tạo
`src/features/assets/statementNeighbours.ts`:

```ts
// Xếp các bản sao kê vừa nạp theo thứ tự kỳ, và với mỗi bản chỉ ra kỳ liền trước +
// liền sau TRONG CHÍNH TẬP VỪA NẠP.
//
// Hai trong bốn luật của `reconcileStatement` (hoàn tiền lệch kỳ, lệch ranh giới ngày)
// cần dòng của kỳ bên cạnh. Nạp một file lẻ thì hai luật đó im lặng không chạy, và
// phần lệch hợp lệ bị báo thành "cần bạn xem" — đó là lý do màn nạp cho chọn nhiều file.

import type { ParsedStatement } from './paypayStatement'

export interface StatementWithNeighbours {
  parsed: ParsedStatement
  neighbours: { lines: ParsedStatement['lines'] }[]
}

/** Sắp theo `closeISO` tăng dần rồi gắn hàng xóm hai bên. */
export function withNeighbours(parsed: ParsedStatement[]): StatementWithNeighbours[] {
  const sorted = [...parsed].sort((a, b) => a.range.closeISO.localeCompare(b.range.closeISO))
  return sorted.map((p, i) => ({
    parsed: p,
    neighbours: [sorted[i - 1], sorted[i + 1]]
      .filter((n): n is ParsedStatement => n != null)
      .map((n) => ({ lines: n.lines })),
  }))
}
```

Test `src/features/assets/statementNeighbours.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { withNeighbours } from './statementNeighbours'
import type { ParsedStatement } from './paypayStatement'

const st = (closeISO: string): ParsedStatement => ({
  range: { start: '', end: '', closeISO, dueISO: '' },
  dueDateFromFile: '',
  total: 0,
  lines: [{ iso: closeISO, amount: 1, name: closeISO, isAdjustment: false }],
  dueDateMismatch: false,
})

describe('withNeighbours', () => {
  it('sap theo ky va gan hai hang xom', () => {
    const out = withNeighbours([st('2026-06-30'), st('2026-04-30'), st('2026-05-31')])
    expect(out.map((o) => o.parsed.range.closeISO)).toEqual([
      '2026-04-30', '2026-05-31', '2026-06-30',
    ])
    expect(out[1].neighbours.map((n) => n.lines[0].name)).toEqual(['2026-04-30', '2026-06-30'])
  })

  it('ky dau va ky cuoi chi co mot hang xom', () => {
    const out = withNeighbours([st('2026-05-31'), st('2026-06-30')])
    expect(out[0].neighbours).toHaveLength(1)
    expect(out[1].neighbours).toHaveLength(1)
  })

  it('mot file le thi khong co hang xom nao', () => {
    expect(withNeighbours([st('2026-06-30')])[0].neighbours).toEqual([])
  })
})
```

Run: `npx vitest run src/features/assets/statementNeighbours.test.ts` — đỏ trước, xanh sau.

- [ ] **Step 2: Viết sheet**

Tạo `src/features/assets/ImportStatementSheet.tsx`. Theo khuôn `CardMonthAdjustSheet.tsx`
và `ReconcileSheet.tsx` trong cùng thư mục (cùng component `<Sheet>`, cùng cách đóng/mở).

```tsx
// Nạp file sao kê của nhà thẻ, đối chiếu từng dòng với sổ, rồi lưu TỔNG hoá đơn.
//
// KHÔNG tạo/sửa/xoá giao dịch nào. Đó là khác biệt cố ý với nút "Chỉnh cho khớp": nút
// kia đẻ một khoản bù làm số khớp ngay, và chôn luôn những dòng ghi sai bên dưới nó.
// Màn này chỉ ra chỗ sai và để người dùng quyết.

import { useState } from 'react'
import { FileUp } from 'lucide-react'
import { Money } from '../../components/ui/Money'
import { Num } from '../../components/ui/Num'
import { ActionButton } from '../../components/ui/ActionButton'
import { SectionTitle } from '../../components/ui/SectionTitle'
import { Sheet } from '../../components/ui/Sheet'
import { useUpsertCardBills } from '../../hooks/queries'
import type { CurrencyCode } from '../../lib/money'
import { parsePaypayStatement, type ParsedStatement } from './paypayStatement'
import { withNeighbours } from './statementNeighbours'
import { reconcileStatement, type LedgerTx, type ReconcileResult } from './statementReconcile'
import type { TransactionRow } from '../../types/database.types'

export interface ImportStatementSheetProps {
  open: boolean
  onClose: () => void
  card: { id: string; currency: CurrencyCode; statementDay: number | null; paymentDueDay: number | null }
  /** Giao dịch của thẻ, đủ rộng để phủ mọi kỳ sẽ nạp. Nơi gọi đã có sẵn rổ này. */
  txs: TransactionRow[]
}

/** `TransactionRow` → `LedgerTx`: chỉ những trường phép ghép cần, không hơn. */
const toLedgerTx = (t: TransactionRow): LedgerTx => ({
  id: t.id,
  occurred_on: t.occurred_on,
  amount: t.amount,
  type: t.type as LedgerTx['type'],
  is_refund: t.is_refund ?? false,
  to_account_id: t.to_account_id,
  note: t.note,
})

interface Reviewed {
  parsed: ParsedStatement
  result: ReconcileResult
}

export function ImportStatementSheet({ open, onClose, card, txs }: ImportStatementSheetProps) {
  const [reviewed, setReviewed] = useState<Reviewed[]>([])
  const [unreadable, setUnreadable] = useState<string[]>([])
  const upsert = useUpsertCardBills()

  async function onPick(files: FileList | null) {
    if (!files) return
    const parsed: ParsedStatement[] = []
    const bad: string[] = []
    for (const f of Array.from(files)) {
      const p = parsePaypayStatement(await f.text(), card)
      if (p) parsed.push(p)
      else bad.push(f.name)
    }
    setUnreadable(bad)
    setReviewed(
      withNeighbours(parsed).map(({ parsed: p, neighbours }) => ({
        parsed: p,
        result: reconcileStatement(
          p.lines,
          txs
            .filter((t) => t.occurred_on >= p.range.start && t.occurred_on < p.range.end)
            .map(toLedgerTx),
          card.id,
          neighbours,
        ),
      })),
    )
  }

  // Ngày chốt / ngày trả khai sai thì MỌI kỳ xếp nhầm chỗ — chặn lưu, đừng lưu một nửa.
  const blocked = reviewed.some((r) => r.parsed.dueDateMismatch)

  function onSave() {
    upsert.mutate(
      reviewed.map((r) => ({
        account_id: card.id,
        close_date: r.parsed.range.closeISO,
        due_date: r.parsed.range.dueISO,
        total: r.parsed.total,
      })),
      { onSuccess: onClose },
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nạp sao kê">
      {/* `multiple` là BẮT BUỘC: hai luật "giải thích được" cần dòng của kỳ liền kề. */}
      <input type="file" accept=".csv" multiple onChange={(e) => void onPick(e.target.files)} />

      {unreadable.length > 0 && (
        <p className="mt-2 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
          Không đọc được: {unreadable.join(', ')}. File phải là sao kê PayPay tải từ app.
        </p>
      )}

      {reviewed.map(({ parsed, result }) => (
        <section key={parsed.range.closeISO} className="mt-3">
          <SectionTitle>
            Quẹt {parsed.range.start} – {parsed.range.closeISO}
          </SectionTitle>

          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-fg-muted">Hoá đơn nhà thẻ</span>
            <Money amount={parsed.total} currency={card.currency} tone="out" className="font-bold" />
          </div>

          {parsed.dueDateMismatch && (
            <p className="mt-1.5 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
              Ngày chốt / ngày trả khai trong app không khớp file (file ghi{' '}
              {parsed.dueDateFromFile}, app tính {parsed.range.dueISO}). Sửa tài khoản trước khi lưu.
            </p>
          )}

          <p className="mt-1.5 text-sm text-fg-muted">
            Khớp <Num value={result.matchedCount} /> dòng
          </p>

          {(result.extraInLedger.length > 0 || result.missingFromLedger.length > 0) && (
            <>
              <p className="mt-2 text-sm font-medium">Cần bạn xem</p>
              {result.extraInLedger.map(({ tx, amount }) => (
                <div key={tx.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-fg-muted">
                    {tx.occurred_on} · {tx.note || 'không ghi chú'} — sổ có, thẻ không
                  </span>
                  <Money amount={Math.abs(amount)} currency={card.currency} tone="out" />
                </div>
              ))}
              {result.missingFromLedger.map((l, i) => (
                <div key={`${l.iso}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-fg-muted">
                    {l.iso} · {l.name} — thẻ có, sổ không
                  </span>
                  <Money amount={Math.abs(l.amount)} currency={card.currency} tone="out" />
                </div>
              ))}
            </>
          )}

          {result.explained.length > 0 && (
            <details className="mt-2">
              <summary className="text-sm text-fg-muted">
                Giải thích được, bỏ qua (<Num value={result.explained.length} /> dòng)
              </summary>
              {result.explained.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-fg-muted">{e.label}</span>
                  <Money amount={Math.abs(e.amount)} currency={card.currency} tone="neutral" />
                </div>
              ))}
            </details>
          )}
        </section>
      ))}

      {reviewed.length > 0 && (
        <ActionButton onClick={onSave} disabled={blocked || upsert.isPending} className="mt-3">
          <FileUp className="h-3.5 w-3.5" /> Lưu <Num value={reviewed.length} /> kỳ
        </ActionButton>
      )}
    </Sheet>
  )
}
```

**Nếu tên component thật khác** (`<Sheet>`, `<Num>`, `<SectionTitle>`, `<ActionButton>`
prop `disabled`): mở `CardMonthAdjustSheet.tsx` và dùng đúng tên/props ở đó. Đừng tự chế
component mới — `tests/designSystem.test.ts` sẽ chặn.

- [ ] **Step 3: Nối nút vào panel**

Trong `AccountDetailPage.tsx`, đổi khối nút ở `:857-859` thành hai nút cạnh nhau:

```tsx
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton onClick={() => setShowImportStatement(true)}>
              <FileUp className="h-3.5 w-3.5" /> Nạp sao kê
            </ActionButton>
            <ActionButton onClick={() => setShowMonthAdjust(true)}>
              <Scale className="h-3.5 w-3.5" /> Chỉnh cho khớp
            </ActionButton>
          </div>
```

Thêm `FileUp` vào import từ `lucide-react`, thêm `const [showImportStatement, setShowImportStatement] = useState(false)` cạnh `showMonthAdjust`, và render `<ImportStatementSheet>` cạnh `<CardMonthAdjustSheet>`.

- [ ] **Step 4: Kiểm kiểu + guardrail**

Run: `npx tsc -b && npm test`
Expected: PASS

- [ ] **Step 5: Kiểm trên app thật bằng file thật**

Mở app, vào thẻ `Credit Paypay`, nạp cả 13 file trong `~/Downloads/credit/Paypay/`. Xác nhận đúng các số đã đo:

| Kỳ | Hoá đơn phải ra | "Cần bạn xem" phải nêu |
|---|---:|---|
| 1月 | 56.990 | (không dòng nào) |
| 4月 | 122.613 | (không dòng nào) |
| 6月 | 104.380 | 3.300 ngày 23/05 |
| 7月 | 158.429 | 23.000 (10/06), 23.000 (27/06), 4.950 (16/06) |
| 8月 | 191.925 | (không dòng nào) |

Kỳ 7月 phải xếp dòng 5.060 "Quần áo" vào nhóm **giải thích được** (lệch ranh giới ngày), KHÔNG phải nhóm cần xem.

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/statementNeighbours.ts src/features/assets/statementNeighbours.test.ts src/features/assets/ImportStatementSheet.tsx src/features/assets/AccountDetailPage.tsx
git commit -m "feat(the): man nap sao ke va doi chieu tung dong"
```

---

### Task 7: Sao lưu và dọn cuối

**Files:**
- Modify: `src/data/backupImport.ts` (kiểm tra `cardBills` trỏ tới tài khoản có thật, cạnh khối `accountValuations` `:194`)
- Test: `src/data/backupImport.test.ts`

**Interfaces:**
- Consumes: `BackupData.cardBills` (Task 2)

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/data/backupImport.test.ts`:

```ts
it('bat hoa don the tro toi tai khoan khong co trong file', () => {
  const data = baseBackup()
  data.cardBills = [
    { id: 'b1', user_id: 'u', account_id: 'khong-ton-tai', close_date: '2026-06-30',
      due_date: '2026-07-27', total: 158429, created_at: '' },
  ]
  const problems = validateBackup(data)
  expect(problems.some((p) => p.includes('Hoá đơn thẻ'))).toBe(true)
})
```

(`baseBackup()` / `validateBackup` — dùng đúng helper mà các test khác trong file đang dùng; nếu tên khác thì theo tên có sẵn.)

- [ ] **Step 2: Chạy test cho chắc là đỏ**

Run: `npx vitest run src/data/backupImport.test.ts -t "hoa don the"`
Expected: FAIL

- [ ] **Step 3: Thêm kiểm tra**

Trong `src/data/backupImport.ts`, sau khối `accountValuations` (`:198`):

```ts
  const billKey = uniques('hoá đơn thẻ (thẻ × ngày chốt)')
  for (const b of data.cardBills ?? []) {
    if (!accountIds.has(b.account_id))
      p.add('Hoá đơn thẻ trỏ tới tài khoản không có trong file', b.account_id)
    billKey(`${b.account_id}|${b.close_date}`, b.close_date)
  }
```

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `npx vitest run src/data/backupImport.test.ts`
Expected: PASS

- [ ] **Step 5: Xác nhận toàn bộ**

Run: `npx tsc -b && npm test && npx oxlint`
Expected: PASS cả ba.

Chạy `detect_changes()` và xác nhận **chỉ** các symbol của kế hoạch này đổi — cây làm việc có phiên Claude khác, phải phân biệt được phần nào của mình.

- [ ] **Step 6: Commit**

```bash
git add src/data/backupImport.ts src/data/backupImport.test.ts
git commit -m "feat(the): sao luu kiem tra hoa don the"
```

---

## Sau khi xong code

Bốn dòng ghi sai đã tìm ra (spec §10) **không** do code này sửa — app chỉ ra, người dùng quyết:

| Kỳ | Ngày | Số tiền | Ghi chú trong sổ |
|---|---|---:|---|
| 7月 | 10/06 | 23.000 | *(trống)* |
| 7月 | 27/06 | 23.000 | Tiền ks |
| 7月 | 16/06 | 4.950 | *(trống)* |
| 6月 | 23/05 | 3.300 | *(trống)* |

Hỏi user từng khoản: tiêu thật bằng cách khác (đổi tài khoản của giao dịch), hay ghi trùng (xoá).
