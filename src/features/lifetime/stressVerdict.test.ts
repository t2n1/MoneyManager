import { describe, expect, it } from 'vitest'
import { stressVerdict } from './stressVerdict'

// Câu kết luận của khối Stress test. Quy ước trang Tương lai: "không năm nào âm" LUÔN
// kèm phạm vi tuổi (xem verdictHeadline trong summary.ts) — bản chiếu dừng ở endAge.
const base = { birthYear: 1994, baseEndAge: 90, longevityYears: 0 }

describe('stressVerdict', () => {
  it('chịu được mọi cú sốc → nói rõ tới tuổi nào', () => {
    expect(stressVerdict({ ...base, baseNegativeYear: null, stressNegativeYear: null })).toBe(
      'Kịch bản chịu được các cú sốc đang bật: vẫn không năm nào âm tới tuổi 90.',
    )
  })

  it('bật "sống thọ hơn" thì phạm vi của bản CÓ sốc dài thêm đúng số năm đó', () => {
    expect(
      stressVerdict({ ...base, longevityYears: 10, baseNegativeYear: null, stressNegativeYear: null }),
    ).toBe('Kịch bản chịu được các cú sốc đang bật: vẫn không năm nào âm tới tuổi 100.')
  })

  it('sốc làm âm, gốc thì không → phạm vi của GỐC là endAge, không cộng năm sống thọ', () => {
    expect(
      stressVerdict({ ...base, longevityYears: 10, baseNegativeYear: null, stressNegativeYear: 2090 }),
    ).toBe('Cú sốc làm nhánh bi quan âm từ 2090 (tuổi 96) — kịch bản gốc vốn không năm nào âm tới tuổi 90.')
  })

  it('cả hai cùng âm → giữ câu so hai mốc', () => {
    expect(stressVerdict({ ...base, baseNegativeYear: 2070, stressNegativeYear: 2060 })).toBe(
      'Cú sốc kéo năm âm từ 2070 lên 2060.',
    )
  })
})
