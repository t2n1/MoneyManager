// Toán hình học của đồ thị Tương lai — THUẦN, không React, không DOM.
//
// VÌ SAO TÁCH RA. Bản trước vẽ bằng Recharts, nên phần toán này thuộc về thư viện và
// không ai phải viết. Bản vẽ mới đòi bốn thứ Recharts không cho: chip mốc KÉO ĐƯỢC đặt
// tuyệt đối theo năm, một dải chặng đời dưới đáy, thang log chịu được số ÂM, và một
// tooltip GHIM được. Ba trong bốn thứ đó cần biết chính xác "năm này ra pixel nào" —
// tức là chính cái Recharts giấu bên trong.
//
// Tự vẽ thì phép chiếu năm→pixel thành code của mình, và code của mình thì phải có phép
// thử. Đây là chỗ chứa nó: mọi hàm dưới đây nhận số, trả số, không đụng gì tới thẻ SVG.

/** Lề quanh vùng vẽ. `left` chừa chỗ cho nhãn trục tung, `top` cho hàng chip mốc. */
export const PLOT_MARGIN = { top: 28, right: 8, bottom: 18, left: 44 } as const

/**
 * Thang "symlog": `sign(v) · log10(1 + |v|/unit)`.
 *
 * Log thường không nhận 0 và số âm, mà bản chiếu tài sản có CẢ HAI — cạn tiền rồi âm
 * là đúng cái người dùng bật thang log để nhìn cho rõ. Dạng này liên tục qua 0, đối
 * xứng hai chiều, và gần tuyến tính trong khoảng |v| < unit nên đoạn quanh 0 không bị
 * kéo giãn thành vô cực.
 */
export function symlog(v: number, unit: number): number {
  const u = unit > 0 ? unit : 1
  return Math.sign(v) * Math.log10(1 + Math.abs(v) / u)
}

/**
 * Đơn vị quy chiếu của thang log, suy từ chính dữ liệu: ~1/100 độ lớn cao nhất.
 *
 * Không gõ cứng: đồ thị này chạy cả bằng ¥ (số hàng chục triệu) lẫn ₫ (số hàng chục
 * tỷ), và một `unit` hợp với ¥ thì với ₫ là ép cả đồ thị vào một đoạn phẳng.
 */
export function symlogUnit(minV: number, maxV: number): number {
  const bien = Math.max(Math.abs(minV), Math.abs(maxV))
  if (bien <= 0) return 1
  return 10 ** Math.max(0, Math.floor(Math.log10(bien)) - 2)
}

export interface YScaleArgs {
  min: number
  max: number
  log: boolean
  /** Chỉ dùng khi `log`. Lấy từ `symlogUnit`. */
  unit: number
  plotTop: number
  plotBottom: number
}

/** `(giá trị) => toạ độ y bằng pixel`. Trên màn hình y tăng xuống dưới nên thang đảo. */
export function makeYScale(a: YScaleArgs): (v: number) => number {
  const h = a.plotBottom - a.plotTop
  if (a.log) {
    const lo = symlog(a.min, a.unit)
    const hi = symlog(a.max, a.unit)
    // `1e-9`: min === max (bản chiếu một điểm, hoặc mọi năm cùng một số) thì mẫu số
    // bằng 0 và mọi điểm ra NaN — cả đồ thị biến mất mà không có gì báo.
    const span = Math.max(1e-9, hi - lo)
    return (v) => a.plotTop + (1 - (symlog(v, a.unit) - lo) / span) * h
  }
  const span = Math.max(1e-9, a.max - a.min)
  return (v) => a.plotTop + (1 - (v - a.min) / span) * h
}

/** `(năm) => toạ độ x bằng pixel`. */
export function makeXScale(
  y0: number,
  y1: number,
  plotLeft: number,
  plotRight: number,
): (year: number) => number {
  const span = Math.max(1, y1 - y0)
  const w = plotRight - plotLeft
  return (year) => plotLeft + ((year - y0) / span) * w
}

/**
 * Bước chia "đẹp" gần nhất cho một khoảng: 1 · 2 · 2,5 · 5 nhân luỹ thừa 10.
 *
 * Bốn hệ số đó (không phải chỉ 1/2/5) vì trục tiền hay rơi vào ca span/maxTicks nằm
 * giữa 2 và 5: thiếu 2,5 thì nhảy thẳng lên 5 và trục chỉ còn hai vạch.
 */
export function niceStep(span: number, maxTicks: number): number {
  if (span <= 0 || maxTicks <= 0) return 1
  const tho = span / maxTicks
  const bac = 10 ** Math.floor(Math.log10(tho))
  for (const m of [1, 2, 2.5, 5]) {
    if (bac * m >= tho) return bac * m
  }
  return bac * 10
}

/** Các vạch ngang của trục tung, thang tuyến tính. Luôn gồm 0 nếu 0 nằm trong khoảng. */
export function niceYTicks(min: number, max: number, maxTicks = 5): number[] {
  if (!(max > min)) return [min]
  const step = niceStep(max - min, maxTicks)
  const dau = Math.ceil(min / step)
  const cuoi = Math.floor(max / step)
  const out: number[] = []
  // Đếm theo CHỈ SỐ NGUYÊN rồi mới nhân, không cộng dồn `v += step`: step có thể là
  // 2,5·10^k và cộng dồn 40 lần sẽ trôi ra những con số như 24999999,999999996.
  for (let i = dau; i <= cuoi; i++) out.push(Math.round(i * step))
  return out
}

/** Các vạch ngang ở thang log: 0 và các bậc mười về hai phía. */
export function logYTicks(min: number, max: number, unit: number): number[] {
  const out: number[] = [0]
  for (let p = unit * 10; p <= max; p *= 10) out.push(Math.round(p))
  for (let p = unit * 10; p <= Math.abs(min); p *= 10) out.push(-Math.round(p))
  return out.sort((a, b) => a - b)
}

/**
 * Bước năm giữa hai NHÃN trên trục hoành: bước nhỏ nhất trong 1·2·5·10·20 mà mỗi nhãn
 * còn được `minLabelPx` bề ngang.
 *
 * Suy từ BỀ NGANG THẬT chứ không từ một con số nhãn tối đa đoán trước: cùng một nhãn
 * "2046 · 52t" đáng 5 năm ở bề ngang desktop nhưng 14 năm ở 375px, nên mọi ngưỡng theo
 * NĂM đều sai ở một trong hai đầu.
 */
export function xTickStep(spanYears: number, plotWidth: number, minLabelPx = 70): number {
  if (plotWidth <= 0) return 20
  const toiDa = Math.max(1, plotWidth / minLabelPx)
  return [1, 2, 5, 10, 20, 25, 50].find((s) => spanYears / s <= toiDa) ?? 50
}

export interface PackItem {
  /** Mép trái của chip, pixel. */
  left: number
  width: number
}

/**
 * Xếp chip mốc thành nhiều hàng để không đè nhau: mỗi chip vào HÀNG ĐẦU TIÊN còn chỗ.
 *
 * Xếp theo VA CHẠM THẬT, không gán cứng `i % 3`: một kịch bản có ba mốc rải đều 30 năm
 * thì `i % 3` vẫn đẩy chúng xuống ba hàng, chiếm 84px mép trên đồ thị mà không cần —
 * còn ba mốc dồn vào hai năm liền nhau thì `i % 3` cho đúng ba hàng nhưng mốc thứ tư
 * lại quay về hàng 0, đè lên mốc thứ nhất.
 *
 * Trả về chỉ số hàng của từng chip, cùng thứ tự đầu vào. `items` phải đã sắp theo `left`
 * tăng dần (chip sinh từ danh sách mốc đã sắp theo năm).
 */
export function packRows(items: PackItem[], gap = 8): number[] {
  const mepPhai: number[] = []
  return items.map((it) => {
    let hang = mepPhai.findIndex((r) => r + gap < it.left)
    if (hang === -1) {
      hang = mepPhai.length
      mepPhai.push(it.left + it.width)
    } else {
      mepPhai[hang] = it.left + it.width
    }
    return hang
  })
}

/** `d` của một đường gãy khúc. Rỗng → chuỗi rỗng (React bỏ qua `d=""`). */
export function linePath(pts: [number, number][]): string {
  if (pts.length === 0) return ''
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
}

/** `d` của một vùng khép kín giữa mép trên và mép dưới. */
export function bandPath(hi: [number, number][], lo: [number, number][]): string {
  if (hi.length === 0 || lo.length === 0) return ''
  const nguoc = [...lo].reverse()
  return `${linePath(hi)} ${nguoc.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')} Z`
}

/**
 * Năm ứng với một toạ độ x — phép chiếu NGƯỢC của `makeXScale`, dùng cho rê chuột và
 * kéo chip. Đã kẹp trong [y0, y1]: kéo chip ra ngoài mép đồ thị phải dừng ở mép, không
 * nhảy sang một năm không có trên trục.
 */
export function xToYear(
  px: number,
  y0: number,
  y1: number,
  plotLeft: number,
  plotRight: number,
): number {
  const w = Math.max(1, plotRight - plotLeft)
  const tho = y0 + ((px - plotLeft) / w) * (y1 - y0)
  return Math.max(y0, Math.min(y1, Math.round(tho)))
}
