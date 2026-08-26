// Dải ghim đầu màn của mặt LẬP KẾ HOẠCH — chỉ ở điện thoại.
//
// Vì sao cần: kéo một thanh trượt hạn mức làm cơ cấu 50/30/20 đổi ngay, nhưng ở điện
// thoại hai khối mang con số đó nằm phía trên và đã cuộn khỏi màn — người dùng kéo mù rồi
// phải cuộn lên xem hậu quả, cuộn xuống sửa, cuộn lên xem lại.
//
// Vì sao là DẢI GỌN chứ không ghim thẳng hai khối đó: đo ở 375×812 thì khối tiền cao 293px
// và khối Cơ cấu 276px — cộng lại 569px, tức 70% màn hình. Còn ~91px trên một màn điện
// thoại thật (660px sau khi trừ thanh địa chỉ), không đủ cho một dòng hạn mức kèm thanh
// trượt (~155px). Dải này ~110px.
//
// Vì sao KHÔNG có dòng "chưa phân bổ" riêng: `axisProgress` tính tiết kiệm = thu − tổng
// chi, nên `actual` của trục Để dành CHÍNH LÀ phần chưa phân bổ. In thêm một dòng nữa là
// một con số đọc hai lần dưới hai cái tên.
//
// Desktop không cần: bố cục hai cột để hai khối đầy đủ ở cột trái, trong tầm mắt suốt lúc
// kéo cột phải. Nên `lg:hidden`.
//
// PHẢI là sibling đứng TRƯỚC panel hạn mức, không phải nằm trong header của nó: `Card` của
// panel đặt `overflow: hidden`, mà một `position: sticky` bên trong khối bị cắt thì không
// dính bao giờ — và nó chết im lặng, không lỗi, không cảnh báo.

import { AxisStrip } from './AxisStrip'
import type { MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import type { AxisProgress } from './axisTargets'

export function PlanStickyBar({
  axis,
  monthKey,
  base,
}: {
  /** null = chưa biết thu nhập, không có cơ cấu nào để bám */
  axis: AxisProgress | null
  monthKey: MonthKey
  base: CurrencyCode
}) {
  if (!axis) return null
  return (
    // `-mx-3 px-3` để nền chạy hết bề ngang: khung ngoài có `p-3`, không bù lại thì lúc
    // dính sẽ thấy nội dung trôi qua hai bên rìa dải.
    // `order-4` bằng đúng panel hạn mức và đứng trước nó trong DOM — hai phần tử cùng
    // `order` giữ nguyên thứ tự DOM, nên dải luôn ở ngay trên panel.
    <div className="sticky top-0 z-10 -mx-3 order-4 bg-surface-page px-3 pb-2 lg:hidden">
      <AxisStrip data={axis} monthKey={monthKey} base={base} linkToDetail={false} showAmount />
    </div>
  )
}
