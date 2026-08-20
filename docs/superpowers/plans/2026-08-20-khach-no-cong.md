# Khách nợ công — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghi được "khách nợ tôi tiền công" — một khoản `owed_to_me` không có đồng nào rời ví, và khi khách trả thì số tiền đó vào đúng Thu của tháng, đúng danh mục.

**Architecture:** Hai cột nullable trên `debts` (`origin`, `income_category_id`) mang ý nghĩa mới; một chip thứ tư ở "Tiền vào" (`kind: 'owed'`, `writes: 'debtOnly'`) là cửa vào; và hai hàm thuần — `debtPaymentPosting` (lần trả ghi vào sổ thế nào) và `matchOpenDebt` (được cộng dồn vào khoản nào) — là chỗ duy nhất chứa quyết định, để cả hai cửa ghi (màn Nhập, `DebtPaymentSheet`) và cả hai repo (Supabase, demo) không cửa nào phải tự nhớ.

**Tech Stack:** React 19 · TypeScript · Tailwind v4 · TanStack Query · Vitest · Supabase (Postgres + RLS)

**Spec:** `docs/superpowers/specs/2026-08-20-khach-no-cong-design.md`

## Global Constraints

- **Không có hạ tầng test component** (0 file `*.test.tsx`, không jsdom). Chốt cấu trúc đi qua test ĐỌC FILE, và test đọc file phải ở `tests/` — `tsconfig.app.json` chỉ khai `types: ["vite/client"]` nên `node:fs` trong `src/` làm `tsc -b` đỏ ngay dòng import.
- **Mỗi test mới phải invert-check**: sửa code cho sai rồi chạy lại, thấy đỏ, mới hoàn nguyên. Test xanh mà không invert-check là test chưa biết nó canh cái gì.
- **`src/types/database.types.ts` viết TAY.** Schema đổi thì sửa file này CÙNG COMMIT với migration.
- **Hai repo, không phải một**: `src/data/supabaseRepo.ts` và `src/data/demoRepo.ts` đều hiện thực `Repo`. Đổi hành vi ghi ở một cái mà quên cái kia là bản demo và bản thật nói hai chuyện khác nhau.
- **§4.6 — không shadow**: viền tiêu điểm/trạng thái dùng `outline` (kèm `-outline-offset-2` nếu ô trải hết bề rộng khối cuộn), KHÔNG dùng `ring-*`.
- **Cỡ chữ theo `rem`**, không `px` cứng — `--app-font-scale` (0.9 / 1 / 1.1 / 1.25) chỉ co giãn được `rem`.
- **Chữ tiếng Việt có dấu** trong UI và chú thích code; **commit message không dấu** (theo `git log` của repo), tiền tố `feat(nhap):` / `fix(nhap):` / `feat(no):`.
- **Chú thích nói VÌ SAO**, không nói lại code. Ba chỗ trong plan này là bẫy im lặng (không có câu báo, `tsc` không bắt) — chú thích ở đó phải nói ra cái bẫy.
- Kết mỗi commit: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Chạy đủ ba cửa trước khi commit: `npx tsc -b --noEmit`, `npm run lint` (0 error; 20 warning có sẵn là chấp nhận được), `npx vitest run`.

---

## File Structure

| File | Trách nhiệm | Task |
| --- | --- | --- |
| `supabase/migrations/0049_debt_origin.sql` | Hai cột + ba ràng buộc | 1 |
| `src/types/database.types.ts` | `DebtOrigin`, `DebtRow.origin`, `DebtRow.income_category_id` | 1 |
| `src/data/repo.ts` | `NewDebt.origin`, `NewDebt.income_category_id` | 1 |
| `src/data/demoRepo.ts` | Lưu hai cột mới; posting của lần trả | 1, 2 |
| `src/data/supabaseRepo.ts` | Posting của lần trả (đọc khoản nợ) | 2 |
| `src/features/debts/debtPaymentPosting.ts` | **Hàm thuần**: lần trả ghi cờ/danh mục nào | 2 |
| `src/features/transactions/matchOpenDebt.ts` | **Hàm thuần**: được cộng dồn vào khoản nợ nào | 3 |
| `src/features/transactions/entryShape.ts` | Dạng `owed` + hai switch theo kind | 4 |
| `src/features/transactions/entryValidation.ts` | Cổng Lưu thứ nhất | 5 |
| `src/features/transactions/roleSave.ts` | Ghi `origin`/`income_category_id`; dùng matcher chung | 3, 6 |
| `src/features/transactions/TransactionForm.tsx` | Cổng Lưu thứ hai, ẩn hàng ví/ngày, ô loại tiền riêng | 7 |
| `src/features/transactions/EntryPage.tsx` | Truyền `kind` xuống `saveDebtEntry` | 6 |
| `src/features/debts/DebtsPage.tsx` | Nhãn thẻ tổng + chip "tiền công" | 8 |

---

### Task 1: Migration 0049 + hai cột chạy được qua cả hai repo

**Files:**
- Create: `supabase/migrations/0049_debt_origin.sql`
- Modify: `src/types/database.types.ts` (khối `DebtRow`)
- Modify: `src/data/repo.ts:288-306` (`NewDebt`)
- Modify: `src/data/demoRepo.ts:2125-2160` (`createDebt`)
- Test: `src/data/demoRepo.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `type DebtOrigin = 'lent' | 'earned'`; `DebtRow.origin: DebtOrigin | null`; `DebtRow.income_category_id: string | null`; `NewDebt.origin?: DebtOrigin | null`; `NewDebt.income_category_id?: string | null`

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/0049_debt_origin.sql`:

```sql
-- ============================================================
-- Sổ Chi Tiêu — Migration 0049: debts.origin + debts.income_category_id
--
-- VÌ SAO CẦN HAI CỘT NÀY
-- "Khách nợ tôi tiền công" là một khoản owed_to_me KHÔNG có đồng nào rời ví. Ghi được
-- khoản đó thì tầng dữ liệu đã làm được (createDebt nhận `transaction` là tuỳ chọn),
-- nhưng LÚC KHÁCH TRẢ thì sai: createDebtPayment đóng cứng is_debt_flow = true, mà cờ
-- đó bị loại khỏi MỌI báo cáo Chi/Thu.
--   · Tiền cho vay: đúng — tiền vốn của mình, ra rồi về, không phải chi/thu thật.
--   · Tiền công:    sai — lúc khách trả là thu nhập thật lần đầu vào tài sản. Ghi như
--                   nợ thường thì số dư ví tăng mà "Thu" của tháng vẫn 0.
--
-- NULLABLE có chủ ý, và KHÔNG backfill.
-- null = "chưa ai nói", và lúc đó app chạy y như hôm nay. Mọi khoản nợ đang có không
-- đổi một con số nào. Cùng lối với categories.kind (0046) và accounts.is_liquid (0047).
--
-- KHÔNG suy origin từ `disbursement_transaction_id IS NULL`. Phép suy đó sai một ca có
-- thật: cho vay tiền mặt từ trước, giờ mới ghi vào app — không có giao dịch giải ngân,
-- mà vẫn là tiền cho vay. Suy như vậy thì lần người ta trả lại bị đếm thành thu nhập.
-- ============================================================

alter table public.debts
  add column if not exists origin text,
  add column if not exists income_category_id uuid;

-- drop-then-add (đúng lối 0023): `add constraint` không có `if not exists`, nên chạy
-- lại migration mà không drop trước là lỗi "already exists".
alter table public.debts
  drop constraint if exists debts_origin_check,
  drop constraint if exists debts_earned_needs_income_category,
  drop constraint if exists debts_earned_is_receivable,
  drop constraint if exists debts_income_category_fk;

alter table public.debts
  add constraint debts_origin_check
    check (origin is null or origin in ('lent', 'earned')),
  -- 'earned' mà thiếu danh mục thu thì lúc khách trả không biết ghi vào đâu — hàng đó
  -- không dùng được. Cùng tinh thần với planned_done_needs_tx (0038).
  add constraint debts_earned_needs_income_category
    check (origin is distinct from 'earned' or income_category_id is not null),
  -- Không ai "làm ra" một khoản MÌNH nợ.
  add constraint debts_earned_is_receivable
    check (origin is distinct from 'earned' or direction = 'owed_to_me'),
  add constraint debts_income_category_fk
    foreign key (income_category_id, user_id) references public.categories (id, user_id);

comment on column public.debts.origin is
  '''earned'' = người ta nợ vì mình đã làm việc (tiền công) → lần trả ghi thành THU '
  'thật, không mang cờ is_debt_flow. ''lent'' = đã xác nhận là tiền mình đưa ra. '
  'null = chưa ai nói → chạy như ''lent''. Chỉ đặt lúc TẠO, không cho sửa.';

comment on column public.debts.income_category_id is
  'Danh mục THU cho mọi lần trả của khoản origin = ''earned''. Chọn một lần lúc ghi nợ '
  'nên khách trả ba lần cũng vào cùng một chỗ.';
```

- [ ] **Step 2: Thêm type viết tay**

Trong `src/types/database.types.ts`, cạnh `DebtDirection`:

```ts
/**
 * Khoản nợ này từ đâu ra (migration 0049). Nó KHÔNG phải nhãn trang trí: nhánh
 * 'earned' làm lần trả được ghi thành THU thật thay vì dòng tiền nợ.
 * null = chưa ai nói → xử như 'lent' (hành vi trước 0049).
 */
export type DebtOrigin = 'lent' | 'earned'
```

Và trong `DebtRow`, ngay dưới `direction`:

```ts
  origin: DebtOrigin | null
  /** Danh mục THU cho mọi lần trả khi origin = 'earned'. */
  income_category_id: string | null
```

- [ ] **Step 3: Mở `NewDebt`**

Trong `src/data/repo.ts`, thêm vào `interface NewDebt` (sau `note`):

```ts
  /** Chỉ dạng `owed` truyền 'earned'; mọi đường khác bỏ trống = null (xem 0049). */
  origin?: DebtOrigin | null
  /** Bắt buộc khi origin = 'earned' — ràng buộc DB chặn hàng thiếu nó. */
  income_category_id?: string | null
```

Thêm `DebtOrigin` vào import type từ `../types/database.types`.

- [ ] **Step 4: Viết test đỏ cho demoRepo**

Thêm vào `src/data/demoRepo.test.ts`:

```ts
describe('debts.origin + income_category_id (0049)', () => {
  it('createDebt luu duoc origin earned kem danh muc thu', async () => {
    const cat = await demoRepo.createCategory({
      name: 'Làm thêm', type: 'income', icon: '💵', parent_id: null,
    })
    const debt = await demoRepo.createDebt({
      counterparty: 'Khách A',
      direction: 'owed_to_me',
      currency: 'JPY',
      principal: 30_000,
      due_on: null,
      note: '',
      origin: 'earned',
      income_category_id: cat.id,
      transaction: null,
    })
    expect(debt.origin).toBe('earned')
    expect(debt.income_category_id).toBe(cat.id)
    // Khong co dong nao roi vi: khong sinh giao dich giai ngan nao.
    expect(debt.disbursement_transaction_id).toBeNull()
  })

  it('khong truyen gi thi hai cot la null — duong cu khong doi', async () => {
    const debt = await demoRepo.createDebt({
      counterparty: 'Anh Hai',
      direction: 'owed_to_me',
      currency: 'JPY',
      principal: 50_000,
      due_on: null,
      note: '',
      transaction: null,
    })
    expect(debt.origin).toBeNull()
    expect(debt.income_category_id).toBeNull()
  })
})
```

- [ ] **Step 5: Chạy test, phải ĐỎ**

Run: `npx vitest run src/data/demoRepo.test.ts`
Expected: FAIL — `debt.origin` là `undefined` (demoRepo chưa ghi cột) và/hoặc `tsc` đỏ ở `origin:` vì `NewDebt` chưa có trường đó.

- [ ] **Step 6: Sửa demoRepo.createDebt**

Trong `src/data/demoRepo.ts`, khối `const row: DebtRow = {` (~2144), thêm cạnh `interest_bps`:

```ts
      // Đọc THẲNG từng trường như interest_bps, không dựa vào `...debtFields`: NewDebt
      // khai hai cột này là tuỳ chọn, nên vắng mặt thì bản ghi thiếu hẳn khóa —
      // localStorage giữ nguyên `undefined` và mọi chỗ đọc `origin` sau này so sánh với
      // undefined thay vì null.
      origin: input.origin ?? null,
      income_category_id: input.income_category_id ?? null,
```

- [ ] **Step 7: Chạy lại, phải XANH**

Run: `npx vitest run src/data/demoRepo.test.ts` → PASS
Run: `npx tsc -b --noEmit` → sạch

- [ ] **Step 8: Invert-check**

Đổi `input.origin ?? null` thành `null`, chạy lại: test thứ nhất phải đỏ. Hoàn nguyên.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0049_debt_origin.sql src/types/database.types.ts src/data/repo.ts src/data/demoRepo.ts src/data/demoRepo.test.ts
git commit -m "feat(no): 0049 — debts.origin + income_category_id"
```

**Lưu ý cho người thực thi:** ba ràng buộc DB KHÔNG test được ở đây (bộ test không có Postgres). Chúng là lưới an toàn tầng cuối; lưới tầng ứng dụng là cổng Lưu ở Task 5.

---

### Task 2: `debtPaymentPosting` — lần trả ghi vào sổ thế nào

**Files:**
- Create: `src/features/debts/debtPaymentPosting.ts`
- Create: `src/features/debts/debtPaymentPosting.test.ts`
- Modify: `src/data/supabaseRepo.ts` (`createDebtPayment`)
- Modify: `src/data/demoRepo.ts:2189-2220` (`createDebtPayment`)
- Test: `src/data/demoRepo.test.ts`

**Interfaces:**
- Consumes: `DebtOrigin`, `DebtRow` (Task 1)
- Produces: `debtPaymentPosting(debt: Pick<DebtRow, 'origin' | 'income_category_id'> | null | undefined, proposedCategoryId: string | null): { isDebtFlow: boolean; categoryId: string | null }`

- [ ] **Step 1: Viết test đỏ cho hàm thuần**

Tạo `src/features/debts/debtPaymentPosting.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { debtPaymentPosting } from './debtPaymentPosting'

describe('debtPaymentPosting', () => {
  it('origin earned → THU that: khong co co no, danh muc lay tu khoan no', () => {
    const got = debtPaymentPosting({ origin: 'earned', income_category_id: 'cat-lam-them' }, 'cat-no')
    expect(got).toEqual({ isDebtFlow: false, categoryId: 'cat-lam-them' })
  })

  it('danh muc cua khoan no DE danh muc nguoi goi dung san', () => {
    // Khach tra ba lan tu hai cua khac nhau van vao cung mot danh muc.
    const got = debtPaymentPosting({ origin: 'earned', income_category_id: 'cat-lam-them' }, 'cat-khac')
    expect(got.categoryId).toBe('cat-lam-them')
  })

  it('origin lent → y nhu truoc 0049', () => {
    expect(debtPaymentPosting({ origin: 'lent', income_category_id: null }, 'cat-no')).toEqual({
      isDebtFlow: true, categoryId: 'cat-no',
    })
  })

  it('origin null (moi khoan no cu) → y nhu truoc 0049', () => {
    expect(debtPaymentPosting({ origin: null, income_category_id: null }, 'cat-no')).toEqual({
      isDebtFlow: true, categoryId: 'cat-no',
    })
  })

  it('khong tim thay khoan no → duong cu, KHONG doan la thu that', () => {
    // Doan sai chieu nay chi lam sai mot bao cao; doan sai chieu kia lam mot khoan tien
    // cho vay hien ra thanh thu nhap.
    expect(debtPaymentPosting(null, 'cat-no')).toEqual({ isDebtFlow: true, categoryId: 'cat-no' })
    expect(debtPaymentPosting(undefined, null)).toEqual({ isDebtFlow: true, categoryId: null })
  })
})
```

- [ ] **Step 2: Chạy, phải ĐỎ**

Run: `npx vitest run src/features/debts/debtPaymentPosting.test.ts`
Expected: FAIL — không import được `./debtPaymentPosting`.

- [ ] **Step 3: Viết hàm**

Tạo `src/features/debts/debtPaymentPosting.ts`:

```ts
import type { DebtRow } from '../../types/database.types'

/** Cách ghi sổ của MỘT lần trả nợ. */
export interface DebtPaymentPosting {
  /** true = dòng tiền nợ, bị loại khỏi mọi báo cáo Chi/Thu. */
  isDebtFlow: boolean
  categoryId: string | null
}

/**
 * Lần trả này ghi vào sổ thế nào — ĐỌC `origin` của khoản nợ, không đoán.
 *
 * Đây là chỗ DUY NHẤT của repo quyết định việc đó, và nó nằm dưới cả hai cửa ghi (màn
 * Nhập → "Người trả lại", và DebtPaymentSheet ở trang Nợ) cùng cả hai repo (Supabase,
 * demo). Để quyết định này ở tầng gọi thì mỗi cửa mới phải tự nhớ, và cửa nào quên thì
 * tiền công của người dùng lặng lẽ không vào Thu.
 *
 * `proposedCategoryId` là danh mục người gọi đã dựng sẵn trong `input.transaction` —
 * hôm nay là danh mục tự gán của dòng tiền nợ (DEBT_FLOW_CATEGORY_NAMES).
 *
 * Không tìm thấy khoản nợ → đi đường cũ. Hai chiều đoán sai KHÔNG ngang giá nhau: đoán
 * "nợ thường" thì tệ nhất là một khoản thu bị thiếu và người dùng sửa tay được; đoán
 * "thu thật" thì một khoản tiền cho vay quay về tự hiện ra thành thu nhập.
 */
export function debtPaymentPosting(
  debt: Pick<DebtRow, 'origin' | 'income_category_id'> | null | undefined,
  proposedCategoryId: string | null,
): DebtPaymentPosting {
  if (debt?.origin === 'earned')
    return { isDebtFlow: false, categoryId: debt.income_category_id }
  return { isDebtFlow: true, categoryId: proposedCategoryId }
}
```

- [ ] **Step 4: Chạy, phải XANH**

Run: `npx vitest run src/features/debts/debtPaymentPosting.test.ts` → PASS (5 test)

- [ ] **Step 5: Nối vào demoRepo**

Trong `src/data/demoRepo.ts`, `createDebtPayment` (~2189), thay khối `if (input.transaction)`:

```ts
    let transaction_id: string | null = null
    if (input.transaction) {
      // Cách ghi đọc từ KHOẢN NỢ, không từ người gọi — xem debtPaymentPosting.
      const debt = (db.debts ?? []).find((d) => d.id === input.debt_id)
      const post = debtPaymentPosting(debt, input.transaction.category_id)
      const tx: TransactionRow = {
        ...input.transaction,
        category_id: post.categoryId,
        is_debt_flow: post.isDebtFlow,
        id: uuid(),
        user_id: DEMO_USER,
        recurring_rule_id: null,
        created_at: nowISO(),
        updated_at: nowISO(),
      }
      db.transactions.push(tx)
      transaction_id = tx.id
    }
```

Thêm import: `import { debtPaymentPosting } from '../features/debts/debtPaymentPosting'`

- [ ] **Step 6: Nối vào supabaseRepo**

Trong `src/data/supabaseRepo.ts`, `createDebtPayment`, thay khối `if (input.transaction)`:

```ts
    let transaction_id: string | null = null
    if (input.transaction) {
      // Đọc khoản nợ trước khi ghi: cách ghi của lần trả này là thuộc tính của KHOẢN NỢ
      // (origin), không phải của người gọi. Một truy vấn thêm, đổi lấy việc không cửa
      // nào phải tự nhớ — xem debtPaymentPosting.
      const { data: debt, error: eDebt } = await sb
        .from('debts')
        .select('origin, income_category_id')
        .eq('id', input.debt_id)
        .single()
      if (eDebt) throw eDebt
      const cols = txColumns(input.transaction)
      const post = debtPaymentPosting(debt, cols.category_id ?? null)
      const { data: tx, error: eTx } = await sb
        .from('transactions')
        .insert({ ...cols, user_id, category_id: post.categoryId, is_debt_flow: post.isDebtFlow })
        .select()
        .single()
      if (eTx) throw eTx
      transaction_id = tx.id
    }
```

Thêm import `debtPaymentPosting`.

- [ ] **Step 7: Test đầu-cuối trên demoRepo**

Thêm vào `src/data/demoRepo.test.ts`:

```ts
describe('khach tra tien cong → THU that (0049)', () => {
  it('lan tra cua khoan earned khong mang co no, va vao danh muc cua khoan no', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const catThu = await demoRepo.createCategory({
      name: 'Làm thêm', type: 'income', icon: '💵', parent_id: null,
    })
    const debt = await demoRepo.createDebt({
      counterparty: 'Khách A', direction: 'owed_to_me', currency: 'JPY',
      principal: 30_000, due_on: null, note: '',
      origin: 'earned', income_category_id: catThu.id, transaction: null,
    })
    await demoRepo.createDebtPayment({
      debt_id: debt.id, amount: 10_000, paid_on: '2026-08-20', note: '',
      transaction: {
        type: 'income', amount: 10_000, to_amount: null,
        category_id: 'cat-tu-gan-cua-dong-tien-no',
        account_id: acc.id, to_account_id: null,
        occurred_on: '2026-08-20', note: '', tag_ids: [],
      },
    })
    const txs = await demoRepo.getTransactions()
    const paid = txs.find((t) => t.amount === 10_000)
    expect(paid?.is_debt_flow).toBe(false)
    expect(paid?.category_id).toBe(catThu.id)
  })

  it('lan tra cua khoan no thuong van mang co no — duong cu khong doi', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const debt = await demoRepo.createDebt({
      counterparty: 'Anh Hai', direction: 'owed_to_me', currency: 'JPY',
      principal: 50_000, due_on: null, note: '', transaction: null,
    })
    await demoRepo.createDebtPayment({
      debt_id: debt.id, amount: 20_000, paid_on: '2026-08-20', note: '',
      transaction: {
        type: 'income', amount: 20_000, to_amount: null, category_id: 'cat-no',
        account_id: acc.id, to_account_id: null,
        occurred_on: '2026-08-20', note: '', tag_ids: [],
      },
    })
    const txs = await demoRepo.getTransactions()
    const paid = txs.find((t) => t.amount === 20_000)
    expect(paid?.is_debt_flow).toBe(true)
    expect(paid?.category_id).toBe('cat-no')
  })
})
```

- [ ] **Step 8: Chạy cả hai file, phải XANH**

Run: `npx vitest run src/data/demoRepo.test.ts src/features/debts/debtPaymentPosting.test.ts`
Expected: PASS

- [ ] **Step 9: Invert-check**

Trong `debtPaymentPosting`, đổi `debt?.origin === 'earned'` thành `false`. Chạy lại: phải đỏ ở cả test hàm thuần và test đầu-cuối. Hoàn nguyên.

- [ ] **Step 10: Commit**

```bash
git add src/features/debts/debtPaymentPosting.ts src/features/debts/debtPaymentPosting.test.ts src/data/demoRepo.ts src/data/supabaseRepo.ts src/data/demoRepo.test.ts
git commit -m "feat(no): lan tra cua khoan 'earned' ghi thanh THU that"
```

---

### Task 3: `matchOpenDebt` — chặn chỗ trộn hai loại nợ

**Files:**
- Create: `src/features/transactions/matchOpenDebt.ts`
- Create: `src/features/transactions/matchOpenDebt.test.ts`
- Modify: `src/features/transactions/roleSave.ts:205-212` (trong `saveSplit`) và `:374-381` (trong `saveDebtCore`)

**Interfaces:**
- Consumes: `DebtOrigin` (Task 1)
- Produces: `matchOpenDebt(debts, query): T | null`, với
  `query: { direction: DebtDirection; currency: CurrencyCode; counterparty: string; existingDebtId: string | null; origin: DebtOrigin | null; incomeCategoryId: string | null }`

**Vì sao task này tồn tại:** `roleSave.ts` có HAI vị từ cộng dồn chép tay giống nhau (một trong `saveSplit`, một trong `saveDebtCore`), và cả hai chỉ khớp *chiều + loại tiền + tên*. Dạng mới sẽ bị nhập vào đúng khoản cho vay cũ của cùng một người; khoản đó `origin = null`, nên **mọi lần trả sau đó không vào Thu**. Không có câu báo nào. Sửa một bản chép mà quên bản kia là để nguyên nửa cái bẫy.

- [ ] **Step 1: Viết test đỏ**

Tạo `src/features/transactions/matchOpenDebt.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { DebtRow } from '../../types/database.types'
import { matchOpenDebt } from './matchOpenDebt'

type D = Parameters<typeof matchOpenDebt>[0][number]

const debt = (over: Partial<DebtRow>): D =>
  ({
    id: 'd1', status: 'open', direction: 'owed_to_me', currency: 'JPY',
    counterparty: 'Anh Hai', origin: null, income_category_id: null,
    ...over,
  }) as D

const q = (over = {}) => ({
  direction: 'owed_to_me' as const, currency: 'JPY' as const,
  counterparty: 'Anh Hai', existingDebtId: null,
  origin: null, incomeCategoryId: null,
  ...over,
})

describe('matchOpenDebt', () => {
  it('cung ten + cung chieu + cung tien → gop', () => {
    expect(matchOpenDebt([debt({})], q())?.id).toBe('d1')
  })

  it('KHONG phan biet chu hoa/dau cach o ten', () => {
    expect(matchOpenDebt([debt({ counterparty: '  ANH HAI ' })], q())?.id).toBe('d1')
  })

  it('khac chieu / khac tien / da settled → khong gop', () => {
    expect(matchOpenDebt([debt({ direction: 'i_owe' })], q())).toBeNull()
    expect(matchOpenDebt([debt({ currency: 'VND' })], q())).toBeNull()
    expect(matchOpenDebt([debt({ status: 'settled' })], q())).toBeNull()
  })

  it('KHAC origin → khong gop, du trung ten (bay im lang)', () => {
    // Cho "Anh Hai" vay tien mat (origin null), roi ghi "Anh Hai no tien cong". Gop lai
    // la moi lan Anh Hai tra sau do khong vao Thu — khong co cau bao nao.
    expect(matchOpenDebt([debt({ origin: null })], q({ origin: 'earned', incomeCategoryId: 'c1' }))).toBeNull()
    expect(matchOpenDebt([debt({ origin: 'earned', income_category_id: 'c1' }), ], q())).toBeNull()
  })

  it('cung earned nhung KHAC danh muc thu → khong gop', () => {
    // Gop lai thi phai chon mot trong hai danh muc, tuc mot nua so tien vao sai cho.
    const d = debt({ origin: 'earned', income_category_id: 'c1' })
    expect(matchOpenDebt([d], q({ origin: 'earned', incomeCategoryId: 'c2' }))).toBeNull()
    expect(matchOpenDebt([d], q({ origin: 'earned', incomeCategoryId: 'c1' }))?.id).toBe('d1')
  })

  it('existingDebtId van phai qua cong origin', () => {
    // Chon tay mot khoan khac origin cung khong duoc gop — picker se loc san (Task 7),
    // nhung ham nay khong duoc dua vao viec do.
    const d = debt({ id: 'd9', origin: null })
    expect(matchOpenDebt([d], q({ existingDebtId: 'd9', counterparty: '', origin: 'earned', incomeCategoryId: 'c1' }))).toBeNull()
    expect(matchOpenDebt([d], q({ existingDebtId: 'd9', counterparty: '' }))?.id).toBe('d9')
  })

  it('ten trong va khong chon gi → khong gop bua', () => {
    expect(matchOpenDebt([debt({ counterparty: '' })], q({ counterparty: '' }))).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy, phải ĐỎ**

Run: `npx vitest run src/features/transactions/matchOpenDebt.test.ts`
Expected: FAIL — chưa có module.

- [ ] **Step 3: Viết hàm**

Tạo `src/features/transactions/matchOpenDebt.ts`:

```ts
import type { CurrencyCode } from '../../lib/money'
import type { DebtDirection, DebtOrigin, DebtRow } from '../../types/database.types'

/** Khoản nợ tối thiểu để xét cộng dồn — nhận Pick để test không phải dựng cả hàng. */
type Candidate = Pick<
  DebtRow,
  'id' | 'status' | 'direction' | 'currency' | 'counterparty' | 'origin' | 'income_category_id'
>

export interface OpenDebtQuery {
  direction: DebtDirection
  currency: CurrencyCode
  /** Tên người dùng vừa gõ. '' = không gõ gì. */
  counterparty: string
  /** Người dùng chọn tay một khoản đang mở; null = chỉ khớp theo tên. */
  existingDebtId: string | null
  origin: DebtOrigin | null
  /** Chỉ có nghĩa khi origin = 'earned'. */
  incomeCategoryId: string | null
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Khoản nợ đang mở mà lần ghi này được CỘNG DỒN vào; null = tạo khoản mới.
 *
 * MỘT bản cho cả repo. Trước đây vị từ này được chép tay ở hai chỗ trong roleSave
 * (saveSplit và saveDebtCore) và cả hai chỉ khớp chiều + loại tiền + tên — nên "Anh Hai
 * nợ tiền công" bị nhập vào đúng khoản cho vay cũ của Anh Hai, và vì khoản đó
 * `origin` là null, MỌI lần trả sau đó không vào Thu. Im lặng, không câu báo nào.
 *
 * `origin` phải khớp, và khi là 'earned' thì `income_category_id` cũng phải khớp: gộp
 * hai công việc có danh mục thu khác nhau thì một nửa số tiền vào sai chỗ.
 *
 * Cùng một người CÓ THỂ có hai dòng nợ (tiền cho vay và tiền công) — đó là đúng, hai
 * khoản đó thanh toán theo hai cách khác nhau.
 */
export function matchOpenDebt<T extends Candidate>(
  debts: readonly T[],
  q: OpenDebtQuery,
): T | null {
  const name = q.counterparty.trim()
  return (
    debts.find(
      (d) =>
        d.status === 'open' &&
        d.direction === q.direction &&
        d.currency === q.currency &&
        (d.origin ?? null) === (q.origin ?? null) &&
        (q.origin !== 'earned' || d.income_category_id === q.incomeCategoryId) &&
        (d.id === q.existingDebtId || (!!name && norm(d.counterparty) === norm(name))),
    ) ?? null
  )
}
```

- [ ] **Step 4: Chạy, phải XANH**

Run: `npx vitest run src/features/transactions/matchOpenDebt.test.ts` → PASS (8 test)

- [ ] **Step 5: Thay bản chép trong `saveSplit`**

Trong `src/features/transactions/roleSave.ts`, thay khối `const norm = ...; const target = deps.debts.find(...)` (~205-212) bằng:

```ts
    // Cộng dồn: xem matchOpenDebt (một bản cho cả repo — trước đây vị từ này bị chép
    // tay ở hai chỗ và cả hai bỏ sót `origin`).
    const target = matchOpenDebt(deps.debts, {
      direction: 'owed_to_me',
      currency: base.srcCurrency,
      counterparty,
      existingDebtId: v.existingDebtId,
      // Trả hộ tạo khoản CHO VAY, không phải tiền công.
      origin: null,
      incomeCategoryId: null,
    })
```

- [ ] **Step 6: Thay bản chép trong `saveDebtCore`**

Thay khối tương ứng (~374-381) bằng:

```ts
  const target = matchOpenDebt(deps.debts, {
    direction: v.direction,
    currency: base.srcCurrency,
    counterparty,
    existingDebtId: v.existingDebtId,
    origin,
    incomeCategoryId,
  })
```

(`origin` và `incomeCategoryId` là biến của Task 6; ở task này tạm truyền `null, null` rồi Task 6 nối vào. Nếu thực thi tuần tự thì Task 6 ngay sau đây.)

Thêm import `matchOpenDebt` và xoá hai khai báo `const norm = ...` đã thành mồ côi.

- [ ] **Step 7: Chạy toàn bộ, phải XANH**

Run: `npx vitest run src/features/transactions/roleSave.test.ts src/features/transactions/matchOpenDebt.test.ts`
Expected: PASS — hành vi cũ không đổi (mọi khoản nợ cũ có `origin` null, và cả hai lời gọi đang truyền `origin: null`).

Run: `npx tsc -b --noEmit` → sạch

- [ ] **Step 8: Invert-check**

Xoá dòng `(d.origin ?? null) === (q.origin ?? null)` trong `matchOpenDebt`. Chạy `npx vitest run src/features/transactions/matchOpenDebt.test.ts`: hai test origin phải đỏ. Hoàn nguyên.

- [ ] **Step 9: Commit**

```bash
git add src/features/transactions/matchOpenDebt.ts src/features/transactions/matchOpenDebt.test.ts src/features/transactions/roleSave.ts
git commit -m "refactor(nhap): MOT vi tu cong don, va no xet ca origin"
```

---

### Task 4: Dạng `owed` trong bảng

**Files:**
- Modify: `src/features/transactions/entryShape.ts` (`EntryKind`, `EntryShape['writes']`, `SHAPES`, `ORDER`, `counterpartyLabelOf`, `saveVerbOf`)
- Test: `src/features/transactions/entryShape.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `EntryKind` thêm `'owed'`; `EntryShape['writes']` thêm `'debtOnly'`; `SHAPES.owed`; `counterpartyLabelOf('owed') === 'Ai nợ bạn'`; `saveVerbOf('owed', …) === 'ghi ${money} khách nợ'`

- [ ] **Step 1: Cập nhật test cho bảng 11 dạng**

Trong `src/features/transactions/entryShape.test.ts`:

Thêm vào mảng `B23`, ngay sau dòng `earn`:

```ts
  ['owed',      'in',      'user',         'none',    'Số tiền công'],
```

Đổi ba chỗ đếm:

```ts
describe('bang 11 dang khop spec B23', () => {
  it('co dung 11 dang, khong hon khong kem', () => {
    expect(Object.keys(SHAPES)).toHaveLength(11)
  })
```

```ts
    expect(kindsOf('in')).toEqual(['earn', 'owed', 'collect', 'borrow'])
```

```ts
    expect(new Set(all).size).toBe(11)
```

Và khối `dan xuat ra but toan cu`:

```ts
  it('tam dang di qua createTransaction, hai qua createDebtPayment, mot chi ghi no', () => {
    const tx = Object.values(SHAPES).filter((s) => s.writes === 'transaction')
    const dp = Object.values(SHAPES).filter((s) => s.writes === 'debtPayment')
    const only = Object.values(SHAPES).filter((s) => s.writes === 'debtOnly')
    expect(tx).toHaveLength(8)
    expect(dp.map((s) => s.kind).sort()).toEqual(['collect', 'repay'])
    expect(only.map((s) => s.kind)).toEqual(['owed'])
  })
```

Thêm một khối mới:

```ts
describe('dang "Khach no cong" khong dung toi vi nao', () => {
  it('writes debtOnly, txType null, huong "in"', () => {
    const s = shapeOf('owed')
    expect(s.writes).toBe('debtOnly')
    expect(s.txType).toBeNull()
    expect(s.direction).toBe('in')
  })

  it('co hint noi ra he qua: chua co dong nao vao vi', () => {
    // Chip nam duoi tab "Tien vao" ma khong co tien nao vao vi — cho de nham nhat cua
    // ca man, nen hint la bat buoc, khong phai trang tri.
    expect(shapeOf('owed').hint).toMatch(/chưa|Chưa/)
    expect(chipAriaLabel('owed')).toContain(shapeOf('owed').hint!)
  })

  it('o counterparty co ten rieng — KHONG roi vao default undefined', () => {
    // counterpartyLabelOf co `default: undefined`, va undefined nghia la "dang nay
    // khong co o do". Quen case nay thi o "ai no ban" khong hien, ma tsc khong bao gi.
    expect(counterpartyLabelOf('owed')).toBe('Ai nợ bạn')
  })

  it('nut Luu noi dung viec no sap ghi', () => {
    expect(saveVerbOf('owed', 30_000, 'JPY', 'Làm thêm')).toBe('ghi ¥30,000 khách nợ')
  })
})
```

- [ ] **Step 2: Chạy, phải ĐỎ**

Run: `npx vitest run src/features/transactions/entryShape.test.ts`
Expected: FAIL — `'owed'` không thuộc `EntryKind`, `SHAPES` chỉ có 10 khóa.

- [ ] **Step 3: Sửa bảng**

Trong `src/features/transactions/entryShape.ts`:

`EntryKind` — thêm `'owed'` vào nhóm `in`:

```ts
export type EntryKind =
  | 'spend' | 'split' | 'family' | 'lend' | 'repay'
  | 'earn' | 'owed' | 'collect' | 'borrow'
  | 'between' | 'ownvn'
```

`EntryShape['writes']`:

```ts
  /**
   * `debtPayment` = đi qua createDebtPayment (bọc luôn transaction bên trong).
   * `debtOnly`    = đi qua createDebt và KHÔNG kèm giao dịch nào: không đồng nào rời
   *                 ví, nên dạng đó cũng không có tài khoản để đòi (xem entryGate).
   */
  writes: 'transaction' | 'debtPayment' | 'debtOnly'
```

`SHAPES` — thêm sau `earn`:

```ts
  owed: {
    kind: 'owed', direction: 'in', label: 'Khách nợ công',
    hint: 'Chưa có đồng nào vào ví — chỉ ghi người ta nợ bạn.',
    categoryPicker: 'user', capBase: 'none', amountLabel: 'Số tiền công',
    writes: 'debtOnly', txType: null,
    roleSeed: { role: 'debt', debtDirection: 'owed_to_me' },
  },
```

`ORDER.in`:

```ts
  in: ['earn', 'owed', 'collect', 'borrow'],
```

`counterpartyLabelOf` — thêm case:

```ts
    case 'owed':   return 'Ai nợ bạn'
```

`saveVerbOf` — thêm case (switch này KHÔNG có `default`, nên thiếu case là `tsc` đỏ — đó là lưới an toàn, đừng thêm `default`):

```ts
    case 'owed':    return `ghi ${money} khách nợ`
```

- [ ] **Step 4: Chạy, phải XANH**

Run: `npx vitest run src/features/transactions/entryShape.test.ts` → PASS
Run: `npx tsc -b --noEmit` → sạch (nếu đỏ ở switch nào khác, thêm case ở đó — đó chính là việc `tsc` làm hộ)

- [ ] **Step 5: Chạy cả bộ để thấy chỗ nào còn giả định 10 dạng**

Run: `npx vitest run`
Sửa mọi chỗ đếm còn lại. Không nới lỏng phép so sánh chỉ để cho xanh — nếu một test nói "cả 10 dạng phải X" thì dạng thứ 11 cũng phải X.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/entryShape.ts src/features/transactions/entryShape.test.ts
git commit -m "feat(nhap): dang 'owed' — Khach no cong"
```

---

### Task 5: Cổng Lưu thứ nhất — `entryValidation`

**Files:**
- Modify: `src/features/transactions/entryValidation.ts` (`entryGate`, `kindMissing`)
- Test: `src/features/transactions/entryValidation.test.ts`

**Interfaces:**
- Consumes: `SHAPES.owed` (Task 4)
- Produces: `entryGate` không đòi tài khoản khi `shape.writes === 'debtOnly'`; đòi tên người nợ và danh mục thu

- [ ] **Step 1: Viết test đỏ**

Thêm vào `src/features/transactions/entryValidation.test.ts` (dựng `EntryState` theo đúng helper đã có trong file đó):

```ts
describe('dang "Khach no cong" (owed)', () => {
  it('KHONG doi tai khoan — khong co dong nao roi vi', () => {
    const g = entryGate(state({ kind: 'owed', amount: 30_000, hasAccount: false, hasCategory: true,
      debt: { ...initialDebt(), direction: 'owed_to_me', counterparty: 'Khách A' } }))
    expect(g.canSave).toBe(true)
    expect(g.missing).toBeNull()
  })

  it('van doi so tien, va goi dung ten field', () => {
    const g = entryGate(state({ kind: 'owed', amount: 0, hasAccount: false, hasCategory: true,
      debt: { ...initialDebt(), direction: 'owed_to_me', counterparty: 'Khách A' } }))
    expect(g.missing).toBe('Còn thiếu: Số tiền công.')
  })

  it('doi ten nguoi no — ten la khoa cong don', () => {
    const g = entryGate(state({ kind: 'owed', amount: 30_000, hasAccount: false, hasCategory: true,
      debt: { ...initialDebt(), direction: 'owed_to_me', counterparty: '  ' } }))
    expect(g.missing).toBe('Còn thiếu: tên người nợ (ai nợ bạn).')
  })

  it('doi danh muc thu — rang buoc DB chan hang thieu no', () => {
    const g = entryGate(state({ kind: 'owed', amount: 30_000, hasAccount: false, hasCategory: false,
      debt: { ...initialDebt(), direction: 'owed_to_me', counterparty: 'Khách A' } }))
    expect(g.missing).toBe('Còn thiếu: danh mục thu (khách trả thì tiền vào đâu).')
  })

  it('chin dang con lai VAN doi tai khoan', () => {
    for (const k of ['spend', 'earn', 'lend', 'collect'] as const) {
      expect(entryGate(state({ kind: k, amount: 1_000, hasAccount: false })).missing)
        .toBe('Còn thiếu: tài khoản.')
    }
  })
})
```

- [ ] **Step 2: Chạy, phải ĐỎ**

Run: `npx vitest run src/features/transactions/entryValidation.test.ts`
Expected: FAIL — cả bốn test đầu báo `'Còn thiếu: tài khoản.'`

- [ ] **Step 3: Sửa `entryGate`**

```ts
    // Cổng tài khoản đọc từ BẢNG, không thêm một cờ song song kiểu `plannedMode`: dạng
    // `debtOnly` không ghi giao dịch nào nên không có ví nào để đòi. LƯU Ý: đây là cổng
    // THỨ NHẤT; `handleSubmit` trong TransactionForm còn một cổng nữa
    // (`!plannedMode && !effectiveAccountId`) và sửa một cổng mà quên cổng kia thì nút
    // Lưu sáng lên rồi bấm không có gì xảy ra — im lặng, không câu báo nào.
    if (shape.writes !== 'debtOnly' && !s.hasAccount) return 'Còn thiếu: tài khoản.'
```

- [ ] **Step 4: Sửa `kindMissing`**

Thêm `'owed'` thành nhánh riêng (KHÔNG gộp vào `lend`/`borrow`: dạng này còn đòi danh mục thu, hai dạng kia thì không):

```ts
      case 'owed':
        if (!s.debt.counterparty.trim())
          return 'Còn thiếu: tên người nợ (ai nợ bạn).'
        // Ràng buộc DB `debts_earned_needs_income_category` chặn hàng thiếu danh mục.
        // Chặn ở đây nữa để người dùng thấy câu tiếng Việt thay vì lỗi Postgres.
        if (!s.hasCategory)
          return 'Còn thiếu: danh mục thu (khách trả thì tiền vào đâu).'
        break
```

- [ ] **Step 5: Chạy, phải XANH**

Run: `npx vitest run src/features/transactions/entryValidation.test.ts` → PASS

- [ ] **Step 6: Invert-check**

Đổi `shape.writes !== 'debtOnly'` thành `true`: bốn test đầu phải đỏ. Hoàn nguyên.
Xoá nhánh `case 'owed'`: hai test cuối phải đỏ. Hoàn nguyên.

- [ ] **Step 7: Commit**

```bash
git add src/features/transactions/entryValidation.ts src/features/transactions/entryValidation.test.ts
git commit -m "feat(nhap): cong Luu cua dang 'owed' — khong doi vi, doi ten + danh muc thu"
```

---

### Task 6: `roleSave` ghi `origin` + `income_category_id`

**Files:**
- Modify: `src/features/transactions/roleSave.ts` (`RoleBase`, `saveDebtEntry`, `saveDebtCore`)
- Modify: `src/features/transactions/EntryPage.tsx` (`handleRole`)
- Test: `src/features/transactions/roleSave.test.ts`

**Interfaces:**
- Consumes: `matchOpenDebt` (Task 3), `SHAPES.owed` (Task 4)
- Produces: `saveDebtEntry(kind: EntryKind, base: RoleBase, v: DebtValue, deps: RoleSaveDeps)`; `RoleBase.accountId: string | null`

- [ ] **Step 1: Viết test đỏ**

Thêm vào `src/features/transactions/roleSave.test.ts`:

```ts
describe('dang owed: ghi no KHONG kem dong tien', () => {
  it('createDebt khong co transaction, co origin earned + danh muc thu', async () => {
    const { deps, calls } = makeDeps([])
    await saveDebtEntry(
      'owed',
      { amount: 30_000, accountId: null, categoryId: 'cat-lam-them', srcCurrency: 'JPY',
        occurredOn: '2026-08-20', note: '', tagIds: [] },
      { ...initialDebt(), direction: 'owed_to_me', counterparty: 'Khách A', withTransaction: false },
      deps,
    )
    expect(calls.createTransaction).toHaveLength(0)
    expect(calls.createDebt).toHaveLength(1)
    expect(calls.createDebt[0]).toMatchObject({
      counterparty: 'Khách A',
      direction: 'owed_to_me',
      principal: 30_000,
      origin: 'earned',
      income_category_id: 'cat-lam-them',
      transaction: null,
    })
  })

  it('KHONG gop vao khoan cho vay cu cua cung mot nguoi', async () => {
    // Bay im lang: gop lai thi khoan do origin null, nen moi lan tra sau khong vao Thu.
    const cuChoVay = { id: 'd-cho-vay', status: 'open', direction: 'owed_to_me',
      currency: 'JPY', counterparty: 'Khách A', origin: null, income_category_id: null } as DebtRow
    const { deps, calls } = makeDeps([cuChoVay])
    await saveDebtEntry(
      'owed',
      { amount: 30_000, accountId: null, categoryId: 'cat-lam-them', srcCurrency: 'JPY',
        occurredOn: '2026-08-20', note: '', tagIds: [] },
      { ...initialDebt(), direction: 'owed_to_me', counterparty: 'Khách A', withTransaction: false },
      deps,
    )
    expect(calls.createDebtPayment).toHaveLength(0)
    expect(calls.createDebt).toHaveLength(1)
  })

  it('GOP vao khoan tien cong cu cung danh muc', async () => {
    const cuTienCong = { id: 'd-cong', status: 'open', direction: 'owed_to_me',
      currency: 'JPY', counterparty: 'Khách A', origin: 'earned',
      income_category_id: 'cat-lam-them' } as DebtRow
    const { deps, calls } = makeDeps([cuTienCong])
    await saveDebtEntry(
      'owed',
      { amount: 20_000, accountId: null, categoryId: 'cat-lam-them', srcCurrency: 'JPY',
        occurredOn: '2026-08-20', note: '', tagIds: [] },
      { ...initialDebt(), direction: 'owed_to_me', counterparty: 'Khách A', withTransaction: false },
      deps,
    )
    expect(calls.createDebt).toHaveLength(0)
    // amount am = "no them", va KHONG kem giao dich nao.
    expect(calls.createDebtPayment[0]).toMatchObject({ debt_id: 'd-cong', amount: -20_000, transaction: null })
  })

  it('lend/borrow khong bi dinh: origin de null', async () => {
    const { deps, calls } = makeDeps([])
    await saveDebtEntry(
      'lend',
      { amount: 50_000, accountId: 'acc-1', categoryId: null, srcCurrency: 'JPY',
        occurredOn: '2026-08-20', note: '', tagIds: [] },
      { ...initialDebt(), direction: 'owed_to_me', counterparty: 'Anh Hai', withTransaction: true },
      deps,
    )
    expect(calls.createDebt[0].origin ?? null).toBeNull()
    expect(calls.createDebt[0].income_category_id ?? null).toBeNull()
    expect(calls.createTransaction).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Chạy, phải ĐỎ**

Run: `npx vitest run src/features/transactions/roleSave.test.ts`
Expected: FAIL — `saveDebtEntry` chưa nhận `kind`; `accountId: null` không hợp type.

- [ ] **Step 3: Mở `RoleBase.accountId`**

```ts
export interface RoleBase {
  /** minor units theo currency tài khoản nguồn — nghĩa tùy vai trò (tổng/gốc/số gửi). */
  amount: number
  /**
   * null CHỈ ở dạng `debtOnly` (Khách nợ công): dạng đó không ghi bút toán nào nên
   * không có ví nào. Mọi vai trò khác vẫn phải có ví — nhánh nào dùng trường này để
   * dựng giao dịch thì phải tự chặn null trước.
   */
  accountId: string | null
```

- [ ] **Step 4: Sửa `saveDebtEntry` + `saveDebtCore`**

```ts
/**
 * Ghi nợ / cho vay: tạo bản ghi nợ, tùy chọn kèm giải ngân thật.
 * Cho vay (owed_to_me) = chi; Mình nợ (i_owe) = thu. Currency lấy theo `base.srcCurrency`.
 *
 * `kind` vào đây để `origin` đọc được từ BẢNG (`SHAPES[kind].writes`) thay vì thành một
 * field trong `DebtValue` — `DebtValue` là state người dùng sửa, còn origin là hệ quả
 * của dạng đang mở, không phải một lựa chọn.
 */
export async function saveDebtEntry(
  kind: EntryKind,
  base: RoleBase,
  v: DebtValue,
  deps: RoleSaveDeps,
): Promise<void> {
  const debtOnly = SHAPES[kind].writes === 'debtOnly'
  // Phí là phí GIẢI NGÂN. Dạng debtOnly không giải ngân gì nên không có phí nào; gọi
  // createFeeTx với accountId null sẽ dựng một giao dịch không có ví.
  const feeTxId = debtOnly
    ? null
    : await createFeeTx(v.fee, base.accountId!, base.occurredOn,
        v.counterparty.trim() ? `Phí · ${v.counterparty.trim()}` : 'Phí giao dịch', deps)
  try {
    await saveDebtCore(base, v, deps, debtOnly ? 'earned' : null, debtOnly ? base.categoryId : null)
  } catch (e) {
    await undoFeeTx(feeTxId, deps)
    throw e
  }
}

async function saveDebtCore(
  base: RoleBase,
  v: DebtValue,
  deps: RoleSaveDeps,
  origin: DebtOrigin | null,
  incomeCategoryId: string | null,
): Promise<void> {
  const counterparty = v.counterparty.trim()
  const txType = v.direction === 'owed_to_me' ? 'expense' : 'income'
  // `origin === 'earned'` → không bao giờ có bút toán: không có ví, không có giải ngân.
  const withTx = origin !== 'earned' && v.withTransaction
  const categoryId = withTx ? await debtFlowCategoryId('disburse', v.direction, deps) : null
```

Trong thân hàm, thay mọi `v.withTransaction` bằng `withTx`, và truyền `origin` +
`incomeCategoryId` vào cả `matchOpenDebt` (Task 3 Step 6) lẫn `deps.createDebt({...})`:

```ts
    await deps.createDebt({
      counterparty,
      direction: v.direction,
      currency: base.srcCurrency,
      principal: base.amount,
      due_on: v.dueOn || null,
      note: base.note.trim(),
      interest_bps: …,   // giữ nguyên như cũ
      term_months: …,    // giữ nguyên như cũ
      origin,
      income_category_id: incomeCategoryId,
      transaction: …,    // giữ nguyên như cũ (null khi !withTx)
    })
```

Thêm import `SHAPES`, `type EntryKind` từ `./entryShape` và `type DebtOrigin`.

- [ ] **Step 5: Sửa lời gọi ở `EntryPage`**

`src/features/transactions/EntryPage.tsx`, trong `handleRole`:

```ts
    else if (payload.role === 'debt') await saveDebtEntry(payload.kind, payload.base, payload.value, deps)
```

- [ ] **Step 6: Chạy, phải XANH**

Run: `npx vitest run src/features/transactions/roleSave.test.ts` → PASS
Run: `npx tsc -b --noEmit` → sạch (sửa mọi lời gọi `saveDebtEntry` còn thiếu `kind`)

- [ ] **Step 7: Invert-check**

Đổi `debtOnly ? 'earned' : null` thành `null`: test 1 và 3 phải đỏ. Hoàn nguyên.

- [ ] **Step 8: Commit**

```bash
git add src/features/transactions/roleSave.ts src/features/transactions/roleSave.test.ts src/features/transactions/EntryPage.tsx
git commit -m "feat(nhap): roleSave ghi origin='earned' + danh muc thu cho dang owed"
```

---

### Task 7: Màn Nhập — ẩn ví, khoá giải ngân, ô loại tiền riêng

**Files:**
- Modify: `src/features/transactions/TransactionForm.tsx`
- Test: `tests/entryStructure.test.ts`

**Interfaces:**
- Consumes: tất cả Task 4-6
- Produces: (chỉ UI)

- [ ] **Step 1: Viết test cấu trúc đỏ**

Thêm vào `tests/entryStructure.test.ts`:

```ts
describe('dang "Khach no cong" khong dung toi vi nao', () => {
  it('CA HAI cong tai khoan deu mo cho debtOnly', () => {
    // Cong 1 o entryValidation, cong 2 o day. Sua mot cai thi nut Luu sang len roi bam
    // khong co gi xay ra — im lang, khong cau bao nao.
    const v = read('features/transactions/entryValidation.ts')
    expect(v).toMatch(/shape\.writes !== 'debtOnly' && !s\.hasAccount/)
    expect(form).toMatch(/writes === 'debtOnly'[\s\S]{0,120}effectiveAccountId/)
  })

  it('khong ghi LAST_ACCOUNT_KEY khi khong co vi nao', () => {
    // `localStorage.setItem(key, null)` ghi ra chuoi "null", va lan mo man sau se di
    // tim mot vi co id "null".
    const i = form.indexOf('LAST_ACCOUNT_KEY')
    while (form.indexOf('setItem(LAST_ACCOUNT_KEY', i) > 0) break
    for (const m of form.matchAll(/localStorage\.setItem\(LAST_ACCOUNT_KEY, ([^)]+)\)/g))
      expect(m[1]).toMatch(/effectiveAccountId/)
    expect(form).toMatch(/if \(effectiveAccountId\) localStorage\.setItem\(LAST_ACCOUNT_KEY/)
  })

  it('o loai tien rieng, KHONG doc srcCurrency (cai do roi ve JPY dong cung)', () => {
    // srcCurrency = tai khoan dang chon ?? 'JPY'. Dang nay khong co tai khoan, nen doc
    // no la nguoi an tien VND nhan mot khoan no ghi bang JPY ma khong ai noi gi.
    expect(form).toMatch(/owedCurrency/)
    expect(form).toMatch(/const debtCurrency =[\s\S]{0,80}owedCurrency/)
  })

  it('DebtFields hien o ca dang owed', () => {
    expect(form).toMatch(/kind === 'lend' \|\| kind === 'borrow' \|\| kind === 'owed'/)
  })
})
```

- [ ] **Step 2: Chạy, phải ĐỎ**

Run: `npx vitest run tests/entryStructure.test.ts`
Expected: FAIL cả bốn.

- [ ] **Step 3: Cổng thứ hai + `LAST_ACCOUNT_KEY`**

Trong `handleSubmit`:

```ts
    // Hai dạng không ghi bút toán nào nên không đòi ví: "Sẽ chi" (planned) và "Khách nợ
    // công" (`writes === 'debtOnly'`). Chín dạng còn lại vẫn đòi.
    const noAccountNeeded = plannedMode || shape.writes === 'debtOnly'
    if (!canSave || (!noAccountNeeded && !effectiveAccountId)) return
```

Và mọi chỗ `localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId)` thành:

```ts
        // Không có ví thì không ghi: `setItem(key, null)` lưu ra chuỗi "null" và lần mở
        // màn sau đi tìm một ví có id "null".
        if (effectiveAccountId) localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId)
```

- [ ] **Step 4: Ô loại tiền riêng**

Thêm cạnh `srcCurrency` (~474):

```ts
  /**
   * Loại tiền của khoản "Khách nợ công". KHÔNG dùng `srcCurrency` được: cái đó đọc từ
   * ví đang chọn với fallback `?? 'JPY'`, mà dạng này không có ví nào — người làm thêm
   * ăn tiền VND sẽ nhận một khoản nợ ghi bằng JPY và không có gì trên màn nói ra điều
   * đó. Gieo MỘT lần từ ví mặc định rồi không đạp lên lựa chọn của người dùng nữa,
   * đúng lối ô "Ước tính" của "Sẽ chi".
   */
  const [owedCurrency, setOwedCurrency] = useState<CurrencyCode>('JPY')
  const owedCurrencySeeded = useRef(false)
  useEffect(() => {
    if (owedCurrencySeeded.current || activeAccounts.length === 0) return
    owedCurrencySeeded.current = true
    setOwedCurrency(srcCurrency)
  }, [activeAccounts.length, srcCurrency])
  /** Loại tiền của khoản nợ đang ghi — dạng debtOnly có ô riêng, còn lại theo ví. */
  const debtCurrency = shape.writes === 'debtOnly' ? owedCurrency : srcCurrency
```

Dùng `debtCurrency` thay `srcCurrency` ở: `peopleFor(...)` (lọc người đang nợ), prop
`currency` của `DebtFields`, ô số tiền của dạng này, và `base.srcCurrency` lúc submit.

- [ ] **Step 5: Bày `DebtFields` cho dạng `owed`, khoá giải ngân, ẩn hàng ví/ngày**

```tsx
      {(kind === 'lend' || kind === 'borrow' || kind === 'owed') && (
        <DebtFields
          value={debtValue}
          onChange={setDebtVal}
          // Dạng này không bao giờ giải ngân → công tắc "ghi giao dịch thật" và ô Phí
          // biến mất. `canRecordReal` đã là false vì không có ví, nhưng KHÔNG dựa vào
          // đó: nó nói "chưa chọn được ví", còn đây là "dạng này không có việc đó".
          canRecordReal={shape.writes !== 'debtOnly' && canRecordReal}
          people={debtPeople}
          currency={debtCurrency}
          counterpartyLabel={counterpartyLabelOf(kind)}
          …
        />
      )}
```

Hàng "tài khoản + ngày": nới điều kiện ẩn hiện tại (`!plannedMode`) thành
`!plannedMode && shape.writes !== 'debtOnly'`. Ô chọn loại tiền cho dạng này đặt ngay
cạnh ô số tiền, dùng lại đúng markup `<select>` của `PlannedFields` (`w-24 shrink-0`).

Lọc `debtPeople` theo `origin` để picker không mời một khoản mà `matchOpenDebt` sẽ từ
chối gộp:

```ts
  const debtPeople = useMemo<DebtPerson[]>(
    () =>
      enableRoles
        ? peopleFor(debtValue.direction).filter((p) =>
            // Dạng debtOnly chỉ gộp được vào khoản tiền công CÙNG danh mục thu; mời một
            // khoản khác origin là mời người dùng chọn rồi lặng lẽ tạo dòng thứ hai.
            shape.writes === 'debtOnly'
              ? p.origin === 'earned' && p.incomeCategoryId === categoryId
              : (p.origin ?? null) === null,
          )
        : [],
    [enableRoles, peopleFor, debtValue.direction, shape.writes, categoryId],
  )
```

(`DebtPerson` cần thêm hai trường `origin`, `incomeCategoryId` — nguồn là `peopleFor`
ở ~520, nơi đã map từ `allDebts`.)

- [ ] **Step 6: Ép `withTransaction` về false khi vào dạng này**

Trong `useEffect`/handler đổi `kind` (~814-830, chỗ đang `setDebtVal(initialDebt())`):

```ts
      // Vào dạng debtOnly: khoá công tắc giải ngân ngay, không chờ người dùng. roleSave
      // cũng tự chặn (`origin !== 'earned' && v.withTransaction`) — hai lớp, vì state
      // này còn sống qua lần đổi dạng.
      if (nextShape.writes === 'debtOnly')
        setDebtVal((v) => ({ ...v, withTransaction: false, fee: 0 }))
```

- [ ] **Step 7: Chạy, phải XANH**

Run: `npx vitest run tests/entryStructure.test.ts` → PASS
Run: `npx tsc -b --noEmit && npm run lint` → sạch / 0 error
Run: `npx vitest run` → toàn bộ xanh

- [ ] **Step 8: Commit**

```bash
git add src/features/transactions/TransactionForm.tsx tests/entryStructure.test.ts
git commit -m "feat(nhap): man 'Khach no cong' — an vi/ngay, khoa giai ngan, o loai tien rieng"
```

---

### Task 8: Trang Nợ + đo trên máy thật

**Files:**
- Modify: `src/features/debts/DebtsPage.tsx:47-56`
- Test: `tests/entryStructure.test.ts` (hàng chip)

- [ ] **Step 1: Nhãn thẻ tổng + chip "tiền công"**

Thẻ tổng bên phải đang ghi `Cho vay`. Khi có khoản `earned`, con số đó là tổng của hai
thứ khác bản chất (tiền mình đưa ra + tiền công chưa nhận) nên nhãn thành
`Người ta nợ tôi`. Mỗi dòng `origin === 'earned'` mang thêm:

```tsx
{d.origin === 'earned' && (
  <span className="shrink-0 rounded-full bg-state-warn-bg px-2 py-0.5 text-xs font-semibold text-state-warn-fg">
    tiền công
  </span>
)}
```

Chip này KHÔNG phải trang trí: nó là khác biệt làm đổi cách ghi sổ lúc thu tiền, nên
người dùng phải nhìn thấy được.

- [ ] **Step 2: Đo hàng chip "Tiền vào" trên máy thật**

Không đoán. Chạy `preview_start` (`so-chi-tieu-demo`), đặt khung 375×812, vào `/entry`,
bấm tab "Tiền vào", rồi đo:

```js
const row = document.querySelector('[aria-label="Dạng giao dịch"]')
const kids = [...row.children].map(e => e.getBoundingClientRect())
;({ rowW: row.getBoundingClientRect().width,
    tong: kids.reduce((s,r)=>s+r.width,0) + (kids.length-1)*4,
    soDong: new Set(kids.map(r=>Math.round(r.top))).size })
```

`soDong` phải là 1 ở cỡ chữ thường. Nếu 2 thì rút nhãn (`Khách nợ công` →
`Khách nợ`) và đo lại — ghi con số đo được vào commit message. Ở cỡ chữ 1.25 xuống 2
dòng là chấp nhận được (`flex-wrap` giữ nguyên), miễn không tràn ngang.

- [ ] **Step 3: Thử đường đi đầy-đủ trên bản demo**

Trên cùng preview đó: Tiền vào → Khách nợ công → nhập 30.000, tên "Khách A", danh mục
thu → Lưu. Rồi Tiền vào → Người trả lại → chọn khoản đó → 10.000 → Lưu. Kiểm:

```js
JSON.parse(localStorage.getItem('so-chi-tieu-demo')).transactions.slice(-2)
```

Giao dịch của lần trả phải có `is_debt_flow: false` và `category_id` đúng danh mục thu
đã chọn. Không có giao dịch nào sinh ra ở bước ghi nợ.

- [ ] **Step 4: Ba cửa + commit**

Run: `npx tsc -b --noEmit`, `npm run lint`, `npx vitest run` — tất cả sạch.

```bash
git add src/features/debts/DebtsPage.tsx tests/entryStructure.test.ts
git commit -m "feat(no): chip 'tien cong' + nhan 'Nguoi ta no toi'"
```

- [ ] **Step 5: Nhắc người dùng chạy migration**

Migration 0049 phải chạy trên Supabase trước khi bản mới lên production, không thì dạng
mới ghi ra lỗi "column origin does not exist". Báo rõ trong lượt trả lời cuối, kèm
đường chạy (Supabase SQL editor hoặc `supabase db push`).

---

## Self-Review

**Spec coverage:**

| Mục spec | Task |
| --- | --- |
| §3 hai cột + ba ràng buộc, nullable, không backfill | 1 |
| §3 chỉ `owed` ghi `origin`, không cho sửa | 6 (ghi), 1 (không bày ở `DebtEditSheet`) |
| §3 `database.types.ts` viết tay | 1 |
| §4 dòng `SHAPES.owed`, `ORDER.in` | 4 |
| §4 hai switch theo kind | 4 |
| §4 HAI cổng tài khoản + `RoleBase.accountId` nullable | 5, 6, 7 |
| §4 ô loại tiền riêng | 7 |
| §4 `withTransaction` ép false | 6 (roleSave), 7 (state) |
| §5 `debtPaymentPosting`, cả hai cửa + cả hai repo | 2 |
| §5b matcher xét `origin` | 3 |
| §6 báo cáo không sửa gì | — (đúng: không task nào đụng `aggregate.ts`) |
| §7 trang Nợ | 8 |
| §8 kiểm thử | mỗi task tự mang, + đo máy thật ở 8 |
| §9 không lãi/trả góp/phí cho `earned` | 6 (`fee: 0`), 7 (`canRecordReal` false) |

**Không có placeholder.** Mọi bước có code thật hoặc câu lệnh thật.

**Type consistency:** `DebtOrigin` (T1) → `matchOpenDebt` (T3) → `saveDebtCore` (T6);
`debtPaymentPosting(debt, proposedCategoryId)` cùng chữ ký ở T2 Step 3/5/6;
`saveDebtEntry(kind, base, v, deps)` cùng thứ tự tham số ở T6 Step 4/5 và test Step 1;
`writes: 'debtOnly'` cùng một chuỗi ở T4/T5/T6/T7.

**Một chỗ có thứ tự bắt buộc:** Task 3 Step 6 tạm truyền `origin: null` rồi Task 6 nối
biến thật vào. Làm Task 6 ngay sau Task 3; nếu đảo thứ tự thì `tsc` đỏ ở biến chưa khai.
