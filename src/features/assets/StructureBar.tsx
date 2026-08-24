// Khối "Cơ cấu" — VẠCH XẾP thay biểu đồ tròn (bản vẽ 2a).
//
// ---- Vì sao bỏ cái bánh -----------------------------------------------------------
//
// Sổ này có bốn nhóm được tính vào tổng, tỷ trọng 83 / 16 / 1,9 / 0,05%. Trên một vòng
// tròn, lát 0,05% là một sợi chỉ mảnh hơn nét viền, và lát 1,9% chỉ dày hơn nó chút ít —
// tức hai trong bốn lát không có hình. Cái bánh còn ăn 176×176px và phải chừa chỗ giữa
// cho một con số ("4 nhóm") mà chú giải ngay cạnh đã nói.
//
// Một vạch ngang cao 10px làm được đúng phần cái bánh làm được (tỷ lệ của một tổng),
// tốn 1/10 chiều cao, và lát bé nhất vẫn nhìn thấy vì nó có SÀN 2px — trên vòng tròn
// không có cách nào đặt sàn cho một góc mà không nói dối về góc đó.
//
// Đổi lại, vạch không đọc được thứ tự "lát nào lớn hơn lát nào" bằng mắt tốt như góc
// tròn. Nên chú giải bên dưới xếp GIẢM DẦN theo số tiền, và vạch xếp CÙNG thứ tự đó —
// hai thứ đọc cùng chiều thì mắt không phải bắc cầu.
import { Card, Money } from '../../components/ui'
import { formatMoney } from '../../lib/money'
import type { AssetGroup } from './aggregate'
import type { MoneyView } from './moneyView'

/** Lát nhỏ nhất vẫn phải thấy được. 2px = đủ một sợi nhìn ra màu, chưa tới mức nói dối. */
const SAN_LAT_PX = 2

interface Props {
  /** Nhóm của lát đang cắt, theo thứ tự người dùng (dùng để tra màu). */
  groups: AssetGroup[]
  /** Màu theo tên nhóm — cùng hàm với chấm màu ở bảng dưới. */
  colorOf: (name: string) => string
  /** Nhãn lát đang cắt: "mục đích" / "loại" / "loại tiền". */
  modeLabel: string
  view: MoneyView
  isLoading: boolean
}

export function StructureBar({ groups, colorOf, modeLabel, view, isLoading }: Props) {
  // Mẫu số của vạch = Tổng tài sản, nên chỉ nhóm ĐƯỢC TÍNH vào tổng có lát.
  const counted = groups
    .filter((g) => g.includeInTotals && g.total > 0)
    .slice()
    .sort((a, b) => b.total - a.total)
  const tong = counted.reduce((s, g) => s + g.total, 0)
  const ngoaiTong = groups.filter((g) => !g.includeInTotals || g.total === 0)

  return (
    <Card
      as="section"
      elevation="panel"
      padding="none"
      className="flex min-w-0 flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-panel px-4 py-2.5">
        <h2 className="text-2xs uppercase tracking-[.1em] text-fg-muted">
          Cơ cấu · theo {modeLabel}
        </h2>
        <span className="shrink-0 text-2xs text-fg-muted">
          {counted.length} nhóm được tính vào tổng
        </span>
      </div>

      {counted.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-fg-muted">
          {isLoading ? 'Đang tải…' : 'Chưa có tài sản để hiển thị'}
        </p>
      ) : (
        <>
          <div className="px-4 pt-3.5">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-sunken">
              {counted.map((g) => (
                <div
                  key={g.name}
                  className="h-full"
                  style={{
                    width: `${(g.total / tong) * 100}%`,
                    minWidth: SAN_LAT_PX,
                    backgroundColor: colorOf(g.name),
                  }}
                />
              ))}
            </div>
          </div>

          <ul className="flex flex-col gap-2 px-4 py-3">
            {counted.map((g) => (
              <li key={g.name} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: colorOf(g.name) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-fg-secondary">{g.name}</span>
                <Money
                  {...view.view(g.total)}
                  tone="muted"
                  approx={view.view(g.total).approx || g.hasMissingRate}
                  className="shrink-0"
                />
                {/* Tỷ trọng in tới một chữ số thập phân khi nó nhỏ hơn 10%: làm tròn
                    0,05% thành "0%" là biến một nhóm CÓ tiền thành một nhóm không có. */}
                <span className="w-11 shrink-0 text-right font-mono font-semibold text-fg-primary">
                  {tyTrong(g.total / tong)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {ngoaiTong.length > 0 && (
        <p className="mt-auto border-t border-border-subtle px-4 py-2.5 text-2xs leading-snug text-fg-muted">
          Ngoài tổng:{' '}
          {ngoaiTong.map((g, i) => (
            <span key={g.name}>
              {i > 0 && ' · '}
              <span className="text-fg-secondary">{g.name}</span> — {g.accounts.length} tài
              khoản, {tienGoc(g, view)}
            </span>
          ))}
          . Không có lát nào trên vạch vì mẫu số không chứa nó.
        </p>
      )}
    </Card>
  )
}

/** 83% · 1,9% · 0,05% — giữ chữ số có nghĩa đầu tiên thay vì làm tròn về 0. */
function tyTrong(share: number): string {
  const pct = share * 100
  if (pct >= 10) return `${Math.round(pct)}%`
  if (pct >= 1) return `${pct.toFixed(1).replace('.', ',')}%`
  return `${pct.toFixed(2).replace('.', ',')}%`
}

/**
 * Nhóm ngoài tổng in TIỀN GỐC, không in bản quy đổi — cùng lý do đã ghi ở dòng đầu
 * nhóm trong bảng: `rawTotal` coi tài khoản thiếu tỷ giá là 0, nên một nhóm VND sẽ in
 * "¥0" ngay cạnh những dòng đang nói hàng trăm triệu ₫.
 */
function tienGoc(g: AssetGroup, view: MoneyView): string {
  if (g.nativeTotals.length === 0) return view.fmt(g.rawTotal, undefined, g.rawHasMissingRate)
  const head = g.nativeTotals
    .slice(0, 2)
    .map((n) => formatMoney(n.amount, n.currency))
    .join(' · ')
  return g.nativeTotals.length > 2
    ? `${head} +${g.nativeTotals.length - 2} loại tiền`
    : head
}
