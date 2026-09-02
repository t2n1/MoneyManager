// Mẫu sinh chùm chặng/sự kiện. Mẫu chỉ là TIỆN TAY LÚC NHẬP: sinh ra rồi là bản ghi
// thường, sửa xoá như mọi dòng khác, và engine không biết dòng nào từ mẫu mà ra.
// Nên không có đường nào để mẫu làm sai kết quả một cách âm thầm.
//
// MỌI SỐ MẶC ĐỊNH DƯỚI ĐÂY LÀ PHỎNG ĐOÁN, có ghi nguồn + ngày tra. UI phải dán nhãn
// "số mặc định, kiểm tra lại". 児童手当 và học phí đổi theo luật hằng năm — app chỉ
// giúp khỏi gõ từ số không, không hứa biết số đúng.
//
// QUY ƯỚC ĐƠN VỊ (bắt buộc, đọc trước khi thêm mẫu mới): mỗi số mặc định phải ĐI KÈM
// đơn vị tiền mà ĐỘ LỚN của nó được viết cho — tên hằng số mang hậu tố `_JPY`/`_VND`, và
// sự kiện phải ép cứng đúng `currency` đó.
//
// Bản trước để `ev()` rơi về `ctx.currency` (tiền của chặng đang hiệu lực) cho phần lớn
// các số, dù mọi độ lớn đều được viết theo JPY. Đúng khi chặng là JPY; với một chặng VND
// — hoàn toàn có thật với người dùng này (gửi tiền về VN, có thể về VN nghỉ hưu) — "Nuôi
// con 0–6 tuổi" thành ₫600.000/năm, tức khoảng 24 đô một năm: sai 150 lần và KHÔNG có
// guard nào bắt được, vì `fx_to_display` lúc đó hoàn toàn hợp lệ. Câu `note` "Số mặc
// định, kiểm tra lại" không cứu được: nó nói về độ chính xác, không nói về đơn vị.
//
// Ép cứng JPY thì độ lớn luôn đúng NGHĨA, và việc quy về đơn vị hiển thị đi qua đúng cơ
// chế đã có cho việc đó (`fx_to_display` của từng dòng, xem `fxForEvent`) — tra được thì
// đúng, không tra được thì bằng 1 và banner cảnh báo bắt ngay. Sai một cách nhìn thấy
// được, không sai âm thầm.
import type { NewLifeEvent, NewLifePhase } from '../../data/repo'
import type { CurrencyCode } from '../../lib/currencies'

export interface PresetContext {
  scenarioId: string
  /** Năm sự kiện xảy ra (với sinh con: năm sinh của con). */
  year: number
  /**
   * Năm sinh của người dùng. Mẫu Nghỉ hưu cần nó: 年金 trả từ 65 tuổi, không phải từ năm
   * nghỉ việc — bản cũ cho lương hưu chạy từ năm nghỉ, nên "thử nghỉ việc từ 2045" (51
   * tuổi) cộng dư 14 năm lương hưu (bắt được trên app 2026-09-02).
   */
  birthYear: number
  /** Tiền của chặng đang hiệu lực — mẫu dùng làm mặc định cho sự kiện không ép cứng tiền. */
  currency: string
  country: string | null
  currentIncomeMinor: number
  currentExpenseMinor: number
  /**
   * Tỷ giá của `currency` (chặng đang hiệu lực) sang tiền hiển thị của kịch bản,
   * theo MAJOR units — dùng cho CHẶNG (NewLifePhase luôn cùng tiền với `currency`).
   */
  fxToDisplay: number
  /** Tiền hiển thị của kịch bản — dùng để tính đúng fx_to_display cho SỰ KIỆN mang
   * tiền khác `currency` (vài mẫu ép cứng JPY/VND bất kể chặng đang dùng tiền gì). */
  displayCurrency: CurrencyCode
  /**
   * Tra tỷ giá MAJOR-sang-MAJOR từ `currency` bất kỳ sang `displayCurrency`. Trả
   * `null` khi không tra được (vd thiếu cache tỷ giá cho đồng tiền đó).
   *
   * Nguồn số: việc của caller (dựng ctx), không phải của presets.ts. Điểm khởi đầu
   * hợp lý là tỷ giá "hôm nay" từ `src/lib/rates.ts` (đã có sẵn fetch + cache) — đó
   * vẫn chỉ là một giả định, nên `note` của sự kiện luôn nhắc "kiểm tra lại".
   */
  fxOf: (currency: CurrencyCode) => number | null
}

export interface PresetResult {
  phases: NewLifePhase[]
  events: NewLifeEvent[]
}

export interface LifePreset {
  id: string
  label: string
  hint: string
  /** UI hỏi năm nào cho mẫu này. */
  yearLabel: string
  build(ctx: PresetContext): PresetResult
}

/**
 * fx_to_display ĐÚNG cho một sự kiện, tính theo tiền của CHÍNH sự kiện đó — không
 * phải theo `ctx.currency` của chặng (vài mẫu ép cứng currency sang JPY/VND khác
 * hẳn tiền chặng đang dùng, xem các chỗ gọi `ev()` bên dưới).
 *
 * - Tiền sự kiện trùng `displayCurrency`: convertLifetimeMinor (project.ts) short-
 *   circuit ở `from === to` nên tỷ giá bị bỏ qua hoàn toàn — 1 ở đây đúng và vô hại.
 * - Tiền sự kiện khác `displayCurrency`: tra qua `ctx.fxOf`. Nếu tra được thì dùng
 *   luôn. Nếu KHÔNG tra được (trả `null`), CỐ Ý gán 1 thay vì bỏ cuộc: tổ hợp
 *   "currency !== display_currency && fx_to_display === 1" là điều kiện banner cảnh
 *   báo (Task 7) phát hiện được, còn một tỷ giá đoán bừa (khác 1) thì banner không
 *   thấy và người dùng không bao giờ biết mẫu đã đoán sai. Thà sai một cách nhìn
 *   thấy được còn hơn sai một cách im lặng — đây là bài học từ lỗi ở Task 3.
 */
function fxForEvent(ctx: PresetContext, currency: string): number {
  if (currency === ctx.displayCurrency) return 1
  return ctx.fxOf(currency as CurrencyCode) ?? 1
}

function ev(ctx: PresetContext, over: Partial<NewLifeEvent> & Pick<NewLifeEvent, 'label'>): NewLifeEvent {
  const currency = over.currency ?? ctx.currency
  return {
    scenario_id: ctx.scenarioId,
    start_year: ctx.year,
    end_year: ctx.year,
    kind: 'expense',
    amount_minor: 0,
    currency,
    note: 'Số mặc định, kiểm tra lại',
    // Mẫu chỉ điền giá trị khởi đầu — sự kiện vẫn giữ tỷ giá RIÊNG của nó (migration
    // 0032). Tính theo tiền của CHÍNH sự kiện (biến `currency` ở trên), không phải
    // ctx.currency, nên đúng cả khi mẫu ép cứng currency sang JPY/VND — xem fxForEvent().
    fx_to_display: fxForEvent(ctx, currency),
    inflate: true,
    ...over,
  }
}

// 児童手当 SAU CẢI CÁCH 10/2024 (tra 2026-07-29, nguồn: cổng thông tin こども家庭庁):
// cải cách bỏ ngưỡng thu nhập và kéo dài trợ cấp tới hết cấp ba (18 tuổi) — trước đó
// chỉ tới hết cấp hai (15 tuổi). Mức: 0–2 tuổi ¥15.000/tháng, 3 tuổi trở lên (tiểu
// học/cấp hai/cấp ba) ¥10.000/tháng (con thứ 3+ cao hơn, mẫu này không phân biệt thứ
// tự con). Lấy ¥12.000/tháng ≈ ¥144.000/năm làm số gộp trung bình cả giai đoạn.
const JIDO_TEATE_ANNUAL_JPY = 144_000
// Trợ cấp chạy tới hết cấp ba — khớp comment trên, KHÔNG phải mốc 15 tuổi kiểu cũ.
const JIDO_TEATE_END_AGE = 18
// Chi phí nuôi con theo bậc (tra 2026-07-29, ước lượng từ khảo sát AIU 教育費):
const CHILD_COST_0_6_JPY = 600_000
const CHILD_COST_7_15_JPY = 900_000
// Đổi từ "16–18" thành "16–17": tuổi 18 đã tính vào chi phí đại học ngay dưới, tránh
// tính tiền hai lần cho cùng một năm. Ranh giới 6/7, 15/16, 17/18 giữa các bậc là CHỦ
// Ý khớp khít — bậc sau bắt đầu đúng năm liền sau khi bậc trước kết thúc, không chồng
// lấn cũng không hở năm nào. Đừng "sửa lại cho tròn" mà vô tình lệch các mốc này.
const CHILD_COST_16_17_JPY = 1_200_000
const CHILD_COST_UNIVERSITY_JPY = 1_800_000

// Bốn số dưới đây trước là literal viết thẳng trong `build()`. Đặt tên có hậu tố `_JPY`
// vì độ lớn của chúng được viết theo yên — xem QUY ƯỚC ĐƠN VỊ ở đầu file.
/** Chi phí tổ chức đám cưới. Ước lượng, chưa tra nguồn (2026-07-29). */
const WEDDING_COST_JPY = 3_000_000
/** Khoản trả trước khi mua nhà. Ước lượng, chưa tra nguồn (2026-07-29). */
const HOUSE_DOWN_PAYMENT_JPY = 5_000_000
/** Khoản trả vay mỗi năm. Ước lượng, chưa tra nguồn (2026-07-29). */
const HOUSE_LOAN_ANNUAL_JPY = 1_200_000
/** Mức lương hưu (年金) bình quân giả định. Ước lượng, chưa tra nguồn (2026-07-29). */
const PENSION_ANNUAL_JPY = 1_100_000
/** Tuổi bắt đầu nhận 老齢年金 theo luật hiện hành (nhận sớm/muộn là lựa chọn, mẫu không đoán). */
export const PENSION_START_AGE = 65
/** Chi phí chuyển nhà + thủ tục giấy tờ khi đổi nước sinh sống. Ước lượng, chưa tra
 *  nguồn (2026-07-29). */
const MOVING_COST_JPY = 2_500_000
/** Tiền gửi về cho bố mẹ mỗi năm. Ước lượng, chưa tra nguồn (2026-07-29). */
const PARENT_SUPPORT_ANNUAL_VND = 60_000_000

export const LIFE_PRESETS: LifePreset[] = [
  {
    id: 'cuoi',
    label: 'Cưới',
    hint: 'Tạo một chặng đời mới (thu chi nền đổi) và một khoản chi cho đám cưới.',
    yearLabel: 'Năm cưới',
    build: (ctx) => ({
      phases: [
        {
          scenario_id: ctx.scenarioId,
          start_year: ctx.year,
          label: 'Cưới',
          country: ctx.country,
          currency: ctx.currency,
          // Hộ hai người: thu tăng vì có thu nhập thứ hai, chi tăng nhưng không gấp đôi.
          annual_income_minor: Math.round(ctx.currentIncomeMinor * 1.7),
          annual_expense_minor: Math.round(ctx.currentExpenseMinor * 1.5),
          fx_to_display: ctx.fxToDisplay,
        },
      ],
      events: [
        ev(ctx, {
          label: 'Chi phí cưới',
          amount_minor: WEDDING_COST_JPY,
          // Ép cứng JPY vì độ lớn của WEDDING_COST_JPY viết theo yên (QUY ƯỚC ĐƠN VỊ ở
          // đầu file). Không rơi về ctx.currency: một chặng VND sẽ biến ¥3.000.000 thành
          // ₫3.000.000, tức ~120 đô cho một đám cưới.
          currency: 'JPY',
          // Số tiền là giá HÔM NAY cho một việc xảy ra ở năm tương lai — ở chế độ giá
          // danh nghĩa nó phải phồng theo lạm phát như mọi giá cả khác (không phải số
          // luật định như trợ cấp/lương hưu, cũng không phải nợ vay lãi cố định).
          inflate: true,
        }),
      ],
    }),
  },
  {
    id: 'sinh-con',
    label: 'Sinh con',
    hint: 'Tạo chùm sự kiện theo mốc tuổi con: trợ cấp, chi phí nuôi từng bậc, đại học.',
    yearLabel: 'Năm sinh của con',
    build: (ctx) => ({
      phases: [],
      events: [
        ev(ctx, {
          label: 'Trợ cấp trẻ em (児童手当)',
          kind: 'income',
          end_year: ctx.year + JIDO_TEATE_END_AGE,
          amount_minor: JIDO_TEATE_ANNUAL_JPY,
          // Trợ cấp của Nhật luôn trả bằng JPY, ép cứng bất kể ctx.currency. fx_to_display
          // được ev()/fxForEvent() tính theo tiền JPY của CHÍNH sự kiện này (qua ctx.fxOf),
          // không mượn tỷ giá của ctx.currency — đúng cả khi kịch bản dùng tiền khác.
          currency: 'JPY',
          // Trợ cấp cố định theo luật, không theo lạm phát.
          inflate: false,
        }),
        // Bốn bậc chi phí nuôi con: ép cứng JPY vì cả bốn độ lớn tra từ khảo sát 教育費
        // của Nhật (xem CHILD_COST_* ở trên và QUY ƯỚC ĐƠN VỊ ở đầu file). Rơi về
        // ctx.currency thì một chặng VND biến ¥600.000/năm thành ₫600.000/năm (~24 đô).
        ev(ctx, {
          label: 'Nuôi con 0–6 tuổi',
          end_year: ctx.year + 6,
          amount_minor: CHILD_COST_0_6_JPY,
          currency: 'JPY',
        }),
        ev(ctx, {
          label: 'Nuôi con 7–15 tuổi',
          start_year: ctx.year + 7,
          end_year: ctx.year + 15,
          amount_minor: CHILD_COST_7_15_JPY,
          currency: 'JPY',
        }),
        ev(ctx, {
          label: 'Nuôi con 16–17 tuổi',
          start_year: ctx.year + 16,
          // Kết thúc ở +17 (KHÔNG phải +18) — năm con 18 tuổi đã tính vào "Con vào đại
          // học" ngay dưới. Xem ghi chú tại CHILD_COST_16_17_JPY: chủ ý khớp khít.
          end_year: ctx.year + 17,
          amount_minor: CHILD_COST_16_17_JPY,
          currency: 'JPY',
        }),
        ev(ctx, {
          label: 'Con vào đại học',
          start_year: ctx.year + 18,
          end_year: ctx.year + 21,
          amount_minor: CHILD_COST_UNIVERSITY_JPY,
          currency: 'JPY',
        }),
      ],
    }),
  },
  {
    id: 'mua-nha',
    label: 'Mua nhà',
    hint: 'Một khoản trả trước và một khoản trả vay hằng năm tới năm trả hết.',
    yearLabel: 'Năm mua',
    build: (ctx) => ({
      phases: [],
      events: [
        // Cả hai ép cứng JPY — độ lớn viết theo yên, xem QUY ƯỚC ĐƠN VỊ ở đầu file.
        ev(ctx, {
          label: 'Trả trước mua nhà',
          amount_minor: HOUSE_DOWN_PAYMENT_JPY,
          currency: 'JPY',
          // Giá HÔM NAY cho việc xảy ra ở năm tương lai — phồng theo lạm phát ở chế độ
          // danh nghĩa, giống "Chi phí cưới" (không phải số luật định, không phải nợ vay).
          inflate: true,
        }),
        ev(ctx, {
          label: 'Trả vay mua nhà',
          // Thời hạn vay: ước lượng, chưa tra nguồn (2026-07-29) — giả định vay 35 năm,
          // năm mua tính là năm trả đầu tiên nên còn 34 năm sau đó.
          end_year: ctx.year + 34,
          amount_minor: HOUSE_LOAN_ANNUAL_JPY,
          currency: 'JPY',
          // Khoản trả vay lãi cố định là số danh nghĩa — không tăng theo lạm phát, khác
          // với "Chi phí cưới"/"Trả trước mua nhà" ở trên vốn là giá hôm nay phải phồng.
          inflate: false,
        }),
      ],
    }),
  },
  {
    id: 'nghi-huu',
    label: 'Nghỉ hưu',
    hint: 'Chặng mới với thu nền 0, kèm lương hưu chạy tới hết đời.',
    yearLabel: 'Năm nghỉ hưu',
    build: (ctx) => ({
      phases: [
        {
          scenario_id: ctx.scenarioId,
          start_year: ctx.year,
          label: 'Nghỉ hưu',
          country: ctx.country,
          currency: ctx.currency,
          annual_income_minor: 0,
          // Chi giảm còn khoảng 80%: hết chi phí đi làm, nhưng thêm chi phí sức khỏe.
          annual_expense_minor: Math.round(ctx.currentExpenseMinor * 0.8),
          fx_to_display: ctx.fxToDisplay,
        },
      ],
      events: [
        ev(ctx, {
          label: 'Lương hưu',
          kind: 'income',
          // Từ 65 tuổi, hoặc từ năm nghỉ nếu nghỉ SAU 65. Nghỉ sớm thì khoảng giữa hai
          // mốc là những năm thu 0, sống bằng tài sản — đúng câu hỏi mà mẫu này phải
          // trả lời được.
          start_year: Math.max(ctx.year, ctx.birthYear + PENSION_START_AGE),
          end_year: null,
          amount_minor: PENSION_ANNUAL_JPY,
          // 年金 luôn trả bằng JPY, ép cứng bất kể ctx.currency — cùng cách tính với
          // 児童手当 ở trên: fx_to_display theo tiền JPY của sự kiện qua ctx.fxOf.
          currency: 'JPY',
          // Mức do luật/chế độ lương hưu ấn định, không theo lạm phát thị trường —
          // giống trợ cấp trẻ em, khác với các khoản "giá hôm nay" ở trên.
          inflate: false,
        }),
      ],
    }),
  },
  {
    id: 'chuyen-nuoc',
    label: 'Chuyển nước',
    // Câu hint cũ hứa "Chặng mới với tiền và tỷ giá giả định khác" — mẫu KHÔNG làm thế:
    // `build()` dưới đây dựng chặng với đúng `ctx.currency`/`ctx.fxToDisplay` của chặng
    // hiện tại và `country: null`. Nó không biết bạn chuyển sang nước nào nên không đoán
    // được đơn vị tiền, và đoán một tỷ giá giả định cho một nước chưa rõ thì tệ hơn là
    // không đoán. Nói ra đúng việc nó làm, kèm việc người dùng phải tự làm tiếp.
    hint: 'Chặng mới giữ nguyên thu chi nền và tiền hiện tại — tự sửa quốc gia, tiền và tỷ giá của chặng sau khi tạo. Kèm chi phí chuyển một lần.',
    yearLabel: 'Năm chuyển',
    build: (ctx) => ({
      phases: [
        {
          scenario_id: ctx.scenarioId,
          start_year: ctx.year,
          label: 'Chuyển nước',
          country: null,
          currency: ctx.currency,
          annual_income_minor: ctx.currentIncomeMinor,
          annual_expense_minor: ctx.currentExpenseMinor,
          fx_to_display: ctx.fxToDisplay,
        },
      ],
      events: [
        ev(ctx, {
          label: 'Chi phí chuyển nhà, thủ tục',
          amount_minor: MOVING_COST_JPY,
          // Ép cứng JPY. Bản trước CỐ Ý để rơi về ctx.currency ("dùng đúng tiền của
          // chặng"), nhưng độ lớn 2.500.000 vẫn được viết theo yên — nên với một chặng
          // VND nó ra ₫2.500.000 (~100 đô) cho cả một lần chuyển nước. ¥2.500.000 quy
          // sang đồng ra khoảng ₫425 triệu, tức đúng bậc độ lớn ở CẢ HAI nước; con số
          // sai theo đơn vị thì không.
          currency: 'JPY',
          // Giá HÔM NAY cho việc xảy ra ở năm tương lai — phồng theo lạm phát ở chế độ
          // danh nghĩa, cùng lý do với "Chi phí cưới"/"Trả trước mua nhà".
          inflate: true,
        }),
      ],
    }),
  },
  {
    id: 'ho-tro-bo-me',
    label: 'Hỗ trợ bố mẹ ở VN',
    hint: 'Khoản gửi về hằng năm, mặc định tiền VND, có năm kết thúc.',
    yearLabel: 'Năm bắt đầu gửi',
    build: (ctx) => ({
      phases: [],
      events: [
        ev(ctx, {
          label: 'Hỗ trợ bố mẹ',
          // Thời hạn 20 năm: ước lượng, chưa tra nguồn (2026-07-29) — không dựa trên số
          // liệu tuổi thọ hay nhu cầu cụ thể nào, chỉ là một mốc tạm để mẫu có năm kết
          // thúc thay vì chạy vô hạn.
          end_year: ctx.year + 20,
          amount_minor: PARENT_SUPPORT_ANNUAL_VND,
          // Tiền gửi về luôn tính bằng VND, ép cứng bất kể ctx.currency — đây là mẫu
          // mà lệch tiền với ctx là TRƯỜNG HỢP THƯỜNG GẶP NHẤT (người dùng ở Nhật gửi
          // tiền về VN), không phải ca hiếm. fx_to_display tính theo tiền VND của
          // CHÍNH sự kiện qua ctx.fxOf (fxForEvent()), không mượn ctx.fxToDisplay.
          currency: 'VND',
        }),
      ],
    }),
  },
]
