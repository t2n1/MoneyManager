// Đã tới giờ đẩy thông báo cho người này chưa — THUẦN. Không đọc đồng hồ hệ thống:
// "bây giờ" truyền vào qua tham số, giống mọi bộ luật khác trong app.
//
// Vì sao không quy giờ gửi về UTC một lần rồi so sánh số: chủ app đang ở Nhật và dự
// định chuyển sang Mỹ. "8 giờ sáng" là ý định theo nơi người ta đang sống, còn UTC là
// một con số sẽ sai ngay khi đổi nước, và sai một tiếng hai lần mỗi năm ở nơi có DST.
// Nên bảng lưu giờ + tên múi giờ, và phép dịch xảy ra ở đây, lúc gửi.

/** Ngày và giờ theo lịch của một múi giờ, đọc từ một mốc UTC. */
export interface LocalParts {
  /** 'YYYY-MM-DD' theo lịch địa phương. */
  date: string
  /** 0..23 theo giờ địa phương. */
  hour: number
}

/**
 * Đổi một mốc ISO (UTC) sang ngày + giờ theo lịch của `tz`.
 *
 * Dùng `Intl.DateTimeFormat` chứ không tự cộng offset: chỉ nó biết luật DST của từng
 * vùng theo từng năm. Tên múi giờ không hợp lệ thì LÙI VỀ UTC thay vì ném lỗi — cron
 * chạy vòng qua mọi user, một dòng dữ liệu hỏng không được làm chết cả lượt gửi. Đổi
 * lại là người đó nhận push lệch giờ, nhưng vẫn đúng một lần mỗi ngày.
 */
export function localPartsIn(nowISO: string, tz: string): LocalParts {
  const at = new Date(nowISO)
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      // h23 là cố ý: mặc định của một số locale trả '24' cho nửa đêm, và '24' thì
      // không so sánh được với push_hour (0..23).
      hourCycle: 'h23',
    }).formatToParts(at)

  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = format(tz)
  } catch {
    parts = format('UTC')
  }

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '0'

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  }
}

/**
 * Đã tới lúc gửi push cho người này chưa.
 *
 * @param nowISO Bây giờ, mốc UTC.
 * @param pushHour Giờ người dùng chọn (0..23), hiểu theo `pushTz`.
 * @param pushTz Tên múi giờ IANA.
 * @param lastSentISO Lần gửi gần nhất, hoặc null nếu chưa gửi lần nào.
 */
export function dueForPush(
  nowISO: string,
  pushHour: number,
  pushTz: string,
  lastSentISO: string | null,
): boolean {
  const now = localPartsIn(nowISO, pushTz)

  // `>=` chứ không `===`: hai lý do, và cả hai đều xảy ra thật.
  //  1. Cron trượt nhịp (function ngủ, deploy đúng lúc đó) — gửi bù muộn trong ngày
  //     vẫn tốt hơn im lặng mất hẳn một ngày.
  //  2. Ngày nhảy giờ tiến, giờ người dùng đặt có thể KHÔNG TỒN TẠI: ở Mỹ 02:00 nhảy
  //     thẳng sang 03:00, nên ai đặt 2 giờ sáng sẽ không bao giờ khớp `===`.
  if (now.hour < pushHour) return false

  if (lastSentISO) {
    const last = localPartsIn(lastSentISO, pushTz)
    // So theo NGÀY địa phương, không theo số giờ đã trôi qua. Nhờ vậy ngày nhảy giờ
    // lùi (1 giờ sáng xảy ra hai lần) vẫn chỉ gửi một lần.
    // `>=` để mốc gửi ở tương lai (đồng hồ máy lệch, dữ liệu sửa tay) cũng chặn được,
    // chứ không mở đường gửi lại mỗi giờ tới khi tương lai đó thành quá khứ.
    if (last.date >= now.date) return false
  }

  return true
}
