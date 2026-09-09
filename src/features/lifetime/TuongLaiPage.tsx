// Trang riêng cho "Tương lai" — dòng chiếu tài sản ròng cả đời (tách khỏi Tài sản
// 2026-09-09, xem docs/superpowers/specs/2026-09-09-tuong-lai-console-design.md).
//
// Trước đây đây là tab con thứ ba của Tài sản (`/assets?view=future`, xem AssetsPage.tsx
// trước bản này). Route cũ và `/lifetime` đều chuyển tiếp sang đây (xem App.tsx) để
// bookmark và lịch sử trình duyệt của người dùng còn dùng được.
//
// Ruột trang TẠM THỜI vẫn là LifetimeView y nguyên — nhiệm vụ của bản này chỉ là dựng
// đường đi riêng: route, mục nav (chỉ-máy-tính), chuyển tiếp, và cổng bề rộng. Task kế
// tiếp trong đợt console mới thay ruột (xem docs/information-architecture.md §2.3).
import { EmptyState, PageHeader } from '../../components/ui'
import { LifetimeView } from './LifetimeView'

export function TuongLaiPage() {
  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="Tương lai" flush />

      {/* Console dòng thời gian là màn CHỈ CHO MÁY TÍNH (quyết định 2026-09-09, xem spec
          §1). Cần 1280px để chứa rail + vùng vẽ + dock 24,5rem cùng lúc.

          Cổng bằng CSS chứ không đo bằng JS: đọc `innerWidth` trong render thì lần vẽ đầu
          luôn sai ở SSR/hydrate, và không nghe theo Cài đặt → Cỡ chữ (src/lib/fontScale.ts
          đổi `--app-font-scale` → đổi font-size gốc → breakpoint rem của Tailwind đổi
          theo, còn một ngưỡng px đo bằng JS thì đứng yên).

          Mốc dùng là `xl` = 80rem = 1280px — mặc định Tailwind v4, KHÔNG bị override:
          không có `@theme` nào khai lại `--breakpoint-xl` hay `screens` trong
          src/index.css (đã kiểm bằng grep). Đúng luôn 1280px cần, không phải bịa tiện ích
          mới. */}
      <div className="xl:hidden">
        <EmptyState>
          Màn Tương lai cần máy tính (từ 1280px) để đủ chỗ cho rail, vùng vẽ và bảng vặn
          thử cùng lúc. Mở lại bằng máy tính, hoặc phóng rộng cửa sổ trình duyệt.
        </EmptyState>
      </div>
      {/* `block` chứ chưa phải `flex`: ruột trang còn là LifetimeView cũ nguyên khối, Task
          kế tiếp mới đổi thành bố cục console (rail + vùng vẽ + dock) và lúc đó lớp này
          mới cần đổi sang flex. */}
      <div className="hidden xl:block">
        <LifetimeView />
      </div>
    </div>
  )
}
