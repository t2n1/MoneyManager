// Gắn khoản thu/chi của tài khoản chứng khoán vào MỘT MÃ — nguồn của cột "Cổ tức".
//
// Vì sao ở TRANG ĐẦU TƯ chứ không ở form Nhập: form Nhập chung đi qua `entryShape` /
// `roleFields` / `roleSave` — một hệ con lớn, nhiều test, và thêm một ô chỉ có nghĩa với
// đúng một loại tài khoản vào đó là trả giá rủi ro cho cả đường ghi giao dịch. Ở đây thì
// đổi lại còn ĐƯỢC thêm: người dùng gắn mã lúc đang xem danh mục, tức lúc đang nghĩ về mã,
// và những khoản cổ tức ghi từ TRƯỚC khi có cột `stock_symbol` cũng gắn lại được ngay —
// không có màn này thì cả lịch sử cổ tức nằm ngoài bảng vĩnh viễn.
//
// Chọn mã từ danh sách mã ĐÃ TỪNG giao dịch, không phải mã đang giữ: cổ tức của một mã
// bán xong rồi vẫn là tiền thật đã nhận, và nó phải gắn được vào đâu đó.
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { Money, Num, Select } from '../../components/ui'
import { useUpdateTransaction } from '../../hooks/queries'
import { ngay } from './investFormat'
import type { TaggableCashflow } from './positionTable'

const VND = 'VND' as const

/** Danh sách dài thì cắt — người dùng gắn khoản gần đây, không duyệt cả đời sổ. */
const TOI_DA = 30

interface Props {
  flows: TaggableCashflow[]
  /** Mọi mã đã từng giao dịch, sắp theo tên. */
  symbols: string[]
}

export function InvestDividendTagger({ flows, symbols }: Props) {
  const [mo, setMo] = useState(false)
  const capNhat = useUpdateTransaction()

  if (flows.length === 0 || symbols.length === 0) return null

  const chuaGan = flows.filter((f) => f.symbol === '').length
  const hien = flows.slice(0, TOI_DA)

  return (
    <div className="mt-3 border-t border-border-subtle pt-2">
      <button
        type="button"
        onClick={() => setMo((v) => !v)}
        aria-expanded={mo}
        className="flex w-full items-center gap-1.5 text-left text-2xs text-fg-secondary"
      >
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-fast ${mo ? 'rotate-0' : '-rotate-90'}`}
        />
        Gắn cổ tức vào mã
        {chuaGan > 0 && (
          <>
            {' — '}
            <Num>{chuaGan}</Num> khoản chưa gắn
          </>
        )}
      </button>

      {mo && (
        <>
          {/* Chữ để DẠY: bỏ đi vẫn gắn mã được bình thường, nên nó đi qua cổng Guide
              (chế độ Gọn ẩn). Ranh giới ghi ở src/components/Guide.tsx. */}
          <Guide className="mt-1.5 text-2xs text-fg-muted">
            Khoản thu/chi của tài khoản chứng khoán. Gắn mã thì cột <b>Cổ tức</b> ở bảng
            trên mới có số — app không đoán mã từ ghi chú.
          </Guide>
          <ul className="mt-1.5 space-y-1.5">
            {hien.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs">
                <span className="text-fg-muted">{ngay(f.occurredOn)}</span>
                <Money
                  amount={f.amount}
                  currency={VND}
                  tone={f.type === 'income' ? 'in' : 'out'}
                  className="text-2xs font-semibold"
                />
                {f.note && (
                  <span className="min-w-0 max-w-40 truncate text-fg-secondary">{f.note}</span>
                )}
                <Select
                  wrapClassName="ml-auto"
                  aria-label={`Mã cho khoản ngày ${ngay(f.occurredOn)}`}
                  value={f.symbol}
                  disabled={capNhat.isPending}
                  onChange={(e) =>
                    capNhat.mutate({
                      id: f.id,
                      // Chuỗi rỗng → null, không phải '' : cột là nullable và "chưa gán"
                      // phải là NULL để `dividendsBySymbol` bỏ qua nó cho đúng.
                      patch: { stock_symbol: e.target.value || null },
                    })
                  }
                >
                  <option value="">chưa gắn mã</option>
                  {symbols.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
          {flows.length > TOI_DA && (
            <p className="mt-1.5 text-2xs text-fg-muted">
              Còn <Num>{flows.length - TOI_DA}</Num> khoản cũ hơn — sửa trực tiếp trong Sổ.
            </p>
          )}
        </>
      )}
    </div>
  )
}
