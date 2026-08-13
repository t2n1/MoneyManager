// Test cho các hàm thuần của scripts/nhap-sao-ke-rakuten.mjs.
//
// Ở tests/ chứ không src/: script là .mjs thuần và đọc filesystem qua `node:*`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// Đuôi `.ts` tường minh: tsconfig.node.json (bao `tests/`) dùng module nodenext, nên
// import tương đối phải có đuôi — `allowImportingTsExtensions` đã bật cho đúng việc này.
import { fundHoldingsFromTrades, type FundTrade } from '../src/features/assets/fundHoldings.ts'
import {
  docSaoKe,
  docThamSoTaiKhoan,
  donDauVao,
  ghepBiDanh,
  khoaTrung,
  locLenhQuy,
  locTrung,
  soatHinhDang,
  soatSoDuAm,
  // @ts-expect-error — script viết bằng .mjs thuần, không có khai báo kiểu. Directive phải
  // nằm ngay trên dòng có đường dẫn: TypeScript báo lỗi ở chỗ chuỗi module, không ở chữ
  // `import`.
} from '../scripts/nhap-sao-ke-rakuten.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const mau = new Uint8Array(readFileSync(join(ROOT, 'scripts', 'testdata', 'rakuten-uydo-mau.csv')))

const SP500 = '9I31223A'
const NDX = '9I314241'
/** Bí danh ĐỦ — cả tên cũ lẫn tên mới trỏ về cùng một quỹ. */
const BI_DANH_DU = new Map([
  ['楽天・プラス・Ｓ＆Ｐ５００インデックス・ファンド(楽天・プラス・Ｓ＆Ｐ５００)/再投資型', SP500],
  ['楽天・Ｓ＆Ｐ５００インデックス・ファンド(楽天・Ｓ＆Ｐ５００)/再投資型', SP500],
])
/** Bí danh THIẾU tên cũ — đúng cái bẫy đã đo được. */
const BI_DANH_THIEU = new Map([
  ['楽天・プラス・Ｓ＆Ｐ５００インデックス・ファンド(楽天・プラス・Ｓ＆Ｐ５００)/再投資型', SP500],
])

describe('docSaoKe', () => {
  it('đọc Shift-JIS, header ra đúng chữ Nhật', () => {
    const { header } = docSaoKe(mau)
    expect(header[0]).toBe('受渡日')
    expect(header[1]).toBe('約定日')
    expect(header[4]).toBe('対象証券名')
  })

  it('từ chối file không phải sao kê 受渡履歴', () => {
    expect(() => docSaoKe(new TextEncoder().encode('a,b,c\n1,2,3\n'))).toThrow(/受渡日/)
  })

  it('KHÔNG đọc được nếu file là UTF-8 — bài canh chống bẫy Shift-JIS', () => {
    const utf8 = new TextEncoder().encode('受渡日,約定日,取引区分\r\n"a","b","c"\r\n')
    expect(() => docSaoKe(utf8)).toThrow()
  })

  it('ngoặc kép mở mà không đóng → NÊU SỐ DÒNG rồi ném lỗi, không gộp cột im lặng', () => {
    // tachDong lật cờ trongNgoac, nên `"a,b,c` (thiếu ngoặc đóng) ra ĐÚNG MỘT ô: mọi cột
    // phía sau lùi chỗ và units/nav/amount ra số rác mà không lỗi nào bật lên. Đây là ca
    // file bị cắt giữa dòng hoặc tải về dở.
    // Header lấy nguyên BYTE của file mẫu: nó là Shift-JIS, mà Node không có bộ mã hoá
    // Shift-JIS nên không dựng lại được bằng TextEncoder (utf-8) — dựng bằng utf-8 thì
    // hàm dừng ở câu chặn "không phải sao kê" trước, và bài này canh nhầm chỗ.
    const hetHeader = mau.indexOf(0x0a) + 1
    const dongHong = new TextEncoder().encode('"a,b,c\r\n') // ASCII, trùng với Shift-JIS
    const hong = new Uint8Array(hetHeader + dongHong.length)
    hong.set(mau.subarray(0, hetHeader))
    hong.set(dongHong, hetHeader)
    // Số dòng phải là 2 (dòng dữ liệu đầu tiên trong FILE), không phải 1 hay 0.
    expect(() => docSaoKe(hong)).toThrow(/Dòng 2 có 1 ô, header có 10 ô/)
  })

  it('file lành → mọi dòng đúng số ô của header', () => {
    const { header, dong } = docSaoKe(mau)
    for (const o of dong) expect(o).toHaveLength(header.length)
  })
})

describe('locLenhQuy', () => {
  it('chỉ nhận ba loại lệnh quỹ, đếm và nêu tên mọi loại đã bỏ', () => {
    const { lenh, boQua } = locLenhQuy(docSaoKe(mau).dong)
    expect(lenh).toHaveLength(3)
    // Ba dòng tiền phải bị bỏ, và phải được NÊU TÊN — bỏ im lặng là chỗ dễ mất dữ liệu.
    expect(boQua.get('入金(クレジットカード決済ご利用分)')).toBe(1)
    expect(boQua.get('入金(楽天ポイント交換)')).toBe(1)
    expect(boQua.get('自動出金(スイープ)')).toBe(1)
  })

  it('dùng cột 約定日 làm traded_on, KHÔNG dùng 受渡日', () => {
    const { lenh } = locLenhQuy(docSaoKe(mau).dong)
    // Kiểu `any` ở tham số lambda: `lenh` đến từ script .mjs thuần không có khai báo
    // kiểu, nên TypeScript không có gì để suy ra ở đây — không phải giá trị thật đổi.
    const muaMoi = lenh.find((l: any) => l.units === 28_429)
    // 受渡 2026/4/14, 約定 2026/4/9 — lệch 5 ngày. Lấy nhầm cột thì mọi phép lấp lịch sử
    // và mọi phép đối chiếu NAV đều lệch.
    expect(muaMoi.tradedOn).toBe('2026-04-09')
  })

  it('bóc đúng số: bỏ dấu phẩy, `-` thành 0, đơn giá làm tròn về số nguyên', () => {
    const { lenh } = locLenhQuy(docSaoKe(mau).dong)
    const muaMoi = lenh.find((l: any) => l.units === 28_429)
    expect(muaMoi.nav).toBe(17_588)
    expect(muaMoi.amount).toBe(50_000)
    expect(muaMoi.kind).toBe('buy')
    expect(muaMoi.bucket).toBe('NISAつみたて投資枠')
    const banRa = lenh.find((l: any) => l.kind === 'sell')
    // Lệnh bán lấy số tiền ở cột 受渡金額（受取）, không phải cột （支払）.
    expect(banRa.amount).toBe(27_575)
  })
})

describe('ghepBiDanh + soatSoDuAm — bẫy quỹ đổi tên', () => {
  it('đủ bí danh → mọi tên ghép được, số dư khớp', () => {
    const { lenh } = locLenhQuy(docSaoKe(mau).dong)
    const { xong, tenLa } = ghepBiDanh(lenh, BI_DANH_DU)
    expect(tenLa).toEqual([])
    expect(soatSoDuAm(xong)).toEqual([])
    // 19.848 (mua, tên cũ) − 19.848 (bán, tên mới) + 28.429 (mua, tên mới) = 28.429
    const tong = xong
      .filter((l: any) => l.assocFundCd === SP500)
      .reduce((s: number, l: any) => s + (l.kind === 'sell' ? -l.units : l.units), 0)
    expect(tong).toBe(28_429)
  })

  it('THIẾU bí danh tên cũ → tên lạ được nêu ra, KHÔNG đoán bừa', () => {
    const { lenh } = locLenhQuy(docSaoKe(mau).dong)
    const { tenLa } = ghepBiDanh(lenh, BI_DANH_THIEU)
    expect(tenLa).toHaveLength(1)
    expect(tenLa[0]).toContain('楽天・Ｓ＆Ｐ５００')
  })

  // Bài RIÊNG, không gộp vào bài trên: gộp lại thì `toHaveLength(1)` đỏ trước và câu
  // khẳng định về số dư âm KHÔNG BAO GIỜ chạy tới — một chốt canh viết ra mà không bao
  // giờ đỏ nổi thì không canh gì cả.
  it('THIẾU bí danh tên cũ → số dư âm là chốt canh thứ hai, độc lập với cảnh báo tên lạ', () => {
    const { lenh } = locLenhQuy(docSaoKe(mau).dong)
    const { xong } = ghepBiDanh(lenh, BI_DANH_THIEU)
    expect(soatSoDuAm(xong)).toEqual([SP500])
  })
})

describe('soatSoDuAm là CÙNG MỘT phép tính với oversold của bộ luật', () => {
  /**
   * Bài quan trọng nhất của file này. `fund-refresh` BỎ QUA tài khoản khi `oversold` không
   * rỗng (supabase/functions/fund-refresh/index.ts), nên nếu script cho nhập mà bộ luật lại
   * thấy bán quá tay thì chủ app nhập "thành công" rồi cron không bao giờ cập nhật giá trị
   * tài khoản đó nữa. Chiều ngược lại thì script chặn oan kèm lời khuyên "fund_aliases còn
   * thiếu một dòng" — chỉ sai người.
   *
   * Cron KHÔNG trả 400 ở ca này: nó `demBoQua(kq, 'so-lenh-co-lo-hong')` rồi `continue`, cả
   * lượt vẫn HTTP 200. Dấu hiệu thật là `daGhi` đứng yên và `boQua` có
   * `so-lenh-co-lo-hong` trong log function; 400 chỉ có ở chế độ LẤP LỊCH SỬ.
   *
   * Hai bên phải đồng ý DO CẤU TẠO (soatSoDuAm gọi thẳng fundHoldingsFromTrades), và bài
   * này canh để không ai đi cộng dồn lại một lần nữa trong script.
   */
  const boCaKho: { ten: string; lenh: FundTrade[] }[] = [
    { ten: 'sổ lệnh rỗng', lenh: [] },
    {
      ten: 'chỉ mua',
      lenh: [{ assocFundCd: SP500, kind: 'buy', tradedOn: '2026-01-05', units: 100, nav: 1, amount: 100 }],
    },
    {
      ten: 'bán một phần rồi mua lại',
      lenh: [
        { assocFundCd: SP500, kind: 'buy', tradedOn: '2026-01-05', units: 300, nav: 1, amount: 1000 },
        { assocFundCd: SP500, kind: 'sell', tradedOn: '2026-02-05', units: 100, nav: 1, amount: 400 },
        { assocFundCd: SP500, kind: 'sell', tradedOn: '2026-03-05', units: 100, nav: 1, amount: 400 },
        { assocFundCd: SP500, kind: 'buy', tradedOn: '2026-04-05', units: 50, nav: 1, amount: 200 },
      ],
    },
    {
      ten: 'bán trước mua (thiếu bí danh) — phải ÂM',
      lenh: [
        { assocFundCd: SP500, kind: 'sell', tradedOn: '2026-02-05', units: 300, nav: 1, amount: 900 },
        { assocFundCd: SP500, kind: 'buy', tradedOn: '2026-03-05', units: 300, nav: 1, amount: 900 },
      ],
    },
    {
      ten: 'mua và bán CÙNG NGÀY, mảng để lệnh bán trước',
      lenh: [
        { assocFundCd: SP500, kind: 'sell', tradedOn: '2026-04-13', units: 100, nav: 1, amount: 400 },
        { assocFundCd: SP500, kind: 'buy', tradedOn: '2026-04-13', units: 100, nav: 1, amount: 300 },
      ],
    },
    {
      ten: 'hai quỹ, một quỹ âm một quỹ lành',
      lenh: [
        { assocFundCd: SP500, kind: 'buy', tradedOn: '2026-01-05', units: 100, nav: 1, amount: 100 },
        { assocFundCd: NDX, kind: 'sell', tradedOn: '2026-01-05', units: 100, nav: 1, amount: 100 },
      ],
    },
  ]

  for (const { ten, lenh } of boCaKho)
    it(`cho cùng kết quả: ${ten}`, () => {
      expect(soatSoDuAm(lenh)).toEqual(fundHoldingsFromTrades(lenh).oversold)
    })
})

describe('trùng 約定日 — chốt "cùng ngày thì mua trước bán"', () => {
  /**
   * 約定日 chỉ tới NGÀY, không tới giờ, nên một cặp mua+bán cùng ngày cùng quỹ không có
   * thứ tự thật để dựa vào. Trước khi có chốt phụ, sort ổn định của JS giữ thứ tự đầu
   * vào — mà script nhập sao kê đưa vào theo thứ tự file CSV (mới nhất trước) còn
   * fund-refresh đưa vào theo `order('id')` tức uuid NGẪU NHIÊN. Cùng một sổ lệnh, hai
   * kết luận `oversold` khác nhau ở hai bên.
   */
  const mua100 = (tradedOn: string): FundTrade => ({
    assocFundCd: SP500,
    kind: 'buy',
    tradedOn,
    units: 100,
    nav: 1,
    amount: 300,
  })
  const ban100 = (tradedOn: string): FundTrade => ({
    assocFundCd: SP500,
    kind: 'sell',
    tradedOn,
    units: 100,
    nav: 1,
    amount: 400,
  })

  it('bán trước mua trong MẢNG nhưng cùng ngày → KHÔNG âm (chặn oan là chỉ sai người)', () => {
    expect(soatSoDuAm([ban100('2026-04-13'), mua100('2026-04-13')])).toEqual([])
  })

  it('thứ tự trong mảng KHÔNG đổi kết luận — hai phía đưa vào hai thứ tự khác nhau', () => {
    const a = soatSoDuAm([ban100('2026-04-13'), mua100('2026-04-13')])
    const b = soatSoDuAm([mua100('2026-04-13'), ban100('2026-04-13')])
    expect(a).toEqual(b)
    expect(a).toEqual([])
  })

  it('chốt này KHÔNG làm mất khả năng bắt bán quá tay THẬT cùng ngày', () => {
    // Mua 100, bán 250 cùng ngày: mua trước bán vẫn không đủ ⇒ vẫn phải âm. Chốt chỉ dời
    // ĐIỂM THẤP NHẤT giữa đường, không xoá được ca thật.
    const banNhieu: FundTrade = { ...ban100('2026-04-13'), units: 250 }
    expect(soatSoDuAm([banNhieu, mua100('2026-04-13')])).toEqual([SP500])
  })
})

describe('soatHinhDang — một dòng 受渡金額 = "-" không được giết cả lô 200 dòng', () => {
  it('nêu tên dòng amount = 0 (lệnh đã 約定 mà chưa 受渡)', () => {
    const lenh = [
      { tenSaoKe: 'Quỹ A', kind: 'buy', tradedOn: '2026-08-10', units: 1_000, nav: 17_000, amount: 0 },
      { tenSaoKe: 'Quỹ B', kind: 'buy', tradedOn: '2026-07-10', units: 1_000, nav: 17_000, amount: 50_000 },
    ]
    // CHECK fund_trades_shape đòi `units > 0 and amount > 0` với buy/sell. Vì POST gửi cả
    // lô 200 dòng kèm `Prefer: return=minimal`, Postgres bỏ CẢ LÔ và lỗi trả về không nói
    // dòng nào — mà các lô trước đã ghi xong: ghi dở dang.
    expect(soatHinhDang(lenh).map((l: any) => l.tenSaoKe)).toEqual(['Quỹ A'])
  })

  it('nêu tên cả dòng units = 0', () => {
    const lenh = [
      { tenSaoKe: 'Quỹ C', kind: 'sell', tradedOn: '2026-08-10', units: 0, nav: 17_000, amount: 50_000 },
    ]
    expect(soatHinhDang(lenh)).toHaveLength(1)
  })

  it('sổ lệnh lành → không nêu gì', () => {
    const { lenh } = locLenhQuy(docSaoKe(mau).dong)
    expect(soatHinhDang(lenh)).toEqual([])
  })
})

describe('locTrung — chống trùng là so TÚI, không so TẬP', () => {
  const lenhFile = (units: number, amount: number, bucket = 'NISA成長投資枠') => ({
    tenSaoKe: 'Quỹ A',
    assocFundCd: SP500,
    kind: 'buy',
    tradedOn: '2026-06-10',
    units,
    nav: 17_000,
    amount,
    bucket,
  })
  const hangDb = (units: number, amount: number, bucket = 'NISA成長投資枠') => ({
    assoc_fund_cd: SP500,
    traded_on: '2026-06-10',
    kind: 'buy',
    units,
    nav: 17_000,
    amount,
    bucket,
  })

  it('DB có 1 bản, file có 2 bản giống hệt → ghi thêm 1, không phải 0', () => {
    // Ca thật: hai kỳ 積立 trùng khớp hoàn toàn cùng 約定日, hoặc chủ app đã gõ tay một
    // dòng rồi mới nhập sao kê. Dùng Set thì n − k dòng bị bỏ IM LẶNG.
    const { moi, trung } = locTrung([lenhFile(1_000, 50_000), lenhFile(1_000, 50_000)], [
      hangDb(1_000, 50_000),
    ])
    expect(moi).toHaveLength(1)
    expect(trung).toHaveLength(1)
  })

  it('DB có đủ cả 2 bản → không ghi thêm gì', () => {
    const { moi, trung } = locTrung([lenhFile(1_000, 50_000), lenhFile(1_000, 50_000)], [
      hangDb(1_000, 50_000),
      hangDb(1_000, 50_000),
    ])
    expect(moi).toEqual([])
    expect(trung).toHaveLength(2)
  })

  it('khác 口座区分 là HAI lệnh thật — bucket phải nằm trong khoá', () => {
    // NISA成長投資枠 và NISAつみたて投資枠 cùng ngày cùng số tiền là hai lệnh khác nhau.
    // Thiếu bucket trong khoá là gộp làm một và mất một dòng.
    const { moi } = locTrung([lenhFile(1_000, 50_000, 'NISAつみたて投資枠')], [
      hangDb(1_000, 50_000, 'NISA成長投資枠'),
    ])
    expect(moi).toHaveLength(1)
  })

  it('khoá dựng từ dòng file và từ hàng DB phải TRÙNG NHAU', () => {
    // Cùng một hàm khoaTrung cho cả hai phía: hai công thức khoá khác nhau là chuyện sớm
    // muộn lệch, và lúc lệch thì chạy lại script là NHÂN ĐÔI sổ lệnh (fund_trades không
    // có unique constraint nào).
    const { trung } = locTrung([lenhFile(1_000, 50_000)], [hangDb(1_000, 50_000)])
    expect(trung).toHaveLength(1)
    expect(khoaTrung(lenhFile(1_000, 50_000))).toContain('NISA成長投資枠')
  })
})

describe('donDauVao — ô nhập kín không có dấu hiệu nào để nhận ra chuỗi bẩn', () => {
  /**
   * ESC dựng bằng fromCharCode, KHÔNG nhúng ký tự thật vào file: một ký tự điều khiển
   * tàng hình giữa hai dấu nháy là thứ không ai đọc lại được, git diff cũng không hiện ra.
   * Cùng lý do đã ghi ở donDauVao() trong scripts/setup-stock-cron.mjs.
   */
  const ESC = String.fromCharCode(27)

  it('bóc bracketed paste VÀ đếm số ký tự đã bỏ', () => {
    // Windows Terminal/iTerm bọc nội dung dán giữa ESC[200~ và ESC[201~, readline không
    // phải lúc nào cũng bóc ra. Khoá lẫn chúng thì PostgREST trả 401 — mà ô nhập cố tình
    // không hiện gì nên không có MỘT dấu hiệu nào trên màn hình. `soKyTuDaBo` là dấu
    // hiệu duy nhất, nên nó phải được TRẢ VỀ, không chỉ dọn im lặng.
    const r = donDauVao(`${ESC}[200~aB3-_x9${ESC}[201~`)
    expect(r.sach).toBe('aB3-_x9')
    expect(r.soKyTuDaBo).toBe(12)
  })

  it('bóc ký tự điều khiển lẻ', () => {
    expect(donDauVao(`aB3${String.fromCharCode(0)}-_x9`).sach).toBe('aB3-_x9')
  })

  it('chuỗi sạch → không bỏ gì', () => {
    expect(donDauVao('aB3-_x9')).toEqual({ sach: 'aB3-_x9', soKyTuDaBo: 0 })
  })
})

describe('docThamSoTaiKhoan — bẫy `indexOf` trả -1', () => {
  // `String.raw` để giữ nguyên dấu `\` của đường dẫn Windows — đây chính là hình dạng
  // argv thật trên máy chủ app, và `\x`/`\U` là escape không hợp lệ trong chuỗi thường.
  const NODE = String.raw`C:\Program Files\nodejs\node.exe`
  const SCRIPT = String.raw`C:\Antigravity\Money Manager\scripts\nhap-sao-ke-rakuten.mjs`
  const CSV = String.raw`C:\Users\x\Downloads\adjusthistory(JP)_20260812.csv`
  const UUID = '3f1a7c22-9b4e-4d51-8a06-2e7c5d9f1b34'

  // Bài quan trọng nhất của khối này. Dựng lại ĐÚNG argv đã làm hỏng lượt chạy thật:
  // thiếu hẳn `--account` thì `indexOf` trả -1, +1 thành 0, và argv[0] là đường dẫn
  // node.exe — khác rỗng, không bắt đầu bằng `--`, nên phép kiểm cũ cho qua và chuỗi đó
  // đi thẳng vào `account_id=eq.` rồi chết ở Postgres (22P02) sau vài lời gọi mạng.
  it('thiếu hẳn --account → báo lỗi, TUYỆT ĐỐI không trả về đường dẫn node.exe', () => {
    const kq = docThamSoTaiKhoan([NODE, SCRIPT, CSV])
    expect(kq.loi).toBe('thieu-co')
    expect(kq.accountId).toBeUndefined()
    expect(JSON.stringify(kq)).not.toContain('node.exe')
  })

  it('có --account nhưng giá trị là cờ khác → báo thiếu giá trị', () => {
    expect(docThamSoTaiKhoan([NODE, SCRIPT, CSV, '--account', '--ghi']).loi).toBe('thieu-gia-tri')
  })

  it('--account đứng cuối, không có gì theo sau → báo thiếu giá trị', () => {
    expect(docThamSoTaiKhoan([NODE, SCRIPT, CSV, '--account']).loi).toBe('thieu-gia-tri')
  })

  it('giá trị không phải uuid → chặn ngay, không để Postgres báo hộ', () => {
    const kq = docThamSoTaiKhoan([NODE, SCRIPT, CSV, '--account', 'NISA Rakuten'])
    expect(kq.loi).toBe('khong-phai-uuid')
    expect(kq.accountId).toBeUndefined()
  })

  it('uuid hợp lệ → trả đúng, kể cả khi có --ghi đứng sau', () => {
    expect(docThamSoTaiKhoan([NODE, SCRIPT, CSV, '--account', UUID, '--ghi'])).toEqual({
      accountId: UUID,
    })
  })
})
