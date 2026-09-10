import { describe, expect, it } from 'vitest'
import { changeDisplayCurrency } from './draftCurrency'
import type { DraftPhase, ScenarioDraft } from './draft'
import type { FxOf } from './fxModel'
import type { CurrencyCode } from '../../lib/currencies'

const phase = (over: Partial<DraftPhase> & Pick<DraftPhase, 'id'>): DraftPhase => ({
  startYear: 2026,
  label: 'Đi làm ở Nhật',
  country: 'JP',
  currency: 'JPY',
  annualIncomeMinor: 6_800_000,
  annualExpenseMinor: 4_300_000,
  incomePctOfPrev: null,
  expensePctOfPrev: null,
  color: '',
  icon: '',
  fxToDisplay: 1,
  ...over,
})

const draft = (over: Partial<ScenarioDraft> = {}): ScenarioDraft => ({
  scenarioId: 'sc1',
  name: 'Hiện tại',
  displayCurrency: 'JPY',
  startingAssetsMinor: 14_200_000,
  endAge: 90,
  realReturnBps: 200,
  bandSpreadBps: 150,
  phases: [phase({ id: 'p1' })],
  events: [],
  ...over,
})

/** ¥100 = $1 · ¥1 = 160₫. Số tròn để phép kiểm đọc được bằng mắt. */
const fx: FxOf = (from, to) => {
  const perJpy: Record<string, number> = { JPY: 1, USD: 0.005, VND: 160 }
  const f = perJpy[from]
  const t = perJpy[to]
  if (f === undefined || t === undefined) return null
  return t / f
}

describe('changeDisplayCurrency', () => {
  it('quy đổi tài sản khởi điểm sang đơn vị mới — theo MAJOR, không nhân thẳng minor', () => {
    const d = changeDisplayCurrency(draft(), 'USD', fx)
    expect(d).not.toBeNull()
    expect(d?.displayCurrency).toBe('USD')
    // ¥14.200.000 × 0,005 = $71.000 → minor (2 số lẻ) = 7.100.000.
    // Nhân thẳng minor ra 71.000, tức $710 — sai 100 lần, đúng cái bẫy JSDoc
    // `convertMinorToday` ghi lại. Con số này là thứ phân biệt hai cách tính.
    expect(d?.startingAssetsMinor).toBe(7_100_000)
  })

  it('quy đổi cả khi tài sản khởi điểm ÂM (nợ ròng)', () => {
    const d = changeDisplayCurrency(draft({ startingAssetsMinor: -3_000_000 }), 'USD', fx)
    // −¥3.000.000 → −$15.000 → minor −1.500.000. Nợ phải còn là nợ.
    expect(d?.startingAssetsMinor).toBe(-1_500_000)
  })

  it('sang đơn vị 0 số lẻ vẫn đúng bậc: JPY → VND', () => {
    const d = changeDisplayCurrency(draft(), 'VND', fx)
    expect(d?.startingAssetsMinor).toBe(14_200_000 * 160)
  })

  it('THIẾU tỷ giá thì trả null — không đổi đơn vị mà giữ số cũ', () => {
    const khong: FxOf = () => null
    expect(changeDisplayCurrency(draft(), 'USD', khong)).toBeNull()
  })

  it('đổi sang chính đơn vị đang dùng thì trả về nguyên bản nháp', () => {
    const b = draft()
    expect(changeDisplayCurrency(b, 'JPY', fx)).toBe(b)
  })

  it('vẫn đặt lại fx của dòng không còn khớp đơn vị mới (việc của setDraftCurrency)', () => {
    const b = draft({ phases: [phase({ id: 'p1', fxToDisplay: 0.0057 })] })
    const d = changeDisplayCurrency(b, 'USD', fx)
    expect(d?.phases[0].fxToDisplay).toBe(1)
  })

  it('không đụng bản nháp gốc', () => {
    const b = draft()
    changeDisplayCurrency(b, 'USD', fx)
    expect(b.displayCurrency).toBe('JPY')
    expect(b.startingAssetsMinor).toBe(14_200_000)
  })
})

// Đo trên app 2026-09-10: bấm ₫ rồi bấm ¥ lại cho ra dòng "đang đổi" ghi
// `tài sản khởi điểm 163万 → 163万 · cuối đời 1.4億 → 1.4億 (−2)` — một thay đổi đọc
// ra là KHÔNG thay đổi, và một bản nháp "bẩn" mà người dùng không đổi gì cả. Nguyên
// nhân là hai lượt làm tròn của một vòng khứ hồi, không phải một quyết định nào.
describe('changeDisplayCurrency — về lại đơn vị ĐÃ LƯU thì lấy đúng số đã lưu', () => {
  const daLuu = { currency: 'JPY' as CurrencyCode, startingAssetsMinor: 1_627_580 }

  it('vòng khứ hồi JPY → USD → JPY trả về ĐÚNG con số ban đầu, không lệch 1 yên', () => {
    // Tỷ giá này KHÔNG tự khớp lại: ¥1.627.580 → $10.945,39 → ¥1.627.579, lệch đúng
    // một yên. Đã dò bằng script chứ không chọn bừa — phần lớn tỷ giá tình cờ khứ hồi
    // khớp, nên một phép kiểm lấy số ngẫu nhiên sẽ XANH cả khi luật này bị xoá.
    // ¥148,70/$ là tỷ giá thật cỡ tháng 09/2026.
    const le: FxOf = (from, to) => {
      const perJpy: Record<string, number> = { JPY: 1, USD: 1 / 148.7, VND: 168.37 }
      return perJpy[to] / perJpy[from]
    }
    const b = draft({ startingAssetsMinor: 1_627_580 })
    const usd = changeDisplayCurrency(b, 'USD', le, daLuu) as ScenarioDraft
    expect(usd.startingAssetsMinor).not.toBe(1_627_580)
    const lai = changeDisplayCurrency(usd, 'JPY', le, daLuu) as ScenarioDraft
    expect(lai.startingAssetsMinor).toBe(1_627_580)
  })

  it('KHÔNG dùng số đã lưu khi đích là một đơn vị khác', () => {
    const d = changeDisplayCurrency(draft(), 'USD', fx, daLuu) as ScenarioDraft
    expect(d.startingAssetsMinor).toBe(7_100_000)
  })

  // Người dùng SỬA tài sản khởi điểm rồi mới đổi đơn vị qua lại: cái neo phải là số ĐÃ
  // LƯU, nên con số họ vừa sửa KHÔNG được lặng lẽ quay về số cũ. Đây là ranh giới giữa
  // "gỡ nhiễu làm tròn" và "xoá mất một thay đổi thật" — và luật phải rơi về phía sau.
  it('vẫn quy đổi bình thường khi đơn vị hiện tại KHÔNG phải đơn vị đã lưu', () => {
    // Nháp đang ở USD (đã lưu là JPY) và người dùng đổi sang VND: không có gì để neo.
    const b = draft({ displayCurrency: 'USD', startingAssetsMinor: 7_100_000 })
    const d = changeDisplayCurrency(b, 'VND', fx, daLuu) as ScenarioDraft
    // $71.000 × (160/0,005) = ₫2.272.000.000
    expect(d.startingAssetsMinor).toBe(2_272_000_000)
  })

  // ĐÂY là ranh giới thật của luật, và nó KHÔNG phải "đích trùng đơn vị đã lưu": người
  // dùng sửa tài sản khởi điểm rồi bấm $ rồi bấm ¥ lại thì con số họ vừa gõ phải còn.
  // Nếu chỉ so đơn vị thì cú bấm về ¥ lôi lại số trên đĩa và xoá mất số họ gõ — im lặng.
  // Nên điều kiện phải là: số đang giữ ĐÚNG BẰNG số đã lưu quy sang đơn vị hiện tại,
  // tức "chưa ai sửa nó, đây chỉ là nhiễu làm tròn của một vòng khứ hồi".
  it('KHÔNG nuốt thay đổi thật: người dùng đã sửa tài sản khởi điểm rồi mới đổi qua lại', () => {
    // Người dùng gõ ¥5.000.000 (đã lưu là ¥1.627.580) rồi bấm $ …
    const suaTay = draft({ startingAssetsMinor: 5_000_000 })
    const usd = changeDisplayCurrency(suaTay, 'USD', fx, daLuu) as ScenarioDraft
    expect(usd.startingAssetsMinor).toBe(2_500_000) // $25.000
    // … rồi bấm ¥ lại: phải về $25.000 quy sang yên, KHÔNG về ¥1.627.580 trên đĩa.
    const lai = changeDisplayCurrency(usd, 'JPY', fx, daLuu) as ScenarioDraft
    expect(lai.startingAssetsMinor).toBe(5_000_000)
  })

  it('không có neo (bỏ tham số) thì cư xử y như trước', () => {
    const d = changeDisplayCurrency(draft(), 'USD', fx) as ScenarioDraft
    expect(d.startingAssetsMinor).toBe(7_100_000)
  })
})

describe('changeDisplayCurrency — mọi cặp đơn vị đều quy đổi được cả hai chiều', () => {
  const codes: CurrencyCode[] = ['JPY', 'USD', 'VND']
  for (const to of codes) {
    it(`JPY → ${to} → JPY về gần đúng số ban đầu`, () => {
      const d1 = changeDisplayCurrency(draft(), to, fx)
      expect(d1).not.toBeNull()
      const d2 = changeDisplayCurrency(d1 as ScenarioDraft, 'JPY', fx)
      // Làm tròn hai lượt nên không đòi bằng tuyệt đối; lệch quá 1 yên là sai bậc.
      expect(Math.abs((d2 as ScenarioDraft).startingAssetsMinor - 14_200_000)).toBeLessThanOrEqual(1)
    })
  }
})
