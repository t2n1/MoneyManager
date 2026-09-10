import { describe, expect, it } from 'vitest'
import { parsePaypayStatement } from './paypayStatement'

const CARD = { statementDay: 31, paymentDueDay: 27 }
const HEAD =
  '"利用日/キャンセル日","利用店名・商品名","利用者","決済方法","支払区分","利用金額","手数料","支払総額","当月支払金額","翌月以降繰越金額","調整額","当月お支払日"'
/** cols: ngay, ten, nguoi, , , 利用金額, , , 当月支払金額, , 調整額, 当月お支払日 */
const row = (ngay: string, ten: string, riyou: string, thu: string, dieuChinh: string, tra: string) =>
  `"${ngay}","${ten}","${thu ? '本人*' : '本人'}","PayPayクレジット","1回","${riyou}","0","${riyou}","${thu}","0","${dieuChinh}","${tra}"`

describe('parsePaypayStatement', () => {
  it('total = tong 当月支払金額 + tong 調整額, KHONG phai tong 利用金額', () => {
    const csv = [
      HEAD,
      row('2026/1/3', '極楽茶屋', '8215', '8215', '-7951', '2026/2/27'),
      row('2026/1/6', '野方ホープ', '2160', '2160', '0', '2026/2/27'),
      row('2026/2/3', 'ＴＥＭＵ', '-961', '', '0', '2026/2/27'),
    ].join('\n')
    const p = parsePaypayStatement(csv, CARD)!
    // 8215 + 2160 - 7951 = 2424.  Tong 利用金額 la 9414 — con so SAI.
    expect(p.total).toBe(2424)
  })

  it('bo dong khong thu, va dung 調整額 thanh dong ao am', () => {
    const csv = [
      HEAD,
      row('2026/1/3', '極楽茶屋', '8215', '8215', '-7951', '2026/2/27'),
      row('2026/2/3', 'ＴＥＭＵ', '-961', '', '0', '2026/2/27'),
    ].join('\n')
    const p = parsePaypayStatement(csv, CARD)!
    expect(p.lines).toHaveLength(2)
    expect(p.lines.filter((l) => !l.isAdjustment)).toEqual([
      { iso: '2026-01-03', amount: 8215, name: '極楽茶屋', isAdjustment: false },
    ])
    const adj = p.lines.find((l) => l.isAdjustment)!
    expect(adj.amount).toBe(-7951)
    expect(adj.iso).toBe('2026-01-03')
  })

  it('ky suy tu THANG cua 当月お支払日, khong tu ngay da doi cuoi tuan', () => {
    // 27/6/2026 roi Chu nhat ⇒ file ghi 2026/6/29. Ky quet van la 1/5-31/5.
    const csv = [HEAD, row('2026/5/2', '東京湾フェリー', '4000', '4000', '0', '2026/6/29')].join('\n')
    const p = parsePaypayStatement(csv, CARD)!
    expect(p.range.start).toBe('2026-05-01')
    expect(p.range.closeISO).toBe('2026-05-31')
    expect(p.range.dueISO).toBe('2026-06-29')
    expect(p.dueDateFromFile).toBe('2026-06-29')
    expect(p.dueDateMismatch).toBe(false)
  })

  it('dong khong co ngay (再計算) nhan closeISO cua ky', () => {
    const csv = [HEAD, row('', 'ＴＥＭＵ（再計算）', '3476', '3476', '0', '2026/6/29')].join('\n')
    const p = parsePaypayStatement(csv, CARD)!
    expect(p.lines[0].iso).toBe('2026-05-31')
  })

  it('bat duoc ngay chot/ngay tra khai sai', () => {
    const csv = [HEAD, row('2026/5/2', 'X', '4000', '4000', '0', '2026/6/29')].join('\n')
    const p = parsePaypayStatement(csv, { statementDay: 15, paymentDueDay: 10 })!
    expect(p.dueDateMismatch).toBe(true)
  })

  it('file khong phai PayPay tra null', () => {
    expect(parsePaypayStatement('"ngay","so tien"\n"2026/1/1","100"', CARD)).toBeNull()
  })

  it('the thieu ngay chot tra null', () => {
    const csv = [HEAD, row('2026/5/2', 'X', '4000', '4000', '0', '2026/6/29')].join('\n')
    expect(parsePaypayStatement(csv, { statementDay: null, paymentDueDay: 27 })).toBeNull()
  })
})
