// Câu KẾT LUẬN của mặt lập kế hoạch (bản vẽ 18a) — thuần, test được.
//
// 18a mở đầu bằng đúng một câu: "Kế hoạch này giữ lại 32% thu nhập và đạt cả ba mốc —
// nhưng 2 danh mục chưa phủ hết khoản đã cam kết." Ba mệnh đề, và cả ba đều đã có sẵn
// dưới dạng con số trên màn. Việc của câu này là ghép chúng thành một phán quyết, vì
// mặt lập kế hoạch là màn duy nhất trong app trả lời được "kế hoạch này có ổn không"
// TRƯỚC khi tiêu đồng nào — mà bốn ô KPI, ba thanh trục và một danh sách cảnh báo thì
// không tự nói ra điều đó.
//
// Vì sao là file riêng: nó phải im đúng chỗ (chưa biết thu nhập thì không phán), phải
// nói ngược khi chia quá tay, và phải nối ba mệnh đề mà không đẻ ra hai chữ "nhưng"
// trong một câu. Ba thứ đó là ba lỗi ngữ pháp/logic khác nhau, mỗi thứ một test.
import { AXIS_LABEL, shareLabel, type AxisProgress } from './axisTargets'
import type { PlanSummary } from './planning'

export interface PlanVerdict {
  /**
   * 'bad' = chia quá thu · 'warn' = lệch mốc hoặc hụt cam kết · 'good' = phủ hết ·
   * 'info' = chưa chia gì nên chưa phán được.
   *
   * Bốn khoá này trùng đúng bốn tông của <VerdictNote>/<ConclusionLine> — cố ý, để nơi
   * hiển thị truyền thẳng, không cần một bảng ánh xạ thứ hai có thể lệch.
   */
  tone: 'good' | 'warn' | 'bad' | 'info'
  /** Câu đầy đủ. */
  text: string
  /** Bản ngắn cho chế độ Gọn — mệnh đề quyết định, bỏ phần giải thích. */
  short: string
}

export interface PlanVerdictInput {
  summary: PlanSummary
  /** Số trần đang không phủ nổi cam kết (`coverageGaps().length`). */
  gapCount: number
}

/**
 * Phán quyết của một kế hoạch. `null` = chưa có gì để phán.
 *
 * Trả `null` khi chưa biết thu nhập: mẫu số không có thì mọi tỷ lệ đều vô nghĩa, và
 * khối đó đã có câu riêng mời khai thu dự kiến. In thêm một câu phán ở trên nó là hai
 * câu tranh nhau nói cùng một điều.
 */
export function planVerdict({ summary, gapCount }: PlanVerdictInput): PlanVerdict | null {
  if (summary.incomeSource === 'unknown' || summary.income <= 0) return null

  // CHƯA CHIA GÌ thì không được khen. Bắt được ca này khi chạy thật: tháng 9 chưa đặt
  // hạn mức nào ra câu "Tốt: Kế hoạch này giữ lại 100% thu nhập" — vì cả ba mốc đều đạt
  // một cách rỗng (0% ≤ trần 50%, 0% ≤ trần 30%, 100% ≥ sàn 20%). Một kế hoạch chưa lập
  // thì mọi ràng buộc của nó đều thoả, và khen nó là dạy người dùng đúng điều sai:
  // rằng không làm gì là một kế hoạch tốt.
  if (summary.allocated <= 0) {
    return {
      tone: 'info',
      text: 'Chưa đặt hạn mức nào cho tháng này — các tỷ lệ dưới đây đang đạt mốc chỉ vì chưa chia đồng nào.',
      short: 'Chưa đặt hạn mức nào.',
    }
  }

  // Tỷ lệ để dành = phần CHƯA PHÂN BỔ trên thu nhập. Lấy thẳng từ `unallocated` chứ
  // không đi tìm dòng 'savings' trong axis: `planSummary` đã đặt hai thứ đó bằng nhau
  // theo thiết kế, nên tra qua axis chỉ thêm một đường có thể lệch — và axis có thể
  // null trong khi `unallocated` thì luôn có.
  const share = summary.unallocated / summary.income
  const over = summary.unallocated < 0

  const mo = over
    ? `Kế hoạch này chia quá tay ${shareLabel(-share)} thu nhập`
    : `Kế hoạch này giữ lại ${shareLabel(share)} thu nhập`

  const truc = axisClause(summary.axis)
  const camKet =
    gapCount > 0 ? `${gapCount} danh mục chưa phủ hết khoản đã cam kết` : null

  // Nối sao cho KHÔNG có hai chữ "nhưng" trong một câu: mệnh đề trục đã tự mang liên
  // từ của nó ('và đạt…' hay 'nhưng chưa đạt…'), nên mệnh đề cam kết phải xem liên từ
  // đó là gì rồi mới chọn liên từ của mình.
  let text = mo
  if (truc) text += ` ${truc}`
  if (camKet) text += truc?.startsWith('nhưng') ? `, và ${camKet}` : ` — nhưng ${camKet}`
  text += '.'

  // Bản ngắn giữ MỆNH ĐỀ QUYẾT ĐỊNH, không phải mệnh đề đầu tiên: chia quá tay là lỗi
  // nặng nhất, rồi tới cam kết không được phủ (tiền chắc chắn ra), rồi mới tới lệch mốc.
  const short = over
    ? `Chia quá tay ${shareLabel(-share)} thu nhập.`
    : camKet
      ? `${camKet[0].toUpperCase()}${camKet.slice(1)}.`
      : `${mo}.`

  return {
    tone: over ? 'bad' : camKet || (summary.axis?.lines.some((l) => !l.ok) ?? false) ? 'warn' : 'good',
    text,
    short,
  }
}

/** Mệnh đề về ba mốc, ĐÃ mang liên từ. `null` = chưa dựng được cơ cấu. */
function axisClause(axis: AxisProgress | null): string | null {
  if (!axis || axis.lines.length === 0) return null
  const miss = axis.lines.filter((l) => !l.ok)
  if (miss.length === 0) return `và đạt cả ${axis.lines.length} mốc`
  // Một mốc thì gọi tên — người đọc sửa được ngay. Nhiều mốc thì đếm: liệt kê hai ba
  // tên vào giữa câu làm nó dài gấp đôi mà vẫn phải cuộn xuống mới biết lệch bao nhiêu.
  if (miss.length === 1) return `nhưng chưa đạt mốc ${AXIS_LABEL[miss[0].key]}`
  return `nhưng lệch ${miss.length} mốc`
}
