// Panel Tài khoản của Bản tin (§4.1, cột phụ của bản vẽ redesign 2026-09-05). Con số
// TÀI SẢN RÒNG đứng đầu, rồi danh sách số dư — cột Δ 30 ngày, ngày đối chiếu và nút Đối
// chiếu tại dòng là bản 12b của tab Tài sản (PR 10), không phải của Bản tin.
//
// Đọc thẳng `purposeGroups` của `useAssetsData` rồi trải phẳng: cùng phép tính với tab
// Tài sản (đã lọc nhóm ẩn / tài khoản ẩn, đã quy đổi base), nên hai màn không bao giờ
// nói hai số dư khác nhau cho cùng một tài khoản.
//
// Chấm cạnh một dòng = tài khoản đó quá RECONCILE_STALE_DAYS chưa đối chiếu. KHÔNG tự
// suy ở đây: BulletinPage tính từ `lastReconciledMap` — đúng nguồn mà chuông nhắc và
// khối Độ tin cậy dùng, ba chỗ trên cùng một màn phải cùng một danh sách tài khoản cũ.
import { Link } from 'react-router-dom'
import { Card, Money, SectionTitle, StatusDot } from '../../components/ui'
import { AccountTypeIcon } from '../../components/icons'
import type { AssetGroup } from '../assets/aggregate'
import type { CurrencyCode } from '../../lib/money'

/** Trần dòng — Bản tin là chỗ liếc; ai có 20 tài khoản thì mở tab Tài sản. */
const MAX_ROWS = 7

interface Props {
  groups: AssetGroup[]
  /**
   * Tài sản ròng quy đổi base — CÙNG con số với ô "Tài sản ròng" của KpiRow (bản vẽ cố ý
   * in hai lần: ô trả lời "kỳ này ra sao", đây trả lời "nó nằm ở những ví nào").
   * null = thiếu tỷ giá, không in số thiếu (§14).
   */
  netWorth: number | null
  base: CurrencyCode
  /** id tài khoản quá 30 ngày chưa đối chiếu — xem chú thích đầu file. */
  staleIds: ReadonlySet<string>
}

// Mỗi dòng in số dư ở ĐỒNG TIỀN GỐC của tài khoản — quy hết về base thì số trên màn
// không khớp số trên app ngân hàng. `base` chỉ dành cho dòng tài sản ròng.
export function AccountsPanel({ groups, netWorth, base, staleIds }: Props) {
  const accounts = groups.flatMap((g) => g.accounts)
  const shown = accounts.slice(0, MAX_ROWS)

  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>Tài khoản</SectionTitle>
        <Link to="/assets" className="-my-2 py-2 text-2xs font-medium text-fg-accent hover:underline">
          Xem tất cả →
        </Link>
      </div>

      {netWorth !== null && (
        <p className="mt-2.5 flex items-baseline gap-2">
          <span className="font-mono text-kpi font-medium tracking-number">
            <Money amount={netWorth} currency={base} tone="neutral" />
          </span>
          <span className="text-2xs text-fg-muted">tài sản ròng · sau nợ và cho vay</span>
        </p>
      )}

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">
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
                <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">
                  {a.name}
                </span>
                {staleIds.has(a.id) && (
                  <StatusDot tone="warn" label="Chưa đối chiếu quá 30 ngày" />
                )}
                <Money
                  amount={a.value}
                  currency={a.currency}
                  tone={a.value < 0 ? 'out' : 'neutral'}
                  className="shrink-0 text-sm"
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
