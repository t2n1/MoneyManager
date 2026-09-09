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
import type { TagColorKey } from '../tags/colors'

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
  /**
   * Khoá màu RIÊNG của mẫu này — một trong bảy khoá dùng chung toàn app
   * (`features/tags/colors.ts`), không phải hex. Hai chỗ dùng nó:
   *
   * 1. Chip trên bảng chọn nhanh (`QuickAddBoard`) tô theo khoá này, VIVID — cùng cách
   *    `EventPins` tô viền/icon một mốc đã có màu riêng — nên mười chip trông khác nhau
   *    ngay trước khi bấm, đúng dsg-handoff/README.md §"Bảng chọn nhanh" ("10 chip mẫu,
   *    mỗi chip một màu riêng").
   * 2. `LIFE_PRESETS` (export ở cuối file) TỰ gán khoá này làm `color` cho MỌI sự kiện mà
   *    `build()` sinh ra — mốc mới tạo từ mẫu có màu ngay, không phải người dùng tự tô tay
   *    từng cái sau khi bấm. Đây là lý do field này nằm ở tầng `LifePreset` (một khoá cho
   *    cả mẫu) chứ không phải trong từng lời gọi `ev()` riêng lẻ bên dưới: một chỗ khai thì
   *    không có chỗ nào quên tô cho một sự kiện của cùng một mẫu.
   */
  color: TagColorKey
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

// Hai số dưới đây trước là literal viết thẳng trong `build()`. Đặt tên có hậu tố `_JPY`
// vì độ lớn của chúng được viết theo yên — xem QUY ƯỚC ĐƠN VỊ ở đầu file.
// (Trước đây khối này có bốn số; hai số về nhà — `HOUSE_DOWN_PAYMENT_JPY` và
// `HOUSE_LOAN_ANNUAL_JPY` — đã bỏ khi 'mua-nha' chuyển sang hình dạng tài sản+vay, vì
// engine tự sinh trả trước và trả vay từ giá nhà và phần đi vay. Xem khối "Mua nhà".)
/** Chi phí tổ chức đám cưới. Ước lượng, chưa tra nguồn (2026-07-29). */
const WEDDING_COST_JPY = 3_000_000
/** Mức lương hưu (年金) bình quân giả định. Ước lượng, chưa tra nguồn (2026-07-29). */
const PENSION_ANNUAL_JPY = 1_100_000
/** Tuổi bắt đầu nhận 老齢年金 theo luật hiện hành (nhận sớm/muộn là lựa chọn, mẫu không đoán). */
export const PENSION_START_AGE = 65
/** Chi phí chuyển nhà + thủ tục giấy tờ khi đổi nước sinh sống. Ước lượng, chưa tra
 *  nguồn (2026-07-29). */
const MOVING_COST_JPY = 2_500_000
/** Tiền gửi về cho bố mẹ mỗi năm. Ước lượng, chưa tra nguồn (2026-07-29). */
const PARENT_SUPPORT_ANNUAL_VND = 60_000_000

// --- Mua nhà (migration 0068: nhà là TÀI SẢN có vay, và nhà LÊN giá) ---
// Nguồn cho bốn số đầu: dsg-handoff/README.md dòng 222 (bảng loại mốc "house"), tra
// 2026-09-10 — "price 47.000.000 · downPct 20 · ratePct 1.3 · termYears 35 ·
// taxPct 1.4". Bản trước của mẫu này chỉ có trả trước 500万 + trả vay 120万/năm, không
// có nguồn và không có tài sản.
/** Giá một căn nhà tại Nhật. Nguồn: dsg-handoff/README.md (2026-09-10). */
const HOUSE_PRICE_JPY = 47_000_000
/** Phần đi vay — bản vẽ: trả trước 20%, vay 80% giá nhà (47.000.000 × 0,8 =
 *  37.600.000). Nguồn: dsg-handoff/README.md (2026-09-10). */
const HOUSE_LOAN_JPY = 37_600_000
/** Lãi suất vay mua nhà — bản vẽ ratePct 1.3 (vay nhà ở Nhật rẻ hơn vay xe rất
 *  nhiều). Nguồn: dsg-handoff/README.md (2026-09-10). */
const HOUSE_LOAN_RATE_BPS = 130
/** Kỳ hạn vay 35 năm — khớp bản vẽ termYears 35, và cũng khớp quy ước
 *  `applySpanToPreset` (quickAddRange.ts): kéo một khoảng 35 năm trên 'mua-nha' cho
 *  `termYears: 35`. Nguồn: dsg-handoff/README.md (2026-09-10). */
const HOUSE_LOAN_YEARS = 35
/** Nhà lên giá mỗi năm — đúng con số ví dụ đã ghi sẵn ở trường `asset_change_bps`
 *  (database.types.ts, homeAsset.ts: "Nhà +100; xe −1500"). Số quy ước đã có sẵn
 *  trong chính migration 0068, không phải số tra riêng (2026-09-10). */
const HOUSE_APPRECIATION_BPS = 100
/** Chi phí giữ nhà mỗi năm = thuế tài sản (固定資産税) 1,4% × giá nhà, theo bản vẽ
 *  taxPct 1.4 → 47.000.000 × 1,4% = 658.000. Khi `asset_value_minor > 0`,
 *  `amount_minor` đổi nghĩa thành chi phí giữ tài sản hằng năm (xem homeAsset.ts) —
 *  KHÔNG phải trả trước hay trả vay, hai khoản đó do engine tự sinh.
 *
 *  Đây là SÀN, không phải toàn bộ: sở hữu nhà thật còn bảo hiểm, sửa chữa, phí quản lý
 *  (với chung cư là 管理費+修繕積立金, thường lớn hơn cả thuế). Bản vẽ chỉ mô hình phần
 *  thuế nên mẫu theo đúng bản vẽ, và `note` vẫn nhắc "kiểm tra lại".
 *  Nguồn: dsg-handoff/README.md (2026-09-10). */
const HOUSE_PROPERTY_TAX_ANNUAL_JPY = 658_000

// --- Mua xe (migration 0068: xe là TÀI SẢN có vay, khác nhà ở chỗ MẤT giá dần) ---
// Nguồn cho bốn số dưới: dsg-handoff/README.md dòng 223 (bảng loại mốc "car"), tra
// 2026-09-09 — "price 3.000.000 · downPct 30 · ratePct 3.5 · termYears 5 ·
// upkeep 300.000". Bản trước của file này lấy downPct 20/ratePct 3.0 không có nguồn
// (chỉ là ước lượng); đổi lại cho khớp bản vẽ.
/** Giá xe mới cỡ trung bình tại Nhật. Nguồn: dsg-handoff/README.md (2026-09-09). */
const CAR_PRICE_JPY = 3_000_000
/** Phần đi vay — bản vẽ: trả trước 30%, vay 70% giá xe (3.000.000 × 0,7 = 2.100.000).
 *  Nguồn: dsg-handoff/README.md (2026-09-09). */
const CAR_LOAN_JPY = 2_100_000
/** Lãi suất vay mua xe — bản vẽ ratePct 3.5. Nguồn: dsg-handoff/README.md
 *  (2026-09-09). */
const CAR_LOAN_RATE_BPS = 350
/** Kỳ hạn vay 5 năm — khớp quy ước `applySpanToPreset` (quickAddRange.ts): kéo khoảng
 *  2030–2034 (5 năm, đếm cả hai đầu) trên 'mua-xe' cho `termYears: 5`. Cũng khớp bản
 *  vẽ termYears 5. Nguồn: dsg-handoff/README.md (2026-09-09). */
const CAR_LOAN_YEARS = 5
/** Xe mất giá mỗi năm — đúng con số ví dụ đã ghi sẵn ở trường `asset_change_bps`
 *  (database.types.ts, homeAsset.ts: "Nhà +100; xe −1500"). Không phải số tra riêng
 *  cho xe, mà là số quy ước đã có sẵn trong chính migration 0068 (2026-09-09). */
const CAR_DEPRECIATION_BPS = -1500
/** Chi phí giữ xe mỗi năm — bảo hiểm tự nguyện (任意保険), 車検, thuế ô tô
 *  (自動車税), bảo dưỡng. Khi `asset_value_minor > 0`, `amount_minor` đổi nghĩa
 *  thành chi phí giữ tài sản hằng năm (xem homeAsset.ts) — đây KHÔNG phải tiền trả
 *  trước hay trả vay, những khoản đó do engine tự sinh từ `asset_value_minor`/
 *  `loan_minor` ở dưới. Bản vẽ: upkeep 300.000. Nguồn: dsg-handoff/README.md
 *  (2026-09-09). */
const CAR_UPKEEP_ANNUAL_JPY = 300_000

// --- Du lịch ---
/** Chi phí một chuyến du lịch gia đình (ước tính trung bình, trong lẫn ngoài nước).
 *  Ước lượng, chưa tra nguồn (2026-09-09). */
const TRAVEL_COST_JPY = 500_000
/** Lặp mỗi 2 năm — giả định tần suất một gia đình đi chơi xa. Đã tra
 *  dsg-handoff/README.md:224 (bảng loại mốc "trip", tra 2026-09-09): bản vẽ cho
 *  `everyN` 1, tức mỗi năm. CỐ Ý không theo con số đó ở đây: mục tồn tại của preset
 *  'du-lich' trong file này là minh hoạ nhánh LẶP MỖI N NĂM (N > 1) của
 *  `repeat_every_years` (migration 0066, xem eventAmount.ts) — hint của mẫu ("lặp lại
 *  mỗi vài năm, không phải một lần") và bài test 'du-lich lặp lại, không phải một lần'
 *  đều khoá vào N > 1. Đặt `everyN` 1 sẽ biến mốc thành "chi mọi năm", đúng thứ mà hint
 *  nói KHÔNG PHẢI, và không còn mẫu nào trong file bao phủ nhánh N > 1 nữa. Giữ 2 —
 *  đây là lệch có lý do đã ghi, không phải lệch không tra nguồn. */
const TRAVEL_REPEAT_YEARS = 2

// --- Học thêm ---
/** Học phí một khoá học thêm/bằng cấp (cao học bán thời gian, chứng chỉ nghề...) mỗi
 *  năm. Nguồn: dsg-handoff/README.md:225 (bảng loại mốc "study" — `tuition` 2.000.000),
 *  tra 2026-09-09. Bản trước dùng 800.000 không có nguồn ("ước lượng, chưa tra nguồn");
 *  đổi lại cho khớp bản vẽ, cùng cách với CAR_* ở trên. */
const FURTHER_STUDY_TUITION_ANNUAL_JPY = 2_000_000
/** Khoản thu nhập hụt đi mỗi năm khi giảm giờ làm để học. Ước lượng, chưa tra nguồn
 *  (2026-09-09) — CỐ Ý không tính theo % của `ctx.currentIncomeMinor`: con số đó theo
 *  `ctx.currency` (có thể VND/USD/bất kỳ tiền nào của chặng), còn mọi sự kiện của ba
 *  mẫu mới trong file này ép cứng JPY (xem QUY ƯỚC ĐƠN VỊ đầu file), và `ctx.fxOf` chỉ
 *  quy đổi SANG `displayCurrency` chứ không quy đổi sang JPY cho một `ctx.currency` bất
 *  kỳ. Tính % rồi dán nhãn JPY lên sẽ lặp lại đúng lỗi 150 lần đã ghi ở đầu file —
 *  thà một số phẳng ước lượng còn hơn một số "chính xác" nhưng sai đơn vị. */
const FURTHER_STUDY_INCOME_CUT_ANNUAL_JPY = 1_000_000
/** Thời hạn khoá học — 2 năm (cao học bán thời gian/khoá dài phổ biến). Ước lượng,
 *  chưa tra nguồn (2026-09-09). */
const FURTHER_STUDY_YEARS = 2

/**
 * NHÓM MÀU — chín mẫu trên bảy khoá (`TAG_COLOR_KEYS`), tra tại review 2026-09-09
 * (Finding 1). Không có đủ khoá cho mỗi mẫu một màu riêng biệt tuyệt đối, nên việc phải
 * làm là chọn CẶP nào được phép trùng màu — không phải cố nhét đủ chín màu khác nhau.
 *
 * Ba cặp bản vẽ/review nêu tên phải PHÂN BIỆT được, vì người dùng nhiều khả năng cân nhắc
 * chúng CÙNG LÚC trong một kế hoạch (mua nhà rồi mua xe, cưới rồi sinh con, nghỉ hưu và
 * khoản hưu trí đi kèm nó):
 *   - `mua-nha` (amber) / `mua-xe` (sky) — hai khoản tài sản có vay, dễ đứng cạnh nhau
 *     trên cùng một trục năm.
 *   - `sinh-con` (green) / `cuoi` (pink) — hai mốc gia đình liền mạch theo trình tự
 *     thường gặp (cưới rồi mới sinh con).
 *   - `nghi-huu` (indigo) / `ho-tro-bo-me` (red) — cả hai đều là dòng tiền RA/VÀO tuổi
 *     già (lương hưu nhận về, tiền gửi bố mẹ gửi đi), một kế hoạch nghỉ hưu nghiêm túc
 *     thường có cả hai.
 *
 * Ba mẫu còn lại (`chuyen-nuoc`, `du-lich`, `hoc-them`) là ba việc THẤT THƯỜNG, ít khi ai
 * đó lên kế hoạch cả ba cùng lúc với nhau HAY cùng lúc với đúng mẫu chúng mượn màu — nên
 * chỗ trùng màu được đặt ở đây, không phải ở ba cặp bắt buộc phân biệt bên trên:
 *   - `chuyen-nuoc` → gray: khoá còn lại chưa dùng, và "chưa biết nước nào" (xem hint của
 *     chính mẫu này) hợp với một màu trung tính hơn là một màu có sắc.
 *   - `du-lich` → sky (mượn của `mua-xe`): cả hai là chi tiêu lối sống không bắt buộc,
 *     nhưng một cái là MỘT LẦN mua xe còn cái kia LẶP mỗi 2 năm — hình dạng trên trục đã
 *     đủ khác (một icon có chốt dài vs nhiều icon lặp lại) nên trùng màu ít gây nhầm hơn
 *     nếu đặt cạnh `mua-nha`/`sinh-con`.
 *   - `hoc-them` → amber (mượn của `mua-nha`): cùng là một khoản ĐẦU TƯ dài hạn (nhà ở /
 *     bằng cấp), nhưng khác hẳn về quy mô và tần suất xuất hiện trong một kế hoạch thật
 *     (mua nhà là một cột mốc lớn hiếm khi lặp; học thêm là một khoá ngắn 2 năm) nên ít
 *     khi cả hai cùng nổi bật trên trục ở gần nhau.
 */
const RAW_PRESETS: LifePreset[] = [
  {
    id: 'cuoi',
    label: 'Cưới',
    hint: 'Tạo một chặng đời mới (thu chi nền đổi) và một khoản chi cho đám cưới.',
    yearLabel: 'Năm cưới',
    color: 'pink',
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
    color: 'green',
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
    hint: 'Nhà là tài sản LÊN giá, mua bằng vay trả góp — số hằng năm là thuế/chi phí giữ nhà. Nhớ khai ô "thay cho" bằng tiền thuê đang trả, kẻo tính hai lần phần nhà ở.',
    yearLabel: 'Năm mua',
    color: 'amber',
    build: (ctx) => ({
      phases: [],
      events: [
        ev(ctx, {
          label: 'Mua nhà',
          // Ép cứng JPY — độ lớn viết theo yên, xem QUY ƯỚC ĐƠN VỊ ở đầu file.
          currency: 'JPY',
          // MỘT dòng duy nhất — cùng hình dạng với 'mua-xe' và cùng lý do. Bản trước của
          // mẫu này sinh HAI khoản CHI thuần ("Trả trước mua nhà" + "Trả vay mua nhà") và
          // không bao giờ đặt `asset_value_minor`: tài sản ròng tụt đi đúng số đã trả, và
          // người dùng KHÔNG BAO GIỜ nhận được căn nhà. Đó đúng là vấn đề mà đầu
          // homeAsset.ts mô tả — mua nhà luôn trông tệ hơn thực tế, trên chính quyết định
          // lớn nhất người dùng mang tới màn này. Giờ engine tự sinh trả trước
          // (`asset_value_minor − loan_minor`) và trả nợ mỗi năm từ các trường dưới đây.
          amount_minor: HOUSE_PROPERTY_TAX_ANNUAL_JPY,
          // `null` = tới hết đời, khớp với vòng tài sản ở project.ts vốn KHÔNG có biên
          // trên — xem lời ghi dài ở 'mua-xe'. Để mặc định (= năm mua) thì chi phí giữ
          // nhà chỉ tính đúng một năm trong khi căn nhà vẫn còn đó mãi.
          end_year: null,
          asset_value_minor: HOUSE_PRICE_JPY,
          loan_minor: HOUSE_LOAN_JPY,
          loan_rate_bps: HOUSE_LOAN_RATE_BPS,
          loan_years: HOUSE_LOAN_YEARS,
          // DƯƠNG — nhà lên giá, ngược dấu với `asset_change_bps` âm của xe.
          asset_change_bps: HOUSE_APPRECIATION_BPS,
          // CHỐNG ĐẾM HAI LẦN (migration 0067): chi nền của chặng lấy từ chi tiêu THẬT 12
          // tháng, trong đó đã có tiền thuê nhà — cộng tiền nhà lên trên là tính hai lần
          // phần nhà ở. Mẫu KHÔNG đoán hộ số tiền thuê: Tokyo và VN cách nhau rất xa, và
          // một số thuê đoán sai cũng sai ÂM THẦM y như không khai. Nó chỉ dán nhãn sẵn
          // để người dùng thấy có việc phải làm, rồi bảng sửa có nút lấy số THẬT từ danh
          // mục điền vào (`chiTheoDanhMuc`).
          replaces_minor: 0,
          replaces_label: 'Nhà ở',
          // Thuế/chi phí giữ nhà là giá HÔM NAY cho các năm tương lai — phồng theo lạm
          // phát. Khoản trả vay lãi cố định KHÔNG đi qua cờ này: engine tự tính và tự
          // nhân lạm phát riêng ở project.ts.
          inflate: true,
        }),
      ],
    }),
  },
  {
    id: 'mua-xe',
    label: 'Mua xe',
    hint: 'Một mốc mua xe bằng vay trả góp — xe là tài sản MẤT giá dần, số hằng năm là chi phí giữ xe (bảo hiểm, bảo dưỡng).',
    yearLabel: 'Năm mua',
    color: 'sky',
    build: (ctx) => ({
      phases: [],
      events: [
        ev(ctx, {
          label: 'Mua xe',
          // Ép cứng JPY — độ lớn viết theo yên, xem QUY ƯỚC ĐƠN VỊ ở đầu file.
          currency: 'JPY',
          // MỘT dòng duy nhất, không phải hai: tiền trả trước THẬT
          // (asset_value_minor − loan_minor) và tiền trả vay hằng năm do CHÍNH các
          // trường tài sản dưới đây sinh ra TỰ ĐỘNG (migration 0068, cùng cơ chế "mua
          // nhà" khi nối qua homeAsset.ts/project.ts, dòng ~463–496 — không phải cơ chế
          // mà preset 'mua-nha' ở TRÊN đang dùng, vì preset đó viết trước 0068 và chưa
          // được nối vào homeAsset.ts). Từng có một dòng "Trả vay mua xe" thứ hai chỉ
          // để đánh dấu (amount_minor: 0) — đã BỎ: nó không cộng gì vào phép tính,
          // nhưng UI vẫn cho gõ số vào bất kỳ mốc nào, nên một dòng "trông như trả vay
          // riêng" chỉ mời gọi ai đó điền số vào và TÍNH HAI LẦN khoản vay — đúng lớp
          // lỗi "sai âm thầm" mà đầu file này cảnh báo. Một dòng, không có chỗ để mắc
          // bẫy đó.
          //
          // `asset_value_minor > 0` cũng đổi nghĩa `amount_minor`: không còn là "số
          // tiền của sự kiện" mà là CHI PHÍ GIỮ tài sản mỗi năm (xem homeAsset.ts) —
          // với xe là bảo hiểm/車検/thuế/bảo dưỡng. Để 0 sẽ hụt mất cả phần chi phí sở
          // hữu xe hằng năm, phần lớn khiến xe đắt, nên dùng CAR_UPKEEP_ANNUAL_JPY.
          amount_minor: CAR_UPKEEP_ANNUAL_JPY,
          // `ev()` mặc định end_year = start_year (chỉ năm mua) — SAI cho mốc này. Vòng
          // chi phí ở project.ts (~dòng 439) dừng đúng theo end_year, nhưng vòng tài
          // sản/vay ở CÙNG project.ts (~dòng 467–474) chỉ kiểm `year < ts.startYear`,
          // KHÔNG có biên trên — xe và khoản vay của nó chạy tới hết bản chiếu bất kể
          // end_year của event. Để end_year mặc định (= năm mua) thì amount_minor (chi
          // phí giữ xe hằng năm) chỉ bị tính đúng MỘT năm rồi biến mất, trong khi xe vẫn
          // còn đó mãi mãi — hai nửa của cùng một mốc nói hai chuyện khác nhau. null =
          // "tới hết đời" khớp đúng với vòng tài sản không có biên trên. Cắm một biên
          // hữu hạn khác (vd +10 năm) sẽ lặp lại đúng lệch pha này ở năm +11 trở đi —
          // không có con số hữu hạn nào đúng vì vòng tài sản vốn không có biên. Người
          // dùng định bán xe thì tự đặt end_year sau khi tạo, mẫu không đoán hộ.
          end_year: null,
          asset_value_minor: CAR_PRICE_JPY,
          loan_minor: CAR_LOAN_JPY,
          loan_rate_bps: CAR_LOAN_RATE_BPS,
          loan_years: CAR_LOAN_YEARS,
          // Âm vì xe MẤT giá mỗi năm — ngược dấu với `asset_change_bps` dương của nhà.
          asset_change_bps: CAR_DEPRECIATION_BPS,
          // Chi phí giữ xe là giá HÔM NAY cho các năm tương lai — phồng theo lạm phát,
          // giống "Chi phí cưới"/mẫu 'mua-nha' (khoản trả vay lãi cố định do engine tự
          // tính và tự nhân lạm phát riêng ở project.ts, không đi qua cờ này).
          inflate: true,
        }),
      ],
    }),
  },
  {
    id: 'nghi-huu',
    label: 'Nghỉ hưu',
    hint: 'Chặng mới với thu nền 0, kèm lương hưu chạy tới hết đời.',
    yearLabel: 'Năm nghỉ hưu',
    color: 'indigo',
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
    color: 'gray',
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
    color: 'red',
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
  {
    id: 'du-lich',
    label: 'Du lịch',
    hint: 'Một khoản chi lặp lại mỗi vài năm, không phải một lần.',
    yearLabel: 'Năm đầu',
    color: 'sky',
    build: (ctx) => ({
      phases: [],
      events: [
        ev(ctx, {
          label: 'Du lịch',
          currency: 'JPY',
          amount_minor: TRAVEL_COST_JPY,
          end_year: ctx.year + 20,
          // Lặp mỗi TRAVEL_REPEAT_YEARS năm (migration 0066) — không phải chi một lần,
          // và không phải chi mọi năm. Xem eventAmount.ts: repeatEveryYears > 1 chỉ rơi
          // vào đúng nhịp, các năm giữa bị bỏ hẳn khỏi bản chiếu.
          repeat_every_years: TRAVEL_REPEAT_YEARS,
          // Giá HÔM NAY cho một chuyến đi tương lai — phồng theo lạm phát, cùng lý do
          // "Chi phí cưới"/"Trả trước mua nhà" ở trên.
          inflate: true,
        }),
      ],
    }),
  },
  {
    id: 'hoc-them',
    label: 'Học thêm',
    hint: 'Học phí một khoá học thêm, kèm khoản thu nhập hụt đi trong lúc học.',
    yearLabel: 'Năm bắt đầu',
    color: 'amber',
    build: (ctx) => ({
      phases: [],
      events: [
        ev(ctx, {
          label: 'Học phí học thêm',
          currency: 'JPY',
          amount_minor: FURTHER_STUDY_TUITION_ANNUAL_JPY,
          end_year: ctx.year + (FURTHER_STUDY_YEARS - 1),
          // Giá HÔM NAY cho một khoá học tương lai — phồng theo lạm phát, cùng lý do
          // "Chi phí cưới" ở trên.
          inflate: true,
        }),
        ev(ctx, {
          label: 'Giảm thu nhập khi đi học',
          // CHỌN 'expense', KHÔNG PHẢI 'income' mang số âm: migration 0031 ép
          // `check (amount_minor >= 0)` ngay trên cột này (xem src/data/repo.ts,
          // NewLifeEvent.amount_minor), nên "thu nhập âm" không gõ được vào DB — kind:
          // 'income' chỉ có thể CỘNG thêm thu, không bao giờ trừ. Một dòng CHI dương có
          // đúng tác động lên netFlow (thu − chi) như một dòng THU bị trừ đi cùng số đó,
          // nên 'expense' đạt được đúng ý "hụt thu" mà không phá luật check của cột.
          //
          // Lựa chọn còn lại là `replaces_minor`, nhưng trường đó trừ vào CHI NỀN của
          // CHẶNG (đúng cho "mua nhà thay tiền thuê đang có trong chi nền") — sai ngữ
          // nghĩa cho một khoản THU bị hụt, nên không dùng.
          kind: 'expense',
          currency: 'JPY',
          amount_minor: FURTHER_STUDY_INCOME_CUT_ANNUAL_JPY,
          end_year: ctx.year + (FURTHER_STUDY_YEARS - 1),
          // Số hụt thu này KHÔNG tính theo % ctx.currentIncomeMinor — xem comment tại
          // FURTHER_STUDY_INCOME_CUT_ANNUAL_JPY phía trên (đơn vị tiền của ctx là biến
          // số, còn mẫu này ép cứng JPY).
          inflate: true,
        }),
      ],
    }),
  },
]

/**
 * `LIFE_PRESETS` THẬT — bọc `RAW_PRESETS` để gán `color` của mẫu lên MỌI sự kiện mà
 * `build()` sinh ra, một lần duy nhất ở đây thay vì ở từng lời gọi `ev()` bên trên (Finding
 * 1, review 2026-09-09). Một chỗ gán thì không có `ev()` nào của một mẫu MỚI thêm sau này
 * quên tô màu — thiếu field `color` ở khai báo `RAW_PRESETS` đã là lỗi biên dịch (field
 * bắt buộc trên `LifePreset`), và có nó rồi thì build() luôn tô đúng, không cần nhớ.
 *
 * Không đụng tới `phases`: mốc (event) là thứ tô TƯƠI trên đồ thị (spec §8, xem
 * `EventPins`/`TimelinePlot`); chặng (phase) tô TRẦM trong dock và đã có `color` riêng của
 * nó do người dùng tự chọn — mẫu áp màu hộ cho chặng sẽ đè lên lựa chọn đó trước khi người
 * dùng kịp thấy, còn mốc thì đằng nào cũng bắt đầu không màu nên áp mặc định ở đây an toàn.
 */
export const LIFE_PRESETS: LifePreset[] = RAW_PRESETS.map((p) => ({
  ...p,
  build: (ctx) => {
    const r = p.build(ctx)
    return { phases: r.phases, events: r.events.map((e) => ({ ...e, color: p.color })) }
  },
}))
