// Test ĐỌC FILE, không render (xem đầu tests/designSystem.test.ts — repo không có
// hạ tầng test component). Hai chốt của task này kiểm được không cần DOM: chuỗi đã
// chết phải biến mất, và chuỗi của form thật (PlannedFormSheet) phải có mặt NGUYÊN
// VĂN trong PlannedFields — hai form không được lệch chữ.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Ở tests/ chứ không phải src/: đọc filesystem bằng node:fs, mà tsconfig.app.json
// cố ý chỉ khai types: ["vite/client"] (xem designSystem.test.ts / entryStructure.test.ts).
// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách.
const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

const fields = read('features/transactions/PlannedFields.tsx')
const form = read('features/transactions/TransactionForm.tsx')
const page = read('features/transactions/EntryPage.tsx')
const sheet = read('features/planned/PlannedFormSheet.tsx')

const DEAD = ['Khoản sắp tới', 'Tạo lời nhắc', 'Tên lời nhắc', 'Nhắc sau']

describe('ba chuoi da chet khong duoc quay lai', () => {
  it.each(DEAD)('"%s" khong con o dau trong luong Nhap', (dead) => {
    for (const src of [fields, form, page]) expect(src).not.toMatch(new RegExp(dead))
  })
})

describe('dung DUNG chu cua PlannedFormSheet, khong bia', () => {
  const COPY = [
    'Chi cái gì', 'đóng phí vệ sinh', 'Ước tính', 'để trống nếu chưa biết',
    'Chắc tới đâu', 'Đúng ngày', 'Khoảng tháng', 'Ngày đến hạn', 'Tháng dự kiến',
    'Nhắc tôi', 'Nhắc trước', '0 = đúng ngày đến hạn', '— Chưa chọn —',
  ]

  it.each(COPY)('PlannedFields co chuoi "%s"', (s) => {
    expect(fields).toContain(s)
  })

  it.each(COPY)('PlannedFormSheet cung co "%s" — hai form khong lech chu', (s) => {
    expect(sheet).toContain(s)
  })
})

describe('chu "nhac" chi o o tich va dong phu cua no', () => {
  it('dem so lan chuoi "Nhắc" xuat hien — nhieu hon 3 la da tran ra cho khac', () => {
    // "Nhắc tôi" (ô tích) + "Nhắc trước" (dòng phụ) + aria-label của ô số ngày.
    expect((fields.match(/Nhắc/g) ?? []).length).toBeLessThanOrEqual(3)
  })
})

describe('KHONG co o tai khoan, KHONG co o Lap', () => {
  it('PlannedFields khong nhac tai khoan', () => {
    // Khoản sắp chi chưa trừ tiền nên chưa cần biết trừ từ đâu; chọn ví là việc
    // của lúc xác nhận đã chi.
    expect(fields).not.toMatch(/AccountPicker|accountId|account_id/)
  })

  it('form Nhap khong con dropdown Lap lai', () => {
    for (const dead of ['REPEAT_OPTIONS', 'REPEAT_LABEL', 'REPEAT_MENU_LABEL', 'repeatOpen']) {
      expect(form).not.toMatch(new RegExp(dead))
    }
    expect(page).not.toMatch(/onSubmitRecurring|useCreateRecurringRule|useRunRecurringCatchUp/)
  })

  it('thay bang mot dong dan sang RecurringFormSheet', () => {
    expect(form).toMatch(/Khoản này lặp lại\?/)
    expect(form).toMatch(/\/recurring/)
  })
})

describe('o so ngay la o TU DO, khong phai bon chip preset', () => {
  it('khong co chip preset — chung chan mat gia tri hop le khac va tao hai UI cho mot cot', () => {
    for (const preset of ['Không nhắc', '3 ngày', '7 ngày', '30 ngày']) {
      expect(fields).not.toContain(preset)
    }
    expect(fields).toMatch(/type="number"/)
  })
})
