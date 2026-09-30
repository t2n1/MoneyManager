// Bản ĐỌC của tab Tương lai cho màn hẹp (dưới 1280px) — mục 22, soát 2026-09-23.
//
// Trước bản này, dưới 1280px cả trang chỉ là một lời nhắn "cần máy tính": người dùng mở
// trên điện thoại không thấy được cả câu kết luận của chính kế hoạch mình. Console kéo thả
// vẫn chỉ cho máy tính (nó cần rail + vùng vẽ + dock cùng lúc), nhưng ĐỌC thì không cần
// chỗ rộng như thế.
//
// KHÔNG TÍNH GÌ MỚI. Mọi con số ở đây đến từ đúng những chỗ console đọc:
//   - bản chiếu `rows`/`input` của `useLifetime` (trang truyền xuống, một lượt gọi hook
//     dùng chung với console — xem `TuongLaiPage`);
//   - câu kết luận: `lifetimeVerdict` + `verdictHeadline`/`verdictShort` (summary.ts);
//   - tài sản ở tuổi cuối: `assetsAtAge` (insights.ts);
//   - thiếu tỷ giá: `missingRateCurrencies` (fxModel.ts), cùng luật "≈" của cả repo;
//   - mỗi chặng thành một dòng: `phaseDigest` (readView.ts).
//
// Bản đọc hiện bản ĐÃ LƯU, không hiện bản nháp của console: nháp là thứ đang vặn dở trên
// máy tính, còn ở đây người ta hỏi "kế hoạch của tôi đang nói gì".
import { Star } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { ConclusionLine } from '../../components/VerdictNote'
import { Card, EmptyState, FilterChip, Money, Num, SectionTitle } from '../../components/ui'
import { missingRateCurrencies } from './fxModel'
import { assetsAtAge } from './insights'
import { phaseDigest } from './readView'
import {
  FIRE_MEANING,
  inflationRow,
  lifetimeVerdict,
  pctPerYear,
  verdictHeadline,
  verdictShort,
} from './summary'
import type { useLifetime } from './useLifetime'
import { tr } from '../../i18n'
import { trn } from '../../i18n/react'

export function TuongLaiMobile({ lt }: { lt: ReturnType<typeof useLifetime> }) {
  const { scenarios, active, activeId, setActiveId, rows, input, isLoading, fxOf } = lt

  const verdict = useMemo(
    () =>
      input && rows.length > 0 ? lifetimeVerdict(rows, input.birthYear, input.endAge) : null,
    [input, rows],
  )
  const atEnd = useMemo(
    () => (input && rows.length > 0 ? assetsAtAge(rows, input.endAge) : null),
    [input, rows],
  )
  const missing = useMemo(() => (input ? missingRateCurrencies(input, fxOf) : []), [input, fxOf])
  const phases = useMemo(() => (input ? phaseDigest(input, rows) : []), [input, rows])

  if (isLoading) return <EmptyState>{tr('Đang tải…')}</EmptyState>

  if (scenarios.length === 0) {
    return (
      <Card as="section">
        <EmptyState compact>
          {tr('Chưa có kịch bản nào. Mở trang này trên máy tính để tạo kịch bản đầu tiên.')}
        </EmptyState>
      </Card>
    )
  }

  if (!active || !input) return <EmptyState>{tr('Đang tải…')}</EmptyState>

  const currency = input.displayCurrency
  const approx = missing.length > 0
  const inflation = inflationRow(input.nominalTerms, input.inflationBps)
  const events = [...input.events].sort((a, b) => a.startYear - b.startYear)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* --- Kịch bản đã lưu — chọn để xem ------------------------------------------ */}
      <Card as="section">
        <SectionTitle>{tr('Kịch bản đã lưu')}</SectionTitle>
        <div className="mt-2 flex flex-wrap gap-2">
          {scenarios.map((s) => (
            <FilterChip
              key={s.id}
              on={s.id === activeId}
              size="sm"
              onClick={() => setActiveId(s.id)}
              className="max-w-full"
            >
              {s.is_primary && <Star className="h-3 w-3 shrink-0" aria-hidden="true" />}
              <span className="truncate">{s.name}</span>
              {s.is_primary && <span className="sr-only">{tr('(kịch bản chính)')}</span>}
            </FilterChip>
          ))}
        </div>
        {/* E-ink + Gọn: bỏ lời dặn và định nghĩa, giữ con số. */}
        <p className="mt-2 text-sm text-fg-muted eink-gon:hidden">
          {tr('Đây là bản xem nhanh. Muốn chỉnh kế hoạch thì mở trên máy tính.')}
        </p>
      </Card>

      {/* --- Kết luận --------------------------------------------------------------- */}
      <Card as="section">
        {verdict === null ? (
          <EmptyState compact>{verdictHeadline(null)}</EmptyState>
        ) : (
          <>
            <ConclusionLine tone={verdict.tone} short={verdictShort(verdict)}>
              {verdictHeadline(verdict)}.
            </ConclusionLine>
            {/* Nghĩa của "tự do tài chính" viết ra chữ — trên điện thoại không có rê chuột
                để đọc `title` (mục 26). */}
            <p className="mt-2 text-sm text-fg-secondary">
              {tr('Tự do tài chính')}
              <span className="eink-gon:hidden"> ({FIRE_MEANING})</span>:{' '}
              {verdict.fireYear !== null
                ? trn('năm {year}, tuổi {age}.', {
                    year: <Num>{verdict.fireYear}</Num>,
                    age: <Num>{verdict.fireAge}</Num>,
                  })
                : tr('chưa đạt trong bản chiếu này.')}
            </p>
            <div className="mt-3 flex flex-col gap-1.5 border-t border-border-subtle pt-3 text-sm">
              <Row label={tr('Tài sản lúc {age} tuổi', { age: input.endAge })}>
                {atEnd === null ? (
                  <Num tone="muted">—</Num>
                ) : (
                  <Money amount={atEnd.center} currency={currency} compact tone="bySign" approx={approx} />
                )}
              </Row>
              <Row label={tr('Nếu bi quan')}>
                {atEnd === null ? (
                  <Num tone="muted">—</Num>
                ) : (
                  <Money amount={atEnd.low} currency={currency} compact tone="bySign" approx={approx} />
                )}
              </Row>
            </div>
            {approx && (
              <p className="mt-2 text-sm text-fg-warn">
                {tr('Chưa tra được tỷ giá {currencies} — các số có dấu ≈ còn thiếu phần đó.', { currencies: missing.join(', ') })}
              </p>
            )}
          </>
        )}
      </Card>

      {/* --- Giả định chính ------------------------------------------------------------ */}
      <Card as="section">
        <SectionTitle>{tr('Giả định của kịch bản')}</SectionTitle>
        <div className="mt-2 flex flex-col gap-1.5 text-sm">
          <Row label={tr('Năm sinh')}>
            <Num>{input.birthYear}</Num>
          </Row>
          <Row label={tr('Chiếu đến')}>
            <span>
              {trn('tuổi {age} (năm {year})', {
                age: <Num>{input.endAge}</Num>,
                year: <Num>{input.birthYear + input.endAge}</Num>,
              })}
            </span>
          </Row>
          <Row label={tr('Tài sản khởi điểm')}>
            <Money amount={input.startingAssetsMinor} currency={currency} compact />
          </Row>
          <Row label={tr('Lợi suất thực')}>
            <Num>{pctPerYear(input.realReturnBps)}</Num>
          </Row>
          <Row label={tr('Dải dao động')}>
            <Num tone="warn">±{pctPerYear(input.bandSpreadBps)}</Num>
          </Row>
          <Row label={tr('Lạm phát chi tiêu')}>
            {inflation.active ? <Num>{inflation.text}</Num> : <span>{inflation.text}</span>}
          </Row>
        </div>

        <SectionTitle role="micro" as="h3" className="mt-4">
          {tr('Chặng đời')}
        </SectionTitle>
        <ul className="mt-1.5 flex flex-col">
          {phases.map((p) => (
            <li
              key={p.start}
              className="border-t border-border-subtle py-2 text-sm first:border-t-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-fg-primary">{p.label}</span>
                <span className="shrink-0 text-fg-muted">
                  <Num tone="muted">{p.start}</Num>
                  {p.end === null ? ` ${tr('trở đi')}` : <>–<Num tone="muted">{p.end}</Num></>}
                </span>
              </div>
              {p.incomeMinor === null || p.expenseMinor === null ? (
                <p className="text-fg-muted">{tr('Đã qua')}</p>
              ) : (
                <p className="text-fg-secondary">
                  {trn('Thu {income} · Chi {expense} mỗi năm', {
                    income: <Money amount={p.incomeMinor} currency={currency} compact tone="in" approx={approx} />,
                    expense: <Money amount={p.expenseMinor} currency={currency} compact tone="out" approx={approx} />,
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>

        <SectionTitle role="micro" as="h3" className="mt-4">
          {tr('Mốc cuộc đời')}
        </SectionTitle>
        {events.length === 0 ? (
          <p className="mt-1.5 text-sm text-fg-muted">{tr('Kế hoạch chưa có mốc nào.')}</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex items-baseline gap-2">
                <Num tone="muted" className="shrink-0">
                  {e.startYear}
                </Num>
                <span className="min-w-0 truncate text-fg-primary">{e.label}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* --- Bảng theo năm --------------------------------------------------------------
          Ba cột, số rút gọn: ở 375px và Cỡ chữ 1,25× năm cột sẽ tràn ngang. "Thu − chi" là
          `netFlowMinor` — gồm cả tiền của các mốc, tức đúng phần làm tài sản đổi trong năm. */}
      <Card as="section" padding="none">
        <div className="px-4 pt-4">
          <SectionTitle>{tr('Theo từng năm')}</SectionTitle>
        </div>
        <table className="mt-2 w-full table-fixed text-sm">
          <thead>
            <tr className="text-2xs text-fg-muted">
              <th scope="col" className="px-4 py-1.5 text-left font-medium">
                {tr('Năm · tuổi')}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {tr('Tài sản cuối năm')}
              </th>
              <th scope="col" className="px-4 py-1.5 text-right font-medium">
                {tr('Thu − chi')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} className="border-t border-border-subtle">
                <td className="px-4 py-1.5">
                  <Num>{r.year}</Num> <Num tone="muted">· {r.age}</Num>
                </td>
                <td className="py-1.5 text-right">
                  <Money amount={r.assetsEndMinor} currency={currency} compact tone="bySign" approx={approx} />
                </td>
                <td className="px-4 py-1.5 text-right">
                  <Money amount={r.netFlowMinor} currency={currency} compact tone="bySign" approx={approx} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

/** Một dòng nhãn–giá trị. Nhãn co được (truncate), giá trị giữ nguyên. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 text-fg-muted">{label}</span>
      <span className="shrink-0 text-right text-fg-primary">{children}</span>
    </div>
  )
}
