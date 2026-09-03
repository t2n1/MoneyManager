import { describe, expect, it } from 'vitest'
import { type AxisKey, type AxisLine, type AxisProgress } from './axisTargets'
import { BUDGET_METHODS } from './budgetMethods'
import { axisSuggestions, sliderScale } from './axisSuggest'

const M503020 = BUDGET_METHODS.find((m) => m.id === '50-30-20')!
/** Nhãn của khoản 50/30/20 — dùng để dựng fixture, không phải bảng phẳng nào nữa. */
const labelOf = (key: AxisKey): string => M503020.buckets.find((b) => b.key === key)!.label

function line(
  key: AxisKey,
  actual: number,
  target: number,
  slices: [string, number][],
  direction: 'cap' | 'floor' = 'cap',
): AxisLine {
  return {
    key,
    label: labelOf(key),
    hint: '',
    actual,
    target,
    share: actual / 290_000,
    targetShare: target / 290_000,
    direction,
    ok: direction === 'cap' ? actual <= target : actual >= target,
    slices: slices.map(([categoryId, amount]) => ({ categoryId, amount })),
  }
}

function axis(lines: AxisLine[]): AxisProgress {
  return {
    lines,
    income: 290_000,
    actualIncome: 290_000,
    estimated: false,
    unclassified: 0,
    method: M503020,
  }
}

describe('axisSuggestions', () => {
  it('trục vượt trần: mỗi danh mục co theo tỷ lệ, tổng bằng ĐÚNG trần', () => {
    // Ca thật tháng 9/2026: Linh hoạt chia ¥147,156 so trần ¥87,000.
    const r = axisSuggestions(
      axis([
        line('flexible', 147_156, 87_000, [
          ['an-uong', 50_000],
          ['ho-tro', 30_000],
          ['giai-tri', 16_360],
          ['khach-san', 15_182],
          ['di-lai', 10_000],
          ['dich-vu', 8_300],
          ['con-lai', 17_314],
        ]),
      ]),
    )
    // Kéo hết về vạch thì trục phải chạm ĐÚNG trần — lệch một đồng là dòng trục
    // vẫn hiện "vượt" sau khi người dùng đã làm đúng mọi thứ app bảo.
    expect([...r.values()].reduce((s, v) => s + v, 0)).toBe(87_000)
    // 50.000 x 87.000/147.156 = 29.560,47 -> san 29.560, va no la mot trong hai
    // danh muc nhan phan du (phan thap phan lon nhat) nen thanh 29.561.
    expect(r.get('an-uong')).toBe(29_561)
    expect(r.get('ho-tro')).toBe(17_736)
  })

  it('trục đang TRONG trần thì không gợi ý gì — không có gì phải đạt', () => {
    const r = axisSuggestions(
      axis([line('essential', 140_529, 145_000, [['nha-o', 132_760], ['benh-vien', 7_769]])]),
    )
    expect(r.size).toBe(0)
  })

  it('bằng đúng trần cũng không gợi ý', () => {
    const r = axisSuggestions(axis([line('flexible', 87_000, 87_000, [['an-uong', 87_000]])]))
    expect(r.size).toBe(0)
  })

  it('trục SÀN (Để dành) không sinh gợi ý dù thiếu sàn', () => {
    // Để dành là HIỆU, không phải tổng của danh mục nào — co hạn mức nào cũng không
    // "đạt" nó trực tiếp. Vẽ vạch ở đây là gợi ý người dùng tiêu thêm.
    const r = axisSuggestions(
      axis([line('savings', 2_315, 58_000, [['gi-do', 2_315]], 'floor')]),
    )
    expect(r.size).toBe(0)
  })

  it('phần dư đi vào danh mục có phần thập phân LỚN NHẤT, không rơi vãi', () => {
    // 100 chia theo 3 phần bằng nhau: 33,33 mỗi phần → 33+33+33 = 99, dư 1.
    const r = axisSuggestions(
      axis([line('flexible', 300, 100, [['a', 100], ['b', 100], ['c', 100]])]),
    )
    expect([...r.values()].reduce((s, v) => s + v, 0)).toBe(100)
  })

  it('trục vượt trần mà không xổ ra được danh mục nào → map rỗng', () => {
    const r = axisSuggestions(axis([line('flexible', 147_156, 87_000, [])]))
    expect(r.size).toBe(0)
  })

  it('actual = 0 không chia cho 0', () => {
    const r = axisSuggestions(axis([line('flexible', 0, 87_000, [['a', 0]])]))
    expect(r.size).toBe(0)
  })

  it('trần = 0 thì mọi danh mục trong trục gợi ý về 0', () => {
    const r = axisSuggestions(axis([line('flexible', 5_000, 0, [['a', 3_000], ['b', 2_000]])]))
    expect(r.get('a')).toBe(0)
    expect(r.get('b')).toBe(0)
  })

  it('axis null → map rỗng', () => {
    expect(axisSuggestions(null).size).toBe(0)
  })

  it('hai trục cùng vượt thì mỗi trục co theo trần của CHÍNH nó', () => {
    const r = axisSuggestions(
      axis([
        line('essential', 200_000, 145_000, [['nha-o', 200_000]]),
        line('flexible', 100_000, 87_000, [['an-uong', 100_000]]),
      ]),
    )
    expect(r.get('nha-o')).toBe(145_000)
    expect(r.get('an-uong')).toBe(87_000)
  })
})

describe('sliderScale', () => {
  it('hạn mức hiện tại KHÔNG dính mép phải — dính mép là không nâng lên được nữa', () => {
    for (const limit of [37, 1_800, 10_000, 50_000, 132_760]) {
      expect(sliderScale(limit, null, 0).max).toBeGreaterThan(limit)
    }
  })

  it('vạch gợi ý luôn nằm trong thang', () => {
    const s = sliderScale(10_000, 29_554, 0)
    expect(s.max).toBeGreaterThanOrEqual(29_554)
  })

  it('tháng cao nhất lớn hơn hạn mức thì thang vẫn phủ được nó', () => {
    const s = sliderScale(2_869, null, 12_156)
    expect(s.max).toBeGreaterThanOrEqual(12_156)
  })

  it('bước kéo là số nguyên >= 1 — không có nửa đồng yên', () => {
    for (const [l, h] of [[37, 0], [0, 0], [620, 0], [0, 50_000]] as const) {
      const s = sliderScale(l, null, h)
      expect(Number.isInteger(s.step)).toBe(true)
      expect(s.step).toBeGreaterThanOrEqual(1)
    }
  })

  it('dòng bé giữ được độ chính xác — sàn thang KHÔNG kéo tụt nó', () => {
    // `Cây & Cá ¥37`: sàn ¥1.000 áp chung sẽ cho thang ¥2.000 bước ¥10, núm nằm ở 1,85%.
    expect(sliderScale(37, null, 0)).toEqual({ max: 50, step: 1 })
  })

  it('mép phải luôn chia hết cho bước kéo', () => {
    for (const limit of [37, 620, 1_800, 8_300, 50_000, 132_760]) {
      const s = sliderScale(limit, null, 0)
      expect(s.max % s.step).toBe(0)
    }
  })

  it('bước kéo tròn theo cỡ tiền, không ra số lẻ như 663', () => {
    expect(sliderScale(132_760, null, 0).step).toBe(1_000)
    expect(sliderScale(50_000, null, 0).step).toBe(500)
  })

  it('hạn mức 0 vẫn ra thang kéo được', () => {
    const s = sliderScale(0, null, 0)
    expect(s.max).toBeGreaterThan(0)
    expect(s.step).toBeGreaterThan(0)
  })

  it('dòng ¥0 không có lịch sử vẫn có thang ĐỦ RỘNG để kéo lên lại', () => {
    // Hạn mức ¥0 là một lựa chọn thật (xem progress.ts). Nhưng thang mà mép phải chỉ ¥2
    // thì đặt xong là không đổi ý được nữa — cả dải nằm trong hai đồng.
    const s = sliderScale(0, null, 0)
    expect(s.max).toBeGreaterThanOrEqual(1_000)
  })

  it('dòng ¥0 CÓ lịch sử thì thang theo lịch sử, không bị sàn kéo tụt', () => {
    expect(sliderScale(0, null, 50_000).max).toBeGreaterThanOrEqual(50_000)
  })
})

describe('sliderScale — vì sao KHÔNG được gọi với số đang kéo', () => {
  it('đưa mép phải trở lại làm đầu vào thì thang phình ra mãi', () => {
    // Đây là lỗi đã xảy ra thật: LimitSlider gọi `sliderScale(value, ...)` với `value` là
    // số ĐANG KÉO. Đẩy núm tới mép → `ceiling` lớn lên → mép phải nới → núm giật về giữa
    // → còn chỗ đẩy tiếp. Một lần kéo liền tay đưa ¥20.000 lên ¥1.000.000.
    //
    // Hàm này KHÔNG sai — nó đúng là "thang cho một hạn mức". Sai là chỗ GỌI. Test này
    // chốt lại cơ chế phình để lần sau ai định tính thang trong lúc kéo thì thấy ngay.
    const buoc: number[] = []
    let v = 20_000
    for (let i = 0; i < 5; i++) {
      v = sliderScale(v, null, 0).max
      buoc.push(v)
    }
    expect(buoc).toEqual([50_000, 100_000, 200_000, 500_000, 1_000_000])

    // Cách dùng ĐÚNG: một hạn mức cố định luôn cho cùng một thang, gọi bao nhiêu lần cũng vậy.
    const a = sliderScale(20_000, null, 0)
    const b = sliderScale(20_000, null, 0)
    expect(a).toEqual(b)
    expect(a.max).toBe(50_000)
  })
})
