import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import type { ImportItem } from './csvImport'
import { detectInternalTransfers } from './csvImport'
import { classifyDuplicates, mergedNote, mergeStatementFiles } from './dedupe'

let seq = 0
const etx = (
  p: Partial<TransactionRow> &
    Pick<TransactionRow, 'type' | 'amount' | 'occurred_on' | 'account_id'>,
): TransactionRow => ({
  id: `e${seq++}`,
  user_id: 'u',
  to_amount: null,
  category_id: 'c1',
  to_account_id: null,
  recurring_rule_id: null,
  note: '',
  created_at: '',
  updated_at: '',
  ...p,
})

const item = (occurred_on: string, amount: number, note = '', type: 'expense' | 'income' = 'expense'): ImportItem => ({
  occurred_on,
  amount,
  type,
  note,
  key: `${occurred_on}|${type === 'expense' ? '-' : '+'}${amount}|${note}`,
})

const opts = { accountId: 'card' }

describe('classifyDuplicates', () => {
  it('khớp cả ngày, tiền lẫn ghi chú → trùng chắc chắn', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 1_200, 'セブンイレブン')],
      [etx({ type: 'expense', amount: 1_200, occurred_on: '2026-02-10', account_id: 'card', note: 'セブンイレブン' })],
      opts,
    )
    expect(out[0]?.level).toBe('exact')
    expect(out[0]?.dayGap).toBe(0)
  })

  it('cùng tiền, lệch trong 3 ngày, ghi chú khác → NGHI trùng (luật cũ bỏ sót)', () => {
    const out = classifyDuplicates(
      [item('2026-02-12', 1_200, 'セブンイレブン')],
      [etx({ type: 'expense', amount: 1_200, occurred_on: '2026-02-10', account_id: 'card', note: 'Đi chợ' })],
      opts,
    )
    expect(out[0]?.level).toBe('likely')
    expect(out[0]?.dayGap).toBe(2)
    expect(out[0]?.matchedNote).toBe('Đi chợ')
  })

  it('cùng ngày cùng tiền nhưng ghi chú khác vẫn chỉ là NGHI, không phải chắc chắn', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 1_200, 'セブンイレブン')],
      [etx({ type: 'expense', amount: 1_200, occurred_on: '2026-02-10', account_id: 'card', note: 'Đi chợ' })],
      opts,
    )
    expect(out[0]?.level).toBe('likely')
    expect(out[0]?.dayGap).toBe(0)
  })

  it('quá cửa sổ ngày thì coi như khoản mới', () => {
    const out = classifyDuplicates(
      [item('2026-02-20', 1_200, 'x')],
      [etx({ type: 'expense', amount: 1_200, occurred_on: '2026-02-10', account_id: 'card' })],
      opts,
    )
    expect(out[0]).toBeNull()
  })

  it('bỏ qua giao dịch của tài khoản khác', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 1_200, 'x')],
      [etx({ type: 'expense', amount: 1_200, occurred_on: '2026-02-10', account_id: 'bank', note: 'x' })],
      opts,
    )
    expect(out[0]).toBeNull()
  })

  it('chi không khớp với thu cùng số tiền', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 1_200, 'x')],
      [etx({ type: 'income', amount: 1_200, occurred_on: '2026-02-10', account_id: 'card', note: 'x' })],
      opts,
    )
    expect(out[0]).toBeNull()
  })

  it('mỗi giao dịch đã có chỉ khớp MỘT dòng — mua hai lần giống nhau thì dòng sau vẫn là mới', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 480, 'カフェ'), item('2026-02-11', 480, 'カフェ')],
      [etx({ type: 'expense', amount: 480, occurred_on: '2026-02-10', account_id: 'card', note: 'カフェ' })],
      opts,
    )
    expect(out[0]?.level).toBe('exact')
    expect(out[1]).toBeNull()
  })

  it('lượt trùng-chắc-chắn chạy trước, không để dòng nghi-trùng chiếm mất giao dịch', () => {
    // Dòng nghi (10/2, ghi chú khác) đứng TRƯỚC dòng khớp y hệt (11/2). Nếu xét
    // tuần tự từng dòng thì dòng đầu chiếm mất giao dịch duy nhất, đẩy dòng khớp
    // chính xác thành "mới" — đúng khoản sẽ bị nhập lại lần hai.
    const out = classifyDuplicates(
      [item('2026-02-10', 900, 'ａ'), item('2026-02-11', 900, 'ｂ')],
      [etx({ type: 'expense', amount: 900, occurred_on: '2026-02-11', account_id: 'card', note: 'ｂ' })],
      opts,
    )
    expect(out[1]?.level).toBe('exact')
    expect(out[0]).toBeNull()
  })
})

describe('mergeStatementFiles', () => {
  it('phần chồng lấn giữa hai sao kê chỉ còn một lần', () => {
    const a = [item('2026-01-30', 500, 'x'), item('2026-01-31', 700, 'y')]
    const b = [item('2026-01-31', 700, 'y'), item('2026-02-01', 900, 'z')]
    const out = mergeStatementFiles([a, b])
    expect(out).toHaveLength(3)
    expect(out.map((i) => i.amount)).toEqual([500, 700, 900])
  })

  it('mua hai lần giống hệt nhau trong CÙNG một file thì giữ đủ hai', () => {
    const a = [item('2026-01-05', 480, 'カフェ'), item('2026-01-05', 480, 'カフェ')]
    const b = [item('2026-01-05', 480, 'カフェ')]
    const out = mergeStatementFiles([a, b])
    expect(out).toHaveLength(2)
  })

  it('xếp lại theo ngày', () => {
    const out = mergeStatementFiles([[item('2026-03-01', 1, 'a')], [item('2026-01-01', 2, 'b')]])
    expect(out.map((i) => i.occurred_on)).toEqual(['2026-01-01', '2026-03-01'])
  })
})

describe('classifyDuplicates — dò chéo ví', () => {
  const cross = { accountId: 'card', crossAccountIds: new Set(['cash', 'bank']) }

  it('cùng tiền, cùng chiều, trong cửa sổ ngày, ở ví KHÁC → mức cross', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 480, 'ドトール')],
      [etx({ type: 'expense', amount: 480, occurred_on: '2026-02-10', account_id: 'cash', note: 'Cà phê' })],
      cross,
    )
    expect(out[0]?.level).toBe('cross')
    expect(out[0]?.matchedAccountId).toBe('cash')
    expect(out[0]?.matchedNote).toBe('Cà phê')
  })

  it('không có crossAccountIds thì KHÔNG dò chéo — hành vi cũ giữ nguyên', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 480, 'ドトール')],
      [etx({ type: 'expense', amount: 480, occurred_on: '2026-02-10', account_id: 'cash', note: 'Cà phê' })],
      opts,
    )
    expect(out[0]).toBeNull()
  })

  it('ví không nằm trong danh sách ứng viên thì bỏ qua', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 480, 'ドトール')],
      [etx({ type: 'expense', amount: 480, occurred_on: '2026-02-10', account_id: 'ngoai-danh-sach', note: 'x' })],
      cross,
    )
    expect(out[0]).toBeNull()
  })

  it('quá cửa sổ ngày thì không dò chéo nữa', () => {
    const out = classifyDuplicates(
      [item('2026-02-20', 480, 'ドトール')],
      [etx({ type: 'expense', amount: 480, occurred_on: '2026-02-10', account_id: 'cash', note: 'x' })],
      cross,
    )
    expect(out[0]).toBeNull()
  })

  it('khoản NGƯỢC chiều ở ví khác không phải việc của dò chéo — đó là chuyển khoản nội bộ', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 480, 'ドトール')],
      [etx({ type: 'income', amount: 480, occurred_on: '2026-02-10', account_id: 'cash', note: 'x' })],
      cross,
    )
    expect(out[0]).toBeNull()
  })

  it('giao dịch kiểu transfer không bị dò chéo nhận nhầm', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 480, 'ドトール')],
      [etx({ type: 'transfer', amount: 480, occurred_on: '2026-02-10', account_id: 'cash', note: 'x' })],
      cross,
    )
    expect(out[0]).toBeNull()
  })

  it('lượt cùng-ví chạy HẾT trước, không để dò chéo chiếm mất khoản khớp chính xác', () => {
    // Dòng chéo ví (10/2) đứng TRƯỚC dòng khớp y hệt trong đúng ví (11/2). Nếu dò
    // chéo chạy xen vào giữa, nó chiếm mất giao dịch ở 'cash' thì không sao — nhưng
    // nếu nó được phép quét cả pool thì dòng đầu có thể ôm luôn giao dịch của 'card',
    // đẩy dòng khớp chính xác thành "mới" và khoản đó bị nhập lại lần hai.
    const out = classifyDuplicates(
      [item('2026-02-10', 900, 'ａ'), item('2026-02-11', 900, 'ｂ')],
      [etx({ type: 'expense', amount: 900, occurred_on: '2026-02-11', account_id: 'card', note: 'ｂ' })],
      cross,
    )
    expect(out[1]?.level).toBe('exact')
    expect(out[0]).toBeNull()
  })

  it('mỗi giao dịch ở ví khác cũng chỉ khớp MỘT dòng', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 480, 'ドトール'), item('2026-02-10', 480, 'ドトール')],
      [etx({ type: 'expense', amount: 480, occurred_on: '2026-02-10', account_id: 'cash', note: 'Cà phê' })],
      cross,
    )
    expect(out[0]?.level).toBe('cross')
    expect(out[1]).toBeNull()
  })

  it('dò chéo và dò chuyển khoản nội bộ KHÔNG BAO GIỜ giành cùng một giao dịch', () => {
    // Hai hàm cùng quét các ví khác, nên phải chứng minh chúng rời nhau: dò chéo đòi
    // CÙNG chiều, dò chuyển khoản đòi NGƯỢC chiều (hoặc type transfer). Dựng sẵn cả
    // hai loại mồi trong một lượt để nếu ai đó nới điều kiện của một bên thì test đổ.
    const items = [item('2026-02-10', 480, 'ドトール'), item('2026-02-12', 3_000, 'チャージ')]
    const existing = [
      etx({ type: 'expense', amount: 480, occurred_on: '2026-02-10', account_id: 'cash', note: 'Cà phê' }),
      etx({ type: 'income', amount: 3_000, occurred_on: '2026-02-12', account_id: 'bank', note: 'Nạp ví' }),
    ]
    const dupes = classifyDuplicates(items, existing, cross)
    const transfers = detectInternalTransfers(items, existing, {
      importingAccountId: 'card',
      candidateAccountIds: new Set(['cash', 'bank']),
    })
    const dupIds = new Set(dupes.filter((d) => d !== null).map((d) => d!.matchedTxId))
    const transferIds = transfers.map((t) => t.matchedTxId)
    expect(dupIds.size).toBeGreaterThan(0)
    expect(transferIds.length).toBeGreaterThan(0)
    for (const id of transferIds) expect(dupIds.has(id)).toBe(false)
  })
})

describe('mergedNote', () => {
  it('nối ghi chú tay với tên quán từ sao kê', () => {
    expect(mergedNote('Cơm ngoài', '串かつ　でんがな')).toBe('Cơm ngoài · 串かつ　でんがな')
  })

  it('ghi chú cũ trống thì lấy hẳn tên quán', () => {
    expect(mergedNote('', '串かつ　でんがな')).toBe('串かつ　でんがな')
    expect(mergedNote('   ', '串かつ　でんがな')).toBe('串かつ　でんがな')
  })

  it('sao kê không có tên quán thì giữ nguyên ghi chú cũ', () => {
    expect(mergedNote('Cơm ngoài', '')).toBe('Cơm ngoài')
    expect(mergedNote('Cơm ngoài', '  ')).toBe('Cơm ngoài')
  })

  it('gộp LẦN HAI không nối thêm nữa — nhập lại cùng file không làm ghi chú dài ra', () => {
    const lan1 = mergedNote('Cơm ngoài', '串かつ　でんがな')
    expect(mergedNote(lan1, '串かつ　でんがな')).toBe(lan1)
  })

  it('tên quán người dùng đã tự gõ trong câu thì không nối lại', () => {
    expect(mergedNote('Ăn ở ドトール với anh Tuấn', 'ドトール')).toBe('Ăn ở ドトール với anh Tuấn')
  })

  it('cả hai cùng trống thì ra chuỗi rỗng', () => {
    expect(mergedNote('', '')).toBe('')
  })
})
