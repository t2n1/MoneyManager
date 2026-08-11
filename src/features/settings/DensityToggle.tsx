// Cách trình bày: Gọn (ít chữ, nhiều hình) / Đầy đủ (có hướng dẫn).
//
// Dáng nút giống ThemeToggle và FontSizeToggle — ba khối này nằm liền nhau trong Cài
// đặt và đều là "ý thích khi nhìn", trông khác nhau thì đọc thành ba loại cài đặt khác
// nhau. Không dùng switch bật/tắt dù người dùng gọi nó là "nút switch": switch chỉ có
// tên cho MỘT trạng thái ("Gọn: bật"), người đọc phải tự suy tắt nghĩa là gì. Hai nút
// có nhãn thì cả hai lựa chọn đều tự nói tên mình.
//
// Nhưng nó KHÁC hai khối kia ở chỗ lưu: cài đặt này nằm trong hồ sơ người dùng
// (migration 0040) nên đổi một lần là mọi thiết bị theo, còn Sáng/Tối và Cỡ chữ thì
// riêng từng máy. Ba khối trông giống nhau mà cư xử khác nhau thì phải NÓI RA, nên có
// dòng "dùng chung mọi thiết bị" cạnh tiêu đề — và dòng đó không bọc <Guide>: nó là
// hành vi thật của cái nút, không phải chữ hướng dẫn.
import { LayoutGrid, Text } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '../../components/ui'
import { useDensityControl } from '../../hooks/useDensity'
import type { DensityPref } from '../../lib/density'

const OPTIONS: { value: DensityPref; label: string; hint: string; Icon: LucideIcon }[] = [
  { value: 'visual', label: 'Gọn', hint: 'Ít chữ, nhìn hình là hiểu', Icon: LayoutGrid },
  { value: 'full', label: 'Đầy đủ', hint: 'Có câu kết luận và cách tính', Icon: Text },
]

export function DensityToggle() {
  const { pref, setDensity, saving } = useDensityControl()

  return (
    <Card as="section" padding="none" className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 px-3 pt-3">
        <h2 className="text-sm font-semibold text-fg-muted">Cách trình bày</h2>
        <span className="shrink-0 text-2xs text-fg-muted">dùng chung mọi thiết bị</span>
      </div>
      <div className="flex gap-1 p-3">
        {OPTIONS.map((opt) => {
          const active = pref === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDensity(opt.value)}
              // Khoá cả hai nút trong lúc gửi: bấm liên tục sẽ xếp nhiều lượt ghi hồ sơ,
              // lượt về sau cùng thắng — tức chế độ cuối có thể không phải cái vừa bấm.
              disabled={saving}
              aria-pressed={active}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition disabled:opacity-60 ${
                active
                  ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300'
                  : 'border-gray-200 text-fg-secondary hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800'
              }`}
            >
              <opt.Icon className="h-5 w-5" />
              {opt.label}
              {/* Câu mô tả nằm TRONG nút, không phải một dòng chú thích dưới khối: đây
                  chính là cài đặt quyết định chữ hướng dẫn còn hay mất, nên nó phải tự
                  giải thích được ngay cả khi đang ở chế độ Gọn. */}
              <span className="text-center text-3xs font-normal text-fg-on-track">{opt.hint}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
