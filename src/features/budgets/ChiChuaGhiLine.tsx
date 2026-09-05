// Dòng cảnh báo đứng CẠNH phán quyết ngân sách, không trộn vào nó.
//
// `pickBudgetVerdict` cố ý chỉ so chi của các mục ĐÃ ĐẶT hạn mức với tổng trần của chính
// chúng — xem chú thích đầu budgetVerdict.ts. Phần "Chưa ghi rõ" không thuộc danh mục
// nào, nên nhét nó vào phán quyết chính là đúng lỗi lệch phạm vi mà đoạn code đó được
// viết ra để chặn ("ai mới đặt vài hạn mức cũng thấy 'vượt' khổng lồ, rồi thôi tin cả
// thẻ"). Nên nó đứng riêng ở đây, và câu chữ phải nói rõ nó đứng ngoài.
//
// Đặt BÊN NGOÀI BudgetVerdictLine chứ không nhét vào trong: hàm đó `return null` khi chưa
// có phán quyết, mà dòng này phải hiện kể cả khi chưa đặt hạn mức nào — chưa đặt trần
// không có nghĩa là không cần biết ví đang hụt.

import { Guide } from '../../components/Guide'
import { Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/money'
import { dongChiChuaGhi, type ChiChuaGhi } from '../reports/chiChuaGhi'

export function ChiChuaGhiLine({ chuaGhi, base }: { chuaGhi: ChiChuaGhi; base: CurrencyCode }) {
  const dong = dongChiChuaGhi(chuaGhi)
  if (dong === null) return null

  return (
    <Guide className="mt-2 text-sm text-fg-warn">
      Ngoài ra{' '}
      <Money
        amount={Math.abs(dong.soTien)}
        currency={base}
        tone="warn"
        approx={chuaGhi.hasMissingRate}
      />{' '}
      {dong.nhan === 'Chưa ghi rõ' ? 'chưa rõ tiêu vào đâu' : 'đã ghi thừa'} — không nằm trong
      phán quyết trên.
    </Guide>
  )
}
