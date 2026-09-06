// Khối "Cơ cấu" — VẠCH XẾP thay biểu đồ tròn (bản vẽ 2a), và từ 09/2026 là chỗ khai
// TỶ TRỌNG MỤC TIÊU luôn.
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
//
// ---- Vì sao mục tiêu nằm ở ĐÂY chứ không ở một thẻ riêng --------------------------
//
// Bản trước có thẻ "Tỷ trọng mục tiêu" đứng CUỐI trang, cách thẻ này cả bảng tài khoản
// (2–3 màn cuộn). Hai thẻ là một cặp câu hỏi–trả lời: "đang bao nhiêu" và "muốn bao
// nhiêu". Tách ra thì thẻ dưới buộc phải in lại "đang 72,2%" — tức con số duy nhất
// trùng nhau giữa hai thẻ tồn tại chỉ vì khoảng cách. Gộp lại là hết trùng.
//
// Cột mục tiêu CHỈ hiện ở lát "mục đích": mục tiêu khai theo nhóm của người dùng, không
// theo loại tài khoản hay loại tiền (xem rebalance.ts).
import { ExplainBox } from '../../components/ExplainBox'
import { Card, Money, Num, SectionTitle } from '../../components/ui'
import { formatMoney } from '../../lib/money'
import { formatShare, type AssetGroup } from './aggregate'
import type { MoneyView } from './moneyView'
import { parsePctToBps, REBAL_DRIFT_ALERT_PP, type RebalanceResult } from './rebalance'

/** Lát nhỏ nhất vẫn phải thấy được. 2px = đủ một sợi nhìn ra màu, chưa tới mức nói dối. */
const SAN_LAT_PX = 2

export interface RebalanceUi {
  plan: RebalanceResult
  /** bps theo tên nhóm — giá trị hiện trong ô nhập. */
  targets: ReadonlyMap<string, number>
  onSetTarget: (name: string, bps: number | null) => void
}

interface Props {
  /** Nhóm của lát đang cắt, theo thứ tự người dùng (dùng để tra màu). */
  groups: AssetGroup[]
  /** Màu theo tên nhóm — cùng hàm với chấm màu ở bảng dưới. */
  colorOf: (name: string) => string
  /** Nhãn lát đang cắt: "mục đích" / "loại" / "loại tiền". */
  modeLabel: string
  view: MoneyView
  isLoading: boolean
  /** Chỉ truyền ở lát "mục đích" — xem đầu file. */
  rebalance?: RebalanceUi | null
}

const bpsToText = (bps: number) =>
  (bps / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })

const pct1 = (v: number) => `${v.toFixed(1).replace('.', ',')}%`

const pp1 = (v: number) =>
  `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}`

export function StructureBar({
  groups,
  colorOf,
  modeLabel,
  view,
  isLoading,
  rebalance = null,
}: Props) {
  const plan = rebalance?.plan ?? null
  // Mẫu số của vạch = mẫu số của kế hoạch tái cân bằng khi có nó, để thẻ không bao giờ
  // vẽ một tỷ lệ rồi đo lệch trên một tỷ lệ khác. Không có nó thì như cũ: Tổng tài sản.
  const byName = new Map(groups.map((g) => [g.name, g]))
  const counted =
    plan !== null
      ? plan.rows.map((r) => byName.get(r.name)).filter((g): g is AssetGroup => g !== undefined)
      : groups
          .filter((g) => g.includeInTotals && g.total > 0)
          .slice()
          .sort((a, b) => b.total - a.total)
  const tong = plan?.denominator ?? counted.reduce((s, g) => s + g.total, 0)
  const countedNames = new Set(counted.map((g) => g.name))
  // Nhóm ngoài mẫu số mà VẪN CÓ TIỀN phải có dòng riêng, không chỉ một dòng chú thích:
  // không có dòng thì không có ô nhập, và mẫu số 'all' sẽ không bao giờ khai được
  // (xem rebalance.ts — chính lời khai là cái công tắc). Chúng chưa có lát trên vạch.
  const ngoaiMauSo = groups.filter((g) => !countedNames.has(g.name))
  const khaiDuoc = rebalance !== null ? ngoaiMauSo.filter((g) => g.total > 0) : []
  const khaiDuocNames = new Set(khaiDuoc.map((g) => g.name))
  const ngoaiTong = ngoaiMauSo.filter((g) => !khaiDuocNames.has(g.name))
  const rowOf = (name: string) => plan?.rows.find((r) => r.name === name) ?? null

  return (
    <Card
      as="section"
      elevation="panel"
      padding="none"
      className="flex min-w-0 flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-panel px-4 py-2.5">
        <SectionTitle role="micro">
          Cơ cấu · theo {modeLabel}
        </SectionTitle>
        <span className="shrink-0 text-2xs text-fg-muted">
          {plan?.basis === 'all'
            ? `${counted.length} nhóm · trên toàn bộ tài sản`
            : `${counted.length} nhóm được tính vào tổng`}
        </span>
      </div>

      {counted.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-fg-muted">
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

          {rebalance !== null && (
            <div className="flex items-center gap-2 px-4 pt-3 text-2xs font-semibold uppercase tracking-label text-fg-muted">
              <span className="h-2 w-2 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1" />
              <span className="w-12 shrink-0 text-right">Đang</span>
              <span className="w-14 shrink-0 text-right">Mục tiêu</span>
              <span className="hidden w-12 shrink-0 text-right sm:block">Lệch</span>
            </div>
          )}

          <ul className="flex flex-col gap-2 px-4 py-3">
            {counted.map((g) => {
              const row = rowOf(g.name)
              const bps = rebalance?.targets.get(g.name) ?? null
              return (
                <li key={g.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: colorOf(g.name) }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fg-secondary">{g.name}</span>
                    <span className="flex items-baseline gap-1.5 text-2xs">
                      <Money
                        {...view.view(g.total)}
                        tone="muted"
                        approx={view.view(g.total).approx || g.hasMissingRate}
                      />
                      {/* Dưới sm cột "Lệch" nhường chỗ cho TÊN NHÓM: ở 375px × cỡ chữ
                          1,25× nó ép tên xuống ~90px, tức "Tài sản Việt Nam" và "Tài sản
                          Nhật" cùng in ra "Tài sả…" — hai nhóm khác nhau, một chuỗi. */}
                      {row?.driftPp != null && (
                        <Num
                          tone={Math.abs(row.driftPp) >= REBAL_DRIFT_ALERT_PP ? 'out' : 'muted'}
                          className="sm:hidden"
                        >
                          {pp1(row.driftPp)}đ%
                        </Num>
                      )}
                    </span>
                  </span>
                  <span className="w-12 shrink-0 text-right">
                    <Num tone="neutral">
                      {row !== null ? pct1(row.actualPct) : formatShare(g.total / tong)}
                    </Num>
                  </span>
                  {rebalance !== null && (
                    <>
                      <label className="flex w-14 shrink-0 items-baseline justify-end gap-1 text-2xs text-fg-muted">
                        <input
                          key={`${g.name}:${bps ?? ''}`}
                          type="text"
                          inputMode="decimal"
                          defaultValue={bps !== null ? bpsToText(bps) : ''}
                          placeholder="—"
                          aria-label={`Tỷ trọng mục tiêu của nhóm ${g.name} (%)`}
                          className="w-10 rounded-md border border-border-strong bg-surface px-1.5 py-1 text-right font-mono text-sm tabular-nums"
                          onBlur={(e) => {
                            const next = parsePctToBps(e.target.value)
                            if (next === undefined) {
                              e.target.value = bps !== null ? bpsToText(bps) : ''
                              return
                            }
                            if (next !== bps) rebalance.onSetTarget(g.name, next)
                          }}
                        />
                        <span>%</span>
                      </label>
                      <span className="hidden w-12 shrink-0 text-right sm:block">
                        {row?.driftPp != null ? (
                          <Num
                            tone={Math.abs(row.driftPp) >= REBAL_DRIFT_ALERT_PP ? 'out' : 'muted'}
                          >
                            {pp1(row.driftPp)}
                          </Num>
                        ) : (
                          <span className="text-2xs text-fg-muted">—</span>
                        )}
                      </span>
                    </>
                  )}
                </li>
              )
            })}
          </ul>

          {khaiDuoc.length > 0 && (
            <ul className="flex flex-col gap-2 border-t border-border-subtle px-4 py-3">
              {khaiDuoc.map((g) => {
                const bps = rebalance?.targets.get(g.name) ?? null
                return (
                  <li key={g.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2 w-2 shrink-0 rounded-sm border border-border-strong"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-fg-secondary">{g.name}</span>
                      <Money
                        {...view.view(g.total)}
                        tone="muted"
                        approx={view.view(g.total).approx || g.hasMissingRate}
                        className="block text-2xs"
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right text-2xs text-fg-muted">
                      ngoài tổng
                    </span>
                    <label className="flex w-14 shrink-0 items-baseline justify-end gap-1 text-2xs text-fg-muted">
                      <input
                        key={`${g.name}:${bps ?? ''}`}
                        type="text"
                        inputMode="decimal"
                        defaultValue={bps !== null ? bpsToText(bps) : ''}
                        placeholder="—"
                        aria-label={`Tỷ trọng mục tiêu của nhóm ${g.name} (%)`}
                        className="w-10 rounded-md border border-border-strong bg-surface px-1.5 py-1 text-right font-mono text-sm tabular-nums"
                        onBlur={(e) => {
                          const next = parsePctToBps(e.target.value)
                          if (next === undefined) {
                            e.target.value = bps !== null ? bpsToText(bps) : ''
                            return
                          }
                          if (next !== bps) rebalance?.onSetTarget(g.name, next)
                        }}
                      />
                      <span>%</span>
                    </label>
                    <span className="hidden w-12 shrink-0 sm:block" aria-hidden />
                  </li>
                )
              })}
              <li className="text-2xs leading-snug text-fg-muted">
                Chưa có lát trên vạch vì các nhóm này đứng ngoài Tổng tài sản. Khai mục
                tiêu cho một trong số chúng thì cả thẻ chuyển sang đo trên TOÀN BỘ tài sản.
              </li>
            </ul>
          )}
        </>
      )}

      {plan !== null && plan.declaredPct > 100.05 && (
        <p className="px-4 pb-2 text-2xs text-state-warn-fg">
          Tổng mục tiêu đã khai là <Num tone="muted">{Math.round(plan.declaredPct)}%</Num> —
          quá 100%, các con số lệch bên trên sẽ không thể cùng về 0.
        </p>
      )}

      {plan !== null &&
        plan.worst !== null &&
        (plan.alert ? (
          <p className="border-t border-border-panel px-4 py-2.5 text-sm font-medium text-fg-accent">
            Lệch nhất: «{plan.worst.name}» đang{' '}
            <Num tone="muted">{pct1(plan.worst.actualPct)}</Num> so mục tiêu{' '}
            <Num tone="muted">{plan.worst.targetPct.toFixed(0)}%</Num>
            {plan.worst.addToReachMinor !== null && (
              <>
                {' '}
                — góp thêm{' '}
                <Money {...view.view(plan.worst.addToReachMinor)} className="text-sm" /> bằng
                tiền mới là về mục tiêu, không cần bán gì
              </>
            )}
            .
          </p>
        ) : (
          <p className="border-t border-border-panel px-4 py-2.5 text-sm text-fg-secondary">
            Cơ cấu đang trong ngưỡng ±<Num tone="muted">{REBAL_DRIFT_ALERT_PP}đ%</Num> quanh
            mục tiêu — chưa cần làm gì.
          </p>
        ))}

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

      {rebalance !== null && (
        <div className="border-t border-border-subtle px-4 py-2.5 empty:hidden empty:border-0 empty:p-0">
          <ExplainBox label="Vì sao chỉ gợi ý góp thêm, không gợi ý bán">
            <p>
              Mục tiêu khai một lần lúc bình tĩnh chính là để những lúc thị trường nhảy
              múa có một con số đứng yên mà bám. Lệch quá {REBAL_DRIFT_ALERT_PP} điểm % app
              sẽ nhắc ở đây và ở Bản tin.
            </p>
            <p>
              Cân lại bằng TIỀN GÓP MỚI: bán trong NISA là mất suất miễn thuế của phần đó
              vĩnh viễn, còn bán ngoài NISA thì nộp ~20% thuế lãi — cả hai đều đắt hơn việc
              hướng vài tháng tiền góp về nhóm đang hụt.
            </p>
            <p>
              Mẫu số đi theo chính lời khai: chỉ khai cho nhóm đang tính vào Tổng tài sản
              thì đo trên tổng đó; khai cho một nhóm đứng NGOÀI tổng (ví dụ nhóm đầu tư
              bằng ngoại tệ) thì mẫu số nở ra toàn bộ tài sản, và dòng trên cùng của thẻ
              nói rõ đang đo trên cái nào.
            </p>
          </ExplainBox>
        </div>
      )}
    </Card>
  )
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
