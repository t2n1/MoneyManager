// Khu "Cơ cấu danh mục" — mỗi mã một dòng, đủ cột, và một dòng TỔNG.
//
// HAI cách trình bày cho cùng một dữ liệu, không phải một bảng cuộn ngang:
//   · từ `lg`: bảng thật chín cột, vì so mã với mã theo cột là việc mắt làm tốt nhất;
//   · dưới `lg`: mỗi mã một thẻ. Chín cột trong 375px thì cột nào cũng hẹp tới mức phải
//     cuộn ngang, mà cuộn ngang trong một trang cuộn dọc là thứ người dùng không tìm ra.
//
// Cả hai đều BẤM ĐƯỢC để lọc sổ lệnh theo mã — hành vi có từ trước khu này, và nó là lý
// do khu này không phải một `<table>` trơn.
//
// Mọi phép tính ở positionTable.ts. File này chỉ xếp chữ.
import { EstimateMark } from '../../components/EstimateMark'
import { Guide } from '../../components/Guide'
import { Card, Money, Num, SectionTitle, signedPct, pct1 } from '../../components/ui'
import { InvestDividendTagger } from './InvestDividendTagger'
import { share, sliceColor } from './investFormat'
import type { PositionRow, PositionTableResult, TaggableCashflow } from './positionTable'

const VND = 'VND' as const

interface Props {
  table: PositionTableResult
  /** Mã → tên công ty (HOSE_SYMBOLS). */
  nameBySymbol: Map<string, string>
  symbolFilter: string | null
  onToggleSymbol: (symbol: string) => void
  /** Kết luận về mức tập trung; null = chưa nói được gì. */
  concentration: { text: string; estimated: boolean } | null
  /** Khoản thu/chi có thể gắn mã — nguồn của cột Cổ tức. */
  cashflows: TaggableCashflow[]
  /** Mọi mã đã từng giao dịch (gồm cả mã đã bán hết). */
  allSymbols: string[]
}

/** "+8,5%" / "−12,6%" / "—" từ một phần trăm đã ở thang 100. */
const p = (v: number | null) => signedPct(v == null ? null : pct1(v / 100))
const tone = (v: number | null) => (v == null || v === 0 ? 'neutral' : v > 0 ? 'in' : 'out')

export function InvestAllocationSection({
  table,
  nameBySymbol,
  symbolFilter,
  onToggleSymbol,
  concentration,
  cashflows,
  allSymbols,
}: Props) {
  const { rows, totals, soldDividend } = table

  return (
    <Card as="section">
      <SectionTitle>Cơ cấu danh mục ({rows.length} mã)</SectionTitle>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">
          Chưa giữ mã nào.
          <Guide as="span"> Ghi lệnh mua để app tự lấy giá và tính lời/lỗ.</Guide>
        </p>
      ) : (
        <>
          <BangDesktop
            rows={rows}
            totals={totals}
            symbolFilter={symbolFilter}
            onToggleSymbol={onToggleSymbol}
          />
          <TheDienThoai
            rows={rows}
            nameBySymbol={nameBySymbol}
            symbolFilter={symbolFilter}
            onToggleSymbol={onToggleSymbol}
          />
        </>
      )}

      {soldDividend !== 0 && (
        <p className="mt-2 text-2xs text-fg-secondary">
          Ngoài bảng còn <Money amount={soldDividend} currency={VND} showSign /> cổ tức của
          những mã đã bán hết — tiền đã về tài khoản, nhưng không còn dòng nào để đứng.
        </p>
      )}

      <InvestDividendTagger flows={cashflows} symbols={allSymbols} />

      {concentration && (
        <p className="mt-2 border-t border-border-subtle pt-2 text-2xs text-fg-secondary">
          {concentration.text}
          {concentration.estimated && (
            <EstimateMark reason="Có mã chưa có giá nên tỷ trọng đang tính một phần theo giá vốn." />
          )}
        </p>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- bảng, từ lg ---- */

function BangDesktop({
  rows,
  totals,
  symbolFilter,
  onToggleSymbol,
}: {
  rows: PositionRow[]
  totals: PositionTableResult['totals']
  symbolFilter: string | null
  onToggleSymbol: (s: string) => void
}) {
  return (
    // `overflow-x-auto` dù bảng đã vừa ở 1024px: cỡ chữ 1,25× nới mọi cột ra, và luật
    // cứng là nội dung rộng cuộn TRONG hộp của nó, không đẩy cả trang.
    <div className="mt-2 hidden overflow-x-auto lg:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-2xs text-fg-muted">
            <th scope="col" className="py-1.5 text-left font-normal">
              Mã
            </th>
            <Th>Biến động</Th>
            <Th>Tỷ trọng</Th>
            <Th>Khối lượng</Th>
            <Th>
              Giá nay
              <br />
              Giá vốn
            </Th>
            <Th>
              Giá trị
              <br />
              Tiền mua
            </Th>
            <Th>Lãi/lỗ giá</Th>
            <Th>Cổ tức</Th>
            <Th>Lãi/lỗ</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((r, i) => (
            <tr key={r.symbol} className={symbolFilter === r.symbol ? 'bg-accent-soft-bg' : ''}>
              <td className="py-2">
                <button
                  type="button"
                  onClick={() => onToggleSymbol(r.symbol)}
                  aria-pressed={symbolFilter === r.symbol}
                  className="flex items-center gap-2 text-left font-semibold text-fg-primary"
                >
                  {/* Chấm màu = ĐÚNG lát của mã này trong donut bên dưới. */}
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: sliceColor(i) }}
                    aria-hidden
                  />
                  {r.symbol}
                </button>
              </td>
              <Td>
                <Num tone={tone(r.dayChange)}>{p(r.dayChange)}</Num>
              </Td>
              <Td>
                <Num>{share(r.weight)}</Num>
              </Td>
              <Td>
                <Num>{r.quantity.toLocaleString('vi-VN')}</Num>
              </Td>
              <Td>
                {r.price === null ? (
                  <span className="text-fg-muted">chưa có giá</span>
                ) : (
                  <Money amount={r.price} currency={VND} />
                )}
                <br />
                <Money amount={r.avgCost} currency={VND} className="text-2xs text-fg-muted" />
              </Td>
              <Td>
                <Money amount={r.value} currency={VND} />
                <br />
                <Money amount={r.cost} currency={VND} className="text-2xs text-fg-muted" />
              </Td>
              <Td>
                <Money
                  amount={Math.abs(r.pricePnl)}
                  currency={VND}
                  tone={tone(r.pricePnl)}
                  showSign
                />
                <br />
                <Num tone={tone(r.pricePnlPercent)} className="text-2xs">
                  {p(r.pricePnlPercent)}
                </Num>
              </Td>
              <Td>
                {r.dividend === 0 ? (
                  <span className="text-fg-muted">—</span>
                ) : (
                  <>
                    <Money amount={r.dividend} currency={VND} tone="in" showSign />
                    <br />
                    <Num tone="in" className="text-2xs">
                      {p(r.dividendPercent)}
                    </Num>
                  </>
                )}
              </Td>
              <Td>
                <Money
                  amount={Math.abs(r.totalPnl)}
                  currency={VND}
                  tone={tone(r.totalPnl)}
                  showSign
                  className="font-semibold"
                />
                <br />
                <Num tone={tone(r.totalPnlPercent)} className="text-2xs">
                  {p(r.totalPnlPercent)}
                </Num>
              </Td>
            </tr>
          ))}
        </tbody>
        {/* Dòng TỔNG trong `tfoot`, không phải một `tr` cuối của `tbody`: nó không phải
            một mã, và trình đọc màn hình cần biết thế. */}
        <tfoot>
          <tr className="border-t-2 border-border-strong font-semibold">
            <td className="py-2">Tổng</td>
            <Td />
            <Td>
              <Num>{share(1)}</Num>
            </Td>
            <Td />
            <Td />
            <Td>
              <Money amount={totals.value} currency={VND} />
              <br />
              <Money amount={totals.cost} currency={VND} className="text-2xs text-fg-muted" />
            </Td>
            <Td>
              <Money
                amount={Math.abs(totals.pricePnl)}
                currency={VND}
                tone={tone(totals.pricePnl)}
                showSign
              />
              <br />
              <Num tone={tone(totals.pricePnlPercent)} className="text-2xs">
                {p(totals.pricePnlPercent)}
              </Num>
            </Td>
            <Td>
              {totals.dividend === 0 ? (
                <span className="text-fg-muted">—</span>
              ) : (
                <>
                  <Money amount={totals.dividend} currency={VND} tone="in" showSign />
                  <br />
                  <Num tone="in" className="text-2xs">
                    {p(totals.dividendPercent)}
                  </Num>
                </>
              )}
            </Td>
            <Td>
              <Money
                amount={Math.abs(totals.totalPnl)}
                currency={VND}
                tone={tone(totals.totalPnl)}
                showSign
              />
              <br />
              <Num tone={tone(totals.totalPnlPercent)} className="text-2xs">
                {p(totals.totalPnlPercent)}
              </Num>
            </Td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th scope="col" className="py-1.5 pl-3 text-right font-normal">
      {children}
    </th>
  )
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="py-2 pl-3 text-right align-top whitespace-nowrap">{children}</td>
}

/* ------------------------------------------------------ thẻ, dưới lg ---- */

function TheDienThoai({
  rows,
  nameBySymbol,
  symbolFilter,
  onToggleSymbol,
}: {
  rows: PositionRow[]
  nameBySymbol: Map<string, string>
  symbolFilter: string | null
  onToggleSymbol: (s: string) => void
}) {
  return (
    <ul className="mt-1 divide-y divide-border-subtle lg:hidden">
      {rows.map((r, i) => (
        <li key={r.symbol}>
          <button
            type="button"
            onClick={() => onToggleSymbol(r.symbol)}
            aria-pressed={symbolFilter === r.symbol}
            className="w-full py-2 text-left"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg-primary">
                  {r.symbol}
                  <span className="ml-1.5 text-2xs font-normal text-fg-muted">
                    {share(r.weight)}
                  </span>
                  {r.dayChange !== null && (
                    <Num tone={tone(r.dayChange)} className="ml-1.5 text-2xs font-normal">
                      {p(r.dayChange)}
                    </Num>
                  )}
                </p>
                <p className="truncate text-2xs text-fg-muted">
                  {nameBySymbol.get(r.symbol) ?? '—'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Money amount={r.value} currency={VND} className="text-sm font-semibold" />
                {/* `flex-wrap` + `justify-end`: ở 375px với cỡ chữ 1,25× hai con số này
                    không đứng nổi cùng hàng, và tràn thì chúng đè lên cột bên trái. */}
                <p className="flex flex-wrap items-baseline justify-end gap-x-1 text-2xs">
                  <Money
                    amount={Math.abs(r.totalPnl)}
                    currency={VND}
                    tone={tone(r.totalPnl)}
                    showSign
                    className="text-2xs"
                  />
                  <Num tone={tone(r.totalPnlPercent)} className="text-2xs">
                    {p(r.totalPnlPercent)}
                  </Num>
                </p>
              </div>
            </div>

            {/* Thanh tỷ trọng: mắt so hai thanh nhanh hơn so hai con số phần trăm. Màu
                lấy từ `sliceColor(i)` nên nó là ĐÚNG màu lát của mã này trong donut. */}
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(r.weight * 100, 100)}%`,
                  backgroundColor: sliceColor(i),
                }}
              />
            </div>

            <p className="mt-1 flex flex-wrap items-baseline gap-x-1 text-2xs text-fg-secondary">
              <Num className="text-2xs">{r.quantity.toLocaleString('vi-VN')}</Num>
              <span>cổ · vốn</span>
              <Money amount={r.avgCost} currency={VND} className="text-2xs" />
              {r.price === null ? (
                <span>· chưa có giá</span>
              ) : (
                <>
                  <span>· nay</span>
                  <Money amount={r.price} currency={VND} className="text-2xs" />
                </>
              )}
              {r.dividend !== 0 && (
                <>
                  <span>· cổ tức</span>
                  <Money
                    amount={r.dividend}
                    currency={VND}
                    tone="in"
                    showSign
                    className="text-2xs"
                  />
                </>
              )}
              {/* Chỉ nói tên tài khoản khi mã nằm ở NHIỀU nơi — một tài khoản thì câu đó
                  đúng với mọi dòng, tức là không nói thêm được gì. */}
              {r.accountNames.length > 1 && <span>· {r.accountNames.join(' + ')}</span>}
            </p>
          </button>
        </li>
      ))}
    </ul>
  )
}
