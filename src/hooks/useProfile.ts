import { useQuery } from '@tanstack/react-query'
import { repo } from '../data'

/**
 * Hồ sơ người dùng — mọi thứ trong đây là cấu hình dùng khắp app (tháng bắt đầu ngày
 * mấy, tiền gốc, mốc cơ cấu chi, cách trình bày).
 *
 * `staleTime` TỪNG là `Infinity` với lý do "hồ sơ hầu như không đổi". Lý do đó hết đúng
 * từ khi migration 0040 đưa **Cách trình bày** vào đây: đó là cài đặt đi theo NGƯỜI, đổi
 * ở máy này thì máy kia phải thấy. Với `Infinity` cộng cache lưu xuống localStorage
 * (24h), máy kia không bao giờ tải lại — đổi trên điện thoại thì laptop vẫn hiện chế độ
 * cũ suốt cả ngày.
 *
 * 60 giây, không phải một con số nhỏ hơn: React Query chỉ tải lại khi có observer MỚI
 * mount hoặc khi cửa sổ được focus lại, chứ không hẹn giờ. Nên trong một phiên đang dùng
 * liên tục thì gần như không có lượt tải thêm nào, còn đúng cái tình huống cần — nhấc
 * máy khác lên (cold start, hoặc focus lại cửa sổ đang mở) — thì luôn lấy được bản mới.
 * Đây là MỘT hàng, một cột vài chữ.
 *
 * Không sợ render lại vô cớ: React Query dùng structural sharing, lượt tải trả về dữ
 * liệu y hệt thì `data` giữ nguyên tham chiếu.
 *
 * ĐÃ KIỂM tới đâu (trên localhost + Supabase thật): đường MOUNT — ghi giá trị mới từ
 * "máy A", rồi mở app ở trạng thái "máy B" (cache hồ sơ cũ) thì máy B nhận đúng giá trị
 * mới; lùi lại `Infinity` thì máy B đứng ở giá trị cũ. Đường FOCUS (tab đang mở sẵn, không
 * tải lại) thì CHƯA kiểm được: sự kiện `visibilitychange` phát bằng tay không làm đổi
 * trạng thái focus nội bộ của React Query, nên phép thử không nói được gì. Đừng ghi là đã
 * kiểm cho tới khi thử được bằng cách chuyển tab thật.
 */
export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => repo.getProfile(),
    staleTime: 60_000,
  })
}
