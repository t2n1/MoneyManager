import { describe, it, expect } from 'vitest'
import { transformRows, buildNote, parseYen, makeKey } from './transform.mjs'

// Dựng 1 dòng Zaim 16 cột cho gọn.
function row(o = {}) {
  const r = Array(16).fill('')
  r[0] = o.date ?? '2024-01-02'
  r[1] = o.method ?? 'payment'
  r[2] = o.main ?? '食費'
  r[3] = o.sub ?? '昼ご飯'
  r[4] = o.from ?? 'お財布'
  r[5] = o.to ?? '-'
  r[6] = o.item ?? ''
  r[7] = o.memo ?? ''
  r[8] = o.store ?? ''
  r[9] = o.currency ?? 'JPY'
  r[10] = o.income ?? '0'
  r[11] = o.expense ?? '0'
  r[12] = o.transfer ?? ''
  r[13] = o.balanceAdj ?? ''
  r[15] = o.agg ?? '常に集計に含める'
  return r
}

/** Ví -> tài khoản, để hai đầu chuyển khoản ra hai id khác nhau. */
const WALLETS = { お財布: 'acc-vi', ゆうちょ: 'acc-yucho', 楽天: 'acc-rakuten' }
function walletCtx(over = {}) {
  return ctx({ resolveAccountId: (w) => WALLETS[w] ?? 'acc-mac-dinh', ...over })
}

function ctx(over = {}) {
  let n = 0
  return {
    resolveAccountId: () => 'acc-1',
    resolveCategoryId: () => 'cat-1',
    existingKeys: new Set(),
    userId: 'user-1',
    now: '2026-07-31T00:00:00.000Z',
    newId: () => `id-${++n}`,
    ...over,
  }
}

describe('parseYen', () => {
  it('đọc số nguyên, coi rỗng/‑ là null', () => {
    expect(parseYen('500')).toBe(500)
    expect(parseYen('-100')).toBe(-100)
    expect(parseYen('')).toBeNull()
    expect(parseYen('-')).toBeNull()
    expect(parseYen('0')).toBe(0)
  })

  it('đọc được số có dấu phân cách nghìn, ¥ và khoảng trắng', () => {
    expect(parseYen('1,200')).toBe(1200)
    expect(parseYen('¥1,200')).toBe(1200)
    expect(parseYen(' 1 200 ')).toBe(1200)
    expect(parseYen('-1,200')).toBe(-1200)
  })

  it('đọc được chữ số toàn rộng (khi Zaim xuất ra 全角)', () => {
    expect(parseYen('１２００')).toBe(1200)
  })

  it('trả NaN khi KHÔNG đọc được — không được lẫn vào 0', () => {
    expect(parseYen('abc')).toBeNaN()
    expect(parseYen('1.2.3')).toBeNaN()
  })
})

describe('buildNote', () => {
  it('ghép お店·メモ·品目, bỏ rỗng và -', () => {
    const r = row({ store: 'Amazon', memo: '', item: '-' })
    expect(buildNote(r)).toBe('Amazon')
    expect(buildNote(row({ store: 'A', memo: 'B', item: 'C' }))).toBe('A · B · C')
  })
})

describe('transformRows', () => {
  it('payment -> expense, lấy tiền cột 支出', () => {
    const { items, stats } = transformRows([row({ expense: '500' })], ctx())
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'expense', amount: 500, category_id: 'cat-1', account_id: 'acc-1' })
    expect(items[0].to_account_id).toBeNull()
    expect(stats.imported).toBe(1)
  })

  it('income -> income, lấy tiền cột 収入 và ví 入金先', () => {
    const cx = ctx({ resolveAccountId: (w) => (w === 'LINE Pay' ? 'acc-line' : 'acc-x') })
    const { items } = transformRows(
      [row({ method: 'income', main: '給与所得', to: 'LINE Pay', income: '45000' })],
      cx,
    )
    expect(items[0]).toMatchObject({ type: 'income', amount: 45000, account_id: 'acc-line' })
  })

  it('bỏ transfer và balance, đếm theo method', () => {
    const { items, stats } = transformRows(
      [row({ method: 'transfer' }), row({ method: 'balance' }), row({ expense: '100' })],
      ctx(),
    )
    expect(items).toHaveLength(1)
    expect(stats.skipMethod).toEqual({ transfer: 1, balance: 1 })
  })

  it('bỏ dòng tiền = 0', () => {
    const { items, stats } = transformRows([row({ expense: '0' })], ctx())
    expect(items).toHaveLength(0)
    expect(stats.skipZero).toBe(1)
  })

  it('chi âm -> is_refund, amount dương', () => {
    const { items, stats } = transformRows([row({ expense: '-100' })], ctx())
    expect(items[0]).toMatchObject({ type: 'expense', amount: 100, is_refund: true })
    expect(stats.refund).toBe(1)
  })

  it('集計に含めない -> exclude_from_stats', () => {
    const { items, stats } = transformRows([row({ expense: '500', agg: '集計に含めない' })], ctx())
    expect(items[0].exclude_from_stats).toBe(true)
    expect(stats.excluded).toBe(1)
  })

  it('danh mục trả null -> bỏ qua, gom theo main>sub', () => {
    const cx = ctx({ resolveCategoryId: () => null })
    const { items, stats } = transformRows([row({ main: '証券', sub: '投資信託', expense: '100' })], cx)
    expect(items).toHaveLength(0)
    expect(stats.skipCategory).toEqual({ '証券>投資信託': 1 })
    expect(stats.skipCategoryTotal).toBe(1)
  })

  it('tiền không đọc được -> bucket RIÊNG, không lẫn vào "tiền = 0"', () => {
    const { items, stats } = transformRows([row({ expense: 'khong-phai-so' })], ctx())
    expect(items).toHaveLength(0)
    expect(stats.skipZero).toBe(0)
    expect(stats.badAmount).toBe(1)
    expect(stats.badAmountSamples[0]).toMatchObject({ date: '2024-01-02', raw: 'khong-phai-so' })
  })

  it('tiền có dấu phẩy vẫn nạp đúng, KHÔNG bị bỏ', () => {
    const { items, stats } = transformRows([row({ expense: '1,200' })], ctx())
    expect(items).toHaveLength(1)
    expect(items[0].amount).toBe(1200)
    expect(stats.skipZero).toBe(0)
    expect(stats.badAmount).toBe(0)
  })

  it('dòng tiền tệ khác JPY -> bỏ và đếm riêng (số tiền sẽ sai nếu nạp)', () => {
    const { items, stats } = transformRows(
      [row({ expense: '500', currency: 'USD' }), row({ expense: '500', currency: 'JPY' })],
      ctx(),
    )
    expect(items).toHaveLength(1)
    expect(stats.nonJpy).toEqual({ USD: 1 })
  })

  it('ngày sai định dạng -> bỏ và đếm riêng, không nhét rác vào occurred_on', () => {
    const { items, stats } = transformRows(
      [row({ date: '2024/01/02', expense: '500' }), row({ date: '', expense: '500' })],
      ctx(),
    )
    expect(items).toHaveLength(0)
    expect(stats.badDate).toBe(2)
  })

  it('dòng lệch số cột -> bỏ và đếm riêng, KHÔNG đọc bừa cột sai', () => {
    // Ô tiền có dấu phẩy mà không được bọc nháy kép làm cả dòng lệch sang phải:
    // cột 11 khi đó là mảnh "500" chứ không phải số tiền thật 1500.
    const shifted = [...row({ expense: '1' }), 'thua-cot']
    const { items, stats } = transformRows([shifted], ctx())
    expect(items).toHaveLength(0)
    expect(stats.badColumns).toBe(1)
  })

  it('dòng thừa cột RỖNG (dấu phẩy cuối dòng) vẫn nạp bình thường', () => {
    const trailing = [...row({ expense: '500' }), '', '']
    const { items, stats } = transformRows([trailing], ctx())
    expect(items).toHaveLength(1)
    expect(items[0].amount).toBe(500)
    expect(stats.badColumns).toBe(0)
  })

  it('dòng thiếu cột -> badColumns', () => {
    const { stats } = transformRows([row({ expense: '500' }).slice(0, 12)], ctx())
    expect(stats.badColumns).toBe(1)
  })

  it('mọi dòng đều được kể tên: nạp + các loại bỏ = tổng dòng', () => {
    const rows = [
      row({ expense: '500' }),
      row({ method: 'transfer' }),
      row({ expense: '0' }),
      row({ expense: 'xx' }),
      row({ date: 'sai', expense: '500' }),
      row({ expense: '500', currency: 'USD' }),
      [...row({ expense: '500' }), 'lech'],
    ]
    const { items, stats } = transformRows(rows, ctx())
    const skipped =
      Object.values(stats.skipMethod).reduce((a, b) => a + b, 0) +
      stats.skipZero +
      stats.badAmount +
      stats.badColumns +
      stats.badDate +
      Object.values(stats.nonJpy).reduce((a, b) => a + b, 0) +
      stats.skipCategoryTotal +
      stats.dup
    expect(items.length + skipped).toBe(stats.total)
  })

  it('trùng giao dịch đã có -> bỏ, KHÔNG trùng trong cùng file', () => {
    const two = [row({ expense: '500' }), row({ expense: '500' })]
    const key = makeKey('2024-01-02', 'expense', 500, 'acc-1', '')
    // Đã có 1 bản trong app: chỉ dòng khớp key bị coi trùng, nhưng cả hai dòng
    // cùng key -> cả hai đều bị coi trùng (chấp nhận, hiếm gặp).
    const { items, stats } = transformRows(two, ctx({ existingKeys: new Set([key]) }))
    expect(items).toHaveLength(0)
    expect(stats.dup).toBe(2)

    // Không có sẵn -> giữ cả hai (hai bữa trưa 500¥ cùng ngày là thật).
    const fresh = transformRows(two, ctx())
    expect(fresh.items).toHaveLength(2)
  })
})

describe('bỏ hẳn chuyển khoản (振替) — sổ chỉ giữ chi tiêu thực tế', () => {
  const tf = (o = {}) => row({ method: 'transfer', from: 'ゆうちょ', to: '楽天', ...o })

  it('mọi dòng 振替 đều bị bỏ, đếm vào skipMethod.transfer bất kể số tiền/ví', () => {
    const rows = [
      tf({ transfer: '50000' }), // chuyển khoản bình thường
      tf({ transfer: '-2500' }), // số âm
      tf({ transfer: '', expense: '3000' }), // tiền nằm ở cột 支出
      tf({ from: 'Ví lạ A', to: 'Ví lạ B', transfer: '1000' }), // hai ví lạ
    ]
    const { items, stats } = transformRows(rows, walletCtx())
    expect(items).toHaveLength(0)
    expect(stats.skipMethod.transfer).toBe(4)
  })

  it('không còn để lại giao dịch type=transfer nào (báo cáo sẽ không vỡ)', () => {
    const { items } = transformRows([tf({ transfer: '50000' })], walletCtx())
    expect(items.every((t) => t.type !== 'transfer')).toBe(true)
  })

  it('残高調整 (balance) cũng bị bỏ như trước', () => {
    const { items, stats } = transformRows([row({ method: 'balance', balanceAdj: '10000' })], walletCtx())
    expect(items).toHaveLength(0)
    expect(stats.skipMethod.balance).toBe(1)
  })
})

describe('bỏ chuyển tiền lọt vào "Khác" (送金/振込/ワイズ)', () => {
  // Dùng danh mục THẬT qua resolveCategoryPath — nên test đặt main/sub Zaim thật,
  // còn resolveCategoryId (mock) chỉ trả id để dòng không bị chặn bởi SKIP danh mục.
  it('chi その他 + ghi chú 送金/振込/ワイズ -> bỏ, đếm skipOutgoingTransfer', () => {
    const rows = [
      row({ main: 'その他', sub: '-', expense: '300000', store: '送金 TRAN THI' }),
      row({ main: 'その他', sub: '-', expense: '488316', store: 'ワイズペイメンツ 振込予定日' }),
      row({ main: 'その他', sub: '-', expense: '145', store: '振込手数料' }),
    ]
    const { items, stats } = transformRows(rows, ctx())
    expect(items).toHaveLength(0)
    expect(stats.skipOutgoingTransfer).toBe(3)
  })

  it('chi THẬT trả bằng chuyển khoản (nước/học phí/đi chợ) -> GIỮ', () => {
    const rows = [
      row({ main: '水道・光熱', sub: '水道料金', expense: '2602', store: '振込 アスマフドウサン' }),
      row({ main: '教育・教養', sub: 'Học phí', expense: '200000', store: '振込 Học lái xe' }),
      row({ main: '食費', sub: '食料品', expense: '25200', store: '送金 DINH THI' }),
    ]
    const { items, stats } = transformRows(rows, ctx())
    expect(items).toHaveLength(3)
    expect(stats.skipOutgoingTransfer).toBe(0)
  })

  it('その他 mua sắm thường (không phải chuyển tiền) -> GIỮ', () => {
    const { items, stats } = transformRows(
      [row({ main: 'その他', sub: '-', expense: '1500', store: 'Amazon' })],
      ctx(),
    )
    expect(items).toHaveLength(1)
    expect(stats.skipOutgoingTransfer).toBe(0)
  })
})
