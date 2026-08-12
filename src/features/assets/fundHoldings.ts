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
  /** Ngày phiên mới nhất trong bảng giá; null = bảng giá rỗng. */
  session: string | null
  /** ¥/10.000口, chỉ quỹ có nav > 0 */
  navByFund: Map<string, number>
  /** Quỹ mà giá còn ở phiên CŨ hơn `session` — lượt hút này chưa lấy được. */
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
 * một lượt chạy, không phải mọi hàng chắc chắn cùng `nav_date`. `session` lấy ngày lớn
 * nhất coi như ngày của snapshot; quỹ nào còn kẹt ở ngày cũ hơn thì được nêu tên trong
 * `staleFunds` để nơi gọi tự quyết bỏ qua — im lặng dùng giá hôm kia rồi đóng dấu "hôm
 * nay" là nói dối.
 *
 * Cùng vai trò với `sessionPrices` của cổ phiếu; tách riêng vì tên cột khác.
 */
export function sessionNavs(
  rows: { assoc_fund_cd: string; nav: number; nav_date: string }[],
): SessionNavs {
  const session = rows.map((r) => r.nav_date).sort().at(-1) ?? null

  const navByFund = new Map<string, number>()
  const staleFunds = new Set<string>()

  for (const r of rows) {
    if (r.nav > 0) navByFund.set(r.assoc_fund_cd, r.nav)
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
