// Vỏ trang Đầu tư — hai tab, hai loại tài sản, một câu hỏi: "tôi đang giữ gì".
//
// Vì sao là trang riêng chứ không phải khu trên trang chi tiết tài khoản: khu đó chỉ nói
// về MỘT tài khoản, nên không màn nào trả lời được "tôi giữ tổng bao nhiêu VNM" hay "mã
// nào chiếm nhiều nhất trong danh mục". Đó là câu của người, không phải câu của tài khoản.
//
// Vì sao hai tab chứ không một con số gộp: cổ phiếu VN tính bằng đồng, quỹ Nhật bằng yên
// trên 10.000 口. Gộp lại phải quy đổi tỷ giá, mà câu hỏi gộp đã có chỗ trả lời tốt hơn ở
// tab Tài sản — nơi đã có tỷ giá, dấu ước tính và nút "xem thử bằng tiền khác".
//
// Hai tab nhập trực tiếp (không `lazy`): cả hai file đều nhỏ, và bản thân route `/invest`
// đã lazy ở App.tsx nên thêm một lớp Suspense nữa chỉ làm nhấp nháy lúc gạt tab.
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, SegmentedControl, type SegmentedItem } from '../../components/ui'
import { useAccounts } from '../../hooks/queries'
import { InvestFundsTab } from './InvestFundsTab'
import { InvestStocksTab } from './InvestStocksTab'

type InvestTab = 'stocks' | 'funds'

const TABS: readonly SegmentedItem<InvestTab>[] = [
  { value: 'stocks', label: 'Cổ phiếu VN' },
  { value: 'funds', label: 'Quỹ Nhật' },
]

const isTab = (v: string | null): v is InvestTab => TABS.some((t) => t.value === v)

export function InvestPage() {
  const { data: accountRows = [], isLoading: accountsLoading } = useAccounts()
  // Giữ tab trong URL (không phải useState) để link chia sẻ, lịch sử trình duyệt và nút
  // quay lại mở đúng tab — cùng lối AssetsPage đang dùng cho ba tab của nó.
  const [params, setParams] = useSearchParams()

  const hasFundsOnly = useMemo(() => {
    const dautu = accountRows.filter((a) => a.type === 'investment' && !a.is_archived)
    return !dautu.some((a) => a.currency === 'VND') && dautu.some((a) => a.currency === 'JPY')
  }, [accountRows])

  // Không có ?tab= thì mở tab NÀO CÓ tài khoản. Mở mặc định vào một tab rỗng là bắt người
  // dùng tự đoán rằng thứ họ đang tìm nằm ở tab kia. Muốn biết tab nào có tài khoản thì
  // phải CÓ accountRows trước — lúc còn đang tải, accountRows luôn là [] nên "tab nào có
  // tài khoản" luôn trả lời sai là 'stocks', rồi nhảy sang 'funds' khi dữ liệu về (giật
  // tab dưới chân người dùng). Vì vậy: chưa tải xong và chưa có ?tab= thì CHƯA resolve
  // tab nào (null) — vỏ trang render mà không mở tab nào, đợi accounts về rồi mới quyết.
  // ?tab= tường minh trên URL thì tin ngay, không cần đợi: nó không dựa vào accountRows.
  const raw = params.get('tab')
  const tab: InvestTab | null = isTab(raw)
    ? raw
    : accountsLoading
      ? null
      : hasFundsOnly
        ? 'funds'
        : 'stocks'
  const accountId = params.get('account')

  const setTab = (v: InvestTab) =>
    setParams(
      (prev) => {
        prev.set('tab', v)
        // Lọc theo tài khoản chỉ có nghĩa trong tab của chính tài khoản đó — mang sang tab
        // kia là một bộ lọc không khớp gì, và tab kia sẽ lặng lẽ bỏ qua nó.
        prev.delete('account')
        return prev
      },
      { replace: true },
    )

  const setAccount = (id: string | null) =>
    setParams(
      (prev) => {
        if (id) prev.set('account', id)
        else prev.delete('account')
        return prev
      },
      { replace: true },
    )

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="Đầu tư" back="/assets" flush />

      {tab && (
        <>
          <SegmentedControl
            items={TABS}
            value={tab}
            onChange={setTab}
            label="Loại danh mục"
            stretch="lg"
          />

          {tab === 'stocks' ? (
            <InvestStocksTab accountId={accountId} onPickAccount={setAccount} />
          ) : (
            <InvestFundsTab accountId={accountId} onPickAccount={setAccount} />
          )}
        </>
      )}
    </div>
  )
}
