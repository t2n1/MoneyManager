// Thanh trạng thái bản nháp — đứng ĐẦU trang Tương lai, trên cả dải chip kịch bản.
//
// VÌ SAO ĐẦU TRANG chứ không nằm trong panel Giả định (chỗ nút Lưu cũ đứng): bản nháp
// nay gom cả mốc kéo trên đồ thị và mẫu thêm từ thư viện, tức người dùng có thể tạo ra
// thay đổi chưa lưu mà KHÔNG hề chạm vào panel Giả định — và lúc đó một nút Lưu nằm
// khuất trong panel ấy (dưới cùng ở màn hẹp) là một thay đổi không có chỗ nào nói ra.
//
// VÌ SAO LUÔN ĐƯỢC DỰNG, kể cả khi chưa sửa gì (đổi 2026-09-10; trước đó chỗ gọi bọc nó
// trong `dirty && savedDraft &&`). Người dùng báo: "dòng chữ này hiện ra làm cái graph bị
// nhảy xuống khi tôi bắt đầu chỉnh sửa". Thanh cao 62px mọc ra ở ĐẦU khối `top` thì chip
// kịch bản, dải thống kê và cả vùng vẽ tụt xuống 72px (62 + `gap-2.5`) — đúng vào lúc
// ngón tay đang kéo một mốc trên trục, tức mọi toạ độ năm→pixel nhảy một nhịp ngay dưới
// con trỏ. Cùng cái bẫy mà `ConsoleFrame` đã ghi cho cột dock ("LUÔN được dựng… chừa sẵn
// để đồ thị KHÔNG co giãn") và `QuickTuneRow` đã ghi cho cặp Lưu/Bỏ ở hàng 9 (luôn có
// mặt, mờ đi khi chưa có gì để lưu). Đây là chỗ thứ ba theo cùng luật đó.
//
// Trạng thái rảnh KHÔNG phải một hộp trống chừa chỗ: nó nói kịch bản đang chiếu đúng bản
// đã lưu, và chỉ ra ba đường vào việc vặn thử. Con số "cuối đời" thì KHÔNG nhắc lại ở
// đây — dải thống kê ngay dưới đã có ô "Lúc N tuổi" bằng <Money>.
//
// CHIỀU CAO PHẢI BẰNG NHAU Ở HAI TRẠNG THÁI, không thì cú nhảy chỉ nhỏ đi chứ không mất.
// Nó bằng nhau nhờ ba thứ, đừng tháo lẻ cái nào:
//   · hàng KHÔNG `flex-wrap` — console chỉ dựng từ 1280px nên ba nút luôn đủ chỗ đứng
//     cùng dòng với câu chữ; cho nó wrap là mở lại đường cho một dòng thứ hai;
//   · `line-clamp-2` trên câu chữ — câu "đang đổi" dài gấp mấy lần câu lúc rảnh (nó liệt
//     kê từng thay đổi), không kẹp thì hai trạng thái wrap ra hai chiều cao khác nhau.
//     Kẹp KHÔNG làm mất tin: dòng "Đang đổi: …" ở hàng 9 in đúng cùng danh sách mà không
//     kẹp (`QuickTuneRow`), và nó nằm dưới đồ thị nên dài ra cũng không đẩy gì. Đo
//     2026-09-10: danh sách 172 ký tự (đổi tên + đổi tiền + tài sản khởi điểm) vẫn vừa
//     hai dòng ở cả cỡ chữ 1× và 1,25×, nên kẹp là lưới an toàn chứ không phải chuyện
//     thường ngày;
//   · `leading-snug` — hai dòng chữ `text-sm` = 2,4rem, vẫn THẤP HƠN nút chữ 2,75rem
//     (`ActionButton` có `min-h-11` trong BASE), nên chiều cao hàng do NÚT quyết định,
//     không do chữ. Đây là chỗ dễ sảy chân: `leading-relaxed` cho ra 2,84rem, tức chữ
//     vượt nút và một câu dài lại đẩy hàng cao thêm. Cả hai đều tính theo rem nên Cài
//     đặt → Cỡ chữ 1,25× phóng cùng nhịp, đẳng thức không vỡ.
//
// Ba nút chứ không một: "Lưu vào kịch bản" ghi đè bản gốc, nhưng phần lớn lượt vặn thử
// là để SO — "nếu về VN thì sao" không nên phải hy sinh kịch bản "ở lại Nhật". "Lưu
// thành kịch bản mới" giữ cả hai, và "Bỏ" là đường ra không mất gì.
import { AlertTriangle, Check } from 'lucide-react'
import { ActionButton } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import type { DraftChange } from './draft'
import { changeParts } from './draftText'

interface Props {
  /**
   * Có thay đổi chưa lưu hay không — thứ DUY NHẤT quyết định thanh này mặc màu cảnh báo
   * hay màu thẻ thường, và ba nút sáng hay mờ.
   *
   * Truyền vào chứ không tự suy ra `changes.length > 0`: chỗ gọi đã định nghĩa `dirty`
   * đúng như thế một lần rồi, và cùng một câu hỏi trả lời ở hai chỗ là hai chỗ để lệch
   * nhau (thanh nói "đã lưu" trong khi nút Lưu của hàng 9 vẫn sáng).
   */
  dirty: boolean
  /** Tên kịch bản GỐC — câu banner nói rõ bản gốc chưa bị đụng. */
  scenarioName: string
  changes: DraftChange[]
  /** Tài sản cuối đời trước và sau khi vặn; `null` khi một bên chưa chiếu được. */
  endBeforeMinor: number | null
  endAfterMinor: number | null
  currency: CurrencyCode
  onCommit: () => void
  onSaveAsNew: () => void
  onDiscard: () => void
  saving: boolean
  /**
   * true = thanh này DÁN vào đầu thẻ ngay dưới nó (bo góc trên, không bo góc dưới, bỏ
   * viền dưới). Bản vẽ v5 gắn nó lên thẻ đồ thị: nó nói về chính bản chiếu ngay dưới,
   * còn để rời thì ở màn hẹp nó trôi khỏi tầm mắt đúng lúc người dùng đang vặn.
   */
  attached?: boolean
}

export function DraftBanner({
  dirty,
  scenarioName,
  changes,
  endBeforeMinor,
  endAfterMinor,
  currency,
  onCommit,
  onSaveAsNew,
  onDiscard,
  saving,
  attached = false,
}: Props) {
  // Cùng hàm với dòng tóm tắt ở chân trình sửa kịch bản — xem `draftText.ts`.
  const parts = changeParts(changes, currency, endBeforeMinor, endAfterMinor)
  const Icon = dirty ? AlertTriangle : Check

  return (
    <div
      className={`flex min-w-0 items-center gap-2.5 border px-3 py-2 ${
        attached ? 'rounded-t-xl border-b-0' : 'rounded-lg'
      } ${dirty ? 'border-state-warn-border bg-state-warn-bg' : 'border-border-subtle bg-surface'}`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${dirty ? 'text-state-warn-fg' : 'text-fg-muted'}`}
        aria-hidden="true"
      />
      <p
        className={`min-w-0 flex-1 line-clamp-2 text-sm leading-snug ${
          dirty ? 'text-state-warn-fg' : 'text-fg-secondary'
        }`}
      >
        {dirty ? (
          <>
            <b>Đang thử trên bản nháp</b> — kịch bản "{scenarioName}" gốc chưa bị đụng.
            {parts.length > 0 && ` Đang đổi: ${parts.join(' · ')}.`}
          </>
        ) : (
          <>
            <b>Đã lưu</b> — kịch bản "{scenarioName}" đang chiếu đúng bản đã lưu. Kéo mốc trên đồ
            thị, kéo khối chặng, hoặc sửa số ở bảng bên phải để thử một hướng khác; bản gốc chỉ
            đổi khi bạn bấm Lưu.
          </>
        )}
      </p>
      {/* Cả ba nút mờ đi khi chưa có gì để lưu, KHÔNG ẩn: ẩn là đổi bề rộng khối nút,
          tức câu chữ bên trái giãn ra rồi co lại mỗi lần bắt đầu/kết thúc một lượt vặn —
          cùng loại nhiễu với cú nhảy dọc mà cả thanh này tồn tại để chặn. Cùng khuôn với
          cặp Lưu/Bỏ của `QuickTuneRow`. */}
      <div className="flex shrink-0 gap-2">
        <ActionButton variant="primary" onClick={onCommit} disabled={!dirty || saving}>
          {saving ? 'Đang lưu…' : 'Lưu vào kịch bản'}
        </ActionButton>
        <ActionButton onClick={onSaveAsNew} disabled={!dirty || saving} className="bg-surface">
          Lưu thành kịch bản mới
        </ActionButton>
        <ActionButton onClick={onDiscard} disabled={!dirty || saving}>
          Bỏ
        </ActionButton>
      </div>
    </div>
  )
}
