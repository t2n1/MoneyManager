// Mẫu sinh chùm chặng/sự kiện. Mẫu chỉ là TIỆN TAY LÚC NHẬP: sinh ra rồi là bản ghi
// thường, sửa xoá như mọi dòng khác, và engine không biết dòng nào từ mẫu mà ra.
// Nên không có đường nào để mẫu làm sai kết quả một cách âm thầm.
//
// MỌI SỐ MẶC ĐỊNH DƯỚI ĐÂY LÀ PHỎNG ĐOÁN, có ghi nguồn + ngày tra. UI phải dán nhãn
// "số mặc định, kiểm tra lại". 児童手当 và học phí đổi theo luật hằng năm — app chỉ
// giúp khỏi gõ từ số không, không hứa biết số đúng.
import type { NewLifeEvent, NewLifePhase } from '../../data/repo'

export interface PresetContext {
  scenarioId: string
  /** Năm sự kiện xảy ra (với sinh con: năm sinh của con). */
  year: number
  /** Tiền của chặng đang hiệu lực — mẫu dùng làm mặc định. */
  currency: string
  country: string | null
  currentIncomeMinor: number
  currentExpenseMinor: number
  /**
   * Tỷ giá của `currency` (chặng đang hiệu lực) sang tiền hiển thị của kịch bản,
   * theo MAJOR units — xem convertLifetimeMinor ở project.ts.
   *
   * LƯU Ý QUAN TRỌNG (đã báo lại, chưa tự quyết): vài mẫu dưới đây ép cứng currency
   * của SỰ KIỆN sang JPY (児童手当, lương hưu) hoặc VND (hỗ trợ bố mẹ) — khác với
   * `currency` ở trên. fxToDisplay ở đây chỉ là tỷ giá của `currency`, KHÔNG phải
   * tỷ giá của JPY/VND khi hai loại tiền đó không trùng `currency`. PresetContext
   * hiện không mang theo tiền hiển thị (display currency) lẫn bảng tỷ giá đa loại
   * tiền, nên module này KHÔNG ĐỦ DỮ LIỆU để tự tính đúng fx_to_display cho các sự
   * kiện ép cứng currency trong trường hợp tổng quát (vd kịch bản dùng USD). Đã cố
   * tình không tự đặt fx_to_display = 1 cho các sự kiện đó — xem ghi chú tại từng
   * chỗ dùng JPY/VND cứng bên dưới.
   */
  fxToDisplay: number
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

function ev(ctx: PresetContext, over: Partial<NewLifeEvent> & Pick<NewLifeEvent, 'label'>): NewLifeEvent {
  return {
    scenario_id: ctx.scenarioId,
    start_year: ctx.year,
    end_year: ctx.year,
    kind: 'expense',
    amount_minor: 0,
    currency: ctx.currency,
    note: 'Số mặc định, kiểm tra lại',
    // Mẫu lấy tiền của chặng đang hiệu lực nên tỷ giá của chặng là đúng. Sự kiện vẫn
    // giữ tỷ giá RIÊNG của nó (migration 0032) — mẫu chỉ điền giá trị khởi đầu.
    // Cảnh báo: default này CHỈ đúng khi `over.currency` (nếu có ép cứng) trùng với
    // ctx.currency — xem phân tích ở PresetContext.fxToDisplay và từng chỗ gọi ev()
    // với currency ép cứng JPY/VND bên dưới.
    fx_to_display: ctx.fxToDisplay,
    inflate: true,
    ...over,
  }
}

// 児童手当 (tra 2026-07-29, nguồn: cổng thông tin こども家庭庁): 0–3 tuổi ¥15.000/tháng,
// sau đó ¥10.000/tháng tới hết cấp ba. Lấy ¥12.000/tháng ≈ ¥144.000/năm làm số gộp.
const JIDO_TEATE_ANNUAL_JPY = 144_000
// Chi phí nuôi con theo bậc (tra 2026-07-29, ước lượng từ khảo sát AIU 教育費):
const CHILD_COST_0_6_JPY = 600_000
const CHILD_COST_7_15_JPY = 900_000
const CHILD_COST_16_18_JPY = 1_200_000
const CHILD_COST_UNIVERSITY_JPY = 1_800_000

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
      events: [ev(ctx, { label: 'Chi phí cưới', amount_minor: 3_000_000, inflate: false })],
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
          end_year: ctx.year + 15,
          amount_minor: JIDO_TEATE_ANNUAL_JPY,
          // Trợ cấp của Nhật luôn trả bằng JPY, ép cứng bất kể ctx.currency. fx_to_display
          // kế thừa ctx.fxToDisplay (tỷ giá của ctx.currency) CHỈ đúng khi ctx.currency
          // cũng là JPY (trường hợp phổ biến: đang ở Nhật). Nếu kịch bản đổi sang tiền
          // khác (vd chuyển qua Mỹ, ctx.currency='USD') con số này SAI — xem phân tích
          // ở PresetContext.fxToDisplay. Chưa có cách tính đúng vì PresetContext không
          // mang display currency lẫn bảng tỷ giá đa loại tiền.
          currency: 'JPY',
          // Trợ cấp cố định theo luật, không theo lạm phát.
          inflate: false,
        }),
        ev(ctx, {
          label: 'Nuôi con 0–6 tuổi',
          end_year: ctx.year + 6,
          amount_minor: CHILD_COST_0_6_JPY,
        }),
        ev(ctx, {
          label: 'Nuôi con 7–15 tuổi',
          start_year: ctx.year + 7,
          end_year: ctx.year + 15,
          amount_minor: CHILD_COST_7_15_JPY,
        }),
        ev(ctx, {
          label: 'Nuôi con 16–18 tuổi',
          start_year: ctx.year + 16,
          end_year: ctx.year + 18,
          amount_minor: CHILD_COST_16_18_JPY,
        }),
        ev(ctx, {
          label: 'Con vào đại học',
          start_year: ctx.year + 18,
          end_year: ctx.year + 21,
          amount_minor: CHILD_COST_UNIVERSITY_JPY,
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
        ev(ctx, { label: 'Trả trước mua nhà', amount_minor: 5_000_000, inflate: false }),
        ev(ctx, {
          label: 'Trả vay mua nhà',
          end_year: ctx.year + 34,
          amount_minor: 1_200_000,
          // Khoản trả vay lãi cố định là số danh nghĩa — không tăng theo lạm phát.
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
          end_year: null,
          amount_minor: 1_100_000,
          // 年金 luôn trả bằng JPY, ép cứng bất kể ctx.currency — cùng giới hạn với
          // 児童手当 ở trên: fx_to_display kế thừa ctx.fxToDisplay chỉ đúng khi
          // ctx.currency cũng là JPY. Xem phân tích ở PresetContext.fxToDisplay.
          currency: 'JPY',
          inflate: false,
        }),
      ],
    }),
  },
  {
    id: 'chuyen-nuoc',
    label: 'Chuyển nước',
    hint: 'Chặng mới với tiền và tỷ giá giả định khác, kèm chi phí chuyển một lần.',
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
      // Sự kiện này KHÔNG ép cứng currency — dùng đúng ctx.currency, nên fx_to_display
      // kế thừa từ ev() luôn đúng, không dính giới hạn nêu ở JPY/VND phía trên.
      events: [ev(ctx, { label: 'Chi phí chuyển nhà, thủ tục', amount_minor: 2_500_000, inflate: false })],
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
          end_year: ctx.year + 20,
          amount_minor: 60_000_000,
          // Tiền gửi về luôn tính bằng VND, ép cứng bất kể ctx.currency — và khác
          // Trợ cấp/Lương hưu ở chỗ: TRƯỜNG HỢP THƯỜNG GẶP NHẤT của mẫu này (người
          // dùng ở Nhật, ctx.currency='JPY') đã là ép cứng-khác-ctx rồi, không phải
          // ca hiếm. fx_to_display kế thừa ctx.fxToDisplay gần như luôn SAI cho mẫu
          // này. Xem phân tích ở PresetContext.fxToDisplay — cần quyết định cách xử
          // lý ở tầng gọi (UI) trước khi mẫu này có thể tính đúng.
          currency: 'VND',
        }),
      ],
    }),
  },
]
