// Test cho các hàm thuần của scripts/nhap-sao-ke-rakuten.mjs.
//
// Ở tests/ chứ không src/: script là .mjs thuần và đọc filesystem qua `node:*`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — script viết bằng .mjs thuần, không có khai báo kiểu.
import { docSaoKe, ghepBiDanh, locLenhQuy, soatSoDuAm } from '../scripts/nhap-sao-ke-rakuten.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const mau = new Uint8Array(readFileSync(join(ROOT, 'scripts', 'testdata', 'rakuten-uydo-mau.csv')))

const SP500 = '9I31223A'
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
    const { xong, tenLa } = ghepBiDanh(lenh, BI_DANH_THIEU)
    expect(tenLa).toHaveLength(1)
    expect(tenLa[0]).toContain('楽天・Ｓ＆Ｐ５００')
    // Và nếu ai đó lỡ bỏ qua cảnh báo tên lạ, số dư âm là chốt canh thứ hai.
    expect(soatSoDuAm(xong)).toEqual([SP500])
  })
})
