// Trang 退職金 (はぐくみ企業年金) — được gì, mất gì, tới lúc nghỉ bao nhiêu.
//
// Vì sao trang RIÊNG chứ không nhét vào trang chi tiết tài khoản: đây là câu "chế độ này
// lãi lỗ thế nào", không phải câu "tài khoản này có gì" — cùng lý do `InvestPage` tách khỏi
// `AccountDetailPage`. Nhồi năm khối này vào trang chi tiết là làm trang đó dài ra vì đúng
// một tài khoản.
//
// LUẬT XUYÊN SUỐT: mỗi con số phải nói ra nó thuộc loại nào, vì ba loại sai theo ba kiểu
// khác nhau (xem docs/superpowers/specs/2026-08-26-man-hinh-taishokukin-design.md):
//   · ĐO   — từ sổ / phiếu lương          → `<Money>` trần
//   · SÀN  — cộng trừ thuần, không giả định → kèm chữ "ít nhất"
//   · ƯỚC  — có giả định về luật hoặc tương lai → `<EstimateMark>`
//
// Trang này KHÔNG khuyên đóng bao nhiêu. Nó hiện số và nguồn của từng số; mức đóng là
// quyết định của người dùng với 基金 hoặc phòng nhân sự.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { EstimateMark } from '../../components/EstimateMark'
import { Guide } from '../../components/Guide'
import { MoneyField, MONEY_FIELD_CLASS } from '../../components/MoneyField'
import {
  Card,
  EmptyState,
  IconButton,
  Money,
  Num,
  PageHeader,
  SectionTitle,
} from '../../components/ui'
import { formatMonthLabel, parseMonthKey } from '../../lib/dates'
import { KikinSourceSheet } from './KikinSourceSheet'
import { KIKIN_MAX_MONTHLY, useRetirementData } from './useRetirementData'
import { tr, decimalSep } from '../../i18n'
import { trn } from '../../i18n/react'

const JPY = 'JPY' as const

/** 'YYYY-MM' → '2026/08'. Dùng `formatMonthLabel` để mọi màn nói một kiểu. */
const thang = (key: string) => formatMonthLabel(parseMonthKey(key))

/**
 * 30 bps → '0,30'. Dấu PHẨY, không phải dấu chấm — cả app dùng phẩy cho phần thập phân
 * (xem `investFormat.pct` và `signedPct`), và một màn nói '0.30' giữa những màn nói '15,4'
 * là một chỗ lệch mà mắt bắt được ngay.
 */
const suat = (bps: number) => (bps / 100).toFixed(2).replace('.', decimalSep())

export function RetirementPage() {
  const d = useRetirementData()
  /** Mức đang thử ở khối cuối; null = chưa thử, dùng mức đang đóng thật. */
  const [thuMuc, setThuMuc] = useState<number | null>(null)
  const [suaNguon, setSuaNguon] = useState(false)

  if (d.isLoading) {
    return (
      <div className="flex flex-col gap-3 p-3 lg:p-6">
        <PageHeader title="退職金" back="/invest?tab=funds" flush />
        <EmptyState>{tr('Đang tải…')}</EmptyState>
      </div>
    )
  }

  if (!d.account) {
    return (
      <div className="flex flex-col gap-3 p-3 lg:p-6">
        <PageHeader title="退職金" back="/invest?tab=funds" flush />
        <Card as="section">
          <EmptyState compact>
            {trn('Chưa có tài khoản {account}. Nó được tạo khi bạn nhập phiếu lương có khoản {item} ở {link}.', {
              account: <b>退職金</b>,
              item: <b>DB掛金</b>,
              link: (
                <Link to="/settings/data" className="font-medium text-fg-accent">
                  {tr('Cài đặt → Dữ liệu')}
                </Link>
              ),
            })}
          </EmptyState>
        </Card>
      </div>
    )
  }

  const mucThu = thuMuc ?? d.contribution.minorPerMonth
  const loiThu = d.benefitAtLevel(mucThu)
  const doiMuc = mucThu !== d.contribution.minorPerMonth

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="退職金" back="/invest?tab=funds" flush>
        <IconButton aria-label={tr('Sửa số của 基金')} onClick={() => setSuaNguon(true)}>
          <Pencil className="h-5 w-5" />
        </IconButton>
      </PageHeader>

      {/* ── ĐANG CÓ ───────────────────────────────────────────────────── */}
      <Card as="section">
        <SectionTitle role="micro">{tr('Đang có')}</SectionTitle>
        <p className="mt-1">
          <Money
            amount={d.balance}
            currency={JPY}
            className="text-kpi font-medium tracking-number"
          />
        </p>
        {d.contribution.minorPerMonth > 0 && (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-1 text-2xs text-fg-secondary">
            <span>{tr('Đóng')}</span>
            <Money amount={d.contribution.minorPerMonth} currency={JPY} className="text-2xs" />
            <span>{tr('/tháng · đo từ')}</span>
            <Num tone="muted" className="text-2xs">
              {d.contribution.monthsObserved}
            </Num>
            <span className="text-fg-muted">{tr('tháng có phiếu')}</span>
          </p>
        )}

        {d.history.length > 0 && (
          <ul className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
            {d.history.map((h) => (
              <li
                key={h.monthKey}
                className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
              >
                <Num tone="muted" className="text-2xs">
                  {thang(h.monthKey)}
                </Num>
                <Money amount={h.minor} currency={JPY} className="text-sm" />
              </li>
            ))}
          </ul>
        )}

        <Guide className="mt-2 text-2xs text-fg-muted">
          {tr('Nhịp đóng lấy TRUNG VỊ chứ không trung bình: phiếu bù gộp hai kỳ vào một tháng sẽ kéo trung bình lên một mức đóng không có trên hợp đồng nào.')}
        </Guide>
      </Card>

      {/* ── TỚI LÚC NGHỈ ──────────────────────────────────────────────── */}
      <Card as="section">
        {/* Năm + tên chặng nằm trong hàng tiêu đề, cùng khuôn `基準価額 {ngày}` ở
            InvestFundsTab: đây là chú thích nguồn của con số, không phải một đoạn văn. */}
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle>{tr('Tới lúc nghỉ')}</SectionTitle>
          {d.toYear !== null && (
            <span className="text-2xs text-fg-muted">
              <Num tone="muted" className="text-2xs">
                {d.toYear}
              </Num>{' '}
              {tr('· chặng {phase}', { phase: d.phaseLabel ?? '' })}
            </span>
          )}
        </div>
        {d.projection === null || d.toYear === null ? (
          <EmptyState compact>
            {tr('Chưa chiếu được.')}{' '}
            {d.toYear === null ? (
              trn('Đặt một chặng ở {link} để app biết bạn dự tính ngừng làm năm nào.', {
                link: (
                  <Link to="/assets?view=future" className="font-medium text-fg-accent">
                    {tr('Tương lai')}
                  </Link>
                ),
              })
            ) : (
              tr('Chưa đo được nhịp đóng — cần ít nhất một tháng có phiếu.')
            )}
          </EmptyState>
        ) : (
          <>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border-subtle pt-3 text-sm">
              <div>
                <dt className="text-fg-muted">{tr('Còn đóng')}</dt>
                <dd>
                  <Num>{d.projection.months}</Num>{' '}
                  <span className="text-2xs text-fg-muted">{tr('tháng')}</span>
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">{tr('Ít nhất')}</dt>
                <dd>
                  <Money
                    amount={d.projection.minor}
                    currency={JPY}
                    className="font-semibold"
                  />
                </dd>
              </div>
              {d.projection.minorAtRate !== null && (
                <div className="col-span-2">
                  <dt className="text-fg-muted">
                    {trn('Có lãi {rate}{unit}', {
                      rate: <Num tone="muted">{suat(d.rateBps)}</Num>,
                      unit: <span className="text-2xs text-fg-muted">{tr('%/năm')}</span>,
                    })}
                  </dt>
                  <dd className="flex items-baseline">
                    <Money
                      amount={d.projection.minorAtRate}
                      currency={JPY}
                      className="font-semibold"
                    />
                    <EstimateMark
                      reason={
                        d.rateIsDefault
                          ? tr('給付利率 của 事業年度 2025 = {rate}%/năm. 基金 đặt lại mỗi năm tài chính và không bảo đảm cho tương lai.', { rate: suat(d.rateBps) })
                          : tr('給付利率 bạn đã khai = {rate}%/năm. 基金 đặt lại mỗi năm tài chính và không bảo đảm cho tương lai.', { rate: suat(d.rateBps) })
                      }
                    />
                  </dd>
                </div>
              )}
            </dl>
            <Guide className="mt-2 text-2xs text-fg-muted">
              {d.rateIsDefault
                ? tr('“Ít nhất” chỉ cộng tiền đóng, không cộng lãi — chế độ này 元本保証 nên đó là sàn thật. Con số có lãi dùng mức 事業年度 2025; mỗi năm 基金 đặt lại.')
                : tr('“Ít nhất” chỉ cộng tiền đóng, không cộng lãi — chế độ này 元本保証 nên đó là sàn thật. Con số có lãi dùng mức bạn đã khai; mỗi năm 基金 đặt lại.')}
            </Guide>
          </>
        )}
      </Card>

      {/* ── ĐÃ GIẢM ĐƯỢC ─────────────────────────────────────────────── */}
      <Card as="section">
        <SectionTitle>{tr('Đã giảm được')}</SectionTitle>
        <dl className="mt-1 divide-y divide-border-subtle text-sm">
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="min-w-0">
              社会保険料
              <span className="ml-1.5 text-2xs text-fg-muted">{tr('đo từ phiếu')}</span>
            </dt>
            <dd className="shrink-0 text-right">
              {d.standardDrop === null ? (
                <span className="text-2xs text-fg-muted">{tr('chưa đủ phiếu để so')}</span>
              ) : d.standardDrop.unknown ? (
                <span className="text-2xs text-fg-muted">
                  {tr('không suy được 標準報酬 từ phiếu {month}', { month: thang(d.standardDrop.latestMonth) })}
                </span>
              ) : d.standardDrop.drop === 0 ? (
                <span className="text-2xs text-fg-muted">
                  {tr('chưa tụt bậc — đã xem tới phiếu {month}', { month: thang(d.standardDrop.latestMonth) })}
                </span>
              ) : (
                <>
                  <span className="text-2xs text-fg-muted">{tr('標準報酬月額 giảm')} </span>
                  <Money amount={d.standardDrop.drop} currency={JPY} className="text-sm" />
                </>
              )}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
            <dt>所得税 + 住民税</dt>
            <dd className="flex shrink-0 items-baseline">
              {d.benefit ? (
                <>
                  <Money
                    amount={d.benefit.savedAnnual}
                    currency={JPY}
                    className="text-sm font-semibold"
                  />
                  <span className="ml-1 text-2xs text-fg-muted">{tr('/năm')}</span>
                  <EstimateMark
                    reason={tr('Nội suy từ sheet mô phỏng của 基金 ({date}). Phần thuế không dựng lại được từ luật vì phụ thuộc 扶養 và các 控除 riêng.', { date: d.sheet.dated })}
                  />
                </>
              ) : (
                <span className="text-2xs text-fg-muted">{tr('chưa có sheet hiệu chuẩn')}</span>
              )}
            </dd>
            {/* Giới hạn của phép ước đứng NGAY dưới con số, không để cuối thẻ. */}
            {d.benefit && d.sheet.caveat && (
              <p className="basis-full text-2xs text-fg-muted">{d.sheet.caveat}</p>
            )}
          </div>
        </dl>

        <Guide className="mt-2 text-2xs text-fg-muted">
          {tr('社会保険料 chỉ đổi ở 定時決定 (phiếu tháng 9, dựa lương tháng 4–6) hoặc 随時改定 — nên bậc có thể chưa tụt dù đã đóng mấy tháng. 住民税 thì tính theo thu nhập năm trước nên còn muộn hơn.')}
        </Guide>

        {d.turns40In && (
          <p className="mt-2 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
            {tr(
              'Khoảng {month} bạn bước sang 40 tuổi — từ đó 介護保険第2号 cộng thêm khoảng 1,62% vào dòng 健康保険料 (phần bạn trả một nửa). Tiền bảo hiểm TĂNG vì lý do đó, không phải vì 掛金.',
              { month: thang(d.turns40In) },
            )}
            {/* Câu cuối là phương pháp luận thuần — cùng loại với <Guide> cách đây mươi
                dòng. Hai câu trên thì ở lại: chúng báo tiền bảo hiểm sắp tăng. */}
            <Guide as="span">
              {' '}
              {tr('Đây là lý do khối này đọc 標準報酬月額 chứ không đọc số tiền 健康保険料.')}
            </Guide>
          </p>
        )}

      </Card>

      {/* ── ĐÁNH ĐỔI ─────────────────────────────────────────────────── */}
      <Card as="section">
        <SectionTitle>{tr('Đánh đổi')}</SectionTitle>
        <p className="mt-1 text-sm text-fg-secondary">{tr('Lương hưu 厚生年金 sau này')}</p>
        {d.pensionLossAnnual > 0 ? (
          <p className="mt-1 flex items-baseline">
            <Money
              amount={d.pensionLossAnnual}
              currency={JPY}
              tone="out"
              className="text-lg font-semibold"
            />
            <span className="ml-1 text-2xs text-fg-muted">{tr('/năm')}</span>
            <EstimateMark reason={tr('平均標準報酬額 × 5,481/1000 × số tháng tham gia. Số tháng còn lại là dự tính theo năm ngừng làm ở trang Tương lai.')} />
          </p>
        ) : (
          <p className="mt-1 text-sm text-fg-muted">
            {tr('Chưa mất gì — 標準報酬月額 chưa tụt bậc nào.')}
          </p>
        )}
        <Guide className="mt-2 text-2xs text-fg-muted">
          {tr('掛金 trích từ lương nên 標準報酬 tụt, 社会保険料 giảm — nhưng 厚生年金 sau này giảm theo. Chỉ xảy ra NẾU tụt bậc; ở mức đóng thấp có thể không tụt bậc nào.')}
        </Guide>
      </Card>

      {/* ── THỬ MỨC ĐÓNG KHÁC ────────────────────────────────────────── */}
      <Card as="section">
        <SectionTitle>{tr('Thử mức đóng khác')}</SectionTitle>
        <div className="mt-2">
          {/* `className` BẮT BUỘC: `MONEY_FIELD_CLASS` là hằng số riêng, không phải mặc
              định của component — bỏ nó thì ô ra một nút 30px không viền không đệm. */}
          <MoneyField
            value={mucThu}
            onChange={setThuMuc}
            currency={JPY}
            autoOpen={false}
            ariaLabel={tr('Mức đóng mỗi tháng để thử')}
            className={MONEY_FIELD_CLASS}
          />
        </div>
        <p className="mt-1 text-2xs text-fg-muted">
          {trn('Từ {min} tới {max} (プラン③, mức MAX của chế độ)', {
            min: <Money amount={1_000} currency={JPY} className="text-2xs" />,
            max: <Money amount={KIKIN_MAX_MONTHLY} currency={JPY} className="text-2xs" />,
          })}
        </p>

        {loiThu && (
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border-subtle pt-3 text-sm">
            <div>
              <dt className="text-fg-muted">{tr('社会保険料/năm')}</dt>
              <dd className="flex items-baseline">
                <Money amount={loiThu.socialInsuranceAnnual} currency={JPY} />
                <EstimateMark reason={tr('Nội suy từ sheet mô phỏng của 基金 ({date}).', { date: d.sheet.dated })} />
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">{tr('Thuế/năm')}</dt>
              <dd className="flex items-baseline">
                <Money amount={loiThu.taxAnnual} currency={JPY} />
                <EstimateMark reason={tr('Nội suy từ sheet mô phỏng của 基金 ({date}).', { date: d.sheet.dated })} />
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-fg-muted">{tr('Tiết kiệm được')}</dt>
              <dd className="flex items-baseline">
                <Money
                  amount={loiThu.savedAnnual}
                  currency={JPY}
                  tone="in"
                  className="font-semibold"
                />
                <span className="ml-1 text-2xs text-fg-muted">{tr('/năm')}</span>
                <EstimateMark reason={tr('Nội suy từ sheet mô phỏng của 基金 ({date}). Sheet chỉ đo ba mức đóng; giữa hai mức là nội suy.', { date: d.sheet.dated })} />
              </dd>
              {d.sheet.caveat && <p className="mt-0.5 text-2xs text-fg-muted">{d.sheet.caveat}</p>}
            </div>
          </dl>
        )}

        {loiThu && !loiThu.withinCalibration && (
          <p className="mt-2 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
            {trn('Vượt mức cao nhất sheet đã đo — số trên là của mức {max}, không phải của mức bạn vừa nhập.', {
              max: <Money amount={KIKIN_MAX_MONTHLY} currency={JPY} className="text-2xs" />,
            })}
          </p>
        )}

        {doiMuc && (
          <p className="mt-2 text-2xs text-fg-muted">
            {trn('Bạn đang đóng thật {amount}/tháng.', {
              amount: (
                <Money
                  amount={d.contribution.minorPerMonth}
                  currency={JPY}
                  className="text-2xs"
                />
              ),
            })}
            {/* E-ink + Gọn: giữ con số, bỏ lời giải thích ai đổi được mức đóng. */}
            <span className="eink-gon:hidden">
              {' '}
              {tr('Đổi mức đóng là việc làm với 基金 hoặc phòng nhân sự — app chỉ tính số.')}
            </span>
          </p>
        )}
      </Card>

      {suaNguon && (
        <KikinSourceSheet
          rateBps={d.rateBps}
          dated={d.sheet.dated}
          points={d.sheet.points}
          onClose={() => setSuaNguon(false)}
        />
      )}
    </div>
  )
}
