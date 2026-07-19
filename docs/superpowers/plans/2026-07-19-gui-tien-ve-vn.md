# Gửi tiền về Việt Nam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghi nhận và theo dõi các lần gửi tiền JPY→VND: mỗi lần gửi là một giao dịch (chuyển tài sản hoặc chi hỗ trợ gia đình), có trang thống kê tổng đã gửi trong năm và tỷ giá thực nhận trung bình.

**Architecture:** Mở rộng bảng `transactions` bằng 4 cột **nullable/optional** (`is_remittance`, `remit_service`, `remit_fee_jpy`, `remit_received_vnd`) — không thêm bảng, số dư tự đúng vì gửi tiền CHÍNH LÀ một giao dịch. Field mới là **optional** trên `TransactionRow` và `NewTransaction` nên mọi nơi tạo giao dịch cũ không phải sửa (blast radius = 0). Form nhập riêng ánh xạ sang `transfer` (chuyển tài sản → TK VND) hoặc `expense` (hỗ trợ → danh mục "Gửi tiền về VN"). Trang thống kê lọc `is_remittance` client-side qua `searchTransactions` theo năm; hàm tổng hợp thuần `remittanceStats`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, TailwindCSS v4, TanStack Query, Supabase.

## Global Constraints

- Tiền lưu ở minor units; không float. JPY 0 chữ số thập phân (minor = yên); VND 0 chữ số thập phân (minor = đồng).
- 4 field mới là **optional** (`?`) trên cả `TransactionRow` (`src/types/database.types.ts`) và `NewTransaction` (`src/data/repo.ts`) → KHÔNG sửa nơi tạo giao dịch cũ (debt/recurring/entry/optimistic).
- `amount` của giao dịch gửi = **số gửi + phí** (số thực rời TK JPY); `remit_fee_jpy` = phí; số gửi gốc = `amount − remit_fee_jpy`.
- Chuyển tài sản → `type='transfer'`, `to_account_id` = TK VND, `to_amount` = VND nhận. Hỗ trợ gia đình → `type='expense'`, `category_id` = "Gửi tiền về VN".
- Hai repo (`demoRepo`, `supabaseRepo`) đọc `select('*')` nên cột mới tự về — KHÔNG sửa repo đọc; `createTransaction` cả 2 repo spread `{...input}` nên field mới tự lưu.
- Nhãn tiếng Việt. build-typecheck `npx tsc -b` (KHÔNG `--noEmit`); test `npx vitest run`; KHÔNG chạy dev server bằng Bash — dùng Browser `preview_start`.

---

### Task 1: Migration 0013 + mở rộng type (optional remit fields)

**Files:**
- Create: `supabase/migrations/0013_remittance.sql`
- Modify: `src/types/database.types.ts` (`TransactionRow`, sau dòng 80 `note`)
- Modify: `src/data/repo.ts` (`NewTransaction`, sau dòng 30 `note`)

**Interfaces:**
- Produces: `TransactionRow` + `NewTransaction` có thêm (optional) `is_remittance?: boolean`, `remit_service?: string | null`, `remit_fee_jpy?: number | null`, `remit_received_vnd?: number | null`.

- [ ] **Step 1: Tạo migration** `supabase/migrations/0013_remittance.sql`:

```sql
-- ============================================================
-- Sổ Chi Tiêu — Migration 0013: Gửi tiền về Việt Nam
-- Mỗi lần gửi là MỘT giao dịch (transfer = chuyển tài sản sang TK VND, hoặc
-- expense = hỗ trợ gia đình). 4 cột dưới chỉ dùng khi is_remittance=true.
-- Số dư/Tài sản ròng tự đúng vì gửi tiền chính là giao dịch — view balance
-- KHÔNG cần sửa (không đọc các cột này).
-- ============================================================

alter table public.transactions
  add column if not exists is_remittance boolean not null default false;
alter table public.transactions
  add column if not exists remit_service text;         -- Wise / SBI Remit / Brastel / DCOM / Khác
alter table public.transactions
  add column if not exists remit_fee_jpy bigint;       -- phí dịch vụ (minor units JPY = yên)
alter table public.transactions
  add column if not exists remit_received_vnd bigint;  -- số VND người nhận nhận được (minor units VND = đồng)
```

- [ ] **Step 2: Thêm field vào `TransactionRow`**

Trong `src/types/database.types.ts`, trong `export type TransactionRow`, ngay sau dòng `note: string` (dòng 80) và trước `created_at: string`, thêm:

```ts
  /** Gửi tiền về VN: true = giao dịch này là một lần gửi tiền (mặc định false). */
  is_remittance?: boolean
  /** Gửi tiền về VN: dịch vụ chuyển (Wise/SBI Remit/Brastel/DCOM/Khác); null = không rõ. */
  remit_service?: string | null
  /** Gửi tiền về VN: phí dịch vụ (minor units JPY). */
  remit_fee_jpy?: number | null
  /** Gửi tiền về VN: số VND người nhận nhận được (minor units VND = đồng). */
  remit_received_vnd?: number | null
```

- [ ] **Step 3: Thêm field vào `NewTransaction`**

Trong `src/data/repo.ts`, trong `export interface NewTransaction`, ngay sau dòng `note: string` (dòng 30), thêm:

```ts
  /** Gửi tiền về VN: đánh dấu giao dịch là một lần gửi tiền. Bỏ trống = giao dịch thường. */
  is_remittance?: boolean
  /** Gửi tiền về VN: dịch vụ chuyển. */
  remit_service?: string | null
  /** Gửi tiền về VN: phí dịch vụ (minor units JPY). */
  remit_fee_jpy?: number | null
  /** Gửi tiền về VN: số VND người nhận nhận được (minor units VND). */
  remit_received_vnd?: number | null
```

- [ ] **Step 3b: Thêm 4 cột vào Database schema (BẮT BUỘC — nếu không `tsc -b` vỡ)**

Client Supabase gõ theo `Database` (trong `src/types/database.types.ts`), Insert/Update của `transactions` liệt kê cột tường minh qua `InsertOf`. Phải thêm 4 khóa remit, nếu không `RejectExcessProperties` coi chúng là `never` và `.insert({...input})` lỗi kiểu. Trong `Database.public.Tables.transactions`:
- Insert: thêm `| 'is_remittance' | 'remit_service' | 'remit_fee_jpy' | 'remit_received_vnd'` vào danh sách Optional keys của `InsertOf<TransactionRow, …>`.
- Update: thêm `| 'is_remittance' | 'remit_service' | 'remit_fee_jpy' | 'remit_received_vnd'` vào `Pick<TransactionRow, …>`.

- [ ] **Step 4: Typecheck + test**

Run: `npx tsc -b && npx vitest run`
Expected: `tsc -b` không lỗi (field optional + đã thêm vào Database schema); toàn bộ test pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_remittance.sql src/types/database.types.ts src/data/repo.ts
git commit -m "Gui tien VN: migration 0013 + 4 field remit (optional) tren TransactionRow/NewTransaction"
```

---

### Task 2: Hàm tổng hợp thuần `remittanceStats` (unit-tested)

**Files:**
- Create: `src/features/remittance/aggregate.ts`
- Test: `src/features/remittance/aggregate.test.ts`

**Interfaces:**
- Consumes: `TransactionRow`.
- Produces: `RemittanceStats { totalSentJpy, totalFeeJpy, totalReceivedVnd, avgRate: number | null, count }`; `remittanceStats(txs: TransactionRow[]): RemittanceStats` (tự lọc `is_remittance`).

- [ ] **Step 1: Viết `src/features/remittance/aggregate.ts`**

```ts
// Thống kê gửi tiền về VN — thuần, không phụ thuộc React, để unit-test được.
// Nhận danh sách giao dịch bất kỳ; tự lọc is_remittance. Số gửi gốc = amount − phí.

import type { TransactionRow } from '../../types/database.types'

export interface RemittanceStats {
  /** Σ (amount − remit_fee_jpy) — số gửi gốc, minor units JPY */
  totalSentJpy: number
  /** Σ remit_fee_jpy — tổng phí, minor units JPY */
  totalFeeJpy: number
  /** Σ remit_received_vnd — tổng VND người nhận nhận, minor units VND */
  totalReceivedVnd: number
  /** VND nhận trên mỗi 1 JPY gửi gốc; null nếu chưa gửi (totalSentJpy = 0) */
  avgRate: number | null
  /** số lần gửi */
  count: number
}

export function remittanceStats(txs: TransactionRow[]): RemittanceStats {
  const rem = txs.filter((t) => t.is_remittance)
  let totalSentJpy = 0
  let totalFeeJpy = 0
  let totalReceivedVnd = 0
  for (const t of rem) {
    const fee = t.remit_fee_jpy ?? 0
    totalFeeJpy += fee
    totalSentJpy += Math.max(t.amount - fee, 0)
    totalReceivedVnd += t.remit_received_vnd ?? 0
  }
  return {
    totalSentJpy,
    totalFeeJpy,
    totalReceivedVnd,
    avgRate: totalSentJpy > 0 ? totalReceivedVnd / totalSentJpy : null,
    count: rem.length,
  }
}
```

- [ ] **Step 2: Viết test** `src/features/remittance/aggregate.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { remittanceStats } from './aggregate'

let seq = 0
function tx(p: Partial<TransactionRow>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    type: 'transfer',
    amount: 0,
    to_amount: null,
    category_id: null,
    account_id: 'a',
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: '2026-07-01',
    note: '',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...p,
  }
}

describe('remittanceStats', () => {
  it('rỗng → tất cả 0, avgRate null', () => {
    const s = remittanceStats([])
    expect(s).toEqual({ totalSentJpy: 0, totalFeeJpy: 0, totalReceivedVnd: 0, avgRate: null, count: 0 })
  })

  it('bỏ qua giao dịch không phải remittance', () => {
    const s = remittanceStats([
      tx({ type: 'expense', amount: 5_000 }), // không có is_remittance
      tx({ is_remittance: true, amount: 100_000, remit_fee_jpy: 2_000, remit_received_vnd: 16_000_000 }),
    ])
    expect(s.count).toBe(1)
    expect(s.totalSentJpy).toBe(98_000) // 100.000 − 2.000
    expect(s.totalFeeJpy).toBe(2_000)
    expect(s.totalReceivedVnd).toBe(16_000_000)
  })

  it('cộng dồn nhiều lần gửi + tỷ giá thực nhận TB = ΣVND / Σ(số gửi gốc)', () => {
    const s = remittanceStats([
      tx({ is_remittance: true, amount: 102_000, remit_fee_jpy: 2_000, remit_received_vnd: 16_000_000 }), // gốc 100.000
      tx({ is_remittance: true, amount: 51_000, remit_fee_jpy: 1_000, remit_received_vnd: 8_000_000 }), // gốc 50.000
    ])
    expect(s.totalSentJpy).toBe(150_000)
    expect(s.totalFeeJpy).toBe(3_000)
    expect(s.totalReceivedVnd).toBe(24_000_000)
    expect(s.avgRate).toBeCloseTo(24_000_000 / 150_000) // 160 ₫/¥
    expect(s.count).toBe(2)
  })

  it('phí/VND thiếu (null/undefined) coi như 0', () => {
    const s = remittanceStats([tx({ is_remittance: true, amount: 30_000 })])
    expect(s.totalFeeJpy).toBe(0)
    expect(s.totalReceivedVnd).toBe(0)
    expect(s.totalSentJpy).toBe(30_000)
    expect(s.avgRate).toBe(0) // 0 VND / 30.000 JPY
  })
})
```

- [ ] **Step 3: Test + typecheck**

Run: `npx vitest run src/features/remittance/aggregate.test.ts && npx tsc -b`
Expected: 4 test PASS, `tsc -b` sạch.

- [ ] **Step 4: Commit**

```bash
git add src/features/remittance/aggregate.ts src/features/remittance/aggregate.test.ts
git commit -m "Gui tien VN: remittanceStats (thuan) + test"
```

---

### Task 3: Form nhập `RemittanceFormSheet`

**Files:**
- Create: `src/features/remittance/RemittanceFormSheet.tsx`

**Interfaces:**
- Consumes: `useCreateTransaction`, `useAccounts`, `useCategories`, `useCreateCategory` (hooks sẵn có); `NewTransaction` từ `../../data`; `formatMoney`, `parseMoney` từ `../../lib/money`; `toISODate` từ `../../lib/dates`.
- Produces: `export function RemittanceFormSheet({ onClose }: { onClose: () => void })`.

Mẫu cấu trúc: bám sát `src/features/debts/DebtPaymentSheet.tsx` (overlay + sheet, input tiền kiểu `formatMoney`/`parseMoney`, select tài khoản, nút Hủy/Lưu).

- [ ] **Step 1: Viết `src/features/remittance/RemittanceFormSheet.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { NewTransaction } from '../../data'
import {
  useAccounts,
  useCategories,
  useCreateCategory,
  useCreateTransaction,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { formatMoney, parseMoney } from '../../lib/money'

const SERVICES = ['Wise', 'SBI Remit', 'Brastel', 'DCOM', 'Khác']
const GUI_TIEN_CAT = 'Gửi tiền về VN'

type Kind = 'transfer' | 'expense'

/** Sheet ghi nhận một lần gửi tiền về VN. Tạo một giao dịch (transfer hoặc expense). */
export function RemittanceFormSheet({ onClose }: { onClose: () => void }) {
  const createTx = useCreateTransaction()
  const createCat = useCreateCategory()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  // Nguồn: TK JPY (không phải thẻ, chưa lưu trữ). Đích: TK VND tương tự.
  const jpyAccounts = useMemo(
    () => accounts.filter((a) => !a.is_archived && a.type !== 'card' && a.currency === 'JPY'),
    [accounts],
  )
  const vndAccounts = useMemo(
    () => accounts.filter((a) => !a.is_archived && a.type !== 'card' && a.currency === 'VND'),
    [accounts],
  )

  const [kind, setKind] = useState<Kind>('transfer')
  const [occurredOn, setOccurredOn] = useState(toISODate(new Date()))
  const [sourceId, setSourceId] = useState('')
  const [destId, setDestId] = useState('')
  const [sentDigits, setSentDigits] = useState('')
  const [feeDigits, setFeeDigits] = useState('')
  const [receivedDigits, setReceivedDigits] = useState('')
  const [service, setService] = useState(SERVICES[0])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!sourceId && jpyAccounts[0]) setSourceId(jpyAccounts[0].id)
  }, [sourceId, jpyAccounts])
  useEffect(() => {
    if (!destId && vndAccounts[0]) setDestId(vndAccounts[0].id)
  }, [destId, vndAccounts])

  const sent = sentDigits === '' ? 0 : Number(sentDigits)
  const fee = feeDigits === '' ? 0 : Number(feeDigits)
  const received = receivedDigits === '' ? 0 : Number(receivedDigits)
  const rate = sent > 0 ? received / sent : 0

  const needDest = kind === 'transfer'
  const canSave =
    sent > 0 &&
    received > 0 &&
    !!sourceId &&
    (!needDest || !!destId) &&
    !saving

  async function ensureGuiTienCategoryId(): Promise<string> {
    const found = categories.find((c) => c.type === 'expense' && c.name === GUI_TIEN_CAT)
    if (found) return found.id
    const created = await createCat.mutateAsync({
      name: GUI_TIEN_CAT,
      type: 'expense',
      icon: '💸',
      parent_id: null,
    })
    return created.id
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const amount = sent + fee
      const trimmedNote = note.trim() || 'Gửi tiền về VN'
      let input: NewTransaction
      if (kind === 'transfer') {
        input = {
          type: 'transfer',
          amount,
          to_amount: received,
          category_id: null,
          account_id: sourceId,
          to_account_id: destId,
          occurred_on: occurredOn,
          note: trimmedNote,
          is_remittance: true,
          remit_service: service,
          remit_fee_jpy: fee,
          remit_received_vnd: received,
        }
      } else {
        const categoryId = await ensureGuiTienCategoryId()
        input = {
          type: 'expense',
          amount,
          to_amount: null,
          category_id: categoryId,
          account_id: sourceId,
          to_account_id: null,
          occurred_on: occurredOn,
          note: trimmedNote,
          is_remittance: true,
          remit_service: service,
          remit_fee_jpy: fee,
          remit_received_vnd: received,
        }
      }
      await createTx.mutateAsync(input)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">Gửi tiền về VN</h2>

        {/* Kiểu */}
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-gray-200 dark:bg-gray-800 p-1">
          {(
            [
              ['transfer', 'Chuyển tài sản'],
              ['expense', 'Hỗ trợ gia đình'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-lg py-1.5 text-sm font-medium transition ${
                kind === k
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          {kind === 'transfer'
            ? 'Tiền vẫn là của bạn ở VN — không giảm Tài sản ròng.'
            : 'Tiền cho gia đình — ghi nhận là chi (giảm Tài sản ròng).'}
        </p>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Ngày</label>
        <input
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-green-500"
        />

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Từ tài khoản (JPY)</label>
        {jpyAccounts.length === 0 ? (
          <p className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Chưa có tài khoản JPY. Hãy tạo một tài khoản JPY trước.
          </p>
        ) : (
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
          >
            {jpyAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}

        {needDest && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Đến tài khoản VND</label>
            {vndAccounts.length === 0 ? (
              <p className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Chưa có tài khoản VND. Tạo một tài khoản VND (ví dụ "Tiền ở VN") hoặc chọn "Hỗ trợ gia đình".
              </p>
            ) : (
              <select
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
                className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
              >
                {vndAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Số gửi (JPY)</label>
            <input
              inputMode="numeric"
              value={sent === 0 ? '' : formatMoney(sent, 'JPY')}
              onChange={(e) => {
                const p = String(parseMoney(e.target.value))
                setSentDigits(p === '0' ? '' : p)
              }}
              placeholder={formatMoney(0, 'JPY')}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-sm font-semibold outline-green-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Phí (JPY)</label>
            <input
              inputMode="numeric"
              value={fee === 0 ? '' : formatMoney(fee, 'JPY')}
              onChange={(e) => {
                const p = String(parseMoney(e.target.value))
                setFeeDigits(p === '0' ? '' : p)
              }}
              placeholder={formatMoney(0, 'JPY')}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-sm font-semibold outline-green-500"
            />
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Số người nhận nhận (VND)</label>
        <input
          inputMode="numeric"
          value={received === 0 ? '' : formatMoney(received, 'VND')}
          onChange={(e) => {
            const p = String(parseMoney(e.target.value))
            setReceivedDigits(p === '0' ? '' : p)
          }}
          placeholder={formatMoney(0, 'VND')}
          className="mb-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500"
        />
        {rate > 0 && (
          <p className="mb-3 text-right text-xs text-gray-400 dark:text-gray-500">
            Tỷ giá: 1 ¥ ≈ {rate.toFixed(1)} ₫
          </p>
        )}

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Dịch vụ</label>
        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
        >
          {SERVICES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Người nhận / ghi chú (không bắt buộc)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: gửi mẹ"
          className="mb-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: không lỗi.

- [ ] **Step 3: Commit**

```bash
git add src/features/remittance/RemittanceFormSheet.tsx
git commit -m "Gui tien VN: RemittanceFormSheet (form nhap)"
```

---

### Task 4: Trang `RemittancePage` + route + link Cài đặt + kiểm chứng

**Files:**
- Create: `src/features/remittance/RemittancePage.tsx`
- Modify: `src/App.tsx` (thêm lazy route `/settings/remittance`)
- Modify: `src/features/settings/SettingsPage.tsx` (thêm link)

**Interfaces:**
- Consumes: `useSearchTransactions`, `useDeleteTransaction` (hooks sẵn có); `remittanceStats`; `RemittanceFormSheet`; `formatMoney`; `useRates` (để lấy `base` — nhưng số hiển thị JPY/VND cố định theo loại). `Link`, `ChevronLeft` (lucide).
- Produces: `export function RemittancePage()`.

- [ ] **Step 1: Viết `src/features/remittance/RemittancePage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Send, Trash2 } from 'lucide-react'
import { useSearchTransactions, useDeleteTransaction } from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import { remittanceStats } from './aggregate'
import { RemittanceFormSheet } from './RemittanceFormSheet'

/** Năm dương lịch hiện tại (component runtime — Date cho phép ở đây). */
function currentYear(): number {
  return new Date().getFullYear()
}

export function RemittancePage() {
  const year = currentYear()
  const range = { start: `${year}-01-01`, end: `${year + 1}-01-01` }
  const { data: txs = [], isLoading } = useSearchTransactions(range)
  const del = useDeleteTransaction()
  const [adding, setAdding] = useState(false)

  const remittances = useMemo(
    () =>
      txs
        .filter((t) => t.is_remittance)
        .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1)),
    [txs],
  )
  const stats = useMemo(() => remittanceStats(txs), [txs])

  function handleDelete(t: TransactionRow) {
    if (!window.confirm('Xóa lần gửi này? Số dư tài khoản sẽ được hoàn lại.')) return
    del.mutate(t.id)
  }

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/settings"
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">Gửi tiền về VN</h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm active:scale-95"
        >
          <Plus className="h-4 w-4" /> Gửi tiền
        </button>
      </div>

      {/* Thẻ tổng năm nay */}
      <section className="mb-4 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-700 p-5 text-white shadow-md">
        <p className="text-sm font-medium text-green-50/90">Đã gửi năm {year}</p>
        <p className="mt-1.5 text-3xl font-bold leading-none tabular-nums">
          {formatMoney(stats.totalSentJpy, 'JPY')}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-green-50/90">
          <div>
            <p className="text-green-50/70">Người nhận nhận</p>
            <p className="mt-0.5 font-semibold tabular-nums">{formatMoney(stats.totalReceivedVnd, 'VND')}</p>
          </div>
          <div>
            <p className="text-green-50/70">Tỷ giá TB</p>
            <p className="mt-0.5 font-semibold tabular-nums">
              {stats.avgRate ? `${stats.avgRate.toFixed(1)} ₫/¥` : '—'}
            </p>
          </div>
          <div>
            <p className="text-green-50/70">Tổng phí</p>
            <p className="mt-0.5 font-semibold tabular-nums">{formatMoney(stats.totalFeeJpy, 'JPY')}</p>
          </div>
        </div>
      </section>

      {/* Lịch sử */}
      {isLoading ? (
        <p className="py-10 text-center text-gray-400 dark:text-gray-500">Đang tải…</p>
      ) : remittances.length === 0 ? (
        <p className="rounded-xl bg-white dark:bg-gray-900 px-3 py-8 text-center text-sm text-gray-400 dark:text-gray-500 shadow-sm">
          Chưa có lần gửi nào trong năm {year}. Bấm "Gửi tiền" để thêm.
        </p>
      ) : (
        <div className="space-y-2">
          {remittances.map((t) => {
            const fee = t.remit_fee_jpy ?? 0
            const sent = Math.max(t.amount - fee, 0)
            const received = t.remit_received_vnd ?? 0
            const rate = sent > 0 ? received / sent : 0
            const isTransfer = t.type === 'transfer'
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl bg-white dark:bg-gray-900 px-3 py-2.5 shadow-sm"
              >
                <Send className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                    {formatMoney(sent, 'JPY')} → {formatMoney(received, 'VND')}
                  </p>
                  <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                    {t.occurred_on} · {t.remit_service ?? '—'} · {rate > 0 ? `${rate.toFixed(1)} ₫/¥` : ''}
                    {' · '}
                    <span className={isTransfer ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'}>
                      {isTransfer ? 'Chuyển tài sản' : 'Hỗ trợ GĐ'}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(t)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                  aria-label="Xóa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {adding && <RemittanceFormSheet onClose={() => setAdding(false)} />}
    </div>
  )
}
```

> Phạm vi v1: THÊM + XÓA (xóa hoàn số dư qua `deleteTransaction`). Sửa một lần gửi = xóa rồi thêm lại (chưa làm form sửa trong v1).

- [ ] **Step 2: Thêm route trong `src/App.tsx`**

(a) Thêm khai báo lazy (cạnh các `const … = lazy(...)` khác, sau `RecurringPage`):
```tsx
const RemittancePage = lazy(() =>
  import('./features/remittance/RemittancePage').then((m) => ({ default: m.RemittancePage })),
)
```
(b) Thêm route (sau dòng route `/settings/recurring`):
```tsx
          <Route path="/settings/remittance" element={lazyRoute(<RemittancePage />)} />
```

- [ ] **Step 3: Thêm link trong `src/features/settings/SettingsPage.tsx`**

(a) Thêm `Send` vào import lucide hiện có:
```tsx
import { ChevronRight, Handshake, Landmark, Layers, Repeat, Send, Tags, UserRound } from 'lucide-react'
```
(b) Trong khối "Quản lý", sau `<Link to="/settings/recurring">…</Link>`, thêm:
```tsx
          <Link
            to="/settings/remittance"
            className="flex items-center gap-3 px-3 py-3 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            <Send className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <span className="flex-1">Gửi tiền về VN</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: không lỗi.

- [ ] **Step 5: Kiểm chứng trên app (chế độ demo)**

- Khởi động dev server bằng Browser `preview_start` `{name: "so-chi-tieu"}` (dùng server sẵn nếu có).
- Cài đặt → "Gửi tiền về VN" (route `/settings/remittance`). Bấm "Gửi tiền":
  - **Chuyển tài sản**: nguồn = TK JPY (Ngân hàng), đích = TK VND (Đầu tư VN có sẵn trong demo), số gửi ¥100,000, phí ¥2,000, nhận 16,000,000 ₫, dịch vụ Wise → Lưu.
  - Kỳ vọng: thẻ tổng "Đã gửi năm nay ¥100,000", "Người nhận nhận 16.000.000 ₫", "Tỷ giá TB 160.0 ₫/¥", "Tổng phí ¥2,000"; 1 dòng lịch sử "¥100,000 → 16.000.000 ₫ · Wise · 160.0 ₫/¥ · Chuyển tài sản". Số dư Ngân hàng giảm ¥102,000, Đầu tư VN tăng 16.000.000 ₫ (mở /assets kiểm tra).
  - Thêm lần nữa **Hỗ trợ gia đình**: nguồn JPY, số gửi ¥50,000, phí ¥1,000, nhận 8,000,000 ₫ → Lưu. Kỳ vọng tổng cộng dồn (đã gửi ¥150,000, phí ¥3,000, VND 24.000.000). Danh mục "Gửi tiền về VN" (chi) tự tạo nếu chưa có; Tài sản ròng giảm theo phần hỗ trợ.
  - Bấm Xóa một dòng → xác nhận → dòng biến mất, tổng cập nhật, số dư hoàn lại.
- Xác minh bằng `read_page`/`get_page_text` + `read_console_messages` (không lỗi). Ghi kết quả (kèm số liệu quan sát) vào report. Nếu không chạy được server, ghi rõ lý do và bỏ qua (không chặn commit) — nhưng `tsc -b` phải sạch.

- [ ] **Step 6: Commit**

```bash
git add src/features/remittance/RemittancePage.tsx src/App.tsx src/features/settings/SettingsPage.tsx
git commit -m "Gui tien VN: RemittancePage + route + link Cai dat"
```

---

## Self-Review

**Spec coverage (#4):**
- Migration mở rộng `transactions` (is_remittance, remit_service, remit_fee_jpy, remit_received_vnd) — Task 1. ✓ (spec thêm remit_fee_jpy — có.)
- `NewTransaction` + `TransactionRow` thêm field, mặc định để nơi cũ hợp lệ — Task 1 (optional). ✓
- Ánh xạ transfer (→ TK VND) / expense (→ danh mục "Gửi tiền về VN"), amount = gửi+phí — Task 3. ✓
- Danh mục "Gửi tiền về VN" tự tạo nếu thiếu — Task 3 `ensureGuiTienCategoryId`. ✓
- Form nhập đủ trường (ngày, nguồn, đích khi transfer, số gửi, phí, nhận, dịch vụ, ghi chú, tỷ giá tức thời, kiểu) — Task 3. ✓
- Trang thống kê: đã gửi năm, tổng phí, tổng VND, tỷ giá thực nhận TB; lịch sử; nút thêm — Task 4. ✓
- Route `/settings/remittance` + link SettingsPage — Task 4. ✓
- Hàm thuần `remittanceStats` + test — Task 2. ✓
- Số dư/Tài sản ròng tự đúng (gửi = giao dịch), view không sửa — Task 1 (không đụng view). ✓

**Sai khác có chủ đích so với spec:** spec nói "mở lại để sửa/xóa"; v1 làm **xóa** (hoàn số dư) + thêm, HOÃN form sửa (ghi rõ trong Task 4). Không chặn giá trị cốt lõi.

**Placeholder scan:** không TBD/TODO; mọi step có code/lệnh cụ thể.

**Type consistency:** `is_remittance/remit_service/remit_fee_jpy/remit_received_vnd` optional khớp giữa `TransactionRow`, `NewTransaction`, cách dùng trong form (đặt cả 4) và `remittanceStats` (đọc `?? 0`). `NewTransaction` mapping đủ trường bắt buộc (`type, amount, to_amount, category_id, account_id, to_account_id, occurred_on, note`). `remittanceStats` filter `is_remittance` nhất quán với RemittancePage filter.
