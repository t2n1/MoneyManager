// Chân trang chung — một chỗ duy nhất cho cả app.
//
// Hai dòng nói hai chuyện khác nhau: dòng trên là app này là gì và đang quy đổi theo mốc
// nào, dòng dưới là số trên màn lấy lúc nào. Cả hai đều đúng ở MỌI trang, nên chúng thuộc
// về layout chứ không thuộc trang nào — trước đây dòng trên chỉ có ở Cài đặt, còn dòng
// dưới thì mỗi trang tự chèn vào một độ cao khác nhau.
//
// Không phải thanh cố định: nó nằm trong luồng, cuối phần cuộn của <main>. Thanh cố định
// sẽ đánh nhau với nav dưới và nút "+" nổi, mà tuổi dữ liệu không gấp tới mức phải chiếm
// chỗ thường trực trên màn.
import { isDemoMode } from '../lib/demo'
import { useProfile } from '../hooks/queries'
import { useDataFreshness } from '../hooks/useDataFreshness'
import { DataFreshness } from './DataFreshness'

export function AppFooter() {
  const { data: profile } = useProfile()
  const freshness = useDataFreshness()

  return (
    <footer className="mt-8 flex flex-col items-center gap-1 px-3 pb-2 text-center text-xs text-fg-muted print:hidden">
      {/* Chú thích chế độ demo — trước đây nằm ở chân thanh bên 240px nên CHỈ desktop
          thấy, trong khi "số trên màn không phải tiền thật" là câu quan trọng nhất ở
          chế độ đó. Rail 52px không chứa nổi một câu, và đây vốn là chỗ của những câu
          đúng ở mọi trang. */}
      {isDemoMode && (
        <p className="rounded-md border border-state-warn-border bg-state-warn-bg px-3 py-1.5 text-state-warn-fg">
          Chế độ demo — dữ liệu chỉ lưu trên trình duyệt này
        </p>
      )}
      <p>
        Sổ Gạo · Giai đoạn 1 (MVP)
        {profile &&
          ` · Tháng bắt đầu ngày ${profile.month_start_day} · Quy đổi ${profile.base_currency}`}
      </p>
      {/* Ẩn từ xl trở lên: ở đó top bar đã in dòng này ngay trên đầu màn, hai bản cùng
          lúc là hai chỗ nói cùng một chuyện. Dưới xl top bar giấu nó đi (không đủ chỗ)
          nên bản ở đây là bản duy nhất — kể cả toàn bộ mobile. */}
      <span className="xl:hidden">
        <DataFreshness summary={freshness} />
      </span>
    </footer>
  )
}
