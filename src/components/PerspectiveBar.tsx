// Công tắc góc nhìn Cả nhà / Mình / người kia — một dải đặt trên đầu bốn màn đọc sổ theo
// tháng (Bản tin, Sổ, Ngân sách, Báo cáo). Đặt ở KHUNG app chứ không mỗi màn một cái:
// góc nhìn là state chung (usePerspective), đổi ở Sổ rồi sang Báo cáo phải còn nguyên,
// và bốn bản copy thì sớm muộn sẽ lệch chữ lệch chỗ.
//
// Chỉ hiện khi đã bật "Hai người" — một mình thì không có góc nào khác để chọn.
import { useLocation } from 'react-router-dom'
import { SegmentedControl } from './ui'
import { usePerspective } from '../hooks/usePerspective'
import { useProfile } from '../hooks/useProfile'
import { partnerLabel } from '../features/sharedFund/labels'
import type { Perspective } from '../features/sharedFund/perspective'
import { tr } from '../i18n'

/** Màn đi theo góc nhìn — phải khớp các chỗ gọi hook với `{ perspective }`. */
export function followsPerspective(pathname: string): boolean {
  return ['/', '/so', '/budget', '/reports'].includes(pathname) || pathname.startsWith('/reports/')
}

export function PerspectiveBar() {
  const { pathname } = useLocation()
  const { view, enabled, setView } = usePerspective()
  const { data: profile } = useProfile()
  if (!enabled || !followsPerspective(pathname)) return null
  const items: { value: Perspective; label: string }[] = [
    { value: 'all', label: tr('Cả nhà') },
    { value: 'mine', label: tr('Mình') },
    { value: 'partner', label: partnerLabel(profile) },
  ]
  return (
    <div className="px-3 pt-3 lg:px-6">
      <SegmentedControl items={items} value={view} onChange={setView} label={tr('Xem sổ của ai')} size="sm" stretch="lg" />
      {/* Nói ra luật ở góc riêng — không thì "chi tiền nhà ¥60k" ở góc Mình trông như ghi sai
          (trong sổ khoản đó là chuyển khoản vào quỹ). Chỉ ở góc riêng, và hiện cả ở chế độ
          Gọn: đây là cách đọc mọi con số bên dưới, không phải chữ để dạy. */}
      {view !== 'all' && (
        <p className="mt-1 text-2xs text-fg-muted">
          {tr('Góp quỹ chung tính là chi của phần đã góp; chi từ quỹ và khoản “chung” chỉ có ở Cả nhà. Hạn mức ngân sách vẫn là của cả nhà.')}
        </p>
      )}
    </div>
  )
}
