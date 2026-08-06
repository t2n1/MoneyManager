// Lưới 2×2 thẻ kết luận (mục Lifetime, Task 9). Bốn thẻ này đúng là bốn câu hỏi mà cả
// tính năng Lifetime tồn tại để trả lời — xem docs/superpowers/specs/2026-07-29-lifetime-design.md
// mục "4 câu hỏi". CHỈ đọc kết quả từ insights.ts, KHÔNG tự tính lại bất cứ con số nào ở
// đây (bốn hàm đó đã có test riêng, một hàm còn được review bằng brute-force 2000 bộ để
// xác nhận dò nhị phân đúng — tính lại ở component là hai chỗ tính cùng một khái niệm,
// hai chỗ sẽ trôi lệch nhau theo thời gian).
import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { ExplainBox } from '../../components/ExplainBox'
import type { CurrencyCode } from '../../lib/currencies'
import { formatMoney } from '../../lib/money'
import {
  DEFAULT_SWR_BPS,
  assetsAtAge,
  fireYear,
  firstNegativeYear,
  minimumReturnBps,
} from './insights'
import type { LifetimeInput, YearRow } from './project'

interface Props {
  rows: YearRow[]
  input: LifetimeInput
  birthYear: number
  currency: CurrencyCode
}

// Cỡ chữ viết bằng rem (không phải px) vì `--app-font-scale` (Cài đặt → Cỡ chữ) chỉ co
// giãn được những gì tính theo em/rem từ font-size gốc của <html> (xem index.css) —
// arbitrary theo px sẽ đứng yên khi người dùng phóng chữ. 1.375rem = 22px, 0.6875rem =
// 11px ở cỡ mặc định (khớp quy ước sẵn có của `NetCashflowCard.tsx` dùng
// `text-2xs` cho 11px).
const VALUE_SIZE = 'text-[1.375rem]'
const SUB_SIZE = 'text-2xs'

/**
 * Một ô trong lưới — khuôn dùng chung cho cả bốn thẻ (brief Task 9 Step 1).
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
 */
function InsightTile({
  label,
  value,
  amountMinor,
  alert,
  sub,
}: {
  label: string
  value: ReactNode
  /** Số tiền (minor units) đang hiển thị ở `value`, nếu `value` là một số tiền. */
  amountMinor?: number
  /** Ép cảnh báo cho ca không phải tiền (xem JSDoc trên). */
  alert?: boolean
  sub?: string
}) {
  const warn = alert === true || (amountMinor != null && amountMinor < 0)
  return (
    <div className="min-w-0 rounded-lg bg-gray-50 dark:bg-gray-800 p-2.5">
      <p className="text-xs text-fg-secondary">{label}</p>
      <p
        className={`mt-0.5 flex items-center gap-1 ${VALUE_SIZE} font-medium tabular-nums ${
          warn ? 'text-money-out' : 'text-fg-primary'
        }`}
      >
        {warn && <AlertCircle className="h-[1.1em] w-[1.1em] shrink-0" />}
        <span className="truncate">{value}</span>
      </p>
      {sub && (
        <p className={`mt-0.5 truncate ${SUB_SIZE} text-fg-muted`}>{sub}</p>
      )}
    </div>
  )
}

/**
 * Bốn thẻ kết luận của Lifetime — mỗi thẻ trả lời đúng một câu hỏi người dùng hay hỏi
 * nhất khi nhìn đồ thị: "xấu nhất thì bao giờ cạn tiền", "cần lợi suất bao nhiêu để an
 * toàn", "lúc về hưu còn bao nhiêu", "bao giờ tự do tài chính". Không thẻ nào có nút bấm
 * — đây là bảng tóm tắt để đọc, sửa số liệu thuộc `ScenarioEditorSheet` (Task 11).
 */
export function InsightCards({ rows, input, birthYear, currency }: Props) {
  // 'low' = biên DƯỚI của dải dao động — đáng lo hơn nhánh trung tâm, xem JSDoc
  // `firstNegativeYear` trong insights.ts (cùng lý do LifetimeChartCard tô đỏ theo biên
  // này chứ không phải theo nhánh trung tâm).
  const negativeYear = firstNegativeYear(rows, 'low')
  const minReturn = minimumReturnBps(input)
  const atEndAge = assetsAtAge(rows, input.endAge)
  const fire = fireYear(rows)

  return (
    <>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <InsightTile
        // "Bi quan" — dùng ĐÚNG từ mà bảng theo năm (cột "Bi quan") và khối "Cách đọc"
        // bên dưới dùng, không gọi cùng một thứ bằng "nhánh xấu" ở đây và "bi quan" ở kia.
        label="Nếu bi quan, âm từ"
        // Giá trị là một NĂM (không phải tiền) nên không có dấu để tự suy — ép cảnh
        // báo bằng `alert`, xem JSDoc InsightTile.
        alert={negativeYear !== null}
        value={negativeYear !== null ? `Năm ${negativeYear}` : 'Không bao giờ âm'}
        sub={negativeYear !== null ? `tuổi ${negativeYear - birthYear}` : undefined}
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
        value={fire !== null ? `Năm ${fire}` : 'Không đạt trong bản chiếu'}
        // Đọc thẳng DEFAULT_SWR_BPS thay vì gõ cứng "4%" — fireYear ở trên gọi hàm với
        // swrBps mặc định (không truyền override), nên câu chữ phải khớp đúng con số đó.
        // Gõ cứng "4%" là chính hai chỗ tính trôi lệch nhau nếu default đổi sau này.
        sub={
          fire !== null ? `tuổi ${fire - birthYear} · quy tắc ${DEFAULT_SWR_BPS / 100}%` : undefined
        }
      />
    </div>

    {/* Khối "cách đọc" gấp mở — cùng khuôn ExplainBox của các thẻ báo cáo. Bốn ô trên
        cố ý không có nút bấm (bảng tóm tắt để đọc), nên lời giải thích cho từ chuyên
        ngành ("bi quan", "quy tắc 4%"…) nằm ở một nút duy nhất dưới lưới thay vì rải
        icon vào từng ô. Trong tile, sub bị `truncate` nên KHÔNG nhét giải thích vào đó. */}
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
    </>
  )
}
