import { describe, expect, it } from 'vitest'
import { LIFE_PRESETS, type PresetContext } from './presets'
import { presetWeight } from './presetWeight'

const ctx: PresetContext = {
  scenarioId: 's1',
  year: 2029,
  birthYear: 1994,
  currency: 'JPY',
  country: 'JP',
  currentIncomeMinor: 6_000_000,
  currentExpenseMinor: 4_000_000,
  fxToDisplay: 1,
  displayCurrency: 'JPY',
  // 1₫ = 1/172¥ — cùng bộ số với fxModel.test.ts.
  fxOf: (c) => (c === 'VND' ? 1 / 172 : 1),
}

function build(id: string) {
  const p = LIFE_PRESETS.find((x) => x.id === id)
  if (!p) throw new Error(`Không có mẫu ${id}`)
  return p.build(ctx)
}

describe('presetWeight', () => {
  // Lỗi thật trên app 2026-09-02: chip "Sinh con 436万" là tổng các khoản MỖI NĂM của
  // từng bậc cộng lại — không phải tổng phải trả, cũng không phải số năm đầu. Người đọc
  // hiểu là nuôi một đứa con tốn 436万.
  it('Sinh con: tổng CẢ ĐỜI mẫu, đã trừ trợ cấp, kèm số năm', () => {
    const w = presetWeight(build('sinh-con'), 'JPY')
    // Chi: 7×60万 + 9×90万 + 2×120万 + 4×180万 = 2.190万. Trợ cấp 19 năm × 14,4万 = 273,6万.
    expect(w).toEqual({ kind: 'total', amountMinor: 21_900_000 - 2_736_000, years: 22 })
  })

  // Mẫu MUA TÀI SẢN (migration 0068) là ca riêng: mốc của nó `end_year: null` vì vòng
  // tài sản ở project.ts không có biên trên, nên luật "có mốc chạy hết đời → nói số MỖI
  // NĂM" sẽ cho ra ĐÚNG chi phí giữ hằng năm và giấu mất cả món hàng — chip nói "nhà
  // 65,8万/năm" cho một căn 4.700万. Với mẫu có tài sản, tổng là TIỀN RA THẬT suốt kỳ
  // hạn: trả trước + trả nợ mỗi năm + chi phí giữ mỗi năm, kèm số năm = kỳ hạn vay.
  it('Mua nhà: tiền ra thật suốt kỳ hạn, không phải chi phí giữ mỗi năm', () => {
    const w = presetWeight(build('mua-nha'), 'JPY')
    // 9.400.000 trả trước (4.700万 − 3.760万 vay) + 35×1.337.728 trả nợ
    // (niên kim theo THÁNG, xem yearlyLoanPayment) + 35×658.000 thuế/giữ nhà.
    // Cao hơn giá nhà vì gồm 35 năm lãi và 35 năm thuế — đó là tiền RA, không phải giá.
    expect(w).toEqual({ kind: 'total', amountMinor: 79_250_480, years: 35 })
  })

  // Cùng luật, kiểm trên mẫu thứ hai có tài sản. Trước khi có luật này chip "Mua xe" nói
  // 30万/năm cho một chiếc 300万 — sai cùng kiểu, chỉ nhỏ hơn nên không ai để ý.
  it('Mua xe: tiền ra thật suốt kỳ hạn, gồm cả trả trước và chi phí giữ', () => {
    const w = presetWeight(build('mua-xe'), 'JPY')
    // 900.000 trả trước + 5×458.432 trả nợ + 5×300.000 chi phí giữ.
    expect(w).toEqual({ kind: 'total', amountMinor: 4_692_160, years: 5 })
  })

  it('Cưới: một lần, một năm', () => {
    expect(presetWeight(build('cuoi'), 'JPY')).toEqual({ kind: 'total', amountMinor: 3_000_000, years: 1 })
  })

  it('Nghỉ hưu: lương hưu chạy hết đời → số MỖI NĂM, âm vì là thu', () => {
    expect(presetWeight(build('nghi-huu'), 'JPY')).toEqual({ kind: 'perYear', amountMinor: -1_100_000 })
  })

  it('Hỗ trợ bố mẹ: quy đổi ₫ → ¥ qua major units, 21 năm', () => {
    const w = presetWeight(build('ho-tro-bo-me'), 'JPY')
    expect(w?.kind).toBe('total')
    if (w?.kind !== 'total') return
    expect(w.years).toBe(21)
    // Quy đổi làm tròn TỪNG mốc rồi nhân số năm — cùng cách engine cộng từng năm.
    expect(w.amountMinor).toBe(Math.round(60_000_000 / 172) * 21)
  })

  it('không có mốc nào thì null', () => {
    expect(presetWeight({ phases: [], events: [] }, 'JPY')).toBeNull()
  })

  it('tiền hiển thị khác số lẻ (USD) vẫn đúng bậc — không nhân thẳng minor với tỷ giá', () => {
    // ¥3.000.000 với 1¥ = 1/150$ → $20.000 = 2.000.000 cent. Nhân thẳng ra 20.000 cent (200$).
    const w = presetWeight(
      {
        phases: [],
        events: [
          {
            scenario_id: 's1',
            start_year: 2029,
            end_year: 2029,
            kind: 'expense',
            amount_minor: 3_000_000,
            currency: 'JPY',
            note: '',
            fx_to_display: 1 / 150,
            inflate: true,
            label: 'Cưới',
          },
        ],
      },
      'USD',
    )
    expect(w).toEqual({ kind: 'total', amountMinor: 2_000_000, years: 1 })
  })
})
