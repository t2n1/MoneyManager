// Khung xương lúc chờ trang lazy tải xong.
//
// Trước đây mọi trang lazy dùng chung một dòng chữ "Đang tải…" giữa màn trắng. Khung
// xương hơn ở chỗ nó giữ đúng chỗ cho nội dung sắp tới, nên lúc thay vào trang không
// nhảy — và người dùng đọc được ngay "trang này sắp là một danh sách" hay "sắp là mấy
// cái thẻ".
//
// Kích thước khối phải KHỚP nội dung thật. Lệch nhiều thì lúc thay vào vẫn giật, mà giật
// sau khi đã hứa một hình dạng còn khó chịu hơn chữ "Đang tải…".
interface Props {
  kind: 'list' | 'cards' | 'table'
}

const Block = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded-lg bg-surface-sunken ${className}`} />
)

export function PageSkeleton({ kind }: Props) {
  // aria-busy + nhãn: trình đọc màn hình thông báo "đang tải" thay vì đọc một đống khối
  // rỗng không tên.
  const shell = (children: React.ReactNode, className: string) => (
    <div className={className} aria-busy="true" aria-label="Đang tải">
      {children}
    </div>
  )

  if (kind === 'list') {
    return shell(
      <>
        {/* Ô tìm kiếm / thanh lọc ở đầu các trang danh sách */}
        <Block className="h-9 w-full" />
        {Array.from({ length: 8 }, (_, i) => (
          <Block key={i} className="h-14 w-full" />
        ))}
      </>,
      'mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 lg:p-6',
    )
  }

  if (kind === 'table') {
    return shell(
      <>
        <Block className="h-9 w-40" />
        {Array.from({ length: 6 }, (_, i) => (
          <Block key={i} className="h-11 w-full" />
        ))}
      </>,
      'flex flex-col gap-2 p-3 lg:p-6',
    )
  }

  // 'cards' — dùng đúng khuôn lưới hai cột của Báo cáo/Tài sản để lúc thay vào không đổi
  // thế xếp.
  return shell(
    Array.from({ length: 4 }, (_, i) => <Block key={i} className="h-44 w-full" />),
    'flex flex-col gap-4 p-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:p-6',
  )
}
