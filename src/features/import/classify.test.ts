import { describe, expect, it } from 'vitest'
import {
  buildNoteHistory,
  detectPossibleDuplicates,
  guessCategory,
  matchKeyword,
  type DuplicateExisting,
  type HistoryTx,
  type KeywordCategory,
} from './classify'

const tx = (p: Partial<HistoryTx> = {}): HistoryTx => ({
  note: 'ファミリーマート',
  type: 'expense',
  category_id: 'an-ngoai',
  occurred_on: '2026-06-10',
  ...p,
})

describe('buildNoteHistory', () => {
  it('nhớ danh mục theo ghi chú, bỏ qua hoa/thường và dấu', () => {
    const h = buildNoteHistory([tx({ note: 'Cơm Trưa', category_id: 'bua-trua' })])
    expect(h.get('expense|com trua')).toBe('bua-trua')
  })

  it('lần gần nhất thắng (người dùng sửa lại danh mục cho cửa hàng đó)', () => {
    const h = buildNoteHistory([
      tx({ note: 'Family Mart', occurred_on: '2026-05-01', category_id: 'cu' }),
      tx({ note: 'Family Mart', occurred_on: '2026-07-01', category_id: 'moi' }),
    ])
    expect(h.get('expense|family mart')).toBe('moi')
  })

  it('tách theo chiều Chi/Thu, bỏ giao dịch thiếu danh mục hoặc ghi chú', () => {
    const h = buildNoteHistory([
      tx({ note: 'Rakuten', type: 'income', category_id: 'thu-khac' }),
      tx({ note: 'Rakuten', category_id: 'chi-khac' }),
      tx({ note: '   ', category_id: 'x' }),
      tx({ note: 'Suica', category_id: null }),
      tx({ note: 'Trả thẻ', type: 'transfer', category_id: 'y' }),
    ])
    expect(h.get('income|rakuten')).toBe('thu-khac')
    expect(h.get('expense|rakuten')).toBe('chi-khac')
    expect(h.size).toBe(2)
  })
})

const cats: KeywordCategory[] = [
  { id: 'an-ngoai', type: 'expense', is_archived: false, import_keywords: ['ファミリーマート', 'ローソン'] },
  { id: 'ca-phe', type: 'expense', is_archived: false, import_keywords: ['ファミリーマート 渋谷'] },
  { id: 'tau-dien', type: 'expense', is_archived: false, import_keywords: ['suica'] },
  { id: 'luong', type: 'income', is_archived: false, import_keywords: ['kyuyo'] },
  { id: 'cu', type: 'expense', is_archived: true, import_keywords: ['amazon'] },
  { id: 'trong', type: 'expense', is_archived: false, import_keywords: null },
]

describe('matchKeyword', () => {
  it('khớp khi ghi chú CHỨA từ khoá, không phân biệt hoa thường và dấu', () => {
    expect(matchKeyword('モバイルSUICA チャージ', 'expense', cats)).toBe('tau-dien')
    expect(matchKeyword('ローソン 新宿', 'expense', cats)).toBe('an-ngoai')
  })

  it('từ khoá dài hơn (cụ thể hơn) thắng', () => {
    expect(matchKeyword('ファミリーマート 渋谷店', 'expense', cats)).toBe('ca-phe')
    expect(matchKeyword('ファミリーマート 新宿店', 'expense', cats)).toBe('an-ngoai')
  })

  it('sai chiều, danh mục đã lưu trữ, hoặc ghi chú rỗng → null', () => {
    expect(matchKeyword('KYUYO 7gatsu', 'expense', cats)).toBeNull()
    expect(matchKeyword('KYUYO 7gatsu', 'income', cats)).toBe('luong')
    expect(matchKeyword('Amazon.co.jp', 'expense', cats)).toBeNull()
    expect(matchKeyword('   ', 'expense', cats)).toBeNull()
  })
})

describe('guessCategory', () => {
  const history = buildNoteHistory([tx({ note: 'Amazon.co.jp', category_id: 'do-bep' })])
  const base = { type: 'expense' as const, history, categories: cats, fallback: 'khac' }

  it('cột trong file thắng tất cả', () => {
    expect(guessCategory({ ...base, note: 'Amazon.co.jp', fromFile: 'tu-file' })).toEqual({
      category_id: 'tu-file',
      source: 'file',
    })
  })

  it('không có cột thì lấy lịch sử', () => {
    expect(guessCategory({ ...base, note: 'amazon.co.JP', fromFile: null })).toEqual({
      category_id: 'do-bep',
      source: 'history',
    })
  })

  it('lịch sử không có thì tra từ khoá', () => {
    expect(guessCategory({ ...base, note: 'ローソン 池袋', fromFile: null })).toEqual({
      category_id: 'an-ngoai',
      source: 'keyword',
    })
  })

  it('không nguồn nào khớp thì dùng danh mục mặc định', () => {
    expect(guessCategory({ ...base, note: 'Cửa hàng lạ', fromFile: null })).toEqual({
      category_id: 'khac',
      source: 'fallback',
    })
  })

  it('chưa chọn danh mục mặc định → null để UI chặn nhập', () => {
    expect(guessCategory({ ...base, note: 'Cửa hàng lạ', fromFile: null, fallback: null })).toEqual({
      category_id: null,
      source: 'none',
    })
  })
})

describe('detectPossibleDuplicates', () => {
  const item = (key: string, occurred_on: string, amount: number, note: string) => ({
    key,
    occurred_on,
    amount,
    type: 'expense' as const,
    note,
  })
  const ex = (p: Partial<DuplicateExisting> = {}): DuplicateExisting => ({
    id: 'e1',
    account_id: 'card',
    note: 'Cơm trưa',
    type: 'expense',
    category_id: 'bua-trua',
    occurred_on: '2026-07-02',
    amount: 680,
    ...p,
  })
  const opts = { accountId: 'card' }

  it('cùng ngày + cùng tiền + cùng chiều nhưng khác ghi chú → nghi trùng', () => {
    const found = detectPossibleDuplicates(
      [item('k1', '2026-07-02', 680, 'ファミリーマート')],
      [ex()],
      opts,
    )
    expect(found).toEqual([{ key: 'k1', matchedTxId: 'e1', matchedNote: 'Cơm trưa' }])
  })

  it('ghi chú giống hệt thì không cảnh báo (trang nhập đã lọc trùng thật)', () => {
    expect(
      detectPossibleDuplicates([item('k1', '2026-07-02', 680, 'cơm TRƯA')], [ex()], opts),
    ).toEqual([])
  })

  it('lệch ngày, lệch tiền, khác chiều, hoặc ví khác → không nghi', () => {
    expect(
      detectPossibleDuplicates([item('k1', '2026-07-03', 680, 'ファミマ')], [ex()], opts),
    ).toEqual([])
    expect(
      detectPossibleDuplicates([item('k1', '2026-07-02', 681, 'ファミマ')], [ex()], opts),
    ).toEqual([])
    expect(
      detectPossibleDuplicates(
        [item('k1', '2026-07-02', 680, 'ファミマ')],
        [ex({ type: 'income' })],
        opts,
      ),
    ).toEqual([])
    expect(
      detectPossibleDuplicates(
        [item('k1', '2026-07-02', 680, 'ファミマ')],
        [ex({ account_id: 'bank' })],
        opts,
      ),
    ).toEqual([])
  })

  it('một giao dịch cũ chỉ nghi cho một dòng', () => {
    const found = detectPossibleDuplicates(
      [item('k1', '2026-07-02', 680, 'ファミマ A'), item('k2', '2026-07-02', 680, 'ファミマ B')],
      [ex()],
      opts,
    )
    expect(found.map((f) => f.key)).toEqual(['k1'])
  })
})
