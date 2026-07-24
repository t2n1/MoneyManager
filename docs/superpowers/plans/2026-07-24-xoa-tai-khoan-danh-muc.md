# Xóa tài khoản & Xóa danh mục — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép xóa hẳn một tài khoản hoặc danh mục, nhưng **chỉ khi nó không còn dữ liệu nào tham chiếu** (giao dịch, định kỳ, ngân sách, mục tiêu, nguồn trả thẻ).

**Architecture:** Thêm `deleteAccount` / `deleteCategory` vào interface `Repo`, hiện thực cho cả `demoRepo` (localStorage) và `supabaseRepo` (Postgres + RLS). Kiểm tra "trống" nằm trong repo (một chỗ dùng chung); nếu không trống thì `throw` một `Error` với thông điệp tiếng Việt. UI thêm nút "Xóa" đỏ trong hộp Sửa, gọi `confirmDialog` rồi bắt lỗi hiển thị bằng `showToast`.

**Tech Stack:** React 19 + TypeScript + TanStack Query + Vitest. Không thêm dependency mới.

## Global Constraints

- Tiền lưu ở minor units (`number`), không dùng float — không liên quan trực tiếp nhưng giữ nguyên khi tạo dữ liệu test.
- Mọi chuỗi hiển thị bằng **tiếng Việt**.
- `verbatimModuleSyntax: true` → import kiểu phải dùng `import type`.
- `noUnusedLocals` / `noUnusedParameters` bật → không để biến/tham số thừa.
- Không xóa kèm dữ liệu người dùng: chỉ xóa khi trống; còn dữ liệu → chặn và gợi ý Lưu trữ.
- Kiểm tra "trống" phải làm ở tầng repo, không ở UI.

---

### Task 1: `deleteAccount` — tầng dữ liệu + test

**Files:**
- Modify: `src/data/repo.ts` (thêm method vào interface `Repo`)
- Modify: `src/data/demoRepo.ts` (hiện thực; đặt ngay sau `reorderAccounts`)
- Modify: `src/data/supabaseRepo.ts` (hiện thực; đặt ngay sau `reorderAccounts`)
- Create: `src/data/demoRepo.test.ts`

**Interfaces:**
- Produces: `Repo.deleteAccount(id: string): Promise<void>` — xóa tài khoản nếu không còn tham chiếu; ngược lại `throw new Error(<thông điệp>)`.

- [ ] **Step 1: Viết test thất bại trước** — tạo `src/data/demoRepo.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { demoRepo, resetDemoData } from './demoRepo'
import type { NewAccount, NewTransaction } from './repo'

// Vitest chạy môi trường node → không có localStorage. Cài bản giả trong bộ nhớ.
beforeEach(() => {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
  resetDemoData()
})

function accountInput(over: Partial<NewAccount> = {}): NewAccount {
  return {
    name: 'TK test',
    type: 'cash',
    currency: 'JPY',
    initial_balance: 0,
    asset_group: null,
    is_hidden: false,
    include_in_totals: true,
    ...over,
  }
}

function expenseTx(accountId: string, categoryId: string): NewTransaction {
  return {
    type: 'expense',
    amount: 100,
    to_amount: null,
    category_id: categoryId,
    account_id: accountId,
    to_account_id: null,
    occurred_on: '2026-07-01',
    note: '',
  }
}

describe('deleteAccount', () => {
  it('xóa được tài khoản trống', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    await demoRepo.deleteAccount(acc.id)
    const list = await demoRepo.getAccounts()
    expect(list.some((a) => a.id === acc.id)).toBe(false)
  })

  it('không xóa khi còn giao dịch', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = await demoRepo.createCategory({ name: 'C', type: 'expense', icon: '📦' })
    await demoRepo.createTransaction(expenseTx(acc.id, cat.id))
    await expect(demoRepo.deleteAccount(acc.id)).rejects.toThrow(/giao dịch/)
    expect((await demoRepo.getAccounts()).some((a) => a.id === acc.id)).toBe(true)
  })

  it('không xóa khi còn mục tiêu tiết kiệm', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    await demoRepo.createSavingsGoal({
      name: 'G',
      account_id: acc.id,
      target_amount: 1000,
      target_date: null,
      note: '',
    })
    await expect(demoRepo.deleteAccount(acc.id)).rejects.toThrow(/mục tiêu/)
  })

  it('không xóa khi đang là nguồn trả cho một thẻ', async () => {
    const bank = await demoRepo.createAccount(accountInput({ name: 'Ngân hàng', type: 'bank' }))
    await demoRepo.createAccount(accountInput({ name: 'Thẻ', type: 'card', payment_account_id: bank.id }))
    await expect(demoRepo.deleteAccount(bank.id)).rejects.toThrow(/thẻ/)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run src/data/demoRepo.test.ts`
Expected: FAIL — `demoRepo.deleteAccount is not a function` (method chưa tồn tại).

- [ ] **Step 3: Thêm method vào interface `Repo`** — trong `src/data/repo.ts`, ngay sau dòng `reorderAccounts(orderedIds: string[]): Promise<void>` (khoảng dòng 235):

```ts
  /** Xóa tài khoản. Chỉ xóa khi không còn giao dịch / định kỳ / mục tiêu /
   *  giá trị đầu tư nào dùng nó, và nó không phải nguồn trả của thẻ nào.
   *  Còn tham chiếu → throw Error với thông điệp tiếng Việt. */
  deleteAccount(id: string): Promise<void>
```

- [ ] **Step 4: Hiện thực trong `demoRepo`** — trong `src/data/demoRepo.ts`, thêm ngay sau `reorderAccounts` (khoảng dòng 554):

```ts
  async deleteAccount(id: string) {
    const db = load()
    if (db.transactions.some((t) => t.account_id === id || t.to_account_id === id))
      throw new Error('Không xóa được: còn giao dịch dùng tài khoản này. Hãy Lưu trữ thay vì Xóa.')
    if ((db.recurringRules ?? []).some((r) => r.account_id === id || r.to_account_id === id))
      throw new Error('Không xóa được: còn giao dịch định kỳ dùng tài khoản này. Hãy Lưu trữ thay vì Xóa.')
    if ((db.savingsGoals ?? []).some((g) => g.account_id === id))
      throw new Error('Không xóa được: còn mục tiêu tiết kiệm gắn với tài khoản này.')
    if (db.accounts.some((a) => a.payment_account_id === id))
      throw new Error('Không xóa được: tài khoản này đang là nguồn trả cho một thẻ tín dụng.')
    if ((db.accountValuations ?? []).some((v) => v.account_id === id))
      throw new Error('Không xóa được: còn dữ liệu giá trị đầu tư của tài khoản này.')
    db.accounts = db.accounts.filter((a) => a.id !== id)
    save(db)
  },
```

- [ ] **Step 5: Hiện thực trong `supabaseRepo`** — trong `src/data/supabaseRepo.ts`, thêm ngay sau `reorderAccounts` (khoảng dòng 233):

```ts
  async deleteAccount(id: string) {
    const sb = getSupabase()
    const tx = await sb
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .or(`account_id.eq.${id},to_account_id.eq.${id}`)
    if (tx.error) throw tx.error
    if ((tx.count ?? 0) > 0)
      throw new Error('Không xóa được: còn giao dịch dùng tài khoản này. Hãy Lưu trữ thay vì Xóa.')

    const rr = await sb
      .from('recurring_rules')
      .select('id', { count: 'exact', head: true })
      .or(`account_id.eq.${id},to_account_id.eq.${id}`)
    if (rr.error) throw rr.error
    if ((rr.count ?? 0) > 0)
      throw new Error('Không xóa được: còn giao dịch định kỳ dùng tài khoản này. Hãy Lưu trữ thay vì Xóa.')

    const sg = await sb
      .from('savings_goals')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', id)
    if (sg.error) throw sg.error
    if ((sg.count ?? 0) > 0)
      throw new Error('Không xóa được: còn mục tiêu tiết kiệm gắn với tài khoản này.')

    const card = await sb
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('payment_account_id', id)
    if (card.error) throw card.error
    if ((card.count ?? 0) > 0)
      throw new Error('Không xóa được: tài khoản này đang là nguồn trả cho một thẻ tín dụng.')

    const val = await sb
      .from('account_valuations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', id)
    if (val.error) throw val.error
    if ((val.count ?? 0) > 0)
      throw new Error('Không xóa được: còn dữ liệu giá trị đầu tư của tài khoản này.')

    const { error } = await sb.from('accounts').delete().eq('id', id)
    if (error) throw error
  },
```

- [ ] **Step 6: Chạy test để xác nhận đạt**

Run: `npx vitest run src/data/demoRepo.test.ts`
Expected: PASS — cả 4 test `deleteAccount`.

- [ ] **Step 7: Kiểm tra build + lint**

Run: `npm run build && npm run lint`
Expected: build không lỗi type (cả demoRepo lẫn supabaseRepo thỏa `Repo`), lint sạch.

- [ ] **Step 8: Commit**

```bash
git add src/data/repo.ts src/data/demoRepo.ts src/data/supabaseRepo.ts src/data/demoRepo.test.ts
git commit -m "feat(xoa): deleteAccount o tang du lieu (chi xoa khi trong)"
```

---

### Task 2: `deleteCategory` — tầng dữ liệu + test

**Files:**
- Modify: `src/data/repo.ts` (thêm method vào interface `Repo`)
- Modify: `src/data/demoRepo.ts` (hiện thực; đặt ngay sau `reorderCategories`)
- Modify: `src/data/supabaseRepo.ts` (hiện thực; đặt ngay sau `reorderCategories`)
- Modify: `src/data/demoRepo.test.ts` (thêm nhóm test `deleteCategory`)

**Interfaces:**
- Consumes: `Repo.deleteAccount` (Task 1) — chỉ để build chung, không gọi trực tiếp.
- Produces: `Repo.deleteCategory(id: string): Promise<void>` — xóa danh mục nếu trống; danh mục cha có con thì xóa cả cha lẫn con khi tất cả đều trống; còn tham chiếu → `throw`.

- [ ] **Step 1: Viết test thất bại trước** — thêm vào cuối `src/data/demoRepo.test.ts` (helper `accountInput`/`expenseTx` đã có ở Task 1):

```ts
describe('deleteCategory', () => {
  it('xóa được danh mục trống', async () => {
    const cat = await demoRepo.createCategory({ name: 'C', type: 'expense', icon: '📦' })
    await demoRepo.deleteCategory(cat.id)
    expect((await demoRepo.getCategories()).some((c) => c.id === cat.id)).toBe(false)
  })

  it('không xóa khi còn giao dịch', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = await demoRepo.createCategory({ name: 'C', type: 'expense', icon: '📦' })
    await demoRepo.createTransaction(expenseTx(acc.id, cat.id))
    await expect(demoRepo.deleteCategory(cat.id)).rejects.toThrow(/giao dịch/)
    expect((await demoRepo.getCategories()).some((c) => c.id === cat.id)).toBe(true)
  })

  it('xóa cha kèm các con trống', async () => {
    const parent = await demoRepo.createCategory({ name: 'P', type: 'expense', icon: '📦' })
    const child = await demoRepo.createCategory({
      name: 'Con',
      type: 'expense',
      icon: '📦',
      parent_id: parent.id,
    })
    await demoRepo.deleteCategory(parent.id)
    const cats = await demoRepo.getCategories()
    expect(cats.some((c) => c.id === parent.id)).toBe(false)
    expect(cats.some((c) => c.id === child.id)).toBe(false)
  })

  it('không xóa cha khi một con còn giao dịch', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const parent = await demoRepo.createCategory({ name: 'P', type: 'expense', icon: '📦' })
    const child = await demoRepo.createCategory({
      name: 'Con',
      type: 'expense',
      icon: '📦',
      parent_id: parent.id,
    })
    await demoRepo.createTransaction(expenseTx(acc.id, child.id))
    await expect(demoRepo.deleteCategory(parent.id)).rejects.toThrow(/giao dịch/)
    const cats = await demoRepo.getCategories()
    expect(cats.some((c) => c.id === parent.id)).toBe(true)
    expect(cats.some((c) => c.id === child.id)).toBe(true)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run src/data/demoRepo.test.ts`
Expected: FAIL — `demoRepo.deleteCategory is not a function`.

- [ ] **Step 3: Thêm method vào interface `Repo`** — trong `src/data/repo.ts`, ngay sau `reorderCategories(orderedIds: string[]): Promise<void>` (khoảng dòng 257):

```ts
  /** Xóa danh mục. Chỉ xóa khi không còn giao dịch / định kỳ / ngân sách nào
   *  dùng nó. Danh mục cha có con: xóa cả cha lẫn con khi TẤT CẢ đều trống;
   *  còn tham chiếu (ở cha hoặc bất kỳ con nào) → throw, không xóa gì. */
  deleteCategory(id: string): Promise<void>
```

- [ ] **Step 4: Hiện thực trong `demoRepo`** — trong `src/data/demoRepo.ts`, thêm ngay sau `reorderCategories` (khoảng dòng 695):

```ts
  async deleteCategory(id: string) {
    const db = load()
    const target = db.categories.find((c) => c.id === id)
    if (!target) throw new Error('Không tìm thấy danh mục')
    // Cha (parent_id null) có con → gom cha + tất cả con để xóa cả nhóm.
    const childIds = target.parent_id
      ? []
      : db.categories.filter((c) => c.parent_id === id).map((c) => c.id)
    const ids = new Set<string>([id, ...childIds])
    if (db.transactions.some((t) => t.category_id != null && ids.has(t.category_id)))
      throw new Error('Không xóa được: còn giao dịch dùng danh mục này. Hãy Lưu trữ thay vì Xóa.')
    if ((db.recurringRules ?? []).some((r) => r.category_id != null && ids.has(r.category_id)))
      throw new Error('Không xóa được: còn giao dịch định kỳ dùng danh mục này. Hãy Lưu trữ thay vì Xóa.')
    if ((db.budgets ?? []).some((b) => ids.has(b.category_id)))
      throw new Error('Không xóa được: còn ngân sách đặt cho danh mục này. Hãy Lưu trữ thay vì Xóa.')
    db.categories = db.categories.filter((c) => !ids.has(c.id))
    save(db)
  },
```

- [ ] **Step 5: Hiện thực trong `supabaseRepo`** — trong `src/data/supabaseRepo.ts`, thêm ngay sau `reorderCategories` (khoảng dòng 363):

```ts
  async deleteCategory(id: string) {
    const sb = getSupabase()
    // Cha có con → gom id cha + con để kiểm tra & xóa cả nhóm (con cascade khi xóa cha).
    const { data: children, error: eCh } = await sb
      .from('categories')
      .select('id')
      .eq('parent_id', id)
    if (eCh) throw eCh
    const ids = [id, ...(children ?? []).map((c) => c.id)]

    const tx = await sb
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .in('category_id', ids)
    if (tx.error) throw tx.error
    if ((tx.count ?? 0) > 0)
      throw new Error('Không xóa được: còn giao dịch dùng danh mục này. Hãy Lưu trữ thay vì Xóa.')

    const rr = await sb
      .from('recurring_rules')
      .select('id', { count: 'exact', head: true })
      .in('category_id', ids)
    if (rr.error) throw rr.error
    if ((rr.count ?? 0) > 0)
      throw new Error('Không xóa được: còn giao dịch định kỳ dùng danh mục này. Hãy Lưu trữ thay vì Xóa.')

    const bg = await sb
      .from('budgets')
      .select('id', { count: 'exact', head: true })
      .in('category_id', ids)
    if (bg.error) throw bg.error
    if ((bg.count ?? 0) > 0)
      throw new Error('Không xóa được: còn ngân sách đặt cho danh mục này. Hãy Lưu trữ thay vì Xóa.')

    // Xóa cha → FK on delete cascade tự xóa con (đã kiểm tra con trống ở trên).
    const { error } = await sb.from('categories').delete().eq('id', id)
    if (error) throw error
  },
```

- [ ] **Step 6: Chạy test để xác nhận đạt**

Run: `npx vitest run src/data/demoRepo.test.ts`
Expected: PASS — toàn bộ test `deleteAccount` + `deleteCategory`.

- [ ] **Step 7: Kiểm tra build + lint**

Run: `npm run build && npm run lint`
Expected: không lỗi.

- [ ] **Step 8: Commit**

```bash
git add src/data/repo.ts src/data/demoRepo.ts src/data/supabaseRepo.ts src/data/demoRepo.test.ts
git commit -m "feat(xoa): deleteCategory o tang du lieu (cha + con trong)"
```

---

### Task 3: Hook `useDeleteAccount` + `useDeleteCategory`

**Files:**
- Modify: `src/hooks/queries.ts`

**Interfaces:**
- Consumes: `repo.deleteAccount`, `repo.deleteCategory` (Task 1, 2); `invalidateAccounts` (đã có trong file).
- Produces: `useDeleteAccount()` và `useDeleteCategory()` — trả về TanStack `useMutation` với `mutateAsync(id: string)`.

- [ ] **Step 1: Thêm `useDeleteAccount`** — trong `src/hooks/queries.ts`, ngay sau `useReorderAccounts` (khoảng dòng 203):

```ts
export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteAccount(id),
    onSettled: () => invalidateAccounts(qc),
  })
}
```

- [ ] **Step 2: Thêm `useDeleteCategory`** — trong `src/hooks/queries.ts`, ngay sau `useReorderCategories` (khoảng dòng 318):

```ts
export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteCategory(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['budgets'] })
    },
  })
}
```

- [ ] **Step 3: Kiểm tra build + lint**

Run: `npm run build && npm run lint`
Expected: không lỗi.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/queries.ts
git commit -m "feat(xoa): hook useDeleteAccount + useDeleteCategory"
```

---

### Task 4: Nút "Xóa" trong hộp Sửa tài khoản

**Files:**
- Modify: `src/features/accounts/AccountsPage.tsx`

**Interfaces:**
- Consumes: `useDeleteAccount` (Task 3); `confirmDialog`, `showToast` từ `../../lib/dialog`.

- [ ] **Step 1: Thêm import** — đầu `src/features/accounts/AccountsPage.tsx`, thêm sau các import hook/dialog hiện có:

```ts
import { confirmDialog, showToast } from '../../lib/dialog'
```

Và bổ sung `useDeleteAccount` vào khối import từ `../../hooks/queries` (cùng chỗ `useCreateAccount`, `useUpdateAccount`).

- [ ] **Step 2: Khai báo mutation + handler trong `AccountForm`** — trong component `AccountForm`, ngay sau `const update = useUpdateAccount()` (khoảng dòng 205):

```ts
  const del = useDeleteAccount()

  async function handleDelete() {
    if (!account) return
    const ok = await confirmDialog({
      title: `Xóa tài khoản «${account.name}»?`,
      message: 'Không thể hoàn tác. Chỉ xóa được khi không còn giao dịch nào dùng nó.',
      confirmLabel: 'Xóa',
      danger: true,
    })
    if (!ok) return
    try {
      await del.mutateAsync(account.id)
      showToast('Đã xóa tài khoản', 'success')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không xóa được', 'error')
    }
  }
```

- [ ] **Step 3: Thêm nút Xóa vào footer form** — thay khối footer hiện tại (khoảng dòng 500–517):

Từ:

```tsx
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
```

Thành:

```tsx
        <div className="mt-3 flex items-center gap-2">
          {account && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={del.isPending}
              className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              Xóa
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSave}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </div>
```

- [ ] **Step 4: Kiểm tra build + lint**

Run: `npm run build && npm run lint`
Expected: không lỗi.

- [ ] **Step 5: Kiểm tra trực quan trên preview**

Mở dev server (chế độ demo), vào **Cài đặt → Tài khoản**, bấm một tài khoản để mở Sửa → thấy nút "Xóa" đỏ góc trái. Thử xóa:
- Tài khoản mẫu (có giao dịch) → hiện toast đỏ "còn giao dịch…", không xóa.
- Tạo tài khoản mới trống rồi Xóa → xác nhận đỏ → xóa, toast "Đã xóa tài khoản".

- [ ] **Step 6: Commit**

```bash
git add src/features/accounts/AccountsPage.tsx
git commit -m "feat(xoa): nut Xoa trong hop Sua tai khoan"
```

---

### Task 5: Nút "Xóa" trong hộp Sửa danh mục

**Files:**
- Modify: `src/features/categories/CategoriesPage.tsx`

**Interfaces:**
- Consumes: `useDeleteCategory` (Task 3); `confirmDialog`, `showToast` từ `../../lib/dialog`; prop `hasChildren` đã truyền sẵn vào `CategoryForm`.

- [ ] **Step 1: Thêm import** — đầu `src/features/categories/CategoriesPage.tsx`:

```ts
import { confirmDialog, showToast } from '../../lib/dialog'
```

Và bổ sung `useDeleteCategory` vào khối import từ `../../hooks/queries`.

- [ ] **Step 2: Khai báo mutation + handler trong `CategoryForm`** — ngay sau `const update = useUpdateCategory()` (khoảng dòng 337):

```ts
  const del = useDeleteCategory()

  async function handleDelete() {
    if (!category) return
    const ok = await confirmDialog({
      title: `Xóa danh mục «${category.name}»?`,
      message: hasChildren
        ? 'Không thể hoàn tác. Xóa cả các danh mục con bên trong (nếu tất cả đều trống).'
        : 'Không thể hoàn tác. Chỉ xóa được khi không còn giao dịch nào dùng nó.',
      confirmLabel: 'Xóa',
      danger: true,
    })
    if (!ok) return
    try {
      await del.mutateAsync(category.id)
      showToast('Đã xóa danh mục', 'success')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không xóa được', 'error')
    }
  }
```

- [ ] **Step 3: Thêm nút Xóa vào footer form** — thay khối footer hiện tại (khoảng dòng 474–491):

Từ:

```tsx
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
```

Thành:

```tsx
        <div className="flex items-center gap-2">
          {category && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={del.isPending}
              className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              Xóa
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSave}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </div>
```

- [ ] **Step 4: Kiểm tra build + lint**

Run: `npm run build && npm run lint`
Expected: không lỗi.

- [ ] **Step 5: Kiểm tra trực quan trên preview**

Vào **Cài đặt → Danh mục**, mở Sửa một danh mục:
- Danh mục mẫu có giao dịch → toast đỏ "còn giao dịch…", không xóa.
- Tạo danh mục mới trống → Xóa → xác nhận đỏ → xóa, toast "Đã xóa danh mục".
- Tạo cha + con (đều trống) → Xóa cha → xác nhận nói "Xóa cả các danh mục con" → cả cha lẫn con biến mất.

- [ ] **Step 6: Commit**

```bash
git add src/features/categories/CategoriesPage.tsx
git commit -m "feat(xoa): nut Xoa trong hop Sua danh muc"
```

---

## Self-Review

**Spec coverage:**
- "Chỉ xóa khi trống" (tài khoản) → Task 1 (kiểm tra transactions/recurring/goals/payment-source/valuations).
- "Chỉ xóa khi trống" (danh mục) → Task 2 (transactions/recurring/budgets).
- "Cha + con trống xóa cả nhóm" → Task 2 (gom `ids`, cascade).
- "Nút Xóa trong hộp Sửa, đỏ, góc trái, chỉ khi sửa" → Task 4, 5.
- "Xác nhận đỏ + toast lỗi rõ lý do + toast thành công" → Task 4, 5 (`confirmDialog danger`, `showToast`).
- "Kiểm tra trống ở repo" → Task 1, 2.
- Kiểm thử demoRepo (mọi ca trong spec) → Task 1, 2 tests.

**Placeholder scan:** Không có TBD/TODO; mọi step có code/lệnh cụ thể.

**Type consistency:** `deleteAccount(id: string)` / `deleteCategory(id: string)` khớp giữa interface, hai repo, và hook. `useDeleteAccount`/`useDeleteCategory` dùng `mutateAsync(id)` khớp UI. Helper test `accountInput`/`expenseTx` định nghĩa ở Task 1, dùng lại ở Task 2 (cùng file).
