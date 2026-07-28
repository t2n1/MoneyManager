// Mẫu sinh chùm chặng/sự kiện. Mẫu chỉ là TIỆN TAY LÚC NHẬP: sinh ra rồi là bản ghi
// thường, sửa xoá như mọi dòng khác, và engine không biết dòng nào từ mẫu mà ra.
// Nên không có đường nào để mẫu làm sai kết quả một cách âm thầm.
//
// MỌI SỐ MẶC ĐỊNH DƯỚI ĐÂY LÀ PHỎNG ĐOÁN, có ghi nguồn + ngày tra. UI phải dán nhãn
// "số mặc định, kiểm tra lại". 児童手当 và học phí đổi theo luật hằng năm — app chỉ
// giúp khỏi gõ từ số không, không hứa biết số đúng.
import type { NewLifeEvent, NewLifePhase } from '../../data/repo'
import type { CurrencyCode } from '../../lib/currencies'

export interface PresetContext {
  scenarioId: string
  /** Năm sự kiện xảy ra (với sinh con: năm sinh của con). */
  year: number
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
          // được ev()/fxForEvent() tính theo tiền JPY của CHÍNH sự kiện này (qua ctx.fxOf),
          // không mượn tỷ giá của ctx.currency — đúng cả khi kịch bản dùng tiền khác.
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
          // 年金 luôn trả bằng JPY, ép cứng bất kể ctx.currency — cùng cách tính với
          // 児童手当 ở trên: fx_to_display theo tiền JPY của sự kiện qua ctx.fxOf.
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
      // Sự kiện này KHÔNG ép cứng currency — dùng đúng ctx.currency.
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
