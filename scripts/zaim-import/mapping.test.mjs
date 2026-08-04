import { describe, it, expect } from 'vitest'
import { resolveCategoryPath, isOutgoingTransferExpense } from './mapping.mjs'

// Mục tiêu người dùng chốt 2026-08: sổ chỉ để thấy CHI TIÊU THỰC TẾ.
// -> Phần thu chỉ giữ Lương (給与所得) và Thưởng (賞与). Mọi thu khác (tiền chuyển
//    vào 振込/送金, trả lại, cho mượn, lì xì, nạp ví チャージ...) đều KHÔNG nhập.
describe('resolveCategoryPath — income chỉ giữ Lương và Thưởng', () => {
  it('給与所得 -> Lương', () => {
    expect(resolveCategoryPath('income', '給与所得', '-')).toBe('Lương')
  })

  it('賞与 -> Thưởng', () => {
    expect(resolveCategoryPath('income', '賞与', '-')).toBe('Thưởng')
  })

  it('その他 (gồm cả チャージ nạp ví, tiền người khác gửi) -> SKIP', () => {
    expect(resolveCategoryPath('income', 'その他', '-')).toBe('SKIP')
  })

  it('立替金返済 / 臨時収入 / "-" -> SKIP', () => {
    expect(resolveCategoryPath('income', '立替金返済', '-')).toBe('SKIP')
    expect(resolveCategoryPath('income', '臨時収入', '-')).toBe('SKIP')
    expect(resolveCategoryPath('income', '-', '-')).toBe('SKIP')
  })

  it('事業所得 vẫn SKIP như trước', () => {
    expect(resolveCategoryPath('income', '事業所得', '-')).toBe('SKIP')
  })

  it('CHI (expense) không bị ảnh hưởng', () => {
    expect(resolveCategoryPath('expense', '食費', '昼ご飯')).toBe('Ăn uống>Bữa trưa')
    expect(resolveCategoryPath('expense', 'その他', '電子マネーにチャージ')).toBe('SKIP')
  })

  it('使途不明金 (Zaim tự sinh để cân số dư) -> SKIP', () => {
    expect(resolveCategoryPath('expense', 'その他', '使途不明金')).toBe('SKIP')
  })
})

// Chỉ CHI rơi vào catch-all 'Khác' mà ghi chú có 送金/振込/ワイズ (Wise) mới là chuyển
// tiền ra ngoài (gửi người/gửi về VN/phí chuyển khoản) — KHÔNG phải chi tiêu.
// Cùng ghi chú đó nhưng ở danh mục thật (nước, học phí, đi chợ) thì vẫn là chi thật.
describe('isOutgoingTransferExpense — bỏ chuyển tiền lọt vào "Khác"', () => {
  it('その他 + 送金/振込/ワイズ -> true (bỏ)', () => {
    expect(isOutgoingTransferExpense('expense', 'その他', '-', '送金 TRAN THI')).toBe(true)
    expect(isOutgoingTransferExpense('expense', 'その他', '-', 'ワイズペイメンツ 振込予定日')).toBe(true)
    expect(isOutgoingTransferExpense('expense', 'その他', '-', '振込手数料')).toBe(true)
  })

  it('chi THẬT trả bằng chuyển khoản (danh mục khác Khác) -> false (giữ)', () => {
    expect(isOutgoingTransferExpense('expense', '水道・光熱', '水道料金', '振込 アスマフドウサン')).toBe(false)
    expect(isOutgoingTransferExpense('expense', '教育・教養', 'Học phí', '振込 Học lái xe')).toBe(false)
    expect(isOutgoingTransferExpense('expense', '食費', '食料品', '送金 DINH THI · Cosco')).toBe(false)
  })

  it('Khác nhưng KHÔNG phải chuyển tiền -> false (giữ)', () => {
    expect(isOutgoingTransferExpense('expense', 'その他', '-', 'Amazon')).toBe(false)
  })

  it('THU không đụng tới (đã lọc theo Lương/Thưởng rồi)', () => {
    expect(isOutgoingTransferExpense('income', '給与所得', '-', '送金 株式会社 KOME')).toBe(false)
  })
})
