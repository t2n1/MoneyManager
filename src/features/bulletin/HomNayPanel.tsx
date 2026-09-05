// Khối "Hôm nay" — khối MỞ ĐẦU của Bản tin (bản vẽ "Ban tin - redesign", 2026-09-05).
// Tiền thân là PaydayStrip ("Tới ngày lương", §4.9): vẫn đúng bộ số đó, nhưng từ MỘT CÂU
// nó thành MỘT KHỐI trả lời trọn "hôm nay tiêu được bao nhiêu" — con số /ngày là chữ lớn
// nhất màn (text-hero), câu giải thích mang nhịp hiện tại, và hai thanh cùng trục để mắt
// so được "thời gian đã qua" với "hạn mức đã dùng" mà không phải nhẩm.
//
// Câu kết luận của cả màn (ConclusionLine) cũng dọn vào góc phải khối này — bản vẽ đặt nó
// ở đó để kết luận tháng và kết luận hôm nay đọc trong một tầm mắt. Nó vẫn là
// <ConclusionLine> (§5.0 / R7): giữ nguyên ở cả hai chế độ Gọn/Đầy đủ, không đi qua
// VerdictNote.
//
// Câu chữ bám §14, giữ nguyên từ PaydayStrip:
//   • con số là "còn trong HẠN MỨC", không phải lương trừ chi. Xem khối định nghĩa
//     `conLai` trong bulletin.ts — đó là chỗ ghi vì sao bản đầu sai.
//   • kết luận trước, bằng chứng sau (câu nhịp + hai thanh là bằng chứng).
//   • không phán xét: nêu nhịp hiện tại để người đọc TỰ thấy nó vượt mức chia đều.
//
// MÀU: đúng MỘT số được tô, tô theo TÌNH TRẠNG chứ không theo chiều tiền — đúng nhịp →
// `good`, sắp hụt → `warn`, vượt trần → `out`. KHÔNG dùng `in` cho mức mỗi ngày dù cũng
// ra màu xanh: `in`/`out` nghĩa là THU/CHI, mà mức tiêu cho phép không phải khoản thu.
import { Link } from 'react-router-dom'
import { Card, Money, Num } from '../../components/ui'
import { ConclusionLine } from '../../components/VerdictNote'
import type { Headline } from '../reports/headline'
import { dayMonthLabel, dueDateLabel } from '../../lib/dates'
import type { ToiNgayLuong } from './bulletin'
import type { CurrencyCode } from '../../lib/money'

interface Props {
  data: ToiNgayLuong
  base: CurrencyCode
  /** Có ngoại tệ chưa quy đổi được → số là xấp xỉ. `BudgetReport.hasMissingRate`. */
  approx?: boolean
  /**
   * `profile.month_start_day` — vào đây để đặt TÊN cho cái mốc, không tham gia phép tính
   * nào. Xem `moc` trong thân hàm.
   */
  monthStartDay: number
  /** Hôm nay + hai mốc kỳ, cho dòng eyebrow "Hôm nay · T7, 9/5 · kỳ 8/25 → 9/25". */
  todayISO: string
  kyBatDauISO: string
  ngayLuongISO: string
  /** Đã tiêu / tổng hạn mức của kỳ — thanh "Hạn mức". `BudgetReport.totalSpent/totalBudgeted`. */
  daTieu: number
  hanMuc: number
  /** Câu kết luận của cả màn — null khi kỳ chưa có gì để nói. */
  headline: Headline | null
}

export function HomNayPanel({
  data,
  base,
  approx = false,
  monthStartDay,
  todayISO,
  kyBatDauISO,
  ngayLuongISO,
  daTieu,
  hanMuc,
  headline,
}: Props) {
  const {
    soNgay,
    conLai,
    camKet,
    moiNgay,
    nhipHienTai,
    hutTruocLuong,
    canTruocLuong,
    ngayDaQua,
    tongNgay,
    chuaDatHanMuc,
  } = data

  // Số trong câu: mono + đậm, nổi lên khỏi nền câu fg-secondary. Màu CHỈ đi qua `tone`
  // (`neutral` đã là fg-primary) — truyền thêm một class màu qua `className` là hai
  // utility cùng hạng đấu nhau và thứ tự trong CSS build ra mới quyết định ai thắng.
  // Chú thích trong Money.tsx ghi rõ, và tôi đã dẫm đúng vào đó ở bản nháp của file này.
  const so = (amount: number, tone: 'neutral' | 'out' | 'good' | 'warn' = 'neutral') => (
    <Money amount={amount} currency={base} tone={tone} approx={approx} className="font-semibold" />
  )

  // TÊN của mốc — một chỗ cho mọi nhánh câu, vì các nhánh tự gọi tên là từng ấy chỗ để
  // sót một cái lúc sửa.
  //
  // Mốc là `getMonthRange().end`, tức đầu kỳ sau, và app cố tình KHÔNG có trường "ngày
  // lương" riêng (khối chú thích trong bulletin.ts ghi vì sao): nó giả định người dùng đặt
  // "Tháng bắt đầu ngày" = ngày lương của họ. Giả định đó chỉ có căn cứ khi họ ĐÃ tự đặt
  // ngày. Để mặc định 1 thì mốc trùng đúng đầu tháng lịch — app không biết gì về lương của
  // họ, nên gọi mốc đó là "ngày lương" là hứa một thứ chưa biết. §14 "chưa biết ≠ 0" đọc cả
  // cho câu chữ, không riêng con số.
  const moc = monthStartDay === 1 ? 'cuối tháng' : 'ngày lương'

  // Dòng eyebrow: mốc thời gian của khối, cùng khuôn nhãn 11px hoa của các ô KPI.
  // Kỳ trùng tháng lịch (monthStartDay = 1) thì không bắt người đọc học chữ "kỳ".
  const eyebrow = (
    <p className="text-2xs uppercase tracking-label text-fg-muted">
      Hôm nay · {dueDateLabel(todayISO)}
      {monthStartDay !== 1 && (
        <> · kỳ {dayMonthLabel(kyBatDauISO)} → {dayMonthLabel(ngayLuongISO)}</>
      )}
    </p>
  )

  // Hai thanh CÙNG TRỤC: trên là thời gian đã qua, dưới là hạn mức đã dùng, và vạch dọc
  // trên thanh dưới đánh dấu đúng vị trí của thanh trên — lệch nhau bao xa là mắt thấy
  // ngay, không cần nhẩm hai phân số. Hình là bằng chứng, con số thật đứng cạnh từng
  // thanh nên cả hàng không cần vai trò ảnh.
  const timePct = tongNgay > 0 ? Math.min((ngayDaQua / tongNgay) * 100, 100) : 0
  const spentPct = hanMuc > 0 ? Math.min((daTieu / hanMuc) * 100, 100) : 0
  const spentBar = conLai < 0 ? 'bg-money-out' : hutTruocLuong ? 'bg-fg-warn' : 'bg-money-in'
  const bars = !chuaDatHanMuc && (
    <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 font-mono text-2xs text-fg-muted">
      <span>Thời gian</span>
      <span className="relative h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-border-strong"
          style={{ width: `${timePct}%` }}
          aria-hidden
        />
      </span>
      <Num tone="neutral">
        {ngayDaQua} / {tongNgay} ngày
      </Num>
      <span>Hạn mức</span>
      <span className="relative h-1.5 rounded-full bg-surface-sunken">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${spentBar}`}
          style={{ width: `${spentPct}%` }}
          aria-hidden
        />
        {/* Vạch mốc thời gian — nhô ra hai đầu 2px để không lẫn vào thanh màu. */}
        <span
          className="absolute -inset-y-0.5 w-px bg-fg-primary"
          style={{ left: `${timePct}%` }}
          aria-hidden
        />
      </span>
      <span>
        <Money amount={daTieu} currency={base} approx={approx} compact /> /{' '}
        <Money amount={hanMuc} currency={base} approx={approx} compact />
      </span>
    </div>
  )

  return (
    <Card elevation="panel" padding="panel" as="section">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {eyebrow}
        {headline && (
          <ConclusionLine tone={headline.tone} short={headline.short}>
            {headline.text}
          </ConclusionLine>
        )}
      </div>

      {chuaDatHanMuc ? (
        // Chưa đặt hạn mức: không có trần thì không có "còn lại". §14 "chưa biết ≠ 0" —
        // nói thẳng là chưa biết, và đưa đúng MỘT lối ra. Số ngày vẫn giữ: đó là phần
        // duy nhất biết chắc mà không cần hạn mức nào.
        <p className="mt-2.5 text-sm text-fg-secondary">
          Còn <span className="font-semibold text-fg-primary">{soNgay} ngày</span> tới {moc} —
          chưa đặt hạn mức nên chưa nói được mỗi ngày còn tiêu được bao nhiêu.{' '}
          <Link to="/budget" className="font-medium text-fg-accent hover:underline">
            Đặt hạn mức
          </Link>
        </p>
      ) : conLai < 0 ? (
        // Vượt trần: không có "mỗi ngày" để nói (chia số âm ra là vô nghĩa), nên kết luận
        // đổi thành chính phần vượt. Trị tuyệt đối — chữ "đã vượt" đã mang dấu rồi, in
        // thêm '-' là nói hai lần và đọc thành "vượt âm sáu nghìn".
        <>
          <p className="mt-2.5 font-mono text-hero font-medium tracking-number">
            <Money amount={Math.abs(conLai)} currency={base} tone="out" approx={approx} />
          </p>
          <p className="mt-2 max-w-[32.5rem] text-sm text-fg-secondary">
            Đã vượt hạn mức kỳ này — còn{' '}
            <span className="font-semibold text-fg-primary">{soNgay} ngày</span> nữa mới tới{' '}
            {moc}.
          </p>
          {bars}
        </>
      ) : moiNgay === null ? (
        // Không còn gì để chia. Có cam kết thì nói rõ vì sao: "còn ¥12,000 trong trần mà
        // ¥18,600 đã hứa" là tin quan trọng nhất tháng (B36.2), giấu vế sau đi thì con số
        // đầu câu đọc như vẫn ổn.
        <>
          <p className="mt-2.5 text-sm text-fg-secondary">
            {camKet > 0 ? (
              <>
                Hạn mức còn {so(conLai)} tới {moc} nhưng {so(camKet, 'warn')} đã cam kết — còn{' '}
                <span className="font-semibold text-fg-primary">{soNgay} ngày</span>.
              </>
            ) : (
              <>
                Hạn mức còn {so(conLai)} tới {moc} — còn{' '}
                <span className="font-semibold text-fg-primary">{soNgay} ngày</span>.
              </>
            )}
          </p>
          {bars}
        </>
      ) : (
        <>
          {/* Màu của con số này LÀ lời cảnh báo: hổ phách khi giữ nhịp hiện tại sẽ hụt,
              xanh khi còn đúng nhịp — cùng token `--fg-warn` mà VerdictNote dùng. */}
          <p className="mt-2.5 font-mono text-hero font-medium tracking-number">
            <Money
              amount={moiNgay}
              currency={base}
              tone={hutTruocLuong ? 'warn' : 'good'}
              approx={approx}
            />
            <span className="font-sans text-sm font-medium text-fg-muted"> / ngày</span>
          </p>
          <p className="mt-2 max-w-[32.5rem] text-sm text-fg-secondary">
            Mức tiêu mỗi ngày cho{' '}
            <span className="font-semibold text-fg-primary">{soNgay} ngày</span> còn lại tới{' '}
            {moc}
            {/* Bằng chứng cho phép chia: không có vế này thì người đọc lấy hạn mức còn
                chia số ngày ra một con số KHÁC và tưởng app tính sai. Cùng câu chữ với
                trang Ngân sách ("đã trừ … cam kết chưa ra"). */}
            {camKet > 0 && <> (đã trừ {so(camKet)} cam kết chưa ra)</>}.{' '}
            {/* Nhịp hiện tại luôn có mặt: nó là mẫu số của cả hai kết luận bên cạnh, và
                bản vẽ đặt nó ở đây để người đọc TỰ so với mức chia đều ngay trên. */}
            Nhịp hiện tại {so(nhipHienTai)}/ngày
            {hutTruocLuong && canTruocLuong !== null ? (
              <>
                {' '}
                — giữ nhịp này thì hạn mức cạn{' '}
                <span className="font-semibold text-fg-warn">
                  {canTruocLuong} ngày trước {moc}
                </span>
                .
              </>
            ) : (
              <> — đang trong nhịp.</>
            )}
          </p>
          {bars}
        </>
      )}
    </Card>
  )
}
