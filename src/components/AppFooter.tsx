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
import { useProfile } from '../hooks/queries'
import { useDataFreshness } from '../hooks/useDataFreshness'
import { DataFreshness } from './DataFreshness'

export function AppFooter() {
  const { data: profile } = useProfile()
  const freshness = useDataFreshness()

  return (
    <footer className="mt-8 flex flex-col items-center gap-1 px-3 pb-2 text-center text-xs text-fg-muted print:hidden">
      <p>
        Sổ Gạo · Giai đoạn 1 (MVP)
        {profile &&
          ` · Tháng bắt đầu ngày ${profile.month_start_day} · Quy đổi ${profile.base_currency}`}
      </p>
      <DataFreshness summary={freshness} />
    </footer>
  )
}
