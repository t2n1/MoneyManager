// Băng kết luận của tab Tương lai (mục Lifetime, Task 9 — dựng lại theo mock turn 31).
//
// Trước bản này khối là một lưới 2×2 gồm bốn thẻ nền chìm, và người đọc phải tự ghép
// bốn con số rời thành một câu trả lời. Nay câu trả lời đứng SẴN ở dòng đầu, bốn con số
// tụt xuống thành bằng chứng cho chính câu đó — "kết luận trước, bằng chứng sau" (§14).
//
// Bốn con số vẫn là bốn câu hỏi mà cả tính năng Lifetime tồn tại để trả lời — xem
// docs/superpowers/specs/2026-07-29-lifetime-design.md mục "4 câu hỏi". CHỈ đọc kết quả
// từ insights.ts và summary.ts, KHÔNG tự tính lại bất cứ con số nào ở đây (những hàm đó
// đã có test riêng, một hàm còn được review bằng brute-force 2000 bộ để xác nhận dò nhị
// phân đúng — tính lại ở component là hai chỗ tính cùng một khái niệm, hai chỗ sẽ trôi
// lệch nhau theo thời gian).
import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import { ExplainBox } from '../../components/ExplainBox'
import { ConclusionLine } from '../../components/VerdictNote'
import { ActionButton, Card, Money, Num } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { formatMoney } from '../../lib/money'
import {
  DEFAULT_SWR_BPS,
  assetsAtAge,
  firstNegativeYear,
  minimumReturnBps,
} from './insights'
import { lifetimeVerdict } from './summary'
import type { LifetimeInput, YearRow } from './project'
import type { RealityCheck } from './realityCheck'
import { canOfferRetireTrial } from './tryRetire'

interface Props {
  rows: YearRow[]
  input: LifetimeInput
  birthYear: number
  currency: CurrencyCode
  /** Tên kịch bản đang xem — câu kết luận mở đầu bằng nó ("Với kịch bản Hiện tại, …"). */
  scenarioName: string
  /**
   * Mở Bảng theo năm ở đúng năm này. Chỉ hai ô mang một NĂM ("Nếu bi quan, âm từ" và
   * "Tự do tài chính") nhận được — hai ô kia là một số tiền và một tỷ lệ phần trăm,
   * không có năm nào để nhảy tới.
   *
   * Không truyền thì cả bốn ô đứng yên như cũ (`<div>` trơn, không phải nút).
   */
  onJumpToYear?: (year: number) => void
  /**
   * Kết luận của lớp phủ Stress test, nếu đang bật cú sốc nào. Đứng NGAY DƯỚI câu kết
   * luận chính vì nó nói về cùng một thứ — "tiền có đủ không" — chỉ với một giả định xấu
   * hơn. Để nó nằm mãi dưới cột phải (nơi bật cú sốc) thì hai câu trả lời cho cùng một
   * câu hỏi nằm cách nhau cả màn hình.
   */
  stressNote?: string | null
  /**
   * Dòng "Gợi ý: để dành thêm …" — con số DUY NHẤT trên màn mà người dùng hành động
   * được ngay. Mọi thứ khác nói "chuyện gì sẽ xảy ra", cái này nói "làm gì thì khác đi".
   */
  actionLine?: string | null
  /**
   * Kế hoạch vs sổ thật 12 tháng (realityCheck.ts). Câu kết luận phía trên tính trên KẾ
   * HOẠCH; dòng này nói kế hoạch đó xa số thật bao nhiêu và kết luận đổi thế nào nếu
   * chạy theo số thật. null hoặc `meaningful === false` thì không hiện.
   */
  reality?: RealityCheck | null
  /** Số tháng sổ thật đã dùng (1..12) — để câu nói đúng "N tháng qua", không nói bừa 12. */
  realityMonths?: number | null
  /**
   * Có thì hiện nút "Thử nghỉ việc từ <năm FIRE>" (tryRetire.ts). "Không bao giờ âm" ở
   * dải bốn số là câu trả lời dễ vì mô hình cho đi làm tới tuổi cuối — nút này mới hỏi
   * câu thật: nghỉ đúng năm FIRE thì tiền có đủ tới già không.
   */
  onTryRetire?: (year: number) => void
}

/**
 * Dòng "đời thật". Số tiền qua <Money> (chế độ riêng tư), số tháng/số năm qua <Num>;
 * NĂM là nhãn thời gian nên để chữ thường, cùng quy ước với câu kết luận phía trên.
 */
function RealityLine({ reality, months }: { reality: RealityCheck; months: number }) {
  const { fireYearPlan, fireYearReal, negativeYearReal } = reality
  let fireClause: ReactNode
  if (fireYearReal === null) {
    fireClause = 'không năm nào đủ để tự do tài chính'
  } else if (fireYearPlan === null) {
    fireClause = <>tự do tài chính {fireYearReal}, kế hoạch cũ không đạt</>
  } else if (fireYearReal === fireYearPlan) {
    fireClause = <>tự do tài chính vẫn {fireYearReal}</>
  } else {
    const diff = fireYearReal - fireYearPlan
    fireClause = (
      <>
        tự do tài chính {fireYearReal}, {diff > 0 ? 'muộn' : 'sớm'} <Num>{Math.abs(diff)}</Num> năm
      </>
    )
  }
  return (
    <p className="flex min-w-0 items-start gap-1.5 text-sm text-fg-warn">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        Kế hoạch để dành{' '}
        <Money amount={reality.planSavingMinor} currency={reality.currency} tone="neutral" />
        /năm ở chặng hiện tại, nhưng <Num>{months}</Num> tháng qua sổ ghi{' '}
        <Money amount={reality.realSavingMinor} currency={reality.currency} tone="bySign" />
        /năm. Chạy theo số thật: {fireClause}
        {negativeYearReal !== null && <>, nhánh bi quan âm từ {negativeYearReal}</>}.
      </span>
    </p>
  )
}

// Cỡ chữ viết bằng rem (không phải px) vì `--app-font-scale` (Cài đặt → Cỡ chữ) chỉ co
// giãn được những gì tính theo em/rem từ font-size gốc của <html> (xem index.css) —
// arbitrary theo px sẽ đứng yên khi người dùng phóng chữ. 1.375rem = 22px ở cỡ mặc định.
const VALUE_SIZE = 'text-kpi'

/**
 * Một ô trong dải bốn số — khuôn dùng chung cho cả bốn (brief Task 9 Step 1).
 *
 * Cảnh báo đỏ + icon (ràng buộc không-dựa-vào-màu-một-mình của dự án) áp theo HAI
 * nguồn, gộp lại thành một cờ `warn` DUY NHẤT chứ không lặp lại JSX icon/màu ở từng
 * chỗ gọi:
 * - `amountMinor`: giá trị TIỀN đang hiển thị ở `value` (nếu thẻ đó hiện tiền). Âm thì
 *   tự động cảnh báo — tính theo DẤU CỦA GIÁ TRỊ, không theo tên thẻ, nên thẻ tiền nào
 *   thêm sau này (nếu có) cũng tự đúng mà không cần sửa lại quy tắc ở đây.
 * - `alert`: cờ ép cảnh báo cho thẻ không phải tiền (vd. "nhánh xấu âm từ" hiện một
 *   NĂM, không phải một số tiền, nên không có dấu để tự suy — bản thân việc năm đó
 *   tồn tại đã là tin xấu).
 *
 * `good` là chiều NGƯỢC LẠI và cố ý KHÔNG tự suy: "Không bao giờ âm" và "Không cần"
 * đều là tin tốt nhưng chúng là CHỮ, không có dấu để đọc. Không có cờ này thì tin tốt
 * hiện y hệt một con số trung tính, trong khi tin xấu ngay cạnh nó thì đỏ chói — dải
 * bốn số đọc thành "ba ô bình thường, một ô hỏng" thay vì "ba tốt, một xấu".
 */
function InsightTile({
  label,
  value,
  amountMinor,
  alert,
  good,
  sub,
  onClick,
  actionLabel,
}: {
  label: string
  value: ReactNode
  /** Số tiền (minor units) đang hiển thị ở `value`, nếu `value` là một số tiền. */
  amountMinor?: number
  /** Ép cảnh báo cho ca không phải tiền (xem JSDoc trên). */
  alert?: boolean
  /** Ép chiều TỐT cho ca không phải tiền (xem JSDoc trên). Thua `warn` nếu cả hai bật. */
  good?: boolean
  sub?: string
  /** Có thì cả ô thành một nút — xem JSDoc `onJumpToYear` và khối bên dưới dải. */
  onClick?: () => void
  /** Bắt buộc khi có `onClick`: nội dung ô là số/chữ rời, screen reader đọc xong vẫn
   *  không biết bấm vào thì đi đâu. */
  actionLabel?: string
}) {
  const warn = alert === true || (amountMinor != null && amountMinor < 0)
  const body = (
    <>
      <p className="text-sm text-fg-secondary">{label}</p>
      <p
        className={`mt-0.5 flex items-center gap-1 ${VALUE_SIZE} font-medium tabular-nums ${
          warn ? 'text-money-out' : good ? 'text-money-in' : 'text-fg-primary'
        }`}
      >
        {warn && <AlertCircle className="h-[1.1em] w-[1.1em] shrink-0" />}
        <span className="truncate">{value}</span>
      </p>
      {sub && <p className="mt-0.5 truncate text-2xs text-fg-muted">{sub}</p>}
    </>
  )
  // Ô KHÔNG có `onClick` giữ nguyên `<div>`: bọc tất cả vào <button> thì hai ô không
  // dẫn đi đâu vẫn nhận focus bàn phím và vẫn được screen reader đọc là "nút", tức
  // hứa một hành động không tồn tại.
  //
  // Không dùng <ActionButton>: dáng của nó là một nút có viền/nền, còn ô ở đây phải
  // giữ nguyên diện mạo bảng số (mock turn 31 — bốn con số ngăn bằng vạch dọc, không
  // phải bốn cái nút). Chỉ thêm phản hồi hover, và focus ring thì index.css đã lo
  // toàn cục cho <button>.
  if (!onClick) {
    return <div className="min-w-0 sm:px-4 sm:first:pl-0 sm:last:pr-0">{body}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={actionLabel}
      className="min-w-0 rounded-md text-left transition hover:bg-surface-sunken sm:px-4 sm:first:pl-0 sm:last:pr-0"
    >
      {body}
    </button>
  )
}

/**
 * Câu kết luận + bốn con số đỡ nó.
 *
 * Câu đi qua `<ConclusionLine>` chứ không viết tay: §5.0/R7 xếp câu kết luận đầu màn
 * vào loại DỮ LIỆU (giữ ở cả hai chế độ trình bày, chỉ được rút gọn chữ), khác với chữ
 * để dạy — và `ConclusionLine` là chỗ duy nhất trong app cài đúng luật đó. Viết tay ở
 * đây thì ở chế độ Gọn màn này sẽ là màn duy nhất không rút gọn theo.
 */
export function InsightCards({
  rows,
  input,
  birthYear,
  currency,
  scenarioName,
  onJumpToYear,
  stressNote = null,
  actionLine = null,
  reality = null,
  realityMonths = null,
  onTryRetire,
}: Props) {
  // 'low' = biên DƯỚI của dải dao động — đáng lo hơn nhánh trung tâm, xem JSDoc
  // `firstNegativeYear` trong insights.ts (cùng lý do LifetimeChartCard tô đỏ theo biên
  // này chứ không phải theo nhánh trung tâm).
  const negativeYear = firstNegativeYear(rows, 'low')
  const minReturn = minimumReturnBps(input)
  const atEndAge = assetsAtAge(rows, input.endAge)
  const verdict = lifetimeVerdict(rows, birthYear)

  // Vế thứ hai của câu kết luận, dùng chung cho cả ba nhánh tone: dù tiền có đủ hay
  // không thì "bao giờ không cần đi làm nữa" vẫn là câu hỏi người dùng mang tới màn này.
  const fireClause =
    verdict.fireYear !== null ? (
      <>
        {' '}
        Tự do tài chính năm {verdict.fireYear}, tuổi {verdict.fireAge}.
      </>
    ) : (
      <> Không năm nào đủ để tự do tài chính.</>
    )
  const fireShort =
    verdict.fireYear !== null ? `FIRE ${verdict.fireYear}` : 'chưa đạt tự do tài chính'

  const showReality = reality !== null && reality.meaningful
  // Luật mời nằm ở tryRetire.ts (FIRE còn ở tương lai, chưa có chặng năm đó) — không
  // chép lại đây để nút và mẫu không trôi lệch nhau.
  const retireYear = onTryRetire && canOfferRetireTrial(input, verdict.fireYear) ? verdict.fireYear : null

  return (
    <Card as="section">
      <ConclusionLine
        tone={verdict.tone}
        short={
          verdict.negativeYear !== null
            ? `Cạn tiền ${verdict.negativeYear} · ${fireShort}`
            : `Đủ tới hết đời · ${fireShort}`
        }
      >
        Với kịch bản {scenarioName},{' '}
        {verdict.negativeYear !== null ? (
          <>
            nhánh bi quan <span className="text-money-out">cạn tiền năm {verdict.negativeYear}</span>
            , tuổi {verdict.negativeAge}.
          </>
        ) : (
          <>
            tiền <span className="text-money-in">đủ tới hết đời</span> — kể cả nhánh bi quan.
          </>
        )}
        {fireClause}
      </ConclusionLine>

      {stressNote && (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-fg-warn">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {stressNote}
        </p>
      )}
      {actionLine && <p className="mt-1.5 text-sm font-medium text-fg-accent">{actionLine}</p>}

      {/* Dòng "đời thật" và nút thử nghỉ việc đứng CÙNG HÀNG, ngay dưới các câu phụ: cả
          hai đều là "kết luận trên còn thiếu gì" — một cái nói kế hoạch xa sổ, một cái
          hỏi tiếp câu mà mốc FIRE chưa trả lời. */}
      {(showReality || retireYear !== null) && (
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          {showReality && <RealityLine reality={reality} months={realityMonths ?? 12} />}
          {retireYear !== null && (
            <ActionButton className="shrink-0" onClick={() => onTryRetire?.(retireYear)}>
              Thử nghỉ việc từ {retireYear}
            </ActionButton>
          )}
        </div>
      )}

      {/* Dưới `sm`: lưới 2×2 có khoảng cách, không kẻ vạch — bốn vạch dọc trên một cột
          hẹp chia màn thành những mảnh 80px. Từ `sm`: một hàng bốn ô ngăn bằng vạch,
          đúng mock. `divide-x` chỉ đúng khi cả bốn ô là anh em TRÊN CÙNG MỘT HÀNG, nên
          nó bật cùng lúc với `sm:grid-cols-4` chứ không sớm hơn. */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-border-subtle">
        <InsightTile
          // "Bi quan" — dùng ĐÚNG từ mà bảng theo năm (cột "Bi quan") và khối "Cách đọc"
          // bên dưới dùng, không gọi cùng một thứ bằng "nhánh xấu" ở đây và "bi quan" ở kia.
          label="Nếu bi quan, âm từ"
          // Giá trị là một NĂM (không phải tiền) nên không có dấu để tự suy — ép chiều
          // bằng `alert`/`good`, xem JSDoc InsightTile.
          alert={negativeYear !== null}
          good={negativeYear === null}
          value={negativeYear !== null ? `Năm ${negativeYear}` : 'Không bao giờ âm'}
          sub={negativeYear !== null ? `tuổi ${negativeYear - birthYear}` : undefined}
          // Chỉ bấm được khi CÓ năm để nhảy tới. "Không bao giờ âm" là tin tốt, không
          // phải một mốc trên bảng — bấm vào thì không có dòng nào để mở.
          onClick={
            negativeYear !== null && onJumpToYear ? () => onJumpToYear(negativeYear) : undefined
          }
          actionLabel={
            negativeYear !== null ? `Xem năm ${negativeYear} trong bảng theo năm` : undefined
          }
        />

        <InsightTile
          label="Lợi suất tối thiểu"
          // null nghĩa là đã dò tới 10% (biên trên của khoảng dò trong minimumReturnBps)
          // mà vẫn không đủ — hiện "10%" ở đây sẽ nói dối rằng 10% là đáp án, nên PHẢI
          // đổi hẳn sang câu chữ, không được rơi về một con số mặc định nào (brief).
          // 0 cũng đổi sang câu chữ: "0%" đọc như lỗi hiển thị trong khi nó là TIN TỐT
          // (thu chi tự đủ, không cần đầu tư sinh lời). `minReturn / 100` không toFixed:
          // bps là số nguyên nên chia 100 tối đa 2 chữ số lẻ, và "2%" đọc sạch hơn "2.00%".
          value={
            minReturn === null
              ? 'Không đủ dù lợi suất cao'
              : minReturn === 0
                ? 'Không cần'
                : `${minReturn / 100}%`
          }
          alert={minReturn === null}
          good={minReturn === 0}
          sub={
            minReturn === null
              ? undefined
              : minReturn === 0
                ? 'thu chi tự đủ, không năm nào âm'
                : 'để không năm nào âm'
          }
        />

        <InsightTile
          label={`Lúc ${input.endAge} tuổi`}
          value={atEndAge !== null ? formatMoney(atEndAge.center, currency) : 'Chưa có dữ liệu'}
          // Tô đỏ theo dấu của NHÁNH TRUNG TÂM (`center`) — đúng cái đang hiện ở `value`.
          // CỐ Ý không đọc dấu của `low` (biên dưới của dải, hiện ở `sub`): trung tâm
          // dương mà biên dưới âm nghĩa là "có thể âm ở nhánh xấu", không phải "đang âm"
          // — hai tin khác nhau, tô đỏ cả thẻ lúc đó sẽ nói quá tay. Dòng phụ luôn giữ
          // màu trung tính (xem InsightTile), không tự đỏ theo `low`.
          amountMinor={atEndAge?.center}
          // "từ X đến Y" thay vì nối bằng dấu gạch — khi CẢ HAI đầu dải đều âm, chuỗi
          // dạng "-¥8.137.758.694 – -¥2.954.848.430" có ba ký tự trông như dấu trừ liền
          // nhau, và en-dash với hyphen gần như không phân biệt được ở cỡ chữ 11px. Viết
          // thành câu thì không còn phụ thuộc vào việc mắt phân biệt được hai loại dấu
          // gạch hay không (review Task 9, mục Important).
          sub={
            atEndAge !== null
              ? `từ ${formatMoney(atEndAge.low, currency)} đến ${formatMoney(atEndAge.high, currency)}`
              : undefined
          }
        />

        <InsightTile
          label="Tự do tài chính"
          value={verdict.fireYear !== null ? `${verdict.fireYear}` : 'Không đạt'}
          good={verdict.fireYear !== null}
          // Đọc thẳng DEFAULT_SWR_BPS thay vì gõ cứng "4%" — `lifetimeVerdict` gọi
          // `fireYear` với swrBps mặc định (không truyền override), nên câu chữ phải khớp
          // đúng con số đó. Gõ cứng "4%" là chính hai chỗ tính trôi lệch nhau nếu default
          // đổi sau này.
          sub={
            verdict.fireYear !== null
              ? `tuổi ${verdict.fireAge} · quy tắc ${DEFAULT_SWR_BPS / 100}%`
              : 'trong bản chiếu này'
          }
          onClick={
            verdict.fireYear !== null && onJumpToYear
              ? () => onJumpToYear(verdict.fireYear as number)
              : undefined
          }
          actionLabel={
            verdict.fireYear !== null
              ? `Xem năm ${verdict.fireYear} trong bảng theo năm`
              : undefined
          }
        />
      </div>

      {/* Khối "cách đọc" gấp mở — cùng khuôn ExplainBox của các thẻ báo cáo. Lời giải
          thích cho từ chuyên ngành ("bi quan", "quy tắc 4%"…) nằm ở MỘT nút duy nhất
          dưới dải thay vì rải icon vào từng ô; trong tile, sub bị `truncate` nên không
          nhét giải thích vào đó được.
          Luật này KHÔNG đổi khi hai ô mang năm trở thành nút (`onJumpToYear`): nút đó
          mở Bảng theo năm ở đúng năm ấy — một đường ĐI TIẾP, không phải một lời giải
          thích thứ hai chen vào ô. Hai ô còn lại (một số tiền, một tỷ lệ) vẫn là <div>
          trơn, xem JSDoc InsightTile. */}
      <ExplainBox label="Cách đọc 4 ô này">
        <p>
          <b>Nếu bi quan, âm từ</b> — năm đầu tiên tài sản xuống dưới 0 nếu mọi thứ diễn ra
          theo mép dưới của dải dao động trên đồ thị (hướng xấu). "Không bao giờ âm" là tin
          tốt.
        </p>
        <p>
          <b>Lợi suất tối thiểu</b> — tiền đầu tư cần sinh lời ít nhất bao nhiêu mỗi năm để
          không năm nào bị âm.
        </p>
        <p>
          <b>Lúc {input.endAge} tuổi</b> — tài sản ròng dự kiến ở tuổi cuối của kịch bản;
          dòng nhỏ bên dưới là khoảng từ hướng xấu (bi quan) đến hướng tốt (lạc quan).
        </p>
        <p>
          <b>Tự do tài chính</b> — năm đầu tiên mà chỉ cần rút {DEFAULT_SWR_BPS / 100}% tài
          sản mỗi năm là đủ chi tiêu (giới tài chính gọi là "quy tắc {DEFAULT_SWR_BPS / 100}%"),
          tức về lý thuyết không cần đi làm nữa cũng đủ sống.
        </p>
      </ExplainBox>
    </Card>
  )
}
