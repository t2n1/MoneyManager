// Chép một kịch bản Lifetime kèm TOÀN BỘ chặng/sự kiện của nó.
//
// VÌ SAO ĐỨNG RIÊNG: phép chép này có hai chỗ gọi — nút "Nhân bản" trong trình sửa
// (ScenarioEditorSheet) và nút "Kịch bản mới" ở dải chip của LifetimeView. Trước bản
// này chỉ có chỗ thứ nhất, và đường vào nó chôn hai tầng; thêm chỗ thứ hai bằng cách
// chép lại thân hàm là cách hai bản bắt đầu trôi lệch nhau (một bên nhớ chép `note`
// của sự kiện, một bên quên — và không có gì trên màn hình cho thấy bản sao thiếu chữ).
//
// KHÔNG phải hàm thuần (nó ghi DB), nên KHÔNG nằm trong purity.test.ts. Nhưng cũng
// không có JSX: thứ nó biết là LƯỢC ĐỒ ba bảng, không phải cách vẽ nút.
import { repo } from '../../data'
import type { LifeEventRow, LifePhaseRow, LifeScenarioRow } from '../../types/database.types'

export interface DuplicateScenarioArgs {
  /** Kịch bản NGUỒN — đọc bản ĐÃ LƯU, không đọc ô đang sửa dở. */
  scenario: LifeScenarioRow
  /** Chặng/sự kiện của chính kịch bản nguồn (đã lọc theo `scenario_id`). */
  phases: LifePhaseRow[]
  events: LifeEventRow[]
  /**
   * Gọi NGAY sau khi dòng kịch bản mới vào DB, kể cả khi việc chép chặng/sự kiện sau
   * đó lỗi — chỗ gọi dùng nó để làm mới cache.
   *
   * Vì sao bắt buộc và vì sao ở đây chứ không để chỗ gọi tự nhớ: từ lúc `copy` tồn
   * tại, mọi đường ra — kể cả đường lỗi — đều để lại một bản sao (có thể dở dang)
   * trong DB. Cache chưa làm mới thì dải chip kịch bản KHÔNG có bản sao đó, trong khi
   * toast lỗi lại bảo người dùng "kiểm dải chip" — câu hướng dẫn chỉ vào một chỗ trống.
   */
  afterCreate: () => Promise<void>
}

/**
 * Trả về dòng kịch bản MỚI. Ném lỗi nếu bất kỳ lệnh ghi nào hỏng.
 *
 * Bản sao luôn `is_primary: false`: nhân bản là để THỬ một hướng khác, không phải để
 * đổi kịch bản chính (thứ mà thông báo và thẻ ở trang Tài sản đọc theo). Muốn đổi thì
 * có nút riêng trong trình sửa.
 *
 * Chặng/sự kiện chép SONG SONG (`Promise.all`) chứ không tuần tự: một kịch bản có thể
 * có vài chục dòng, và chúng độc lập nhau hoàn toàn — chỉ `copy.id` là phụ thuộc, mà
 * cái đó đã có trước vòng lặp. Lỗi giữa đường để lại bản sao THIẾU DÒNG; hàm này cố ý
 * KHÔNG tự dọn (xoá bản ghi thay người dùng nguy hiểm hơn là để lại một dòng thừa),
 * chỗ gọi phải nói ra bằng toast.
 */
export async function duplicateScenario({
  scenario,
  phases,
  events,
  afterCreate,
}: DuplicateScenarioArgs): Promise<LifeScenarioRow> {
  const copy = await repo.createLifeScenario({
    name: `${scenario.name} (bản sao)`,
    display_currency: scenario.display_currency,
    end_age: scenario.end_age,
    real_return_bps: scenario.real_return_bps,
    band_spread_bps: scenario.band_spread_bps,
    starting_assets_minor: scenario.starting_assets_minor,
    nominal_terms: scenario.nominal_terms,
    is_primary: false,
  })
  // `finally` chứ không phải cuối `try`: xem JSDoc `afterCreate`.
  try {
    await Promise.all([
      ...phases.map((p) =>
        repo.createLifePhase({
          scenario_id: copy.id,
          start_year: p.start_year,
          label: p.label,
          country: p.country,
          currency: p.currency,
          annual_income_minor: p.annual_income_minor,
          annual_expense_minor: p.annual_expense_minor,
          fx_to_display: p.fx_to_display,
        }),
      ),
      ...events.map((e) =>
        repo.createLifeEvent({
          scenario_id: copy.id,
          start_year: e.start_year,
          end_year: e.end_year,
          kind: e.kind,
          amount_minor: e.amount_minor,
          currency: e.currency,
          label: e.label,
          note: e.note,
          fx_to_display: e.fx_to_display,
          inflate: e.inflate,
        }),
      ),
    ])
  } finally {
    await afterCreate()
  }
  return copy
}
