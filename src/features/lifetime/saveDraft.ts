// Ghi bản nháp xuống DB. KHÔNG thuần (gọi repo), nhưng cũng KHÔNG có JSX — thứ nó biết
// là lược đồ ba bảng Lifetime, không phải cách vẽ nút. Cùng khuôn với `duplicate.ts`.
//
// Phần QUYẾT ĐỊNH (ghi cột nào, thêm dòng nào, xoá dòng nào) nằm ở `planDraftSave` /
// `draftRowsFor` trong draft.ts — hàm thuần có phép thử. Ở đây chỉ còn việc chạy danh
// sách lệnh đó. Chia như vậy vì ca khó của tính năng này là ca DỮ LIỆU ("mốc vừa thêm
// rồi xoá ngay", "chặng do mẫu sinh ra"), không phải ca mạng.
import { repo } from '../../data'
import type { LifeScenarioRow } from '../../types/database.types'
import { draftRowsFor, planDraftSave, savePlanIsEmpty, type ScenarioDraft } from './draft'

export interface CommitDraftArgs {
  saved: ScenarioDraft
  draft: ScenarioDraft
  /**
   * Gọi sau khi ĐÃ chạy xong (hoặc dừng vì lỗi) — chỗ gọi dùng để làm mới cache.
   *
   * Bắt buộc và nằm trong `finally` vì lệnh ghi chạy song song: một lệnh hỏng giữa
   * chừng vẫn để lại những lệnh đã thành công trong DB. Cache chưa làm mới thì màn hình
   * hiện một trạng thái không còn tồn tại, và người dùng bấm Lưu lần nữa trên một bản
   * nháp đã áp một nửa.
   */
  afterWrite: () => Promise<void>
}

/** Ghi bản nháp đè lên chính kịch bản của nó. Ném lỗi nếu bất kỳ lệnh ghi nào hỏng. */
export async function commitDraft({ saved, draft, afterWrite }: CommitDraftArgs): Promise<void> {
  const plan = planDraftSave(saved, draft)
  if (savePlanIsEmpty(plan)) return
  try {
    // Kịch bản trước, SONG SONG với phần còn lại là được: `end_age`/`real_return_bps`
    // nằm trên dòng kịch bản, không có dòng chặng/mốc nào phụ thuộc chúng.
    await Promise.all([
      ...(plan.scenarioPatch
        ? [repo.updateLifeScenario(draft.scenarioId, plan.scenarioPatch)]
        : []),
      ...plan.phasePatches.map((p) => repo.updateLifePhase(p.id, p.patch)),
      ...plan.phaseInserts.map((p) => repo.createLifePhase(p)),
      ...plan.phaseDeletes.map((id) => repo.deleteLifePhase(id)),
      ...plan.eventPatches.map((e) => repo.updateLifeEvent(e.id, e.patch)),
      ...plan.eventInserts.map((e) => repo.createLifeEvent(e)),
      ...plan.eventDeletes.map((id) => repo.deleteLifeEvent(id)),
    ])
  } finally {
    await afterWrite()
  }
}

export interface SaveDraftAsNewArgs {
  draft: ScenarioDraft
  /** Kịch bản NGUỒN — lấy những trường mà bản nháp không mang (tên, tiền, tài sản đầu). */
  source: LifeScenarioRow
  name: string
  afterCreate: () => Promise<void>
}

/**
 * Tạo một kịch bản MỚI mang đúng nội dung bản nháp, để nguyên bản gốc.
 *
 * Đây là đường ra quan trọng nhất của cả tính năng vặn thử: phần lớn lượt vặn là để SO
 * ("về VN thì sao"), và bắt người dùng chọn giữa "ghi đè kịch bản đang có" với "mất hết
 * những gì vừa vặn" là ép họ hy sinh một trong hai câu trả lời.
 *
 * Bản mới luôn `is_primary: false` — cùng luật với `duplicateScenario`: một bản thử
 * không được âm thầm trở thành kịch bản mà thông báo và trang Tài sản đọc theo.
 */
export async function saveDraftAsNewScenario({
  draft,
  source,
  name,
  afterCreate,
}: SaveDraftAsNewArgs): Promise<LifeScenarioRow> {
  const copy = await repo.createLifeScenario({
    // `name` là THAM SỐ chứ không phải `draft.name`: chỗ gọi đặt tên riêng cho bản thử
    // ("… (thử)"), và trùng tên với bản gốc thì dải chip có hai chip không phân biệt được.
    name,
    // Mọi giá trị còn lại lấy từ BẢN NHÁP — nháp nay mang trọn kịch bản (xem JSDoc
    // `ScenarioDraft`), nên lấy từ `source` là bỏ đúng những gì người dùng vừa vặn.
    display_currency: draft.displayCurrency,
    end_age: draft.endAge,
    real_return_bps: draft.realReturnBps,
    band_spread_bps: draft.bandSpreadBps,
    starting_assets_minor: draft.startingAssetsMinor,
    // `nominal_terms` KHÔNG thuộc nháp: nó là cách ĐỌC đồ thị (giá hôm nay / danh
    // nghĩa), người dùng vặn nó ở panel Giả định và nó không đổi dữ liệu kịch bản.
    nominal_terms: source.nominal_terms,
    is_primary: false,
  })
  const rows = draftRowsFor(draft, copy.id)
  // `finally` chứ không cuối `try`: từ lúc `copy` tồn tại, mọi đường ra — kể cả đường
  // lỗi — đều để lại một kịch bản (có thể dở dang) trong DB, và dải chip phải hiện nó
  // ra để người dùng sửa hoặc xoá. Xem JSDoc `afterCreate` của `duplicateScenario`.
  try {
    await Promise.all([
      ...rows.phases.map((p) => repo.createLifePhase(p)),
      ...rows.events.map((e) => repo.createLifeEvent(e)),
    ])
  } finally {
    await afterCreate()
  }
  return copy
}
