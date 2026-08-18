// Sổ lệnh quỹ ở demoRepo: soi hình dạng theo `kind` y như CHECK fund_trades_shape của
// Postgres (migration 0045). Bản demo là chỗ DUY NHẤT bắt được lỗi hình dạng trước khi nó
// thành một câu INSERT bị 23514 ở production.
import { beforeEach, describe, expect, it } from 'vitest'
import { demoRepo, resetDemoData } from './demoRepo'

// Tài khoản đầu tư JPY có sẵn trong dữ liệu demo — lấy động, không viết cứng id.
async function taiKhoanQuyJPY(): Promise<string> {
  const accs = await demoRepo.getAccounts()
  const a = accs.find((x) => x.type === 'investment' && x.currency === 'JPY')
  if (!a) throw new Error('dữ liệu demo thiếu tài khoản đầu tư JPY')
  return a.id
}

const SP500 = '9I31223A'

describe('demoRepo — sổ lệnh quỹ', () => {
  // Vitest chạy môi trường node → không có localStorage. Cài bản giả trong bộ nhớ,
  // giống demoRepo.test.ts.
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

  it('danh bạ quỹ demo có đủ hai quỹ Rakuten và bảng giá kèm theo', async () => {
    const funds = await demoRepo.getFunds()
    expect(funds.map((f) => f.assoc_fund_cd)).toContain(SP500)
    const prices = await demoRepo.getFundPrices()
    expect(prices.find((p) => p.assoc_fund_cd === SP500)?.nav).toBeGreaterThan(0)
  })

  it('ghi lệnh mua rồi đọc lại được', async () => {
    const account_id = await taiKhoanQuyJPY()
    const row = await demoRepo.createFundTrade({
      account_id,
      assoc_fund_cd: SP500,
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 28_429,
      nav: 17_588,
      amount: 50_000,
      bucket: 'NISAつみたて投資枠',
      note: '',
    })
    expect(row.units).toBe(28_429)
    expect(row.amount).toBe(50_000)
    const all = await demoRepo.getFundTrades()
    expect(all.some((t) => t.id === row.id)).toBe(true)
  })

  it('lệnh mua có amount = 0 bị từ chối (CHECK fund_trades_shape)', async () => {
    const account_id = await taiKhoanQuyJPY()
    await expect(
      demoRepo.createFundTrade({
        account_id,
        assoc_fund_cd: SP500,
        kind: 'buy',
        traded_on: '2026-04-09',
        units: 100,
        nav: 17_588,
        amount: 0,
        bucket: '',
        note: '',
      }),
    ).rejects.toThrow()
  })

  it('lệnh adjust phải có nav = 0 và amount = 0, units khác 0', async () => {
    const account_id = await taiKhoanQuyJPY()
    // Hợp lệ: 分配金再投資.
    await expect(
      demoRepo.createFundTrade({
        account_id,
        assoc_fund_cd: SP500,
        kind: 'adjust',
        traded_on: '2026-05-01',
        units: 1_000,
        nav: 0,
        amount: 0,
        bucket: '',
        note: '',
      }),
    ).resolves.toBeTruthy()
    // Không hợp lệ: adjust mà có nav.
    await expect(
      demoRepo.createFundTrade({
        account_id,
        assoc_fund_cd: SP500,
        kind: 'adjust',
        traded_on: '2026-05-01',
        units: 1_000,
        nav: 17_588,
        amount: 0,
        bucket: '',
        note: '',
      }),
    ).rejects.toThrow()
  })

  it('sửa lệnh soi hình dạng SAU khi trộn patch, không chỉ lúc tạo', async () => {
    const account_id = await taiKhoanQuyJPY()
    const row = await demoRepo.createFundTrade({
      account_id,
      assoc_fund_cd: SP500,
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 100,
      nav: 17_588,
      amount: 50_000,
      bucket: '',
      note: '',
    })
    // Đổi sang 'adjust' mà không dọn nav/amount → phải đỏ, y như Postgres soi dòng kết quả.
    await expect(demoRepo.updateFundTrade(row.id, { kind: 'adjust' })).rejects.toThrow()
    // Đổi sang 'adjust' kèm dọn sạch thì được.
    await expect(
      demoRepo.updateFundTrade(row.id, { kind: 'adjust', nav: 0, amount: 0 }),
    ).resolves.toBeTruthy()
  })

  it('sửa lệnh soi hình dạng phải chạy trên bản đã trộn, không phải patch thô (ca: đổi kind sang sell mà không kèm units)', async () => {
    // Ca DUY NHẤT phân biệt được "soi trên bản đã trộn" với "soi trên patch thô": đổi riêng
    // `kind` sang 'sell' mà không kèm units/amount. Trên bản đã trộn thì units=100 và
    // amount=50.000 của hàng cũ vẫn đó nên hợp lệ; nhưng nếu ai đó soi trên `patch` thô
    // (khác với code hiện tại đúng) thì `patch.units` là undefined và phép soi ném lỗi.
    // Hai khẳng định ở bài test trước cho ra CÙNG kết quả ở cả hai cách gọi assertFundTradeShape,
    // nên chỉ chúng thôi chứng minh không được gì — bài test này gán chốt canh thực sự phân biệt.
    const account_id = await taiKhoanQuyJPY()
    const newRow = await demoRepo.createFundTrade({
      account_id,
      assoc_fund_cd: SP500,
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 100,
      nav: 17_588,
      amount: 50_000,
      bucket: '',
      note: '',
    })
    // Đổi sang 'sell' mà không kèm units/amount: nên hợp lệ vì units/amount lấy từ lệnh cũ,
    // nhưng nếu soi trên patch thô (bug) thì patch.units=undefined → lỗi "Lệnh mua/bán phải có
    // số 口数 dương".
    await expect(demoRepo.updateFundTrade(newRow.id, { kind: 'sell' })).resolves.toBeTruthy()
  })

  it('xoá lệnh thì nó biến khỏi danh sách', async () => {
    const account_id = await taiKhoanQuyJPY()
    const row = await demoRepo.createFundTrade({
      account_id,
      assoc_fund_cd: SP500,
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 100,
      nav: 17_588,
      amount: 1_000,
      bucket: '',
      note: '',
    })
    await demoRepo.deleteFundTrade(row.id)
    expect((await demoRepo.getFundTrades()).some((t) => t.id === row.id)).toBe(false)
  })

  it('KHÔNG xoá được tài khoản còn sổ lệnh quỹ', async () => {
    // fund_trades có `on delete cascade` ở DB — không chặn ở tầng repo thì xoá tài khoản
    // là XOÁ LUÔN sổ lệnh mà không ai hỏi, ngược hẳn với mọi bảng khác.
    //
    // Tài khoản DỰNG RIÊNG, không dùng tài khoản NISA của dữ liệu demo: từ khi demo có 24
    // tháng lịch sử, NISA còn cả giao dịch "Nạp NISA" mỗi tháng, nên chốt chặn "còn giao
    // dịch" nổ TRƯỚC và phép thử này không còn kiểm được chốt chặn nó muốn kiểm. Cả hai
    // chốt đều đúng — chỉ là phải soi từng cái một.
    const account_id = (
      await demoRepo.createAccount({
        name: 'Quỹ trống (chỉ có sổ lệnh)',
        type: 'investment',
        currency: 'JPY',
        initial_balance: 0,
        asset_group: null,
        is_hidden: false,
        include_in_totals: true,
      })
    ).id
    await demoRepo.createFundTrade({
      account_id,
      assoc_fund_cd: SP500,
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 100,
      nav: 17_588,
      amount: 1_000,
      bucket: '',
      note: '',
    })
    await expect(demoRepo.deleteAccount(account_id)).rejects.toThrow(/sổ lệnh quỹ/)
  })
})
