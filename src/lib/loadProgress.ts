// Tiến độ của một ĐỢT tải dữ liệu, tính từ số query đang bay của react-query.
//
// Vì sao có file này: thanh tiến độ nào cũng phải trả lời được "phần trăm của cái gì".
// Ở app này thứ duy nhất đếm được thật là số query — react-query biết đang có mấy cái
// bay, và mỗi cái xong là một việc xong thật. Cho số chạy theo đồng hồ thì nó sẽ bò lên
// 90% kể cả khi mạng đã chết, tức là nói dối đúng lúc người dùng cần biết sự thật nhất.
//
// Module này KHÔNG đọc đồng hồ và không đụng React: mọi mốc thời gian vào qua tham số,
// nên test được mà không cần giả lập timer. Nơi nối vào react-query là
// hooks/useLoadProgress.ts.

/** Đợt phải kéo dài quá ngần này mới đáng hiện. Ngắn hơn thì nút chỉ nháy một cái. */
export const PROGRESS_DELAY_MS = 800

export interface BurstState {
  /** Số query đã khởi trong đợt. Chỉ tăng cho tới khi đợt đóng. */
  started: number
  /** Số query đang bay ở lần đo gần nhất. */
  inFlight: number
  /** Mốc mở đợt (ms). null = đang rảnh. */
  startedAt: number | null
}

export const IDLE_BURST: BurstState = { started: 0, inFlight: 0, startedAt: null }

/**
 * Ghi nhận một lần đo mới.
 *
 * Chỉ nhìn được `inFlight` tại mỗi lần đo, nên số query MỚI khởi phải suy từ mức chênh
 * so với lần đo trước. react-query render lại ở mọi lần đổi nên không có lần đổi nào bị
 * bỏ sót giữa hai lần đo.
 */
export function advanceBurst(prev: BurstState, inFlight: number, nowMs: number): BurstState {
  // Hết việc là đóng đợt và quên sạch. Giữ lại số cũ thì đợt sau mở ra đã lỡ 100%.
  if (inFlight <= 0) return IDLE_BURST

  if (prev.startedAt === null) return { started: inFlight, inFlight, startedAt: nowMs }

  return {
    // Chỉ cộng phần TĂNG: `inFlight` giảm nghĩa là có cái xong, không phải có cái mất đi.
    started: prev.started + Math.max(0, inFlight - prev.inFlight),
    inFlight,
    // Mốc mở đợt giữ nguyên. Dời theo mỗi việc mới thì một đợt dài liên tục sẽ không bao
    // giờ chạm ngưỡng hiện, đúng lúc nó cần hiện nhất.
    startedAt: prev.startedAt,
  }
}

/** Phần trăm việc đã xong trong đợt. Rảnh → 0. */
export function burstPercent(state: BurstState): number {
  if (state.started <= 0) return 0
  const done = state.started - state.inFlight
  return Math.round((done / state.started) * 100)
}

/** Đợt đã đủ dài để đáng hiện chưa. */
export function shouldShowProgress(state: BurstState, nowMs: number): boolean {
  if (state.startedAt === null) return false
  return nowMs - state.startedAt >= PROGRESS_DELAY_MS
}
