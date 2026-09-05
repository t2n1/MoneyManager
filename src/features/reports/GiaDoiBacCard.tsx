// Thẻ "Khoản lặp đều đã đổi giá" — tab Dài hạn (spec 2026-09-05-gia-doi-bac §5.1).
//
// Danh sách TĨNH, không nút, không lưu gì: muốn nó thôi hiện thì sửa chính khoản chi.
// Không có bậc nào → null, tab y hệt hôm nay. Câu "đã trả N lần theo giá mới" là bằng
// chứng — người đọc kiểm được bằng mắt trong Sổ.
import { Card, Money, Num, SectionTitle } from '../../components/ui'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { CategoryRow, RecurringRuleRow, TransactionRow } from '../../types/database.types'
import type { CurrencyOf } from './aggregate'
import { doBacGia } from './giaDoiBac'

export function GiaDoiBacCard({
  txs,
  rules,
  categories,
  currencyOf,
  base,
  rates,
}: {
  txs: readonly TransactionRow[]
  rules: readonly RecurringRuleRow[]
  categories: readonly Pick<CategoryRow, 'id' | 'icon'>[]
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates
}) {
  const items = doBacGia(txs, rules, categories, currencyOf, base, rates)
  if (items.length === 0) return null

  return (
    <Card as="section" elevation="panel" padding="panel">
      <SectionTitle>Khoản lặp đều đã đổi giá</SectionTitle>
      <ul className="mt-2 flex flex-col divide-y divide-border-subtle">
        {items.map((b) => (
          <li key={`${b.nhan}:${b.tuNgayISO}`} className="flex flex-col gap-0.5 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm text-fg-primary">
                {b.icon && (
                  <span aria-hidden className="mr-1.5">
                    {b.icon}
                  </span>
                )}
                {b.nhan}
              </span>
              <span className="shrink-0 text-sm">
                <Money amount={b.giaCu} currency={b.currency} className="text-fg-muted" />
                <span className="text-fg-muted"> → </span>
                <Money
                  amount={b.giaMoi}
                  currency={b.currency}
                  tone={b.chenhMoiNam > 0 ? 'warn' : 'in'}
                />
              </span>
            </div>
            {/* KHÔNG bọc Guide: đây là dòng DỮ LIỆU của chính bậc giá (từ bao giờ, đã
                trả mấy lần, nặng/nhẹ bao nhiêu mỗi năm) — mất nó là mất một nửa kết
                luận, không phải "gọn hơn". */}
            <p className="text-2xs text-fg-muted">
              Đổi từ {b.tuNgayISO.slice(0, 7).replace('-', '/')} · đã trả{' '}
              <Num tone="neutral">{b.soLanGiaMoi}</Num> lần theo giá mới ·{' '}
              {/* chenhMoiNam CÓ DẤU sẵn: đừng bật showSign (ra '--'); số dương thì
                  thêm '+' bằng chữ — đọc JSDoc showSign của Money.tsx. */}
              {b.chenhMoiNam > 0 && <span className="text-fg-warn">+</span>}
              <Money
                amount={b.chenhMoiNam}
                currency={b.currency}
                tone={b.chenhMoiNam > 0 ? 'warn' : 'in'}
              />
              /năm nếu giữ giá này
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
