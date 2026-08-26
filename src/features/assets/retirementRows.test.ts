import { describe, expect, it } from 'vitest'
import { pensionByMonth, standardDropSince, type PensionTx } from './retirementRows'

const tx = (monthKey: string, category: string, amount: number): PensionTx => ({
  monthKey,
  category,
  amount,
})

/** ¥27.450 = ¥300.000 × 9,15% — đúng số 折半額 in trên bảng ở bậc 19. */
const PHI_300K = 27_450
/** ¥25.620 = ¥280.000 × 9,15% → bậc 18. Đúng một bậc thấp hơn PHI_300K. */
const PHI_TUT = 25_620

describe('pensionByMonth', () => {
  it('gom 厚生年金保険 theo tháng và suy ra 標準報酬月額', () => {
    const r = pensionByMonth([tx('2026-08', 'Hưu trí (年金)', PHI_300K)])
    expect(r).toHaveLength(1)
    expect(r[0].pensionPremium).toBe(PHI_300K)
    expect(r[0].standardMonthly).toBe(300_000)
    expect(r[0].hasKikinLine).toBe(false)
  })

  it('bỏ qua danh mục khác', () => {
    const r = pensionByMonth([
      tx('2026-08', 'Hưu trí (年金)', PHI_300K),
      tx('2026-08', 'Bảo hiểm y tế (健康保険)', 15_000),
      tx('2026-08', 'Ăn uống', 3_000),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].pensionPremium).toBe(PHI_300K)
  })

  /**
   * R1 của spec. `nhap.ts` map CẢ `厚生年金保険` và `厚生年金基金` vào cùng danh mục
   * 'Hưu trí (年金)'. Nên một tháng có hai dòng là dấu hiệu người dùng thuộc 厚生年金基金 —
   * lúc đó tổng hai dòng KHÔNG phải `標準報酬月額 × 9,15%`, và phép suy phải im.
   */
  it('tháng có HAI dòng 年金 → nghi 厚生年金基金, không suy 標準報酬', () => {
    const r = pensionByMonth([
      tx('2026-08', 'Hưu trí (年金)', PHI_300K),
      tx('2026-08', 'Hưu trí (年金)', 8_000),
    ])
    expect(r[0].hasKikinLine).toBe(true)
    expect(r[0].standardMonthly).toBeNull()
    expect(r[0].pensionPremium).toBe(PHI_300K + 8_000)
  })

  it('sắp theo tháng, cũ trước', () => {
    const r = pensionByMonth([
      tx('2026-08', 'Hưu trí (年金)', PHI_300K),
      tx('2026-05', 'Hưu trí (年金)', PHI_300K),
    ])
    expect(r.map((x) => x.monthKey)).toEqual(['2026-05', '2026-08'])
  })

  it('không dòng nào → mảng rỗng', () => {
    expect(pensionByMonth([])).toEqual([])
  })
})

describe('standardDropSince', () => {
  const thang = (monthKey: string, phi: number) => tx(monthKey, 'Hưu trí (年金)', phi)

  /**
   * R2 của spec. 掛金 bắt đầu 4/2026 nhưng 標準報酬 chỉ đổi ở 定時決定 (tháng 9). Bốn phiếu
   * 5→8/2026 vẫn ở bậc cũ, nên hàm phải nói "chưa tụt" chứ không bịa ra một mức giảm.
   */
  it('chưa tụt bậc → drop 0, và nêu tháng mới nhất đã xem', () => {
    const rows = pensionByMonth([
      thang('2026-02', PHI_300K),
      thang('2026-03', PHI_300K),
      thang('2026-05', PHI_300K),
      thang('2026-08', PHI_300K),
    ])
    const d = standardDropSince(rows, '2026-04')
    expect(d).toEqual({
      before: 300_000,
      after: 300_000,
      drop: 0,
      latestMonth: '2026-08',
      unknown: false,
    })
  })

  it('đã tụt một bậc → drop bằng chênh lệch 標準報酬月額', () => {
    const rows = pensionByMonth([
      thang('2026-02', PHI_300K),
      thang('2026-09', PHI_TUT),
    ])
    const d = standardDropSince(rows, '2026-04')!
    expect(d.before).toBe(300_000)
    expect(d.after).toBe(280_000)
    expect(d.drop).toBe(20_000)
    expect(d.latestMonth).toBe('2026-09')
  })

  /** Lương TĂNG thì `drop` không được ra số âm — 掛金 không làm 標準報酬 tăng. */
  it('bậc tăng lên → drop 0, không trả số âm', () => {
    const rows = pensionByMonth([
      thang('2026-02', PHI_TUT),
      thang('2026-09', PHI_300K),
    ])
    expect(standardDropSince(rows, '2026-04')!.drop).toBe(0)
  })

  it('chưa có phiếu nào sau mốc → null, chưa có gì mà so', () => {
    const rows = pensionByMonth([thang('2026-02', PHI_300K)])
    expect(standardDropSince(rows, '2026-04')).toBeNull()
  })

  it('chưa có phiếu nào trước mốc → null', () => {
    const rows = pensionByMonth([thang('2026-08', PHI_300K)])
    expect(standardDropSince(rows, '2026-04')).toBeNull()
  })

  /** Phiếu nghi 厚生年金基金 thì không suy được bậc → nói `unknown`, không đoán. */
  it('tháng mới nhất không suy được bậc → unknown, drop 0', () => {
    const rows = pensionByMonth([
      thang('2026-02', PHI_300K),
      thang('2026-09', PHI_300K),
      thang('2026-09', 8_000),
    ])
    const d = standardDropSince(rows, '2026-04')!
    expect(d.unknown).toBe(true)
    expect(d.drop).toBe(0)
  })
})
