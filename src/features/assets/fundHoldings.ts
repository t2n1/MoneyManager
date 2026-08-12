// Danh mục quỹ đầu tư Nhật dựng từ sổ lệnh — thuần, không phụ thuộc React, test được.
//
// File RIÊNG, không nhét vào holdings.ts, vì ba chỗ khác nhau về bản chất:
//
// 1. ĐƠN VỊ. 基準価額 niêm yết trên 10.000 口, không phải trên một đơn vị. Cổ phiếu Việt
//    Nam là đồng/cổ, nhân thẳng. Ở đây phải chia NAV_UNITS, và chia ở đúng một chỗ.
// 2. GIÁ VỐN. Cổ phiếu tính `số cổ × giá + phí`. Quỹ thì lấy thẳng số tiền thật đã trừ,
//    vì `口数 × 基準価額 ÷ 10.000` KHÔNG bằng số tiền Rakuten trừ: đo trên sao kê thật,
//    28.429 × 17.588 ÷ 10.000 = 50.000,93 trong khi số tiền bị trừ là 50.000. Suy giá
//    vốn từ `units × nav` là LẤY ĐẦU RA ĐỂ DỰNG LẠI ĐẦU VÀO — Rakuten tính 口数 TỪ số
//    tiền, không phải ngược lại. Sai số dưới một yên mỗi lệnh, nhưng 136 lệnh thì trôi
//    thấy được, và có phí mua thì lệch hẳn.
// 3. TIỀN MẶT. Không có. Rakuten tự quét sạch tiền dư về 楽天銀行 (自動出金(スイープ)),
//    nên tài khoản không giữ tiền nhàn rỗi — và tiền vào tài khoản qua thẻ tín dụng/điểm
//    chứ không qua một lần chuyển khoản mà sổ app có ghi. Mượn `brokerCash` ở đây sẽ ra
//    số âm, van `tien-chua-dau-tu-am` chặn, và cron chạy mỗi ngày mà KHÔNG BAO GIỜ ghi
//    được gì — thất bại im lặng.
//
// Gộp ba chỗ đó vào một hàm chung với cổ phiếu là mời một lỗi làm tròn không ai tìm ra.
//
// Mọi số tiền ở minor units JPY. JPY decimals = 0 nên minor unit CHÍNH LÀ yên.

/** 基準価額 niêm yết trên 10.000 口. Chia ở đúng một chỗ: fundValue(). */
export const NAV_UNITS = 10_000

export interface FundTrade {
  /** 協会コード, vd '9I31223A' */
  assocFundCd: string
  kind: 'buy' | 'sell' | 'adjust'
  /** 約定日 (ISO date) — ngày mà `nav` thuộc về, KHÔNG phải 受渡日. */
  tradedOn: string
  /** 口数; âm chỉ hợp lệ với kind='adjust' */
  units: number
  /** ¥/10.000口 lúc khớp; 0 với 'adjust' */
  nav: number
  /** yên THẬT đã trừ (mua) / nhận (bán); 0 với 'adjust' */
  amount: number
}

export interface FundHolding {
  assocFundCd: string
  /** 口数 đang giữ (luôn > 0 — quỹ bán sạch không xuất hiện) */
  units: number
  /** yên */
  costBasis: number
  /** ¥/10.000口 — 取得単価 kiểu Rakuten */
  avgNav: number
}

export interface FundHoldingsResult {
  /** chỉ quỹ còn giữ, xếp theo giá vốn giảm dần */
  holdings: FundHolding[]
  /** lãi/lỗ đã hiện thực hoá từ các lệnh bán (yên; có thể âm) */
  realizedPnl: number
  /** quỹ bị bán quá số đang giữ → sổ lệnh có lỗ hổng, hoặc THIẾU MỘT DÒNG BÍ DANH */
  oversold: string[]
}

export interface SessionNavs {
  /** Ngày phiên của các quỹ ĐANG GIỮ; null = bảng giá rỗng. Xem `sessionNavs`. */
  session: string | null
  /** ¥/10.000口, chỉ quỹ có nav > 0 */
  navByFund: Map<string, number>
  /** Quỹ ĐANG GIỮ mà giá còn ở phiên CŨ hơn `session` — lượt hút này chưa lấy được. */
  staleFunds: Set<string>
}

export interface FundValue {
  /** null = không đáng tin; xem `fundValue` */
  marketValue: number | null
  /** quỹ chưa có giá, đang tạm tính theo giá vốn */
  missingNavs: string[]
}

/**
 * Thứ tự xử lý các lệnh CÙNG một 約定日: mua → adjust → bán.
 *
 * Vì sao mua trước bán: tổng cuối KHÔNG đổi (cộng dồn là phép cộng, giao hoán) — chỉ
 * ĐIỂM THẤP NHẤT giữa đường đổi. Xử lý mọi lệnh làm TĂNG 口数 trước mọi lệnh làm GIẢM là
 * thứ tự cho ra số dư cao nhất có thể tại mỗi lệnh bán, nên một lệnh bán vẫn vượt số
 * đang giữ ở thứ tự này thì nó vượt ở MỌI thứ tự trong ngày. Nói cách khác chốt này chỉ
 * XOÁ cờ `oversold` OAN, không làm mất khả năng bắt ca bán quá tay thật.
 *
 * `adjust` nằm giữa: nó không đổi giá vốn, và một lần 分配金再投資 cùng ngày phải được
 * cộng vào trước khi trừ lệnh bán.
 */
function thuTuTrongNgay(t: FundTrade): number {
  return t.kind === 'buy' ? 0 : t.kind === 'adjust' ? 1 : 2
}

/** 取得単価: yên trên 10.000 口, làm tròn về số nguyên như Rakuten hiện. */
function avgNavOf(costBasis: number, units: number): number {
  return units > 0 ? Math.round((costBasis / units) * NAV_UNITS) : 0
}

/**
 * Giá trị một dòng quỹ: 口数 × 基準価額 ÷ 10.000, làm tròn. ĐÚNG MỘT chỗ chia — mọi nơi
 * khác cần số này (FundHoldingsSection hiện từng dòng, FundTradeFormSheet gợi ý Số tiền,
 * `fundValue` dưới đây tính tổng) đều gọi lại hàm này, không viết lại công thức. Viết
 * lại ở nơi khác là mời một lần sửa NAV_UNITS hay cách làm tròn chỉ trúng một chỗ.
 */
export function fundLineValue(units: number, nav: number): number {
  return Math.round((units * nav) / NAV_UNITS)
}

/**
 * Cộng dồn sổ lệnh ra 口数 và giá vốn từng quỹ.
 *
 * Bán trừ theo **giá vốn bình quân trên 口**, giống 取得単価 mà Rakuten báo — nên số
 * trong app khớp sao kê.
 *
 * `oversold` không chỉ nghĩa là "quên ghi một lệnh mua". Với quỹ Nhật nó còn là chữ ký
 * của việc THIẾU MỘT DÒNG trong `fund_aliases`: quỹ đổi tên (Rakuten đổi loạt
 * 「楽天・プラス」 ngày 2024-10-17), nửa lịch sử ghép vào mã này còn nửa kia rơi ra
 * ngoài, nên phía có lệnh bán bị âm. Đã đo: S&P500 −19.848 口, VTI −10.232 口.
 */
export function fundHoldingsFromTrades(trades: FundTrade[]): FundHoldingsResult {
  const acc = new Map<string, { units: number; costBasis: number }>()
  const oversold = new Set<string>()
  let realizedPnl = 0

  // Sao kê Rakuten xếp MỚI NHẤT TRƯỚC. Không sắp lại theo 約定日 thì lệnh bán được xử lý
  // trước lệnh mua và mọi quỹ đều `oversold`.
  //
  // CHỐT PHỤ `thuTuTrongNgay`: 約定日 chỉ tới NGÀY, không tới giờ, nên một cặp mua+bán
  // cùng ngày cùng quỹ KHÔNG có thứ tự thật để dựa vào. Sort ổn định của JS giữ thứ tự
  // đầu vào — mà đầu vào ở hai nơi gọi là hai thứ tự KHÁC nhau: script nhập sao kê đưa
  // vào theo thứ tự trong file CSV (mới nhất trước), còn fund-refresh đưa vào theo
  // `readAll(sb, 'fund_trades', 'id')` tức theo uuid NGẪU NHIÊN. Thiếu chốt này thì cùng
  // một sổ lệnh có thể cho ra hai kết luận `oversold` khác nhau ở hai bên, và ca "bán
  // sạch rồi mua lại" đã xảy ra thật (2026-04-13/14 — trên file thật hai lệnh lệch một
  // ngày, nhưng không gì bảo đảm lần sau cũng lệch).
  const inOrder = trades
    .slice()
    .sort((a, b) => a.tradedOn.localeCompare(b.tradedOn) || thuTuTrongNgay(a) - thuTuTrongNgay(b))

  for (const t of inOrder) {
    const h = acc.get(t.assocFundCd) ?? { units: 0, costBasis: 0 }

    if (t.kind === 'buy') {
      h.units += t.units
      // Số tiền THẬT, không suy từ units × nav — xem đầu file.
      h.costBasis += t.amount
    } else if (t.kind === 'sell') {
      if (t.units > h.units) oversold.add(t.assocFundCd)
      // Kẹp về số thực đang giữ: bán quá tay thì `oversold` đã báo, không cần thêm một
      // con số lãi khổng lồ vô nghĩa. Tiền thu về cũng phải kẹp theo TỶ LỆ, kẻo lãi tính
      // từ toàn bộ số tiền của một lệnh chỉ khớp được một phần.
      const sold = Math.min(t.units, h.units)
      const thuVe = t.units > 0 ? (t.amount * sold) / t.units : 0
      const von = h.units > 0 ? (h.costBasis * sold) / h.units : 0
      realizedPnl += thuVe - von
      h.units -= sold
      h.costBasis -= von
      // Bán sạch thì xoá phần dư do chia lẻ. Thiếu dòng này, quỹ đã bán hết vẫn còn vài
      // yên giá vốn lơ lửng và lần mua sau tính bình quân sai — ca "bán sạch rồi mua lại
      // hôm sau" đã xảy ra thật ngày 2026-04-13/14.
      if (h.units === 0) h.costBasis = 0
    } else {
      // 分配金再投資 / điều chỉnh 口数: số 口 đổi, giá vốn KHÔNG đổi → 取得単価 tự giảm.
      // Đó đúng là bản chất của việc được chia thêm mà không tốn tiền.
      h.units += t.units
      if (h.units < 0) {
        oversold.add(t.assocFundCd)
        h.units = 0
        h.costBasis = 0
      }
    }

    acc.set(t.assocFundCd, h)
  }

  const holdings: FundHolding[] = [...acc.entries()]
    .filter(([, h]) => h.units > 0)
    .map(([assocFundCd, h]) => ({
      assocFundCd,
      units: h.units,
      costBasis: Math.round(h.costBasis),
      avgNav: avgNavOf(h.costBasis, h.units),
    }))
    .sort((a, b) => b.costBasis - a.costBasis || a.assocFundCd.localeCompare(b.assocFundCd))

  return {
    holdings,
    realizedPnl: Math.round(realizedPnl),
    oversold: [...oversold].sort(),
  }
}

/**
 * Gom bảng giá thô thành MỘT phiên duy nhất cho cả snapshot.
 *
 * `fund_prices` được hút từng quỹ một, và một quỹ lỗi thì các quỹ khác vẫn ghi — nên sau
 * một lượt chạy, không phải mọi hàng chắc chắn cùng `nav_date`. Quỹ nào còn kẹt ở ngày cũ
 * hơn `session` thì được nêu tên trong `staleFunds` để nơi gọi tự quyết bỏ qua — im lặng
 * dùng giá hôm kia rồi đóng dấu "hôm nay" là nói dối.
 *
 * VÌ SAO PHẢI TRUYỀN `heldFundCds`: `fund_prices` chứa CẢ danh bạ (8 quỹ), không chỉ quỹ
 * đang giữ (2 quỹ) — `loadFundRegistry` cố ý hút cả danh bạ. Lấy ngày lớn nhất của cả
 * bảng thì một quỹ KHÔNG AI GIỮ đi trước một phiên (quỹ tài sản trong nước công bố
 * 基準価額 sớm hơn quỹ tài sản nước ngoài đúng một ngày) sẽ đánh `staleFunds` cho CẢ hai
 * quỹ đang giữ ⇒ cron bỏ qua tài khoản mỗi ngày, HTTP 200, `daGhi = 0`, không bao giờ tự
 * khỏi. Nên `session` và `staleFunds` chỉ tính trên tập quỹ đang giữ; tham số là BẮT BUỘC
 * để không nơi gọi nào lỡ quên trả lời câu "quỹ nào mới đáng tính".
 *
 * `navByFund` thì vẫn là cả bảng: nơi gọi chỉ tra theo quỹ nó đang giữ, và lọc thêm ở đây
 * không mua được gì.
 *
 * KHÔNG giữ quỹ nào (đã bán sạch) thì không có quỹ nào để lấy ngày: `session` rơi về ngày
 * lớn nhất của cả bảng giá — chỉ để ĐÓNG DẤU ảnh chụp giá trị 0, và lúc đó `staleFunds`
 * cũng không còn ai để nêu.
 *
 * Cùng vai trò với `sessionPrices` của cổ phiếu, nhưng KHÁC ở đúng chỗ này: `stock_prices`
 * chỉ chứa mã đã từng giao dịch nên bên đó `session` tự nhiên đã tính trên tập đang giữ.
 */
export function sessionNavs(
  rows: { assoc_fund_cd: string; nav: number; nav_date: string }[],
  heldFundCds: Iterable<string>,
): SessionNavs {
  const dangGiu = new Set(heldFundCds)
  const cuaQuyDangGiu = rows.filter((r) => dangGiu.has(r.assoc_fund_cd))
  const nguonNgay = cuaQuyDangGiu.length > 0 ? cuaQuyDangGiu : rows
  const session = nguonNgay.map((r) => r.nav_date).sort().at(-1) ?? null

  const navByFund = new Map<string, number>()
  for (const r of rows) if (r.nav > 0) navByFund.set(r.assoc_fund_cd, r.nav)

  const staleFunds = new Set<string>()
  for (const r of cuaQuyDangGiu) {
    if (session !== null && r.nav_date < session) staleFunds.add(r.assoc_fund_cd)
  }

  return { session, navByFund, staleFunds }
}

/**
 * Giá trị thị trường của cả tài khoản = tổng giá trị các quỹ. **Không cộng tiền mặt** —
 * xem lý do 3 ở đầu file.
 *
 * Làm tròn TỪNG quỹ rồi mới cộng, đúng cách Rakuten hiện từng dòng rồi cộng ra tổng. Làm
 * tròn ở cuối sẽ lệch với app Rakuten một vài yên và người dùng sẽ đi tìm một nguyên nhân
 * không có thật. Đã đối chiếu: 28.429 × 20.053 ÷ 10.000 → 57.009 và
 * 12.595 × 18.855 ÷ 10.000 → 23.748, tổng 80.757 — khớp từng yên với ảnh chụp app Rakuten
 * ngày 2026-08-12.
 *
 * `marketValue` trả `null` khi thiếu giá **mọi** quỹ đang giữ: lúc đó tất cả rơi về giá
 * vốn nên kết quả chỉ bằng đúng giá vốn, không nói thêm được gì so với việc chưa có
 * snapshot nào. Thiếu giá **một phần** thì vẫn trả số, quỹ thiếu tạm tính theo giá vốn và
 * có tên trong `missingNavs` — cùng cách app xử lý thiếu tỷ giá.
 *
 * KHÔNG giữ quỹ nào thì trả **0**, không phải null: đó là con số đúng và ghi được (tài
 * khoản đã bán sạch thì giá trị bằng 0), khác hẳn "có giữ mà không biết giá".
 */
export function fundValue(
  holdings: FundHolding[],
  navByFund: Map<string, number>,
): FundValue {
  let marketValue = 0
  const missingNavs: string[] = []

  for (const h of holdings) {
    const nav = navByFund.get(h.assocFundCd)
    if (nav == null || nav <= 0) {
      missingNavs.push(h.assocFundCd)
      marketValue += h.costBasis
    } else {
      marketValue += fundLineValue(h.units, nav)
    }
  }

  const allMissing = holdings.length > 0 && missingNavs.length === holdings.length
  return { marketValue: allMissing ? null : marketValue, missingNavs }
}

/** Một ngày chụp được trong chế độ lấp lịch sử. */
export interface FundBackfillDay {
  /** ISO date — phiên mà con số này thuộc về (KHÔNG phải ngày chạy) */
  valuedOn: string
  /** yên */
  marketValue: number
}

/** Tài khoản cần lấp — đúng những gì phép tính cần, không hơn. */
export interface FundBackfillAccount {
  trades: FundTrade[]
  /** true nếu tài khoản CŨNG có dòng trong `stock_trades` */
  coCaSoLenhCoPhieu: boolean
}

export type FundBackfillPlan =
  | {
      ok: false
      /** Vì sao KHÔNG được ghi hàng nào — nơi gọi in ra nguyên văn cho người chạy tay. */
      reason: 'tron-hai-loai-so-lenh' | 'so-lenh-co-lo-hong' | 'thieu-lich-su-gia'
      /** Mã quỹ liên quan tới `reason`; rỗng với 'tron-hai-loai-so-lenh'. */
      funds: string[]
    }
  | {
      ok: true
      days: FundBackfillDay[]
      /** Ngày bị BỎ vì nguồn thiếu 基準価額 của một quỹ đang giữ đúng ngày đó. */
      skipped: string[]
    }

/**
 * Chế độ lấp lịch sử: dựng lại giá trị thị trường cho các phiên ĐÃ QUA từ lịch sử
 * 基準価額 tải về.
 *
 * Vì sao phép tính này nằm ở đây chứ không trong edge function: nó ghi tới 1.500 hàng
 * `account_valuations` mang `source: 'auto'` trong MỘT lượt gọi tay, và không lượt nào sau
 * đó chạm lại (bước ghi bỏ mọi ngày đã có hàng, cron thì chỉ ghi ngày hôm nay). Một con số
 * sai ở đây là sai VĨNH VIỄN cho tới khi có người xoá tay bằng SQL — nên nó phải test được
 * bằng số, không phải đọc bằng mắt.
 *
 * BA CHỐT, cả ba đều là "thà không ghi gì còn hơn ghi số trông như đúng":
 *
 * ① Trộn hai hệ đơn vị (口数 của quỹ và số cổ của cổ phiếu) là cộng sai. Cron đã chặn ca
 *    này từ đầu; lấp lịch sử phải chặn CÙNG bất biến, kẻo nó ghi giá trị CHỈ CÓ PHẦN QUỸ
 *    cho hàng trăm ngày rồi cron từ đó về sau từ chối chạm vào — để lại số thiếu vĩnh viễn.
 *
 * ② Sổ lệnh có lỗ hổng (`oversold`) thì mọi ngày đều sai. Xét trên TOÀN BỘ sổ lệnh, không
 *    theo từng ngày: cờ `oversold` của một tiền tố chỉ phụ thuộc các lệnh trước nó, nên nó
 *    đã bật thì không tắt lại được — xét cả sổ chỉ phát hiện SỚM hơn, và nêu đủ tên quỹ.
 *
 * ③ Quỹ đang giữ mà KHÔNG có lịch sử giá (hút hỏng, hoặc file không có dòng nào hợp lệ) →
 *    dừng cả lượt. Vì sao đây là chốt riêng, không để `fundValue` lo: `marketValue` chỉ
 *    trả `null` khi thiếu giá MỌI quỹ đang giữ; thiếu MỘT PHẦN thì nó vẫn trả số và quỹ
 *    thiếu được tạm tính theo GIÁ VỐN. Chủ app giữ đúng hai quỹ ⇒ một quỹ hút hỏng là
 *    khoảng 40% giá trị sai, đóng dấu 'auto', trông y như số đúng. `missingNavs` (chốt ③b
 *    dưới, cho từng ngày lẻ mà nguồn thiếu phiên) một mình cũng chặn được, nhưng nó chặn
 *    bằng cách bỏ SẠCH mọi ngày — người chạy chỉ thấy `daGhi = 0` mà không biết vì sao.
 *
 * `alreadyValued` bị trừ ra TRƯỚC khi cắt trần `maxDays`, không phải sau: cắt trước rồi
 * trừ thì lượt chạy lại luôn nhận đúng 1.500 ngày đầu, thấy đã có hàng cả, và những ngày
 * sau ngày thứ 1.500 KHÔNG BAO GIỜ được lấp — trái hẳn ý "chạy lại lấp tiếp phần còn trống".
 *
 * Ngày lấy từ CHÍNH các khoá của `navHistory` (chuỗi ISO đã parse từ `2026年08月10日`),
 * không từ `new Date()` — mốc lịch của dữ liệu phải đến từ nguồn.
 */
export function planFundBackfill(
  account: FundBackfillAccount,
  navHistory: Map<string, Map<string, number>>,
  alreadyValued: Set<string>,
  maxDays: number,
): FundBackfillPlan {
  if (account.coCaSoLenhCoPhieu) return { ok: false, reason: 'tron-hai-loai-so-lenh', funds: [] }

  const { oversold } = fundHoldingsFromTrades(account.trades)
  if (oversold.length > 0) return { ok: false, reason: 'so-lenh-co-lo-hong', funds: oversold }

  const lenhDauTien = account.trades.map((t) => t.tradedOn).sort()[0]
  if (lenhDauTien == null) return { ok: true, days: [], skipped: [] }

  // Mọi ngày phiên xuất hiện ở BẤT KỲ quỹ nào, từ lệnh đầu tiên trở đi.
  const moiNgay = new Set<string>()
  for (const theoNgay of navHistory.values())
    for (const ngay of theoNgay.keys()) if (ngay >= lenhDauTien) moiNgay.add(ngay)

  const cacNgay = [...moiNgay]
    .sort()
    .filter((ngay) => !alreadyValued.has(ngay))
    .slice(0, maxDays)

  // Lượt một: 口数 đang giữ tại từng ngày. Ngày không giữ gì (chưa mua, hoặc đã bán sạch —
  // ca CÓ THẬT: tài khoản trống từ 2025-04-14 tới 2025-08-28) thì không có gì để chụp.
  const theoNgay: { valuedOn: string; holdings: FundHolding[] }[] = []
  for (const ngay of cacNgay) {
    const { holdings } = fundHoldingsFromTrades(
      account.trades.filter((t) => t.tradedOn <= ngay),
    )
    if (holdings.length > 0) theoNgay.push({ valuedOn: ngay, holdings })
  }

  // Chốt ③: quỹ nào có ngày cần chụp mà lịch sử giá của nó RỖNG thì biết trước là sai.
  const thieuLichSu = [
    ...new Set(theoNgay.flatMap((x) => x.holdings.map((h) => h.assocFundCd))),
  ]
    .filter((ma) => (navHistory.get(ma)?.size ?? 0) === 0)
    .sort()
  if (thieuLichSu.length > 0)
    return { ok: false, reason: 'thieu-lich-su-gia', funds: thieuLichSu }

  // Lượt hai: giá trị từng ngày.
  const days: FundBackfillDay[] = []
  const skipped: string[] = []
  for (const { valuedOn, holdings } of theoNgay) {
    const navNgayDo = new Map<string, number>()
    for (const h of holdings) {
      const nav = navHistory.get(h.assocFundCd)?.get(valuedOn)
      if (nav != null) navNgayDo.set(h.assocFundCd, nav)
    }
    const { marketValue, missingNavs } = fundValue(holdings, navNgayDo)
    // Chốt ③b: nguồn có lịch sử quỹ này nhưng thiếu ĐÚNG phiên đó (ngày nghỉ lệch nhau
    // giữa hai quỹ, một dòng hỏng). Bỏ ngày — chứ không ghi một con số mà một quỹ đang
    // tạm tính theo giá vốn.
    if (missingNavs.length > 0 || marketValue === null) {
      skipped.push(valuedOn)
      continue
    }
    days.push({ valuedOn, marketValue })
  }

  return { ok: true, days, skipped }
}
