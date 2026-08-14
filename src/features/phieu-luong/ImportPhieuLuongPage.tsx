import { useState } from 'react'
import { FileUp } from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import { Card } from '../../components/ui/Card'
import { useAccounts, useCategories } from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import { showToast } from '../../lib/dialog'
import { repo } from '../../data'
import { bocPhieu, type Phieu } from './boc'
import { docPdfWeb } from './docPdfWeb'
import { DANH_MUC_THUE_CON, dungKeHoach, type DongKeHoach, type KhoanNeo } from './nhap'

const TEN_YUCHO = /yucho/i

export function ImportPhieuLuongPage() {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const [keHoach, setKeHoach] = useState<DongKeHoach[] | null>(null)
  const [dangBoc, setDangBoc] = useState(false)

  const yucho = accounts.find((a) => TEN_YUCHO.test(a.name))
  const chiPhi = categories.filter((c) => c.type === 'expense')
  const thieuDanhMuc = DANH_MUC_THUE_CON.map((c) => c.name).filter(
    (n) => !chiPhi.some((c) => c.name === n),
  )

  async function chonFile(files: FileList | null) {
    if (!files?.length || !yucho) return
    setDangBoc(true)
    try {
      const phieuList: Phieu[] = []
      for (const f of Array.from(files)) {
        try {
          phieuList.push(bocPhieu(await docPdfWeb(f), f.name))
        } catch (e) {
          phieuList.push({
            file: f.name, empno: null, period: null, kind: null, nguonKy: 'ten-file',
            canhBao: [], gross: null, deductTotal: null, net: null, bank: null,
            tru: {}, ngoaiTong: {}, nhanLa: [], loi: [`đọc PDF lỗi: ${(e as Error).message}`],
          })
        }
      }
      const thu = (await repo.listYuchoIncome(yucho.id)) as KhoanNeo[]
      const dauDaCo = new Set(await repo.listDauPhieuLuong())
      const idTheoTen = new Map(chiPhi.map((c) => [c.name, c.id]))
      setKeHoach(dungKeHoach(phieuList, thu, yucho.id, idTheoTen, dauDaCo))
    } finally {
      setDangBoc(false)
    }
  }

  if (!yucho) {
    return (
      <div className="p-3">
        <BackLink to="/settings/data" aria-label="Dữ liệu" />
        <p className="mt-3 text-sm text-money-out">Không tìm thấy tài khoản Yucho Bank.</p>
      </div>
    )
  }

  const dat = keHoach?.filter((k) => k.trangThai === 'dat') ?? []
  const soDong = dat.reduce((s, k) => s + 1 + (k.thuKhac ? 1 : 0) + k.chi.length, 0)

  return (
    <div className="flex flex-col gap-3 p-3">
      <BackLink to="/settings/data" aria-label="Dữ liệu" />
      <h1 className="text-base font-semibold text-fg-primary">Nhập phiếu lương từ PDF</h1>

      {thieuDanhMuc.length > 0 && (
        <Card>
          <p className="text-xs text-money-out">
            Thiếu {thieuDanhMuc.length} danh mục Thuế &amp; An sinh. Phải tạo trước khi nhập.
          </p>
          <ul className="mt-1 text-xs text-fg-secondary">
            {thieuDanhMuc.map((n) => <li key={n}>· {n}</li>)}
          </ul>
          <button
            type="button"
            onClick={async () => {
              const cha = await repo.createCategory({
                name: 'Thuế & An sinh', type: 'expense', icon: '🏛️', parent_id: null,
              })
              for (const c of DANH_MUC_THUE_CON) {
                if (chiPhi.some((x) => x.name === c.name)) continue
                await repo.createCategory({ ...c, type: 'expense', parent_id: cha.id })
              }
              showToast('Đã tạo danh mục')
            }}
            className="mt-2 min-h-9 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
          >
            Tạo 6 danh mục
          </button>
        </Card>
      )}

      <Card as="label" className="flex cursor-pointer items-center gap-3">
        <FileUp className="h-5 w-5 text-fg-muted" />
        <span className="flex-1 text-sm text-fg-primary">
          {dangBoc ? 'Đang bóc…' : 'Chọn file PDF (chọn được nhiều file)'}
        </span>
        <input
          type="file" multiple accept="application/pdf" className="hidden"
          disabled={dangBoc || thieuDanhMuc.length > 0}
          onChange={(e) => chonFile(e.target.files)}
        />
      </Card>

      {keHoach && (
        <Card>
          <p className="text-sm font-semibold text-fg-primary">
            {dat.length} phiếu sẵn sàng · {soDong} dòng
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Số dư không đổi: thu vào chi ra cùng ngày cùng tài khoản, triệt tiêu.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {keHoach.map((k) => (
              <li key={k.phieu.file} className="border-t border-border-subtle pt-2 text-xs">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-fg-primary">{k.dau || k.phieu.file}</span>
                  <span className={
                    k.trangThai === 'dat' ? 'text-money-in'
                      : k.trangThai === 'da-nhap' ? 'text-fg-muted' : 'text-money-out'
                  }>
                    {k.trangThai === 'dat' ? 'sẵn sàng'
                      : k.trangThai === 'da-nhap' ? 'đã nhập rồi' : 'từ chối'}
                  </span>
                </div>
                {k.lyDo && <p className="mt-0.5 text-fg-secondary">{k.lyDo}</p>}
                {k.trangThai === 'dat' && k.neo && (
                  <p className="mt-0.5 text-fg-muted">
                    neo {k.neo.occurred_on} · giữ lại {formatMoney(k.thu!.amount, 'JPY')}
                    {k.thuKhac && ` · mua hàng ${formatMoney(k.thuKhac.amount, 'JPY')}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
