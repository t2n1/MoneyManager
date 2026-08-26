// Chân trang chung — một chỗ duy nhất cho cả app.
//
// Còn lại đúng những câu đúng ở MỌI trang: chú thích chế độ demo, và số trên màn lấy lúc
// nào. Trước đây mỗi trang tự chèn dòng tuổi dữ liệu vào một độ cao khác nhau.
//
// Không phải thanh cố định: nó nằm trong luồng, cuối phần cuộn của <main>. Thanh cố định
// sẽ đánh nhau với nav dưới và nút "+" nổi, mà tuổi dữ liệu không gấp tới mức phải chiếm
// chỗ thường trực trên màn.
import { isDemoMode } from '../lib/demo'
import { useDataFreshness } from '../hooks/useDataFreshness'
import { DataFreshness } from './DataFreshness'

export function AppFooter() {
  const freshness = useDataFreshness()

  return (
    <footer
      // Ngoài chế độ demo, thứ duy nhất còn lại trong chân trang là dòng tuổi dữ liệu,
      // mà dòng đó đã tự ẩn từ xl trở lên (top bar in nó rồi). Không ẩn cả thẻ <footer>
      // thì mt-8 + pb-2 vẫn chừa một khoảng trống rỗng ở cuối mọi trang desktop.
      className={`mt-8 flex flex-col items-center gap-1 px-3 pb-2 text-center text-sm text-fg-muted print:hidden${
        isDemoMode ? '' : ' xl:hidden'
      }`}
    >
      {/* Chú thích chế độ demo — trước đây nằm ở chân thanh bên 240px nên CHỈ desktop
          thấy, trong khi "số trên màn không phải tiền thật" là câu quan trọng nhất ở
          chế độ đó. Rail 52px không chứa nổi một câu, và đây vốn là chỗ của những câu
          đúng ở mọi trang. */}
      {isDemoMode && (
        <p className="rounded-md border border-state-warn-border bg-state-warn-bg px-3 py-1.5 text-state-warn-fg">
          Chế độ demo — dữ liệu chỉ lưu trên trình duyệt này
        </p>
      )}
      {/* Ẩn từ xl trở lên: ở đó top bar đã in dòng này ngay trên đầu màn, hai bản cùng
          lúc là hai chỗ nói cùng một chuyện. Dưới xl top bar giấu nó đi (không đủ chỗ)
          nên bản ở đây là bản duy nhất — kể cả toàn bộ mobile. */}
      <span className="xl:hidden">
        <DataFreshness summary={freshness} />
      </span>
    </footer>
  )
}
