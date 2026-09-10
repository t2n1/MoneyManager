// HÀNG 11 — ba chip chọn MỘT pane. Bảng theo năm · Bản đồ khoản lớn · Danh sách đầy đủ.
//
// Bản vẽ (README §"Thứ tự các hàng" mục 11, và markup .dc.html dòng 641-651) giữ đúng
// MỘT pane mở: `pane: 'table' | 'map' | null`, bấm lại chip đang mở thì đóng. Trước bản
// này bảng và bản đồ là hai thẻ TỰ GẬP, mỗi thẻ mang chip riêng — nên hai bảng số dài mở
// được cùng lúc, và chip thứ ba (phiếu danh sách) không có hàng nào để chen vào.
//
// SỐ NẰM TRONG NHÃN là điểm chính của hàng này, không phải trang trí: một chip trơ ghi
// "Bản đồ khoản lớn" buộc người dùng bấm mở mới biết trong đó có gì. Vì mọi con số phải
// đi qua <Num>/<Money>, nhãn là JSX chứ không phải chuỗi ghép — nên hàng này là một
// component, không phải một bảng tra nhãn.
//
// <FilterChip> chứ không <SegmentedControl>: bộ segmented hứa LUÔN có đúng một mục bật
// (xem đầu FilterChip.tsx), mà ở đây đóng hết cả ba là một trạng thái hợp lệ — và cái
// chip thứ ba không mở pane nào cả, nó mở một phiếu phủ màn.
import { ExternalLink } from 'lucide-react'
import { ActionButton, FilterChip, Money, Num } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'

/** Pane đang mở dưới hàng chip. `null` = đóng hết, chỉ còn đồ thị. */
export type ConsolePane = 'table' | 'map' | null

export function PaneSwitchRow({
  pane,
  onPane,
  onOpenDrawer,
  yearCount,
  bigCount,
  lifetimeSpendMinor,
  phaseCount,
  eventCount,
  currency,
  approx,
}: {
  pane: ConsolePane
  onPane: (p: ConsolePane) => void
  onOpenDrawer: () => void
  /** Số năm bản chiếu đang hiện — nhãn chip bảng. */
  yearCount: number
  /**
   * Số khoản trong bản đồ, đếm theo cách xếp MẶC ĐỊNH của pane ("Cả đời").
   *
   * Không đếm theo "Cần dành": hai cách xếp cho hai con số khác nhau (một chặng sinh
   * hoạt là MỘT khoản cả đời nhưng KHÔNG là khoản nào cần để dành), nên chip đếm cách
   * này mà pane mở ra cách kia là chip nói sai ngay khi vừa bấm. Bản vẽ cũng đếm cách
   * này (`bigRaw` ở dòng 1792 là xếp hạng cả đời).
   */
  bigCount: number
  /** Tổng chi cả đời — chính con số ở dòng cộng của pane, xem trước ngay trên chip. */
  lifetimeSpendMinor: number
  phaseCount: number
  eventCount: number
  currency: CurrencyCode
  /** Thiếu tỷ giá đâu đó → số trên chip hiện `≈`, cùng quy ước với mọi tổng khác. */
  approx: boolean
}) {
  // Bấm lại chip đang mở = đóng. Cử chỉ của bản vẽ (`st.pane === 'table' ? null : 'table'`)
  // và cũng là cách duy nhất để lấy lại chỗ trên màn mà không phải cuộn.
  const toggle = (p: Exclude<ConsolePane, null>) => () => onPane(pane === p ? null : p)

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <FilterChip
        on={pane === 'table'}
        onClick={toggle('table')}
        title="Bảng chi tiết theo năm — bản đọc được bằng chữ của đồ thị"
      >
        Bảng theo năm · <Num tone={pane === 'table' ? 'onAccent' : 'muted'}>{yearCount}</Num> năm
      </FilterChip>

      <FilterChip
        on={pane === 'map'}
        onClick={toggle('map')}
        title="Khoản nào ngốn nhiều tiền nhất, và mỗi tháng cần để dành bao nhiêu"
      >
        Bản đồ khoản lớn · <Num tone={pane === 'map' ? 'onAccent' : 'muted'}>{bigCount}</Num> khoản
        {bigCount > 0 && (
          <>
            {' · '}
            <Money
              amount={lifetimeSpendMinor}
              currency={currency}
              tone={pane === 'map' ? 'onAccent' : 'muted'}
              approx={approx}
            />
          </>
        )}
      </FilterChip>

      {/* Không phải một pane, nên không phải một <FilterChip>: nó mở một phiếu phủ màn
          rồi tự đóng lại, tức một HÀNH ĐỘNG. Bản vẽ cũng vẽ nó khác hai chip kia — icon
          mũi ra ngoài thay vì mũi xuống. */}
      <ActionButton
        variant="outline"
        onClick={onOpenDrawer}
        title="Toàn bộ chặng và mốc dạng danh sách — tìm được, sắp được"
      >
        Danh sách đầy đủ · <Num tone="muted">{phaseCount}</Num> chặng ·{' '}
        <Num tone="muted">{eventCount}</Num> mốc
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </ActionButton>
    </div>
  )
}
