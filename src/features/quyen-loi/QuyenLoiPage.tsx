// Màn Quyền lợi — "tới 31/12 năm nay tôi còn để quên đồng nào?" (spec 2026-09-03).
// Bốn khối theo THỨ TỰ TIỀN: ① phụ thuộc nước ngoài, ② đòi lại năm cũ, ③ furusato, ④ NISA.
// Mỗi khối: một câu kết luận → một con số (≈) → bảng chi tiết → nguồn luật → nút.
// Trang KHÔNG tính một con số nào: mọi số đến từ useQuyenLoi → tinhQuyenLoi.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ActionButton, Card, EmptyState, Money, Num, PageHeader, SectionTitle, Select } from '../../components/ui'
import { EstimateMark } from '../../components/EstimateMark'
import { useCreateCategory, useProfile, useRelatives, useUpdateProfile } from '../../hooks/queries'
import { calendarYearOf, toISODate } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import type { KetLuan } from './ketLuan'
import { FURUSATO_CATEGORY_NAME } from './furusato'
import { luatChoNam } from './rules/luat'
import { useQuyenLoi } from './useQuyenLoi'
import { GanNguoiNhanSheet } from './GanNguoiNhanSheet'
// NguoiThanSheet nằm ở components/ (dùng chung với form gửi tiền — CLAUDE.md cấm feature import UI của nhau).
import { NguoiThanSheet } from '../../components/NguoiThanSheet'
import type { RelativeRow } from '../../types/database.types'

const NHOM_NHAN: Record<string, string> = { '<16': 'dưới 16', '16-29': '16–29', '30-69': '30–69', '70+': 'từ 70' }

function TrangThaiChu({ k }: { k: KetLuan }) {
  const map: Record<KetLuan['trang_thai'], string> = {
    du: 'Xong', thieu: 'Cần làm', 'het-han': 'Đã qua', 'thieu-du-lieu': 'Thiếu dữ liệu',
  }
  return <SectionTitle role="micro" as="h3">{map[k.trang_thai]}</SectionTitle>
}

function NguonLuat({ year }: { year: number }) {
  const luat = luatChoNam(year)
  return (
    <p className="mt-3 text-2xs text-fg-muted">
      Theo{' '}
      <a href={luat.nguon[0]} target="_blank" rel="noreferrer" className="underline">
        Cục thuế Nhật (NTA)
      </a>{' '}
      · áp dụng từ năm thuế {luat.nam || 'trước 2023'}
    </p>
  )
}

export function QuyenLoiPage() {
  const todayISO = toISODate(new Date()) // đọc đồng hồ MỘT lần ở tầng UI, truyền xuống
  const namNay = calendarYearOf(todayISO)
  const [year, setYear] = useState(namNay)
  const { ketQua, isReady, isError, furusatoCategoryId, txs } = useQuyenLoi(year, todayISO)
  const { data: profile } = useProfile()
  const { data: relatives = [] } = useRelatives()
  const updateProfile = useUpdateProfile()
  const createCategory = useCreateCategory()
  const [sheetNguoi, setSheetNguoi] = useState<RelativeRow | null | 'new'>(null)
  // Năm đang gán (không nhất thiết = `year` đang xem: khối ② có thể mở sheet cho một năm
  // cũ khác), null = sheet đóng.
  const [sheetGan, setSheetGan] = useState<number | null>(null)

  const chuaGanTxs = useMemo(
    () => txs.filter((t) => t.is_remittance && t.remit_recipient_id == null && calendarYearOf(t.occurred_on) === year),
    [txs, year],
  )
  const sheetGanTxs = useMemo(
    () => (sheetGan === null ? [] : txs.filter((t) => t.is_remittance && t.remit_recipient_id == null && calendarYearOf(t.occurred_on) === sheetGan)),
    [txs, sheetGan],
  )
  const daKhai = (profile?.fuyo_claimed_years ?? []).includes(year)

  async function toggleDaKhai() {
    const cur = profile?.fuyo_claimed_years ?? []
    const next = daKhai ? cur.filter((y) => y !== year) : [...cur, year].sort((a, b) => a - b)
    await updateProfile.mutateAsync({ fuyo_claimed_years: next })
    showToast(daKhai ? `Bỏ đánh dấu năm ${year}` : `Đã ghi: năm ${year} đã nộp giấy`)
  }

  async function taoDanhMucFurusato() {
    await createCategory.mutateAsync({ name: FURUSATO_CATEGORY_NAME, type: 'expense', icon: '🎁', parent_id: null, need_level: 'flexible', cost_type: 'variable' })
    showToast('Đã tạo danh mục — ghi các khoản ふるさと納税 vào đó')
  }

  const years = Array.from({ length: 6 }, (_, i) => namNay - i)

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="Quyền lợi" back="/">
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Năm thuế">
          {years.map((y) => (
            <option key={y} value={y}>Năm {y}</option>
          ))}
        </Select>
      </PageHeader>

      {isError ? (
        <EmptyState>Không tải được dữ liệu. Thử lại sau.</EmptyState>
      ) : !isReady || !ketQua ? (
        <EmptyState>Đang tải…</EmptyState>
      ) : (
        <>
          {/* ① Khấu trừ người phụ thuộc ở nước ngoài */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>Khấu trừ người phụ thuộc ở nước ngoài</SectionTitle>
              <TrangThaiChu k={ketQua.fuyo.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg-primary">{ketQua.fuyo.ketLuan.viec}</p>
            {ketQua.fuyo.ketLuan.tiet_kiem_uoc !== null && (
              <p className="mt-1 text-sm text-fg-muted">
                Thuế bớt được{' '}
                <Money amount={ketQua.fuyo.ketLuan.tiet_kiem_uoc} currency="JPY" tone="in" />
                <EstimateMark reason={ketQua.fuyo.ketLuan.ly_do[0]} />
              </p>
            )}

            {ketQua.fuyo.nguoi.length > 0 && (
              <ul className="mt-3 divide-y divide-border-subtle">
                {ketQua.fuyo.nguoi.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <button type="button" className="font-medium text-fg-primary hover:underline" onClick={() => setSheetNguoi(relatives.find((r) => r.id === n.id) ?? null)}>
                      {n.name}
                    </button>
                    <Num tone="muted">{n.tuoi} tuổi · nhóm {NHOM_NHAN[n.nhom]}</Num>
                    <span className="ml-auto">
                      đã gửi <Money amount={n.da_gui} currency="JPY" />
                      {n.nguong > 0 && !n.du && (
                        <>
                          {' · '}còn thiếu <Money amount={n.con_thieu} currency="JPY" tone="out" />
                        </>
                      )}
                    </span>
                    <span className="basis-full text-2xs text-fg-muted">
                      {n.du ? `Giấy: ${n.giay.join(' + ')}` : n.nhom === '<16' ? 'Dưới 16 tuổi không thuộc khấu trừ này' : <>Cần ≥ <Money amount={n.nguong} currency="JPY" />/năm để được tính</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-2 list-disc pl-5 text-2xs text-fg-muted">
              {ketQua.fuyo.ketLuan.ly_do.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <NguonLuat year={year} />
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton variant="primary" onClick={() => setSheetNguoi('new')}>
                <Plus className="h-4 w-4" /> Thêm người thân
              </ActionButton>
              {chuaGanTxs.length > 0 && relatives.some((r) => !r.is_archived) && (
                <ActionButton variant="outline" onClick={() => setSheetGan(year)}>
                  Gán người nhận ({chuaGanTxs.length})
                </ActionButton>
              )}
              <ActionButton variant="outline" onClick={toggleDaKhai}>
                {daKhai ? `Đã nộp giấy năm ${year} ✓` : `Đã nộp giấy năm ${year}`}
              </ActionButton>
            </div>
          </Card>

          {/* ② Đòi lại năm cũ */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>Đòi lại năm cũ (還付申告)</SectionTitle>
              <TrangThaiChu k={ketQua.refund.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg-primary">{ketQua.refund.ketLuan.viec}</p>
            {ketQua.refund.ketLuan.tiet_kiem_uoc !== null && (
              <p className="mt-1 text-sm text-fg-muted">
                Tổng có thể được hoàn{' '}
                <Money amount={ketQua.refund.ketLuan.tiet_kiem_uoc} currency="JPY" tone="in" />
                <EstimateMark reason={ketQua.refund.ketLuan.ly_do[1]} />
              </p>
            )}
            {ketQua.refund.nam.length > 0 && (
              <ul className="mt-3 divide-y divide-border-subtle">
                {ketQua.refund.nam.map((n) => (
                  <li key={n.year} className="flex flex-wrap items-center gap-x-3 py-2 text-sm">
                    <Num>Năm {n.year}</Num>
                    <span className="text-fg-secondary">{n.nguoi.map((p) => p.name).join(', ')}</span>
                    <span className="ml-auto text-fg-muted">hạn {n.han.slice(8, 10)}/{n.han.slice(5, 7)}/{n.han.slice(0, 4)}</span>
                    {n.tiet_kiem_uoc !== null && (<span><Money amount={n.tiet_kiem_uoc} currency="JPY" tone="in" /><EstimateMark reason={ketQua.refund.ketLuan.ly_do[1]} /></span>)}
                    {!n.co_nguong && <span className="basis-full text-2xs text-fg-muted">Năm này luật chưa có ngưỡng 38万 — chỉ cần chứng từ gửi tiền.</span>}
                  </li>
                ))}
              </ul>
            )}
            {ketQua.refund.chua_gan.length > 0 && relatives.some((r) => !r.is_archived) && (
              <ul className="mt-3 divide-y divide-border-subtle">
                {ketQua.refund.chua_gan.map((c) => (
                  <li key={c.year} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Num tone="muted">Năm {c.year} · {c.so_lan} lần chưa gán</Num>
                    <ActionButton variant="outline" onClick={() => setSheetGan(c.year)}>
                      Gán người nhận năm {c.year}
                    </ActionButton>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-2 list-disc pl-5 text-2xs text-fg-muted">
              {ketQua.refund.ketLuan.ly_do.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <NguonLuat year={namNay} />
          </Card>

          {/* ③ ふるさと納税 */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>Trần ふるさと納税</SectionTitle>
              <TrangThaiChu k={ketQua.furusato.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg-primary">{ketQua.furusato.ketLuan.viec}</p>
            {ketQua.furusato.tran !== null && (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-2xs text-fg-muted">Trần</dt><dd><Money amount={ketQua.furusato.tran} currency="JPY" /><EstimateMark reason={ketQua.furusato.ketLuan.ly_do[0]} /></dd></div>
                <div><dt className="text-2xs text-fg-muted">Đã gửi</dt><dd><Money amount={ketQua.furusato.da_gui} currency="JPY" /></dd></div>
                <div><dt className="text-2xs text-fg-muted">Còn lại</dt><dd><Money amount={ketQua.furusato.con_lai ?? 0} currency="JPY" tone="in" /></dd></div>
              </dl>
            )}
            <ul className="mt-2 list-disc pl-5 text-2xs text-fg-muted">
              {ketQua.furusato.ketLuan.ly_do.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <NguonLuat year={year} />
            {!furusatoCategoryId && (
              <ActionButton variant="outline" className="mt-3" onClick={taoDanhMucFurusato}>
                Tạo danh mục "{FURUSATO_CATEGORY_NAME}"
              </ActionButton>
            )}
          </Card>

          {/* ④ NISA / iDeCo */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>Hạn mức NISA / iDeCo chưa dùng</SectionTitle>
              <TrangThaiChu k={ketQua.shelter.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg-primary">{ketQua.shelter.ketLuan.viec}</p>
            {ketQua.shelter.tai_khoan.length > 0 && (
              <ul className="mt-3 divide-y divide-border-subtle">
                {ketQua.shelter.tai_khoan.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                    <Link to={`/assets/account/${t.id}`} className="font-medium text-fg-primary hover:underline">{t.name}</Link>
                    <span className="ml-auto">
                      đã nạp <Money amount={t.used} currency="JPY" />
                      {t.remaining !== null ? <> · còn <Money amount={t.remaining} currency="JPY" tone="in" /></> : <> · chưa đặt hạn mức</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-2 list-disc pl-5 text-2xs text-fg-muted">
              {ketQua.shelter.ketLuan.ly_do.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </Card>
        </>
      )}

      {sheetNguoi !== null && (
        <NguoiThanSheet relative={sheetNguoi === 'new' ? null : sheetNguoi} onClose={() => setSheetNguoi(null)} />
      )}
      {sheetGan !== null && (
        <GanNguoiNhanSheet txs={sheetGanTxs} relatives={relatives.filter((r) => !r.is_archived)} onClose={() => setSheetGan(null)} />
      )}
    </div>
  )
}
