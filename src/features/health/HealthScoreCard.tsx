// Thẻ đầu tab Sức khỏe: gộp 6 chỉ số thành MỘT con số + đồng hồ.
//
// Vì sao cần: trước đây tab này mở ra là 6 thẻ chỉ số, và câu hỏi đầu tiên của người
// dùng ("tình hình chung ổn không?") phải tự trả lời bằng cách đọc hết rồi tự cân.
// Ba ô đếm Tốt/Cần chú ý/Rủi ro bên dưới vẫn giữ — chúng nói cấu trúc của điểm, còn
// thẻ này nói kết luận.
//
// Thẻ KHÔNG tự tính gì: mọi phép tính ở health.ts để test được (health.test.ts).
import { ExplainBox } from '../../components/ExplainBox'
import { VerdictNote } from '../../components/VerdictNote'
import { VERDICT_LABELS, type HealthScore, type ScoreItem } from './health'
import { ScoreGauge } from './ScoreGauge'

interface Props {
  /** null = không chỉ số nào chấm được. */
  result: HealthScore | null
  /** Danh sách đã chấm, để nói ra trọng số và chỉ số nào đang thiếu. */
  items: ScoreItem[]
  /** Số tháng dữ liệu điểm đang dựa vào. */
  monthsCounted: number
}

const NOTE_TONE = { good: 'good', warn: 'warn', bad: 'bad', unknown: 'info' } as const

export function HealthScoreCard({ result, items, monthsCounted }: Props) {
  const weakestScore = result?.weakest?.score ?? null
  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
        Điểm sức khỏe tài chính
      </h2>

      {result === null ? (
        <p className="mt-2 text-xs leading-relaxed text-fg-secondary">
          Chưa chấm được chỉ số nào. Ghi thêm giao dịch và phân loại danh mục chi để mở điểm này.
        </p>
      ) : (
        <>
          <div className="mt-2">
            <ScoreGauge
              score={result.score}
              verdict={result.verdict}
              label={VERDICT_LABELS[result.verdict]}
            />
          </div>

          <div className="mt-3 space-y-1.5">
            <VerdictNote tone={NOTE_TONE[result.verdict]}>
              {result.verdict === 'good' && (
                <>
                  Nhìn chung ổn: <b>{result.score}/100</b> trên {monthsCounted} tháng gần nhất.{' '}
                  {/* Điểm tổng cao vẫn có thể che một chỉ số đang cháy — trung bình là
                      như vậy. Nói "giữ nguyên là đủ" trong trường hợp đó là nói sai. */}
                  {weakestScore !== null && weakestScore < 40
                    ? 'Nhưng có một chỗ lệch hẳn khỏi mức an toàn — xem dòng dưới.'
                    : 'Giữ nguyên nếp đang có là đủ.'}
                </>
              )}
              {result.verdict === 'warn' && (
                <>
                  Ở mức cần chú ý: <b>{result.score}/100</b>. Chưa có gì gấp, nhưng có chỗ đang mỏng —
                  xem chỉ số yếu nhất bên dưới.
                </>
              )}
              {result.verdict === 'bad' && (
                <>
                  Đang có rủi ro thật: <b>{result.score}/100</b>. Nên xử lý chỉ số yếu nhất trước khi
                  tính tới mục tiêu dài hạn.
                </>
              )}
            </VerdictNote>

            {result.weakest && weakestScore !== null && (
              <VerdictNote
                // Mức của dòng này theo chính chỉ số yếu nhất, KHÔNG theo điểm tổng:
                // nó tồn tại để nói ra cái mà trung bình đang làm mờ đi.
                tone={weakestScore >= 70 ? 'info' : weakestScore >= 40 ? 'warn' : 'bad'}
                label="Kéo điểm xuống nhiều nhất"
              >
                {result.weakest.label} — {Math.round(weakestScore)}/100.
              </VerdictNote>
            )}

            {/* Điểm chấm thiếu chỉ số thì phải NÓI RA, không thì một con số dựa trên 2/6
                chỉ số vẫn được đọc như kết luận đầy đủ. */}
            {result.counted < result.total && (
              <VerdictNote tone="info" label={`Chấm trên ${result.counted}/${result.total} chỉ số`}>
                Chưa tính được: {result.missing.join(', ')}.
              </VerdictNote>
            )}
          </div>
        </>
      )}

      <ExplainBox>
        <p>
          <b>Cách tính:</b> mỗi chỉ số được đổi thành điểm 0–100 theo đúng thang màu vẽ trên thẻ của
          nó (vùng đỏ 0–39, vàng 40–69, xanh 70–100), nội suy trong vùng — nên cải thiện 5,9 → 6,5
          tháng quỹ dự phòng là điểm nhích lên thật, không phải nhảy bậc. Điểm tổng là trung bình có
          trọng số:
        </p>
        <ul className="ml-4 list-disc space-y-0.5">
          {items.map((i) => (
            <li key={i.key}>
              {i.label} — {i.weight}%{i.score === null && ' (chưa tính được)'}
            </li>
          ))}
        </ul>
        <p>
          Chỉ số chưa đủ dữ liệu bị <b>loại khỏi cả tử và mẫu</b>, không tính 0 điểm: chưa phân loại
          danh mục là thiếu dữ liệu, không phải sức khỏe kém. Bù lại thẻ luôn ghi điểm đang chấm trên
          bao nhiêu chỉ số.
        </p>
        <p>
          <b>Đừng đọc quá:</b> đây là điểm nội bộ của app, không so được với ai. Việc của nó là cho
          thấy tháng này so với tháng trước mình đi lên hay đi xuống.
        </p>
      </ExplainBox>
    </section>
  )
}
