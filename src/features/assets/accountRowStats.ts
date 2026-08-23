// Δ 30 ngày · đường tí hon · ngày đối chiếu gần nhất cho từng dòng tài khoản (§4.4).
//
// §4.4 đòi: *"Danh sách tài khoản thêm cột Δ 30 ngày + đường tí hon mỗi dòng, và ngày
// đối chiếu gần nhất; tài khoản quá 30 ngày chưa đối chiếu hiện nút Đối chiếu tại
// dòng."* Trước bản này danh sách chỉ có tên · loại tiền · số dư — tức nó trả lời "bao
// nhiêu" nhưng không trả lời "đang đi lên hay xuống", mà đó mới là câu người ta liếc
// danh sách để hỏi.
//
// ---- Vì sao phép tính này nằm ở CLIENT, và cái giá của nó -------------------------
//
// Số dư TUYỆT ĐỐI đến từ view `account_balances` (nguồn sự thật duy nhất). Nhưng Δ theo
// cửa sổ thì view không trả được — nó chỉ có số dư HÔM NAY. Nên chỗ này buộc phải cộng
// lại từ giao dịch, và như vậy công thức số dư tồn tại ở BA nơi: view SQL, demoRepo, và
// đây. Đúng cái bẫy "hai chỗ vẽ cùng một ý nghĩa" mà docs/design-system.md cảnh báo.
//
// Giảm thiểu bằng ba điều, không phải bằng cách vờ như không có vấn đề:
//   1. `applyTx` dưới đây chép ĐÚNG năm nhánh của view, theo đúng thứ tự, có ghi rõ. Ai
//      sửa view mà không sửa đây thì phép thử ở accountRowStats.test.ts gãy.
//   2. Nó chỉ tính HIỆU, không bao giờ tính số dư tuyệt đối từ đầu — số dư hiện tại vẫn
//      lấy từ view rồi lùi dần về quá khứ. Sai sót (nếu có) không lan sang con số lớn.
//   3. Bút toán bù số dư (`exclude_from_stats`) thì NGƯỢC LẠI: view tính, chỗ này không.
//      Lý do nằm ở khối "VÌ SAO LOẠI BÚT TOÁN BÙ" trong `accountRowStats` — nó là chỗ
//      duy nhất file này cố tình lệch khỏi view, nên phải đọc trước khi sửa.
import type { TransactionRow } from '../../types/database.types'

/** Cửa sổ của cột Δ. Cùng con số với RECONCILE_STALE_DAYS ở dataRules — cùng ý "gần đây". */
export const DELTA_DAYS = 30

/** Số mốc của đường tí hon. 8 điểm đủ thấy hình, không đủ để ai đọc ra ngày cụ thể. */
export const SPARK_POINTS = 8

export interface AccountRowStat {
  /** Đổi bao nhiêu trong `DELTA_DAYS` ngày, ĐƠN VỊ CỦA TÀI KHOẢN. */
  delta: number
  /** Số dư ở `SPARK_POINTS` mốc đều nhau, cũ → mới. Phần tử cuối = số dư hiện tại. */
  spark: number[]
  /** Đối chiếu gần nhất biết được. null = chưa lần nào. CÓ THỂ cũ hơn cửa sổ Δ. */
  lastReconciledISO: string | null
  /** Quá hạn: chưa đối chiếu bao giờ, hoặc lần cuối đã trước `windowStartISO`. */
  stale: boolean
}

/**
 * Một giao dịch làm số dư của `accountId` đổi bao nhiêu.
 *
 * CHÉP ĐÚNG view `account_balances` (xem migration, và bản đối chiếu trong
 * demoRepo.getAccountBalances). Năm nhánh, đúng thứ tự này:
 *   income                → +amount
 *   expense + is_refund   → +amount   (tiền quay lại ví)
 *   expense               → −amount
 *   transfer (đi)         → −amount
 *   transfer (đến)        → +(to_amount ?? amount)
 * Nhánh hoàn tiền phải đứng TRƯỚC nhánh expense thường, nếu không mọi khoản hoàn tiền
 * bị trừ hai lần về hướng sai.
 */
export function applyTx(t: TransactionRow, accountId: string): number {
  if (t.type === 'income' && t.account_id === accountId) return t.amount
  if (t.type === 'expense' && t.account_id === accountId) return t.is_refund ? t.amount : -t.amount
  if (t.type === 'transfer' && t.account_id === accountId) return -t.amount
  if (t.type === 'transfer' && t.to_account_id === accountId) return t.to_amount ?? t.amount
  return 0
}

export interface RowStatsArgs {
  /** Số dư HIỆN TẠI theo view, theo id. */
  balanceById: Map<string, number>
  /** Giao dịch trong cửa sổ (ít nhất `DELTA_DAYS` ngày gần nhất). */
  txs: TransactionRow[]
  /**
   * Ngày đối chiếu gần nhất theo tài khoản, dựng bằng `lastReconciledMap`
   * (notifications/reconciledAt.ts) — nơi DUY NHẤT trả lời câu "lần cuối là khi nào",
   * chung với chuông nhắc và khối Độ tin cậy.
   *
   * Trước đây file này tự suy lấy, chỉ nhìn giao dịch bù trong cửa sổ Δ. Suy như vậy bỏ
   * sót đúng cái ca hay gặp nhất: đối chiếu thấy KHỚP thì không sinh giao dịch nào, nên
   * nút "Đối chiếu" vẫn nằm lì ở dòng ngay sau khi người dùng vừa kiểm xong. Đó là chỗ
   * thứ ba trong repo trả lời cùng một câu hỏi; giờ cả ba đi qua một hàm.
   */
  lastReconciledById: Map<string, string>
  todayISO: string
  /** Mốc sớm nhất của cửa sổ, 'YYYY-MM-DD'. */
  windowStartISO: string
}

/**
 * Thống kê cho MỌI tài khoản có trong `balanceById`.
 *
 * Đi LÙI từ số dư hiện tại: `spark[cuối]` luôn đúng bằng con số view trả về, nên đường
 * tí hon và cột số bên cạnh nó không bao giờ kể hai câu chuyện khác nhau. Nếu đi xuôi
 * từ số dư đầu kỳ thì sai số cộng dồn sẽ đọng hết vào đúng cái đầu bên phải — đầu mà
 * người dùng nhìn.
 */
export function accountRowStats(args: RowStatsArgs): Map<string, AccountRowStat> {
  const { balanceById, txs, lastReconciledById, todayISO, windowStartISO } = args
  const out = new Map<string, AccountRowStat>()

  // Mốc chia đường tí hon: SPARK_POINTS đoạn đều nhau trên cửa sổ.
  const t0 = Date.parse(`${windowStartISO}T00:00:00Z`)
  const t1 = Date.parse(`${todayISO}T00:00:00Z`)
  const span = Math.max(1, t1 - t0)
  const bucketOf = (iso: string) => {
    const t = Date.parse(`${iso}T00:00:00Z`)
    if (!Number.isFinite(t) || t <= t0) return 0
    if (t >= t1) return SPARK_POINTS - 1
    return Math.min(SPARK_POINTS - 1, Math.floor(((t - t0) / span) * SPARK_POINTS))
  }

  /**
   * VÌ SAO LOẠI BÚT TOÁN BÙ (`exclude_from_stats`) — chỗ duy nhất lệch khỏi view.
   *
   * Đó là cờ mà cả hai sheet đối chiếu (ReconcileSheet, CardMonthAdjustSheet) đóng lên
   * khoản bù chênh lệch. Khoản bù KHÔNG phải tiền vào/ra: nó là sai số theo dõi được
   * ghi nhận. Và với một sổ ghi tay thì nó to hơn mọi dòng thật — một cái ví số dư
   * ¥2.840 nhận bút toán +¥1.446.190 làm cột Δ đọc ra "tháng qua ví tăng 1,4 triệu",
   * còn đường tí hon vẽ một bậc thang dựng đứng. Cả hai nói sai về đúng cái duy nhất
   * chúng được đặt ở đó để nói: tài khoản đang đi lên hay đi xuống.
   *
   * Cùng lối với `keptDestinations` (reports/monthReport.ts), nơi ĐÚNG bút toán
   * ¥1.661.218 của sổ này từng thành dòng to nhất bảng "tiền để lại đã đi đâu".
   *
   * CÁI GIÁ, nói thẳng: cửa sổ nào có bút toán bù thì Δ không còn cộng đúng bằng hiệu
   * hai đầu đường tí hon. Bất biến giữ lại là cái quan trọng hơn — `spark[cuối]` vẫn
   * đúng bằng số dư view trả về — nên đoạn quá khứ của đường được vẽ như thể tài khoản
   * LUÔN khớp với số dư đã chốt, tức đúng điều người dùng vừa khẳng định lúc bấm Đối
   * chiếu.
   *
   * Dòng nợ/cho vay (`is_debt_flow`) thì GIỮ, khác với báo cáo: tiền của người khác,
   * nhưng nó rời tài khoản thật, nên số dư đi xuống thật.
   */
  const flows = txs.filter((t) => t.occurred_on >= windowStartISO && !t.exclude_from_stats)

  for (const [id, balance] of balanceById) {
    // Hiệu theo từng mốc, và ngày đối chiếu gần nhất.
    const perBucket = new Array<number>(SPARK_POINTS).fill(0)
    let tong = 0

    for (const t of flows) {
      const d = applyTx(t, id)
      if (d === 0) continue
      perBucket[bucketOf(t.occurred_on)] += d
      tong += d
    }

    // Mốc đối chiếu KHÔNG bị cửa sổ Δ cắt: cột `accounts.last_reconciled_at` giữ được
    // ngày cũ tuỳ ý, nên "quá hạn" phải so với `windowStartISO` chứ không còn suy được
    // từ "không tìm thấy trong cửa sổ" như bản cũ.
    const lastReconciledISO = lastReconciledById.get(id) ?? null

    // Lùi từ số dư hiện tại: spark[i] = số dư ở CUỐI mốc i.
    const spark = new Array<number>(SPARK_POINTS)
    let chay = balance
    for (let i = SPARK_POINTS - 1; i >= 0; i--) {
      spark[i] = chay
      chay -= perBucket[i]
    }

    out.set(id, {
      delta: tong,
      spark,
      lastReconciledISO,
      stale: lastReconciledISO === null || lastReconciledISO < windowStartISO,
    })
  }
  return out
}
