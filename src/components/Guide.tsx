// Chữ CHỈ ĐỂ DẠY — biến mất ở chế độ Gọn.
//
// Ranh giới quan trọng, vì nó quyết định cái gì được bọc: bọc `Guide` khi bỏ đoạn chữ
// đó đi mà người dùng VẪN thấy được tình trạng và vẫn nhập đúng được. Cụ thể:
//
//   BỌC   — cách tính, ý nghĩa của con số, mẹo dùng, ghi chú "vì sao lại thế", lời dẫn
//           trong trạng thái rỗng, gợi ý quy ước nhập liệu đã thuộc lòng.
//   ĐỪNG  — nhãn của ô nhập, câu báo lỗi, câu xác nhận trước khi xoá, đơn vị tiền,
//           cảnh báo dữ liệu sai (tỷ giá cũ, số không khớp). Mất mấy thứ này là mất
//           chức năng hoặc dẫn tới ghi sai, không phải "gọn hơn".
//
// Mặc định render <p>. Đổi bằng `as` cho những chỗ đoạn chữ nằm trong <li>, <span>…
//
// `FullOnly` cho khối không phải một đoạn văn (cả một thẻ mẹo, một danh sách, một hàng
// nút phụ chỉ có nghĩa khi đọc kèm hướng dẫn). Cùng một cơ chế, khác chỗ dùng — cố ý
// không nhồi thêm prop vào `Guide` để mỗi chỗ gọi đọc ra ngay đang ẩn cái gì.
import type { ElementType, ReactNode } from 'react'
import { useDensity } from '../hooks/useDensity'

interface GuideProps {
  /** Thẻ HTML sẽ render ở chế độ Đầy đủ. Mặc định 'p'. */
  as?: ElementType
  className?: string
  children: ReactNode
}

export function Guide({ as: Tag = 'p', className, children }: GuideProps) {
  const { visual } = useDensity()
  if (visual) return null
  return <Tag className={className}>{children}</Tag>
}

/** Ẩn cả khối ở chế độ Gọn, không tự bọc thẻ nào. */
export function FullOnly({ children }: { children: ReactNode }) {
  const { visual } = useDensity()
  if (visual) return null
  return <>{children}</>
}
