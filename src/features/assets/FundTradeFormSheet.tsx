// Sheet ghi / sửa một lệnh quỹ đầu tư Nhật. Cùng khuôn TradeFormSheet (cổ phiếu Việt
// Nam): nền mờ, sheet trượt từ dưới trên mobile, giữa màn trên desktop.
//
// Số tiền được TÍNH GỢI Ý rồi cho sửa, giống phí/thuế của TradeFormSheet — nhưng ở đây
// vì lý do khác: 口数 × 基準価額 ÷ 10.000 không khớp số Rakuten thực trừ do làm tròn
// (xem fundHoldings.ts, lý do 2). Gợi ý giúp gõ nhanh, số thật trên sao kê mới là số
// được lưu.
import { useId, useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { MoneyField } from '../../components/MoneyField'
import { DateField } from '../../components/DateField'
import { ActionButton, SectionTitle, SegmentedControl, Select, actionButtonClass } from '../../components/ui'
import { confirmDialog } from '../../lib/dialog'
import {
  useCreateFundTrade,
  useDeleteFundTrade,
  useFunds,
  useUpdateFundTrade,
} from '../../hooks/queries'
import { toISODate, formatDateLabel } from '../../lib/dates'
import { parseSignedIntText, sanitizeSignedIntText, signedIntToText } from '../../lib/signedInt'
import type { AccountRow, FundTradeKind, FundTradeRow } from '../../types/database.types'
import { useEscClose } from '../../hooks/useEscClose'
import { fundLineValue } from './fundHoldings'
import { accountLabel, tr } from '../../i18n'

const KINDS = [
  { value: 'buy' as const, label: tr('Mua') },
  { value: 'sell' as const, label: tr('Bán') },
  { value: 'adjust' as const, label: tr('Điều chỉnh') },
]

interface Props {
  account: AccountRow
  /** null = ghi lệnh mới */
  trade: FundTradeRow | null
  onClose: () => void
}

export function FundTradeFormSheet({ account, trade, onClose }: Props) {
  useEscClose(onClose)
  const uid = useId()
  const { data: funds = [] } = useFunds()
  const create = useCreateFundTrade()
  const update = useUpdateFundTrade()
  const remove = useDeleteFundTrade()

  const [kind, setKind] = useState<FundTradeKind>(trade?.kind ?? 'buy')
  const [assocFundCd, setAssocFundCd] = useState(trade?.assoc_fund_cd ?? '')
  const [tradedOn, setTradedOn] = useState(trade?.traded_on ?? toISODate(new Date()))
  // Giữ chuỗi thô, không phải số: xem lib/signedInt.ts — <input type="number"> làm mất
  // dấu trừ vừa gõ, mà 口数 điều chỉnh (分配金再投資/gộp) cần nhập được số âm.
  const [unitsText, setUnitsText] = useState(signedIntToText(trade?.units ?? 0))
  const units = parseSignedIntText(unitsText)
  const [nav, setNav] = useState(trade?.nav ?? 0)
  const [amount, setAmount] = useState(trade?.amount ?? 0)
  // 口座区分 không có ô riêng ở đây (không tham gia phép tính nào, xem fundHoldings.ts) —
  // chỉ giữ nguyên để sửa một lệnh do script nhập sổ lệnh tạo không làm rỗng mất cột này.
  const [bucket] = useState(trade?.bucket ?? '')
  const [note, setNote] = useState(trade?.note ?? '')
  // Số tiền là gợi ý ĐỘC LẬP, giống phí/thuế của TradeFormSheet. Với lệnh có sẵn: chỉ
  // coi số đã lưu là "thật, đừng tính lại" khi kind gốc CÓ số tiền (mua/bán) — 'adjust'
  // luôn ép amount = 0, không phải số người dùng từng chọn.
  const [amountTouched, setAmountTouched] = useState(trade != null && trade.kind !== 'adjust')
  const [saving, setSaving] = useState(false)

  const currency = account.currency
  const isAdjust = kind === 'adjust'

  const fundName = useMemo(
    () => new Map(funds.map((f) => [f.assoc_fund_cd, f.name])),
    [funds],
  )

  // Quỹ của lệnh đang sửa có thể không còn trong useFunds() (quỹ bị xoá hoặc đổi mã
  // qua fund_aliases). Không xử lý thì <Select value={assocFundCd}> không khớp option
  // nào — hành vi của browser lúc đó KHÔNG được chuẩn hoá (một số trình duyệt tự chọn
  // option đầu), nên có thể đổi lệnh sang quỹ khác chỉ vì người dùng mở sheet ra sửa số
  // tiền. Thêm hẳn một option (vô hiệu hoá) đúng mã cũ để `value` luôn khớp một option
  // có thật.
  const fundKhongCon = assocFundCd !== '' && !funds.some((f) => f.assoc_fund_cd === assocFundCd)

  // Gợi ý = 口数 × 基準価額 ÷ 10.000 — gọi đúng hàm mà fundValue() dùng để tính giá trị
  // từng dòng (fundLineValue), không viết lại công thức — tới khi người dùng tự sửa ô
  // Số tiền thì thôi.
  const suggestedAmount =
    !isAdjust && units > 0 && nav > 0 ? fundLineValue(units, nav) : 0
  const effAmount = amountTouched ? amount : suggestedAmount

  // Nói MỘT thứ thiếu mỗi lần, theo thứ tự mắt đọc form — cùng quy ước với entryGate()
  // của trang Nhập, chỉ khác là quỹ này không có state chung nên viết thẳng ở đây.
  const missing = ((): string | null => {
    if (!assocFundCd) return tr('Còn thiếu: chọn quỹ.')
    if (isAdjust) return units === 0 ? tr('Còn thiếu: số 口数 (khác 0).') : null
    if (!(units > 0)) return tr('Còn thiếu: số 口数.')
    if (!(nav > 0)) return tr('Còn thiếu: 基準価額.')
    if (!(effAmount > 0)) return tr('Còn thiếu: số tiền.')
    return null
  })()
  const canSave = missing === null && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        assoc_fund_cd: assocFundCd,
        kind,
        traded_on: tradedOn,
        units,
        // CHECK fund_trades_shape đòi adjust ⇒ nav = 0 và amount = 0 — ép ở đây, không
        // chỉ ẩn ô, để không có đường nào gửi lên một dòng bị Postgres từ chối.
        nav: isAdjust ? 0 : nav,
        amount: isAdjust ? 0 : effAmount,
        bucket,
        note: note.trim(),
      }
      if (trade) await update.mutateAsync({ id: trade.id, patch: payload })
      else await create.mutateAsync({ account_id: account.id, ...payload })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!trade) return
    if (
      !(await confirmDialog({
        title: tr('Xóa lệnh {fund} ngày {date}?', {
          fund: fundName.get(trade.assoc_fund_cd) ?? trade.assoc_fund_cd,
          date: formatDateLabel(trade.traded_on),
        }),
        danger: true,
        confirmLabel: tr('Xóa'),
      }))
    )
      return
    setSaving(true)
    try {
      await remove.mutateAsync(trade.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-1">
          {trade ? tr('Sửa lệnh') : tr('Ghi lệnh')}
        </SectionTitle>
        <p className="mb-3 text-sm text-fg-muted">{accountLabel(account.name)}</p>

        <div className="mb-3">
          <SegmentedControl items={KINDS} value={kind} onChange={setKind} label={tr('Loại lệnh')} />
        </div>

        {isAdjust && (
          <Guide className="mb-3 rounded-lg bg-surface-page px-2.5 py-2 text-2xs text-fg-muted">
            {tr(
              'Dùng khi được chia thêm 口 mà không tốn tiền (分配金再投資) hoặc sửa lại 口数 cho khớp sao kê. Số 口 tăng mà giá vốn không đổi nên 取得単価 tự giảm. Gộp 口 thì nhập số âm.',
            )}
          </Guide>
        )}

        <label htmlFor={`${uid}-fund`} className="mb-1 block text-sm font-medium text-fg-muted">
          {tr('Quỹ')}
        </label>
        <Select
          id={`${uid}-fund`}
          value={assocFundCd}
          onChange={(e) => setAssocFundCd(e.target.value)}
          wrapClassName="mb-3 w-full"
        >
          <option value="" disabled>
            {tr('Chọn quỹ…')}
          </option>
          {fundKhongCon && (
            <option value={assocFundCd} disabled>
              {tr('{code} (quỹ này không còn trong danh sách — chọn quỹ khác để đổi)', { code: assocFundCd })}
            </option>
          )}
          {funds.map((f) => (
            <option key={f.assoc_fund_cd} value={f.assoc_fund_cd}>
              {f.name}
            </option>
          ))}
        </Select>

        {/* <span> chứ không <label>: ô ngày là <button>, tên đi qua ariaLabel. */}
        <span className="mb-1 block text-sm font-medium text-fg-muted">{tr('Ngày khớp (約定日)')}</span>
        <DateField
          ariaLabel={tr('Ngày khớp (約定日)')}
          value={tradedOn}
          max={toISODate(new Date())}
          onChange={setTradedOn}
          className="mb-3 w-full px-3 py-2"
        />

        <label htmlFor={`${uid}-units`} className="mb-1 block text-sm font-medium text-fg-muted">
          {tr('口数 (số đơn vị quỹ)')}{' '}
          {isAdjust && <span className="text-fg-muted">{tr('(âm = giảm 口 do gộp/điều chỉnh)')}</span>}
        </label>
        {/* 口 là chữ Nhật trên sao kê, người dùng Việt không đọc được — giải thích ngay ở ô
            nhập đầu tiên gặp nó, không giấu trong Guide (Guide tắt được). */}
        <p id={`${uid}-units-hint`} className="mb-1 text-2xs text-fg-muted">
          {tr('口 = đơn vị chứng chỉ quỹ (số phần bạn đang giữ). Chép đúng cột 口数 trên sao kê.')}
        </p>
        <input
          id={`${uid}-units`}
          aria-describedby={`${uid}-units-hint`}
          type="text"
          inputMode="numeric"
          value={unitsText}
          onChange={(e) => setUnitsText(sanitizeSignedIntText(e.target.value))}
          className="mb-3 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-right text-lg font-semibold"
        />

        {!isAdjust && (
          <>
            {/* Hai nhãn dưới đây là <span>: MoneyField có hai ô (chạm mobile / input
                desktop) nên `htmlFor` luôn trỏ vào ô đang bị CSS ẩn. Tên ô = `ariaLabel`. */}
            <span className="mb-1 block text-sm font-medium text-fg-muted">
              基準価額 <span className="text-fg-muted">(¥ / 10.000 口)</span>
            </span>
            <div className="mb-3">
              <MoneyField
                value={nav}
                onChange={setNav}
                currency={currency}
                ariaLabel="基準価額 (¥ / 10.000 口)"
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold"
              />
            </div>

            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm font-medium text-fg-muted">{tr('Số tiền')}</span>
              {!amountTouched && suggestedAmount > 0 && (
                <span className="text-2xs text-fg-muted">{tr('gợi ý theo 口数 × 基準価額')}</span>
              )}
            </div>
            <div className="mb-1">
              <MoneyField
                value={effAmount}
                onChange={(v) => {
                  setAmountTouched(true)
                  setAmount(v)
                }}
                currency={currency}
                autoOpen={false}
                ariaLabel={tr('Số tiền')}
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold"
              />
            </div>
            <Guide className="mb-3 text-2xs text-fg-muted">
              {tr(
                'Gợi ý tính từ 口数 × 基準価額 ÷ 10.000. Sao kê Rakuten thường lệch vài yên do làm tròn — cứ sửa cho khớp số thật, app lấy số bạn nhập làm giá vốn.',
              )}
            </Guide>
          </>
        )}

        <label htmlFor={`${uid}-note`} className="mb-1 block text-sm font-medium text-fg-muted">
          {tr('Ghi chú')} <span className="text-fg-muted">{tr('(không bắt buộc)')}</span>
        </label>
        <input
          id={`${uid}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={tr('Ví dụ: 分配金再投資')}
          className="mb-3 w-full rounded-md border border-border-strong px-3 py-2 text-sm"
        />

        <Guide className="mb-3 text-sm text-fg-muted">
          {tr('Lệnh không tạo giao dịch thu/chi và không đổi số dư — nó chỉ nói tiền trong tài khoản đang nằm ở quỹ nào.')}
        </Guide>

        {missing && !saving && (
          <p className="mb-2 px-1 text-sm text-fg-warn">{missing}</p>
        )}

        <div className="mt-1 flex items-center justify-end gap-2">
          {trade && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className={actionButtonClass('danger', 'mr-auto')}
            >
              {tr('Xóa')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            {tr('Hủy')}
          </button>
          <ActionButton variant="primary" onClick={handleSubmit} disabled={!canSave}>
            {saving ? tr('Đang lưu…') : tr('Lưu')}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
