import { describe, expect, it } from 'vitest'
import { parseRakutenStatement } from './rakutenStatement'

const CARD = { statementDay: 31, paymentDueDay: 27 }

/** Header 11 cột đúng như enavi202607: có 当月請求額. Có BOM như file thật. */
const HEAD_11 =
  '﻿"利用日","利用店名・商品名","利用者","支払方法","利用金額","手数料/利息","支払総額","7月支払金額","当月請求額","8月繰越残高","新規サイン"'
/** Header 10 cột như enavi202603: KHÔNG có 当月請求額 — cột hoá đơn dời vị trí. */
const HEAD_10 =
  '﻿"利用日","利用店名・商品名","利用者","支払方法","利用金額","手数料/利息","支払総額","3月支払金額","4月繰越残高","新規サイン"'
/** Header 12 cột như enavi202609(3737): thêm 支払月 và N月以降請求額. */
const HEAD_12 =
  '﻿"利用日","利用店名・商品名","利用者","支払方法","利用金額","手数料/利息","支払総額","支払月","9月支払金額","当月請求額","10月繰越残高","10月以降請求額"'

const q = (...cells: string[]) => cells.map((c) => `"${c}"`).join(',')
/** Dòng 11 cột: ngày, tên, người, cách trả, 利用金額, phí, tổng, N月支払金額, 当月請求額, carry, sign */
const r11 = (ngay: string, ten: string, how: string, use: string, pay: string, sign = '*') =>
  q(ngay, ten, '本人', how, use, '0', use, pay, pay, '0', sign)

describe('parseRakutenStatement', () => {
  it('nhan file enavi, total = tong cot N月支払金額, ky suy tu ten cot', () => {
    const csv = [
      HEAD_11,
      r11('2026/06/26', 'ﾍｱｷﾞﾛﾑ', '1回払い', '4950', '4950'),
      r11('2026/06/22', 'ﾄｷｷﾞﾂ', '1回払い', '40680', '40680'),
    ].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202607(3737).csv')!
    expect(p.total).toBe(45630)
    expect(p.range.closeISO).toBe('2026-06-30')
    expect(p.range.dueISO).toBe('2026-07-27')
    expect(p.dueDateFromFile).toBe('2026-07-27')
    expect(p.dueDateMismatch).toBe(false)
    expect(p.source).toBe('3737')
    expect(p.sourceLabel).toBe('Master 3737')
  })

  it('tra cot theo TEN: header 10 cot va 12 cot van ra dung so', () => {
    const csv10 = [HEAD_10, q('2026/02/10', 'A', '本人', '1回払い', '1200', '0', '1200', '1200', '0', '*')].join('\n')
    const p10 = parseRakutenStatement(csv10, CARD, 'enavi202603(3737).csv')!
    expect(p10.total).toBe(1200)
    expect(p10.range.closeISO).toBe('2026-02-28')

    const csv12 = [
      HEAD_12,
      q('2026/08/05', 'B', '本人', '1回払い', '880', '0', '880', '9月', '880', '880', '0', '0'),
    ].join('\n')
    const p12 = parseRakutenStatement(csv12, CARD, 'enavi202609(3737).csv')!
    expect(p12.total).toBe(880)
    expect(p12.range.closeISO).toBe('2026-08-31')
  })

  it('nam suy tu ngay quet muon nhat: quet thang 12, hoa don thang 1 nam sau', () => {
    const head =
      '﻿"利用日","利用店名・商品名","利用者","支払方法","利用金額","手数料/利息","支払総額","1月支払金額","2月繰越残高","新規サイン"'
    const csv = [head, q('2025/12/20', 'C', '本人', '1回払い', '500', '0', '500', '500', '0', '*')].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202601(3737).csv')!
    expect(p.range.closeISO).toBe('2025-12-31')
    expect(p.range.dueISO).toBe('2026-01-27')
    expect(p.dueDateMismatch).toBe(false)
  })

  it('bo dong phu khong ngay (chi tiet tuyen ETC) va dong khong co so hoa don', () => {
    const csv = [
      HEAD_11,
      r11('2026/05/17', 'ＥＴＣカード売上', '1回払い', '300', '300'),
      q('', 'ｴｷﾌｷﾀﾞﾘ   ﾁﾕｵｵｵﾞ', '', '', '', '', '', '', '', '', ''),
    ].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202607(3737).csv')!
    expect(p.lines).toHaveLength(1)
    expect(p.lines[0]).toMatchObject({ iso: '2026-05-17', amount: 300, billed: 300, kind: 'purchase' })
  })

  it('tra gop: lan 1 ghep theo GIA DAY DU nhung chi mot nua vao hoa don; lan 2 la installment-later', () => {
    const csv = [
      HEAD_11,
      r11('2026/02/09', 'AMAZON.CO.JP', '分割2回払い(1回目)', '9469', '4735'),
      r11('2026/02/05', 'AMAZON.CO.JP', '分割2回払い(2回目)', '11763', '5881', ''),
    ].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202607(3737).csv')!
    expect(p.lines[0]).toMatchObject({ amount: 9469, billed: 4735, kind: 'purchase' })
    expect(p.lines[1]).toMatchObject({ amount: 5881, billed: 5881, kind: 'installment-later' })
    expect(p.total).toBe(4735 + 5881)
  })

  it('gan kind topup cho 楽天キャッシュ チャージ va investment cho 楽天証券', () => {
    const csv = [
      HEAD_11,
      r11('2026/06/24', '楽天キャッシュ　チャージ', '1回払い', '1000', '1000'),
      r11('2026/06/01', '楽天証券投信積立', '1回払い', '68000', '68000'),
    ].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202607(3737).csv')!
    expect(p.lines.map((l) => l.kind)).toEqual(['topup', 'investment'])
  })

  it('hoan tien la dong am thuong, khong phai adjustment', () => {
    const csv = [HEAD_11, r11('2026/06/10', 'UNIQLO', '1回払い', '-5060', '-5060')].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202607(3737).csv')!
    expect(p.lines[0]).toMatchObject({ amount: -5060, kind: 'purchase', isAdjustment: false })
    expect(p.total).toBe(-5060)
  })

  it('ten file khac ky suy ra thi dueDateMismatch = true; ten file la thi khong kiem', () => {
    const csv = [HEAD_11, r11('2026/06/26', 'A', '1回払い', '100', '100')].join('\n')
    expect(parseRakutenStatement(csv, CARD, 'enavi202608(3737).csv')!.dueDateMismatch).toBe(true)
    expect(parseRakutenStatement(csv, CARD, 'sao-ke.csv')!.dueDateMismatch).toBe(false)
  })

  it('khong phai enavi, file rong, hay the chua khai ngay thi tra null', () => {
    const paypay = '"利用日/キャンセル日","利用店名・商品名","利用者","決済方法"\n"2026/1/1","X","本人*","PayPayクレジット"'
    expect(parseRakutenStatement(paypay, CARD, 'detail.csv')).toBeNull()
    expect(parseRakutenStatement('', CARD, 'enavi.csv')).toBeNull()
    const csv = [HEAD_11, r11('2026/06/26', 'A', '1回払い', '100', '100')].join('\n')
    expect(parseRakutenStatement(csv, { statementDay: null, paymentDueDay: 27 }, 'enavi202607(3737).csv')).toBeNull()
  })
})
