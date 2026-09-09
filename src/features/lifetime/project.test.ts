import { describe, expect, it } from 'vitest'
import { convertLifetimeMinor, projectLifetime, type LifetimeInput } from './project'

/** Kịch bản trần: 1 chặng, không sự kiện, lợi suất 0. */
function baseInput(over: Partial<LifetimeInput> = {}): LifetimeInput {
  return {
    currentYear: 2026,
    birthYear: 1994,
    // Tuổi kết thúc phải LỚN HƠN tuổi hiện tại (32 vào 2026), không thì bản chiếu rỗng.
    endAge: 40,
    displayCurrency: 'JPY',
    startingAssetsMinor: 1_000_000,
    realReturnBps: 0,
    bandSpreadBps: 0,
    inflationBps: 200,
    nominalTerms: false,
    phases: [
      {
        startYear: 2026,
        label: 'Nhật',
        country: 'JP',
        currency: 'JPY',
        annualIncomeMinor: 5_000_000,
        annualExpenseMinor: 4_000_000,
        fxToDisplay: 1,
      },
    ],
    events: [],
    ...over,
  }
}

describe('convertLifetimeMinor', () => {
  it('quy đổi đúng khi hai loại tiền khác số chữ số thập phân', () => {
    // $95.000 = 9.500.000 minor USD. Tỷ giá ¥150/$ → ¥14.250.000 = 14.250.000 minor JPY.
    // Nhân thẳng minor × 150 sẽ ra 1.425.000.000 — sai 100 lần. Đây là cái bẫy.
    expect(convertLifetimeMinor(9_500_000, 'USD', 'JPY', 150)).toBe(14_250_000)
  })

  it('cùng loại tiền thì trả nguyên, không nhân tỷ giá', () => {
    expect(convertLifetimeMinor(1234, 'JPY', 'JPY', 999)).toBe(1234)
  })

  it('quy đổi ngược lại cũng đúng', () => {
    // ¥15.000 với tỷ giá 1¥ = 0,0067$ → $100,50 = 10050 minor USD
    expect(convertLifetimeMinor(15_000, 'JPY', 'USD', 0.0067)).toBe(10_050)
  })
})

describe('projectLifetime', () => {
  it('trả một dòng cho mỗi năm từ năm hiện tại tới tuổi kết thúc', () => {
    const rows = projectLifetime(baseInput())
    // 1994 + 40 = 2034 là năm cuối; 2034 − 2026 + 1 = 9 dòng
    expect(rows).toHaveLength(9)
    expect(rows[0].year).toBe(2026)
    expect(rows[0].age).toBe(32)
    expect(rows[rows.length - 1].year).toBe(2034)
    expect(rows[rows.length - 1].age).toBe(40)
  })

  it('trả rỗng khi tuổi kết thúc đã ở quá khứ', () => {
    expect(projectLifetime(baseInput({ endAge: 20 }))).toEqual([])
  })

  it('cộng dồn thặng dư hằng năm khi lợi suất bằng 0', () => {
    const rows = projectLifetime(baseInput({ endAge: 34 }))
    // dư 1.000.000/năm, khởi điểm 1.000.000
    expect(rows[0].assetsEndMinor).toBe(2_000_000)
    expect(rows[1].assetsEndMinor).toBe(3_000_000)
    expect(rows[2].assetsEndMinor).toBe(4_000_000)
  })

  it('áp lợi suất lên tài sản đầu năm trước khi cộng dòng tiền', () => {
    const rows = projectLifetime(baseInput({ endAge: 33, realReturnBps: 1000 }))
    // 1.000.000 × 1,1 = 1.100.000, cộng dư 1.000.000 → 2.100.000
    expect(rows[0].assetsEndMinor).toBe(2_100_000)
  })

  it('chặng sau ghi đè chặng trước từ năm bắt đầu của nó', () => {
    const rows = projectLifetime(
      baseInput({
        endAge: 34,
        phases: [
          {
            startYear: 2026,
            label: 'Nhật',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 5_000_000,
            annualExpenseMinor: 4_000_000,
            fxToDisplay: 1,
          },
          {
            startYear: 2028,
            label: 'Mỹ',
            country: 'US',
            currency: 'USD',
            annualIncomeMinor: 9_500_000,
            annualExpenseMinor: 6_200_000,
            fxToDisplay: 150,
          },
        ],
      }),
    )
    expect(rows[0].country).toBe('JP')
    expect(rows[0].incomeMinor).toBe(5_000_000)
    // 2028: $95.000 → ¥14.250.000 ; $62.000 → ¥9.300.000
    const y2028 = rows.find((r) => r.year === 2028)!
    expect(y2028.country).toBe('US')
    expect(y2028.incomeMinor).toBe(14_250_000)
    expect(y2028.expenseMinor).toBe(9_300_000)
  })

  it('sự kiện chỉ tính trong khoảng start_year..end_year, bao gồm hai đầu', () => {
    const rows = projectLifetime(
      baseInput({
        endAge: 35,
        events: [
          {
            id: 'e1',
            startYear: 2027,
            endYear: 2028,
            kind: 'expense',
            amountMinor: 500_000,
            currency: 'JPY',
            label: 'Học phí',
            fxToDisplay: 1,
            inflate: false,
          },
        ],
      }),
    )
    expect(rows.find((r) => r.year === 2026)!.events).toHaveLength(0)
    expect(rows.find((r) => r.year === 2027)!.events).toHaveLength(1)
    expect(rows.find((r) => r.year === 2028)!.events).toHaveLength(1)
    expect(rows.find((r) => r.year === 2029)!.events).toHaveLength(0)
    expect(rows.find((r) => r.year === 2027)!.netFlowMinor).toBe(500_000)
  })

  it('sự kiện end_year null thì chạy tới hết đời', () => {
    const rows = projectLifetime(
      baseInput({
        // endAge 45 → năm cuối 2039. Sự kiện bắt đầu 2030 phải NẰM TRONG bản chiếu,
        // không thì nó không bao giờ hiệu lực và test không kiểm được gì.
        endAge: 45,
        events: [
          {
            id: 'e1',
            startYear: 2030,
            endYear: null,
            kind: 'income',
            amountMinor: 1_100_000,
            currency: 'JPY',
            label: '年金',
            fxToDisplay: 1,
            inflate: false,
          },
        ],
      }),
    )
    expect(rows[rows.length - 1].events).toHaveLength(1)
    expect(rows[rows.length - 1].events[0].label).toBe('年金')
  })

  it('inflate=true thì sự kiện tăng theo lạm phát, false thì đứng yên', () => {
    const withInflate = projectLifetime(
      baseInput({
        endAge: 34,
        nominalTerms: true,
        inflationBps: 1000,
        events: [
          {
            id: 'e1',
            startYear: 2026,
            endYear: null,
            kind: 'expense',
            amountMinor: 1_000_000,
            currency: 'JPY',
            label: 'Học phí',
            fxToDisplay: 1,
            inflate: true,
          },
        ],
      }),
    )
    // 2028 là năm thứ 2 sau gốc → ×1,1² = 1.210.000
    expect(withInflate.find((r) => r.year === 2028)!.events[0].amountDisplayMinor).toBe(1_210_000)

    const noInflate = projectLifetime(
      baseInput({
        endAge: 34,
        nominalTerms: true,
        inflationBps: 1000,
        events: [
          {
            id: 'e1',
            startYear: 2026,
            endYear: null,
            kind: 'expense',
            amountMinor: 1_000_000,
            currency: 'JPY',
            label: '年金',
            fxToDisplay: 1,
            inflate: false,
          },
        ],
      }),
    )
    expect(noInflate.find((r) => r.year === 2028)!.events[0].amountDisplayMinor).toBe(1_000_000)
  })

  it('giá hôm nay (nominalTerms=false) thì lạm phát không làm phồng số', () => {
    const rows = projectLifetime(baseInput({ endAge: 40, inflationBps: 1000 }))
    for (const r of rows) expect(r.expenseMinor).toBe(4_000_000)
  })

  it('dải dao động: nhánh lạc quan ≥ trung tâm ≥ nhánh bi quan', () => {
    const rows = projectLifetime(baseInput({ endAge: 60, realReturnBps: 300, bandSpreadBps: 150 }))
    const last = rows[rows.length - 1]
    expect(last.assetsOptimisticMinor).toBeGreaterThan(last.assetsEndMinor)
    expect(last.assetsEndMinor).toBeGreaterThan(last.assetsPessimisticMinor)
  })

  it('dải dao động giữ đúng thứ tự cả khi tài sản âm', () => {
    // Cạn tiền: thu 1tr, chi 4tr, khởi điểm 0 → âm ngay năm đầu và âm mãi.
    // Ở vùng ÂM, nhánh lợi suất CAO phình nợ nhanh hơn nên nó mới là nhánh bi quan.
    // Gán hai trường theo nhánh lợi suất thì ở đúng đoạn cạn tiền chúng đảo chỗ, và
    // <Area> của Recharts (Task 8) vẽ dải lộn ngược.
    const rows = projectLifetime(
      baseInput({
        endAge: 40,
        startingAssetsMinor: 0,
        realReturnBps: 500,
        bandSpreadBps: 300,
        phases: [
          {
            startYear: 2026,
            label: 'Nhật',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 1_000_000,
            annualExpenseMinor: 4_000_000,
            fxToDisplay: 1,
          },
        ],
      }),
    )
    // Chốt là kịch bản THẬT SỰ âm, không thì vòng lặp dưới kiểm một mảng toàn số dương.
    expect(rows.every((r) => r.assetsEndMinor < 0)).toBe(true)
    for (const r of rows) {
      expect(r.assetsPessimisticMinor).toBeLessThanOrEqual(r.assetsEndMinor)
      expect(r.assetsEndMinor).toBeLessThanOrEqual(r.assetsOptimisticMinor)
    }
    // Và ở vùng âm, nhánh bi quan đúng là nhánh lợi suất CAO — trung tâm nằm giữa.
    const last = rows[rows.length - 1]
    expect(last.assetsPessimisticMinor).toBeLessThan(last.assetsEndMinor)
    expect(last.assetsOptimisticMinor).toBeGreaterThan(last.assetsEndMinor)
  })

  it('nhánh trung tâm không chạy ra ngoài dải khi tài sản xuyên qua 0', () => {
    // Dải phải trùm CẢ BA nhánh. Lấy min/max của riêng hai nhánh biên là sai: khi tài
    // sản xuyên qua 0, kết quả không còn đơn điệu theo lợi suất (dương thì lợi suất cao
    // là tốt, âm thì nó phình nợ nhanh hơn), nên A(r) không nhất thiết nằm giữa
    // A(r−s) và A(r+s).
    //
    // Kịch bản này là phản ví dụ THẬT ở đúng giá trị mặc định của migration 0031
    // (real_return_bps 200, band_spread_bps 150): khởi điểm 10tr, thu 1tr, chi 4tr
    // → dòng tiền −3tr/năm, tài sản xuyên 0 vào khoảng 2029.
    const rows = projectLifetime(
      baseInput({
        endAge: 45,
        startingAssetsMinor: 10_000_000,
        realReturnBps: 200,
        bandSpreadBps: 150,
        phases: [
          {
            startYear: 2026,
            label: 'Nhật',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 1_000_000,
            annualExpenseMinor: 4_000_000,
            fxToDisplay: 1,
          },
        ],
      }),
    )
    // Kịch bản phải thật sự xuyên qua 0, không thì phản ví dụ không xuất hiện.
    expect(rows.some((r) => r.assetsEndMinor > 0)).toBe(true)
    expect(rows.some((r) => r.assetsEndMinor < 0)).toBe(true)

    for (const r of rows) {
      expect(r.assetsPessimisticMinor).toBeLessThanOrEqual(r.assetsEndMinor)
      expect(r.assetsEndMinor).toBeLessThanOrEqual(r.assetsOptimisticMinor)
    }

    // Chốt sắc: năm 2033 nhánh TRUNG TÂM là nhánh tệ nhất trong cả ba, nên biên dưới
    // phải bằng đúng nó. Bản chỉ lấy hai nhánh biên cho ra −14.017.157 > trung tâm
    // −14.032.313, tức trung tâm nằm NGOÀI dải.
    const y2033 = rows.find((r) => r.year === 2033)!
    expect(y2033.assetsEndMinor).toBe(-14_032_313)
    expect(y2033.assetsPessimisticMinor).toBe(y2033.assetsEndMinor)
    expect(y2033.assetsOptimisticMinor).toBe(-13_986_970)
  })

  it('sự kiện dùng tỷ giá RIÊNG của nó, không mượn tỷ giá của chặng', () => {
    // Ca thật: nhận 年金 ¥1.100.000/năm trong khi đã sang Mỹ. Đơn vị hiển thị USD,
    // chặng cũng USD, chỉ sự kiện là JPY — không có tỷ giá nào của chặng dùng được.
    // ¥1.100.000 × 0,00667 = $7.337 → 733.700 minor USD.
    // Dùng tỷ giá 1 (lỗi cũ) sẽ ra 110.000.000 minor USD = $1,1 triệu, sai 150 lần.
    const rows = projectLifetime(
      baseInput({
        endAge: 34,
        displayCurrency: 'USD',
        startingAssetsMinor: 0,
        phases: [
          {
            startYear: 2026,
            label: 'Mỹ',
            country: 'US',
            currency: 'USD',
            annualIncomeMinor: 0,
            annualExpenseMinor: 0,
            fxToDisplay: 1,
          },
        ],
        events: [
          {
            id: 'e1',
            startYear: 2026,
            endYear: null,
            kind: 'income',
            amountMinor: 1_100_000,
            currency: 'JPY',
            label: '年金',
            fxToDisplay: 0.00667,
            inflate: false,
          },
        ],
      }),
    )
    expect(rows[0].events[0].amountDisplayMinor).toBe(733_700)
    expect(rows[0].netFlowMinor).toBe(733_700)
  })

  it('giá danh nghĩa: tài sản tăng theo lợi suất DANH NGHĨA', () => {
    // Không dòng tiền (thu = chi = 0, không sự kiện) để chỉ còn lợi suất tác động.
    // r = 5%, i = 2% → danh nghĩa (1,05 × 1,02) − 1 = 7,1%/năm, làm tròn theo TỪNG năm:
    //   1.000.000 → 1.071.000 → 1.147.041 → 1.228.481
    // Vẫn dùng lợi suất thực 5% thì ra 1.050.000 / 1.102.500 / 1.157.625 — tức là
    // dòng tiền tính bằng tiền tương lai còn tài sản tính bằng tiền hôm nay.
    const rows = projectLifetime(
      baseInput({
        endAge: 34,
        nominalTerms: true,
        realReturnBps: 500,
        inflationBps: 200,
        bandSpreadBps: 0,
        startingAssetsMinor: 1_000_000,
        phases: [
          {
            startYear: 2026,
            label: 'Nhật',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 0,
            annualExpenseMinor: 0,
            fxToDisplay: 1,
          },
        ],
      }),
    )
    expect(rows.map((r) => r.assetsEndMinor)).toEqual([1_071_000, 1_147_041, 1_228_481])
  })

  it('tài sản âm được, không bị kẹp về 0', () => {
    const rows = projectLifetime(
      baseInput({
        endAge: 36,
        startingAssetsMinor: 0,
        phases: [
          {
            startYear: 2026,
            label: 'Nhật',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 1_000_000,
            annualExpenseMinor: 4_000_000,
            fxToDisplay: 1,
          },
        ],
      }),
    )
    expect(rows[0].assetsEndMinor).toBe(-3_000_000)
    expect(rows[1].assetsEndMinor).toBe(-6_000_000)
  })

  it('không có chặng nào thì trả mảng rỗng, không nổ', () => {
    expect(projectLifetime(baseInput({ phases: [] }))).toEqual([])
  })

  it('năm trước chặng đầu tiên thì dùng chặng đầu tiên', () => {
    const rows = projectLifetime(
      baseInput({
        endAge: 33,
        phases: [
          {
            startYear: 2030,
            label: 'Muộn',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 5_000_000,
            annualExpenseMinor: 4_000_000,
            fxToDisplay: 1,
          },
        ],
      }),
    )
    expect(rows[0].phaseLabel).toBe('Muộn')
  })
})

describe('projectLifetime — mốc TẮT TẠM (migration 0063)', () => {
  const moc = (over: Partial<LifetimeInput['events'][number]> = {}) => ({
    id: 'e1',
    startYear: 2028,
    endYear: 2028,
    kind: 'expense' as const,
    amountMinor: 3_000_000,
    currency: 'JPY' as const,
    label: 'Cưới',
    fxToDisplay: 1,
    inflate: false,
    ...over,
  })
  const nam2028 = (input: LifetimeInput) =>
    projectLifetime(input).find((r) => r.year === 2028)!

  it('mốc bật vào phép chiếu như thường', () => {
    const r = nam2028(baseInput({ events: [moc({ enabled: true })] }))
    expect(r.events).toHaveLength(1)
  })

  it('mốc TẮT không vào phép chiếu — không dòng sự kiện nào của năm đó', () => {
    const r = nam2028(baseInput({ events: [moc({ enabled: false })] }))
    expect(r.events).toHaveLength(0)
  })

  it('tắt mốc chi thì tài sản cuối năm CAO HƠN đúng phần đã tắt', () => {
    const bat = nam2028(baseInput({ events: [moc({ enabled: true })] }))
    const tat = nam2028(baseInput({ events: [moc({ enabled: false })] }))
    expect(tat.assetsEndMinor - bat.assetsEndMinor).toBe(3_000_000)
  })

  it('THIẾU cờ = BẬT: mốc dựng ở chỗ chưa biết tới 0063 không được lặng lẽ biến mất', () => {
    const r = nam2028(baseInput({ events: [moc()] }))
    expect(r.events).toHaveLength(1)
  })

  it('tắt một mốc không đụng tới mốc còn lại', () => {
    const r = nam2028(
      baseInput({
        events: [moc({ id: 'a', enabled: false }), moc({ id: 'b', label: 'Xe', enabled: true })],
      }),
    )
    expect(r.events.map((e) => e.id)).toEqual(['b'])
  })
})

describe('projectLifetime — mốc THAY chi nền (migration 0067)', () => {
  const ev = (over: Record<string, unknown> = {}) => ({
    id: 'nha',
    startYear: 2030,
    endYear: null as number | null,
    kind: 'expense' as const,
    amountMinor: 1_800_000,
    currency: 'JPY' as const,
    label: 'Trả nợ mua nhà',
    fxToDisplay: 1,
    inflate: false,
    ...over,
  })

  it('trừ phần bị thay khỏi CHI NỀN, không phải khỏi netFlow riêng', () => {
    // Chi nền ¥4M (đã gồm ¥1,2M tiền thuê). Mốc mua nhà ¥1,8M/năm thay tiền thuê.
    // Đúng: chi nền về ¥2,8M, mốc cộng ¥1,8M → tổng ra ¥4,6M, không phải ¥5,8M.
    const rows = projectLifetime(
      baseInput({ events: [ev({ replacesMinor: 1_200_000 })] }),
    )
    const truoc = rows.find((r) => r.year === 2029)!
    const sau = rows.find((r) => r.year === 2030)!
    expect(truoc.expenseMinor).toBe(4_000_000)
    expect(sau.expenseMinor).toBe(2_800_000)
    expect(sau.netFlowMinor).toBe(5_000_000 - 2_800_000 - 1_800_000)
  })

  it('chỉ trừ TRONG KHOẢNG của mốc', () => {
    const rows = projectLifetime(
      baseInput({ events: [ev({ startYear: 2030, endYear: 2031, replacesMinor: 1_200_000 })] }),
    )
    const at = (y: number) => rows.find((r) => r.year === y)!.expenseMinor
    expect(at(2029)).toBe(4_000_000)
    expect(at(2030)).toBe(2_800_000)
    expect(at(2031)).toBe(2_800_000)
    expect(at(2032)).toBe(4_000_000)
  })

  it('trừ MỌI NĂM trong khoảng, KHÔNG theo nhịp lặp', () => {
    // Mua nhà là thôi trả tiền thuê mọi năm, không phải mỗi 5 năm. Mốc chỉ tốn tiền
    // ở năm đúng nhịp, nhưng phần THAY thì suốt khoảng.
    const rows = projectLifetime(
      baseInput({
        events: [
          ev({ startYear: 2030, endYear: 2035, repeatEveryYears: 5, replacesMinor: 1_200_000 }),
        ],
      }),
    )
    expect(rows.find((r) => r.year === 2031)!.expenseMinor).toBe(2_800_000)
    // 2031 lệch nhịp nên mốc không tốn đồng nào ở đó...
    expect(rows.find((r) => r.year === 2031)!.events).toHaveLength(0)
    // ...nhưng tiền thuê vẫn đã thôi trả.
    expect(rows.find((r) => r.year === 2030)!.events).toHaveLength(1)
  })

  it('mốc TẮT TẠM thì không thay gì cả', () => {
    const rows = projectLifetime(
      baseInput({ events: [ev({ replacesMinor: 1_200_000, enabled: false })] }),
    )
    expect(rows.find((r) => r.year === 2030)!.expenseMinor).toBe(4_000_000)
  })

  it('khai thay nhiều hơn cả chi nền thì kẹp ở 0, KHÔNG cho chi nền âm', () => {
    // Chi nền âm sẽ chảy vào netFlow thành "chặng này tự sinh ra tiền".
    const rows = projectLifetime(
      baseInput({ events: [ev({ replacesMinor: 9_000_000 })] }),
    )
    const sau = rows.find((r) => r.year === 2030)!
    expect(sau.expenseMinor).toBe(0)
    expect(sau.netFlowMinor).toBe(5_000_000 - 0 - 1_800_000)
  })

  it('mốc mang tiền KHÁC: quy đổi phần thay theo tỷ giá của chính mốc', () => {
    const rows = projectLifetime(
      baseInput({
        events: [
          ev({ currency: 'VND', fxToDisplay: 1 / 165, amountMinor: 0, replacesMinor: 165_000_000 }),
        ],
      }),
    )
    // ₫165.000.000 ÷ 165 = ¥1.000.000 → chi nền ¥4M − ¥1M = ¥3M.
    expect(rows.find((r) => r.year === 2030)!.expenseMinor).toBe(3_000_000)
  })
})

describe('projectLifetime — chặng khai bằng PHẦN TRĂM (migration 0067)', () => {
  it('chi của chặng sau = 80% chặng trước', () => {
    const rows = projectLifetime(
      baseInput({
        endAge: 45,
        phases: [
          {
            startYear: 2026,
            label: 'Đi làm',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 5_000_000,
            annualExpenseMinor: 4_000_000,
            fxToDisplay: 1,
          },
          {
            startYear: 2036,
            label: 'Nghỉ hưu',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 0,
            annualExpenseMinor: 0,
            expensePctOfPrev: 80,
            incomePctOfPrev: 0,
            fxToDisplay: 1,
          },
        ],
      }),
    )
    const huu = rows.find((r) => r.year === 2036)!
    expect(huu.expenseMinor).toBe(3_200_000)
    expect(huu.incomeMinor).toBe(0)
  })
})

describe('projectLifetime — mốc MUA TÀI SẢN (migration 0068)', () => {
  const nha = (over: Record<string, unknown> = {}) => ({
    id: 'nha',
    startYear: 2030,
    endYear: null as number | null,
    kind: 'expense' as const,
    // Chi phí GIỮ mỗi năm (thuế + bảo hiểm + bảo trì) — không phải giá nhà.
    amountMinor: 400_000,
    currency: 'JPY' as const,
    label: 'Mua nhà',
    fxToDisplay: 1,
    inflate: false,
    assetValueMinor: 40_000_000,
    assetChangeBps: 0,
    loanMinor: 32_000_000,
    loanRateBps: 0,
    loanYears: 10,
    ...over,
  })

  const chay = (over: Record<string, unknown> = {}) =>
    projectLifetime(baseInput({ endAge: 50, events: [nha(over)] }))

  it('kịch bản KHÔNG có mốc mua tài sản: ba trường mới bằng 0 và netWorth = tiền lỏng', () => {
    // Bất biến quan trọng nhất của 0068 — mọi kịch bản có trước nó đọc y hệt như cũ.
    for (const r of projectLifetime(baseInput())) {
      expect(r.ownedAssetsMinor).toBe(0)
      expect(r.loanBalanceMinor).toBe(0)
      expect(r.netWorthMinor).toBe(r.assetsEndMinor)
    }
  })

  it('căn nhà VÀO tài sản, và KHÔNG vào tiền lỏng', () => {
    // Tiền lỏng là thứ ngưỡng FIRE và "năm cạn tiền" đọc — một căn nhà không tiêu được.
    const rows = chay()
    const truoc = rows.find((r) => r.year === 2029)!
    const sau = rows.find((r) => r.year === 2030)!
    expect(truoc.ownedAssetsMinor).toBe(0)
    expect(sau.ownedAssetsMinor).toBe(40_000_000)
    expect(sau.netWorthMinor).toBe(sau.assetsEndMinor + 40_000_000 - sau.loanBalanceMinor)
    // Tiền lỏng tụt vì trả trước + trả nợ, không phải vì mất trắng ¥40 triệu.
    expect(truoc.assetsEndMinor - sau.assetsEndMinor).toBeLessThan(40_000_000)
  })

  it('năm mua sinh ĐÚNG BA dòng có tên: giữ, trả trước, trả nợ', () => {
    const sau = chay().find((r) => r.year === 2030)!
    expect(sau.events.map((e) => e.label).sort()).toEqual([
      'Mua nhà',
      'Mua nhà — trả nợ',
      'Mua nhà — trả trước',
    ])
    const tim = (l: string) => sau.events.find((e) => e.label === l)!.amountDisplayMinor
    expect(tim('Mua nhà — trả trước')).toBe(8_000_000)
    expect(tim('Mua nhà — trả nợ')).toBe(3_200_000)
    expect(tim('Mua nhà')).toBe(400_000)
  })

  it('năm sau chỉ còn hai dòng — trả trước đúng một lần', () => {
    const r = chay().find((y) => y.year === 2031)!
    expect(r.events.map((e) => e.label).sort()).toEqual(['Mua nhà', 'Mua nhà — trả nợ'])
  })

  it('trả xong nợ thì hết dòng trả nợ, và dư nợ về 0', () => {
    const r = chay().find((y) => y.year === 2040)!
    expect(r.loanBalanceMinor).toBe(0)
    expect(r.events.some((e) => e.label.includes('trả nợ'))).toBe(false)
    // Căn nhà vẫn còn.
    expect(r.ownedAssetsMinor).toBe(40_000_000)
  })

  it('chi phí giữ bằng 0 vẫn mua được nhà — KHÔNG bị vòng mốc bỏ qua', () => {
    // `eventAmountInYear` trả 0 thì vòng mốc `continue`; nếu phần tài sản nằm chung
    // vòng đó thì căn nhà biến mất đúng ở ca đơn giản nhất (mua, không tốn phí giữ).
    const r = chay({ amountMinor: 0 }).find((y) => y.year === 2030)!
    expect(r.ownedAssetsMinor).toBe(40_000_000)
    expect(r.events.map((e) => e.label).sort()).toEqual([
      'Mua nhà — trả nợ',
      'Mua nhà — trả trước',
    ])
  })

  it('trả thẳng: cả giá ra trong năm mua, không có dòng trả nợ và không có nợ', () => {
    const r = chay({ loanMinor: 0, loanYears: 0 }).find((y) => y.year === 2030)!
    expect(r.loanBalanceMinor).toBe(0)
    expect(r.events.find((e) => e.label.includes('trả trước'))!.amountDisplayMinor).toBe(
      40_000_000,
    )
    expect(r.events.some((e) => e.label.includes('trả nợ'))).toBe(false)
  })

  it('nhà lên giá thì tài sản đi lên theo từng năm', () => {
    const rows = chay({ assetChangeBps: 100 })
    expect(rows.find((r) => r.year === 2030)!.ownedAssetsMinor).toBe(40_000_000)
    expect(rows.find((r) => r.year === 2035)!.ownedAssetsMinor).toBeGreaterThan(41_000_000)
  })

  it('mốc TẮT TẠM thì không mua gì cả', () => {
    const r = chay({ enabled: false }).find((y) => y.year === 2035)!
    expect(r.ownedAssetsMinor).toBe(0)
    expect(r.loanBalanceMinor).toBe(0)
    expect(r.events).toHaveLength(0)
  })

  it('tiền KHÁC: quy đổi cả tài sản lẫn dư nợ theo tỷ giá của mốc', () => {
    const r = chay({
      currency: 'VND',
      fxToDisplay: 1 / 165,
      amountMinor: 0,
      assetValueMinor: 1_650_000_000,
      loanMinor: 0,
      loanYears: 0,
    }).find((y) => y.year === 2030)!
    expect(r.ownedAssetsMinor).toBe(10_000_000)
  })
})

// Cổng R6: §4.4/13b cho phép vẽ lại NGAY trong lúc kéo chỉ khi phép chiếu chạy dưới
// ~16 ms. Đo lại ở đây thay vì tin con số đã đo một lần — nếu ai đó làm projectLifetime
// nặng lên gấp trăm lần, chính phép thử này phải là chỗ báo.
//
// Chuyển từ `assumptions.test.ts` (Task 16, xoá cùng màn Tương lai bản cũ — file đó chỉ
// còn mỗi cổng này là sống, phần biên/bước thanh trượt đã chết theo `assumptions.ts`).
// `projectLifetime` không đổi qua việc dọn dẹp đó (byte-identical với master), nên cổng
// vẫn canh đúng thứ nó luôn canh.
describe('cổng hiệu năng (R6)', () => {
  it('projectLifetime dưới 16ms mỗi lần chiếu', () => {
    const i = baseInput({ birthYear: 1990, endAge: 90, startingAssetsMinor: 10_000_000, realReturnBps: 300, inflationBps: 200 })
    const N = 50
    const t0 = performance.now()
    for (let k = 0; k < N; k++) projectLifetime({ ...i, realReturnBps: 300 + k })
    const moiLan = (performance.now() - t0) / N
    expect(moiLan).toBeLessThan(16)
  })
})
