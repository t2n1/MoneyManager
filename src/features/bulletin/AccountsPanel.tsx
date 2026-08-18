// Panel Tài khoản của Bản tin (§4.1, khối 4). Danh sách số dư, không có gì khác —
// cột Δ 30 ngày, ngày đối chiếu và nút Đối chiếu tại dòng là bản 12b của tab Tài sản
// (PR 10), không phải của Bản tin.
//
// Đọc thẳng `purposeGroups` của `useAssetsData` rồi trải phẳng: cùng phép tính với tab
// Tài sản (đã lọc nhóm ẩn / tài khoản ẩn, đã quy đổi base), nên hai màn không bao giờ
// nói hai số dư khác nhau cho cùng một tài khoản.
import { Link } from 'react-router-dom'
import { Card, Money } from '../../components/ui'
import { AccountTypeIcon } from '../../components/icons'
import type { AssetGroup } from '../assets/aggregate'

/** Trần dòng — Bản tin là chỗ liếc; ai có 20 tài khoản thì mở tab Tài sản. */
const MAX_ROWS = 6

// Cố ý KHÔNG nhận `base`: mỗi dòng in số dư ở ĐỒNG TIỀN GỐC của tài khoản, nên panel
// này không cần biết đồng tiền quy đổi là gì. Bản quy đổi là ô "Tài sản ròng" ở trên.
export function AccountsPanel({ groups }: { groups: AssetGroup[] }) {
  const accounts = groups.flatMap((g) => g.accounts)
  const shown = accounts.slice(0, MAX_ROWS)

  return (
    <Card
      elevation="panel"
      padding="panel"
      as="section"
      // `basis-full xl:basis-0`: xem chú thích ở CashflowPanel — cặp panel phải DỌC ở
      // dưới xl, mà `flex-1` một mình thì chỉ co lại chứ không xuống dòng.
      className="min-w-0 flex-1 basis-full xl:max-w-[23.75rem] xl:basis-0"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[0.8125rem] font-semibold text-fg-primary">Tài khoản</h2>
        <Link to="/assets" className="-my-2 py-2 text-2xs font-medium text-fg-accent hover:underline">
          Xem tất cả →
        </Link>
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 text-[0.8125rem] text-fg-muted">
          Chưa có tài khoản nào.{' '}
          <Link to="/settings/accounts" className="font-medium text-fg-accent hover:underline">
            Thêm tài khoản
          </Link>
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border-subtle">
          {shown.map((a) => (
            <li key={a.id}>
              <Link
                to={`/assets/account/${a.id}`}
                className="flex items-center gap-2.5 py-2 transition hover:bg-surface-sunken"
              >
                <AccountTypeIcon type={a.type} className="h-4 w-4 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg-secondary">
                  {a.name}
                </span>
                {/* Số dư ở đồng tiền gốc: đây là danh sách "ví nào còn bao nhiêu", mà
                    quy hết về base thì số trên màn không khớp số trên app ngân hàng. */}
                <Money
                  amount={a.value}
                  currency={a.currency}
                  tone={a.value < 0 ? 'out' : 'neutral'}
                  className="shrink-0 text-xs"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {accounts.length > MAX_ROWS && (
        <p className="mt-2 text-2xs text-fg-muted">
          và {accounts.length - MAX_ROWS} tài khoản nữa
        </p>
      )}
    </Card>
  )
}
