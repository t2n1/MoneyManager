import { describe, expect, it } from 'vitest'
import { CURRENCIES } from '../../lib/currencies'
import { PHASE_PRESETS, phasePresetToDraft } from './phasePresets'
import { LIFE_PRESETS } from './presets'

describe('PHASE_PRESETS', () => {
  // TÁM, không phải chín như bản vẽ: mẫu 'ret' ("Nghỉ hưu") đã bỏ ngày 2026-09-10 vì nó
  // TRÙNG TÊN với mẫu mốc 'nghi-huu', mà từ bản đó hai bộ mẫu hiện trong CÙNG một cửa —
  // hai dòng "Nghỉ hưu" cạnh nhau là chỗ lẫn tệ hơn hai cái nút cũ. Lý do đầy đủ (và vì
  // sao giữ bản mốc chứ không giữ bản chặng) ở đầu `phasePresets.ts`.
  it('có đúng 8 mẫu, khoá không trùng', () => {
    expect(PHASE_PRESETS).toHaveLength(8)
    expect(new Set(PHASE_PRESETS.map((p) => p.key)).size).toBe(8)
  })

  // Không mẫu chặng nào được trùng tên với một mẫu mốc: cả hai bộ nay nằm trong cùng một
  // cửa (`QuickAddBoard`), nên một cái tên xuất hiện hai lần là người dùng phải đoán.
  it('không trùng tên với mẫu MỐC nào', () => {
    const tenMoc = new Set(LIFE_PRESETS.map((p) => p.label))
    for (const p of PHASE_PRESETS) expect(tenMoc.has(p.label), p.key).toBe(false)
  })

  // QUY ƯỚC ĐƠN VỊ, cùng luật với presets.ts: độ lớn của mỗi mẫu được viết cho MỘT đồng
  // tiền cụ thể, nên mẫu phải mang đúng đồng đó. Rơi về tiền của ngữ cảnh là biến
  // ¥4.700.000 thành ₫4.700.000 (~190 đô) cho cả một năm lương.
  it('mỗi mẫu tự mang đồng tiền, và đó là đồng app biết', () => {
    for (const p of PHASE_PRESETS) {
      expect(p.currency, p.key).toBeTruthy()
      expect(Object.keys(CURRENCIES), p.key).toContain(p.currency)
    }
  })

  it('thu và chi đều dương, và có ghi chú gọn để đọc cạnh nhãn', () => {
    for (const p of PHASE_PRESETS) {
      expect(p.annualIncomeMinor, p.key).toBeGreaterThan(0)
      expect(p.annualExpenseMinor, p.key).toBeGreaterThan(0)
      expect(p.note, p.key).toBeTruthy()
    }
  })

  // Ô "Quốc gia" của dock nhận mã ngắn (placeholder "JP, US, VN…"), không nhận tên đầy
  // đủ — bản vẽ ghi "Nhật Bản"/"Mỹ"/"Việt Nam" là nhãn để ĐỌC, không phải giá trị lưu.
  it('quốc gia là mã ngắn hai chữ, không phải tên đầy đủ', () => {
    for (const p of PHASE_PRESETS) {
      expect(p.country, p.key).toMatch(/^[A-Z]{2}$/)
    }
  })

  // ĐỘ LỚN PHẢI LÀ MINOR UNITS. JPY và VND có 0 lẻ nên minor = major, còn USD có 2 lẻ:
  // bản vẽ ghi `income: 26000` với `cur: 'USD'` nghĩa là $26.000/năm, tức 2.600.000 minor.
  // Copy thẳng 26000 vào đây là khai $260/năm — sai 100 lần, và sai ÂM THẦM vì $260 vẫn
  // là một con số hợp lệ. Cùng họ với lỗi 150 lần mà đầu presets.ts cảnh báo.
  it('mẫu USD khai theo minor units (cents), không phải major', () => {
    const usd = PHASE_PRESETS.filter((p) => p.currency === 'USD')
    expect(usd.length).toBeGreaterThan(0)
    for (const p of usd) {
      // Một năm lương ở Mỹ không thể dưới $1.000 — nếu ai copy major vào thì con số rơi
      // xuống dưới ngưỡng này và test đỏ ngay.
      expect(p.annualIncomeMinor, p.key).toBeGreaterThan(1_000 * 100)
    }
  })

  // Có một mẫu mà CHI > THU (nghỉ chăm con) — đó là chủ ý của bản vẽ, không phải số gõ
  // sai: một quãng đời rút vào tiền tiết kiệm là tình huống thật, và bản chiếu phải vẽ
  // được nó. Test này để không ai "sửa cho hợp lý".
  it('giữ mẫu có chi lớn hơn thu — quãng đời rút tiền tiết kiệm là thật', () => {
    expect(PHASE_PRESETS.some((p) => p.annualExpenseMinor > p.annualIncomeMinor)).toBe(true)
  })
})

describe('phasePresetToDraft', () => {
  const mau = PHASE_PRESETS[0]

  it('dựng đúng chặng nháp ở năm được cho', () => {
    const p = phasePresetToDraft(mau, 2040)
    expect(p.startYear).toBe(2040)
    expect(p.label).toBe(mau.label)
    expect(p.currency).toBe(mau.currency)
    expect(p.country).toBe(mau.country)
    expect(p.annualIncomeMinor).toBe(mau.annualIncomeMinor)
    expect(p.annualExpenseMinor).toBe(mau.annualExpenseMinor)
  })

  // `color`/`icon` BẮT BUỘC là chuỗi rỗng, không phải undefined: `draftChanges` so bằng
  // `!==`, nên `undefined !== ''` làm nháp đọc ra "khác bản đã lưu" MÃI MÃI và nút Lưu
  // không bao giờ tắt. Lý do đầy đủ ở JSDoc của `DraftPhase`.
  it('color và icon là chuỗi rỗng, không phải undefined', () => {
    const p = phasePresetToDraft(mau, 2040)
    expect(p.color).toBe('')
    expect(p.icon).toBe('')
  })

  // Chặng khai bằng SỐ TUYỆT ĐỐI, không phải % chặng trước (0067) — mẫu cho hẳn hai con
  // số, nên để `null` cho cả hai kẻo engine bỏ qua số vừa điền.
  it('không khai theo % chặng trước — mẫu cho số tuyệt đối', () => {
    const p = phasePresetToDraft(mau, 2040)
    expect(p.incomePctOfPrev).toBeNull()
    expect(p.expensePctOfPrev).toBeNull()
  })

  // Tỷ giá của chặng: mẫu KHÔNG tra tỷ giá (nó là hàm thuần), nên chỗ gọi phải truyền
  // vào. Mặc định 1 chỉ đúng khi chặng cùng tiền với tiền hiển thị.
  it('lấy tỷ giá do chỗ gọi truyền vào', () => {
    expect(phasePresetToDraft(mau, 2040, 0.0068).fxToDisplay).toBe(0.0068)
    expect(phasePresetToDraft(mau, 2040).fxToDisplay).toBe(1)
  })
})
