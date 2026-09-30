// Màn Quyền lợi — "tới 31/12 năm nay tôi còn để quên đồng nào?" (spec 2026-09-03).
// Bốn khối theo THỨ TỰ TIỀN: ① phụ thuộc nước ngoài, ② đòi lại năm cũ, ③ furusato, ④ NISA.
// Mỗi khối: một câu kết luận → một con số (≈) → bảng chi tiết → nguồn luật → nút.
// Trang KHÔNG tính một con số nào: mọi số đến từ useQuyenLoi → tinhQuyenLoi.
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ActionButton, Card, EmptyState, Money, Num, PageHeader, SectionTitle, Select, StatusChip, type StatusTone } from '../../components/ui'
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
import { tr } from '../../i18n'
import { trn } from '../../i18n/react'

const NHOM_NHAN: Record<string, string> = { '<16': tr('dưới 16'), '16-29': '16–29', '30-69': '30–69', '70+': tr('từ 70') }

// "Xong" chỉ khi đã thật sự dùng; đếm được mà bằng 0 là "Chưa dùng", không đếm được là
// "Chưa đủ dữ liệu" (ketLuan.ts: chưa biết ≠ 0). Chữ luôn đi kèm — màu không phải kênh duy nhất.
const TRANG_THAI: Record<KetLuan['trang_thai'], { nhan: string; tone: StatusTone }> = {
  du: { nhan: tr('Xong'), tone: 'good' },
  thieu: { nhan: tr('Cần làm'), tone: 'warn' },
  'chua-dung': { nhan: tr('Chưa dùng'), tone: 'warn' },
  'het-han': { nhan: tr('Đã qua'), tone: 'info' },
  'thieu-du-lieu': { nhan: tr('Chưa đủ dữ liệu'), tone: 'info' },
}

function TrangThaiChu({ k }: { k: KetLuan }) {
  const t = TRANG_THAI[k.trang_thai]
  return <StatusChip tone={t.tone} className="shrink-0">{t.nhan}</StatusChip>
}

function CheDoIryohi({ ten, dieuKien, nhanChi, chi, nguong, khauTru, thang, lyDo }: {
  ten: string
  dieuKien: ReactNode
  nhanChi: string
  chi: number
  nguong: number
  khauTru: number
  thang: boolean
  lyDo: string
}) {
  return (
    <div className={`rounded-lg border p-3 ${thang ? 'border-accent' : 'border-border-panel'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle as="h3">{ten}</SectionTitle>
        {thang && <StatusChip tone="good" className="shrink-0">{tr('Lợi hơn')}</StatusChip>}
      </div>
      {/* E-ink + Gọn: bỏ điều kiện / luật / nguồn — ba ô số ngay dưới đã nói. */}
      <p className="mt-1 text-2xs text-fg-muted eink-gon:hidden">{dieuKien}</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-2xs text-fg-muted">{nhanChi}</dt>
          <dd><Money amount={chi} currency="JPY" /></dd>
        </div>
        <div>
          <dt className="text-2xs text-fg-muted">{tr('Ngưỡng')}</dt>
          <dd><Money amount={nguong} currency="JPY" /></dd>
        </div>
        <div>
          <dt className="text-2xs text-fg-muted">{tr('Khấu trừ')}</dt>
          <dd>
            <Money amount={khauTru} currency="JPY" tone={khauTru > 0 ? 'in' : 'neutral'} />
            {khauTru > 0 && <EstimateMark reason={lyDo} />}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function NguonLuat({ year }: { year: number }) {
  const luat = luatChoNam(year)
  return (
    <p className="mt-3 text-2xs text-fg-muted eink-gon:hidden">
      {trn('Theo {link} · áp dụng từ năm thuế {year}', {
        link: (
          <a href={luat.nguon[0]} target="_blank" rel="noreferrer" className="underline">
            {tr('Cục thuế Nhật (NTA)')}
          </a>
        ),
        year: luat.nam || tr('trước 2023'),
      })}
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
    showToast(daKhai ? tr('Bỏ đánh dấu năm {year}', { year }) : tr('Đã ghi: năm {year} đã nộp giấy', { year }))
  }

  async function taoDanhMucFurusato() {
    await createCategory.mutateAsync({ name: FURUSATO_CATEGORY_NAME, type: 'expense', icon: '🎁', parent_id: null, need_level: 'flexible', cost_type: 'variable' })
    showToast(tr('Đã tạo danh mục — ghi các khoản ふるさと納税 vào đó'))
  }

  const years = Array.from({ length: 6 }, (_, i) => namNay - i)

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title={tr('Quyền lợi')} back="/">
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={tr('Năm thuế')}>
          {years.map((y) => (
            <option key={y} value={y}>{tr('Năm {year}', { year: y })}</option>
          ))}
        </Select>
      </PageHeader>

      {isError ? (
        <EmptyState>{tr('Không tải được dữ liệu. Thử lại sau.')}</EmptyState>
      ) : !isReady || !ketQua ? (
        <EmptyState>{tr('Đang tải…')}</EmptyState>
      ) : (
        <>
          {/* ① Khấu trừ người phụ thuộc ở nước ngoài */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>{tr('Khấu trừ người phụ thuộc ở nước ngoài')}</SectionTitle>
              <TrangThaiChu k={ketQua.fuyo.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg-primary">{ketQua.fuyo.ketLuan.viec}</p>
            {ketQua.fuyo.ketLuan.tiet_kiem_uoc !== null && (
              <p className="mt-1 text-sm text-fg-muted">
                {trn('Thuế bớt được {amount}', {
                  amount: <Money amount={ketQua.fuyo.ketLuan.tiet_kiem_uoc} currency="JPY" tone="in" />,
                })}
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
                    <Num tone="muted">{tr('{age} tuổi · nhóm {group}', { age: n.tuoi, group: NHOM_NHAN[n.nhom] })}</Num>
                    <span className="ml-auto">
                      {trn('đã gửi {amount}', { amount: <Money amount={n.da_gui} currency="JPY" /> })}
                      {n.nguong > 0 && !n.du && (
                        <>
                          {' · '}
                          {trn('còn thiếu {amount}', { amount: <Money amount={n.con_thieu} currency="JPY" tone="out" /> })}
                        </>
                      )}
                    </span>
                    <span className="basis-full text-2xs text-fg-muted">
                      {n.du ? tr('Giấy: {docs}', { docs: n.giay.join(' + ') }) : n.nhom === '<16' ? tr('Dưới 16 tuổi không thuộc khấu trừ này') : trn('Cần ≥ {amount}/năm để được tính', { amount: <Money amount={n.nguong} currency="JPY" /> })}
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
                <Plus className="h-4 w-4" /> {tr('Thêm người thân')}
              </ActionButton>
              {chuaGanTxs.length > 0 && relatives.some((r) => !r.is_archived) && (
                <ActionButton variant="outline" onClick={() => setSheetGan(year)}>
                  {tr('Gán người nhận ({n})', { n: chuaGanTxs.length })}
                </ActionButton>
              )}
              <ActionButton variant="outline" onClick={toggleDaKhai}>
                {daKhai ? tr('Đã nộp giấy năm {year} ✓', { year }) : tr('Đã nộp giấy năm {year}', { year })}
              </ActionButton>
            </div>
          </Card>

          {/* ② Đòi lại năm cũ */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>{tr('Đòi lại năm cũ (還付申告)')}</SectionTitle>
              <TrangThaiChu k={ketQua.refund.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg-primary">{ketQua.refund.ketLuan.viec}</p>
            {ketQua.refund.ketLuan.tiet_kiem_uoc !== null && (
              <p className="mt-1 text-sm text-fg-muted">
                {trn('Tổng có thể được hoàn {amount}', {
                  amount: <Money amount={ketQua.refund.ketLuan.tiet_kiem_uoc} currency="JPY" tone="in" />,
                })}
                <EstimateMark reason={ketQua.refund.ketLuan.ly_do[1]} />
              </p>
            )}
            {ketQua.refund.nam.length > 0 && (
              <ul className="mt-3 divide-y divide-border-subtle">
                {ketQua.refund.nam.map((n) => (
                  <li key={n.year} className="flex flex-wrap items-center gap-x-3 py-2 text-sm">
                    <Num>{tr('Năm {year}', { year: n.year })}</Num>
                    <span className="text-fg-secondary">{n.nguoi.map((p) => p.name).join(', ')}</span>
                    <span className="ml-auto text-fg-muted">{tr('hạn {date}', { date: `${n.han.slice(8, 10)}/${n.han.slice(5, 7)}/${n.han.slice(0, 4)}` })}</span>
                    {n.tiet_kiem_uoc !== null && (<span><Money amount={n.tiet_kiem_uoc} currency="JPY" tone="in" /><EstimateMark reason={ketQua.refund.ketLuan.ly_do[1]} /></span>)}
                    {!n.co_nguong && <span className="basis-full text-2xs text-fg-muted">{tr('Năm này luật chưa có ngưỡng 38万 — chỉ cần chứng từ gửi tiền.')}</span>}
                  </li>
                ))}
              </ul>
            )}
            {ketQua.refund.chua_gan.length > 0 && relatives.some((r) => !r.is_archived) && (
              <ul className="mt-3 divide-y divide-border-subtle">
                {ketQua.refund.chua_gan.map((c) => (
                  <li key={c.year} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Num tone="muted">{tr('Năm {year} · {n} lần chưa gán', { year: c.year, n: c.so_lan })}</Num>
                    <ActionButton variant="outline" onClick={() => setSheetGan(c.year)}>
                      {tr('Gán người nhận năm {year}', { year: c.year })}
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
              <SectionTitle>{tr('Trần ふるさと納税')}</SectionTitle>
              <TrangThaiChu k={ketQua.furusato.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg-primary">{ketQua.furusato.ketLuan.viec}</p>
            {ketQua.furusato.tran !== null && (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-2xs text-fg-muted">{tr('Trần')}</dt><dd><Money amount={ketQua.furusato.tran} currency="JPY" /><EstimateMark reason={ketQua.furusato.ketLuan.ly_do[0]} /></dd></div>
                {/* Không có danh mục thì KHÔNG đếm được: đừng in ¥0 và "còn nguyên trần" (chưa biết ≠ 0). */}
                <div><dt className="text-2xs text-fg-muted">{tr('Đã gửi')}</dt><dd>{ketQua.furusato.co_danh_muc ? <Money amount={ketQua.furusato.da_gui} currency="JPY" /> : <span className="text-fg-muted">{tr('Chưa đếm được')}</span>}</dd></div>
                <div><dt className="text-2xs text-fg-muted">{tr('Còn lại')}</dt><dd>{ketQua.furusato.co_danh_muc ? <Money amount={ketQua.furusato.con_lai ?? 0} currency="JPY" tone="in" /> : <span className="text-fg-muted">{tr('Chưa đếm được')}</span>}</dd></div>
              </dl>
            )}
            <ul className="mt-2 list-disc pl-5 text-2xs text-fg-muted">
              {ketQua.furusato.ketLuan.ly_do.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <NguonLuat year={year} />
            {!furusatoCategoryId && (
              <ActionButton variant="outline" className="mt-3" onClick={taoDanhMucFurusato}>
                {tr('Tạo danh mục "{name}"', { name: FURUSATO_CATEGORY_NAME })}
              </ActionButton>
            )}
          </Card>

          {/* ④ NISA / iDeCo */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>{tr('Hạn mức NISA / iDeCo chưa dùng')}</SectionTitle>
              <TrangThaiChu k={ketQua.shelter.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg-primary">{ketQua.shelter.ketLuan.viec}</p>
            {ketQua.shelter.tai_khoan.length > 0 && (
              <ul className="mt-3 divide-y divide-border-subtle">
                {ketQua.shelter.tai_khoan.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                    <Link to={`/assets/account/${t.id}`} className="font-medium text-fg-primary hover:underline">{t.name}</Link>
                    <span className="ml-auto">
                      {trn('đã nạp {amount}', { amount: <Money amount={t.used} currency="JPY" /> })}
                      {t.remaining !== null ? <> · {trn('còn {amount}', { amount: <Money amount={t.remaining} currency="JPY" tone="in" /> })}</> : <> · {tr('chưa đặt hạn mức')}</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-2 list-disc pl-5 text-2xs text-fg-muted">
              {ketQua.shelter.ketLuan.ly_do.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </Card>

          {/* ⑤ 医療費控除 / セルフメディケーション — hai chế độ, chọn một (spec iryohi-kojo) */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>{tr('Khấu trừ chi phí y tế')}</SectionTitle>
              <TrangThaiChu k={ketQua.iryohi.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg-primary">{ketQua.iryohi.ketLuan.viec}</p>
            {/* Hai chế độ, mỗi cái điều kiện + số riêng. Luật cấm cộng dồn: chỉ được chọn MỘT. */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <CheDoIryohi
                ten="医療費控除"
                dieuKien={tr('Chi khám, chữa bệnh, thuốc trong năm — phần vượt ngưỡng được trừ (tối đa ¥2,000,000).')}
                nhanChi={tr('Chi y tế')}
                chi={ketQua.iryohi.chi_y}
                nguong={ketQua.iryohi.nguong}
                khauTru={ketQua.iryohi.khau_tru_chinh}
                thang={ketQua.iryohi.nhanh === 'chinh'}
                lyDo={ketQua.iryohi.ketLuan.ly_do[0]}
              />
              {ketQua.iryohi.self_ap_dung ? (
                <CheDoIryohi
                  ten="セルフメディケーション"
                  dieuKien={trn('Chỉ thuốc mua ngoài có dấu ★, cần khám sức khỏe trong năm. Trần {amount}.', { amount: <Money amount={ketQua.iryohi.tran_self} currency="JPY" /> })}
                  nhanChi={tr('Chi thuốc')}
                  chi={ketQua.iryohi.chi_thuoc}
                  nguong={ketQua.iryohi.nguong_self}
                  khauTru={ketQua.iryohi.khau_tru_self}
                  thang={ketQua.iryohi.nhanh === 'self'}
                  lyDo={ketQua.iryohi.ketLuan.ly_do[0]}
                />
              ) : (
                <div className="rounded-lg border border-border-panel p-3 text-sm text-fg-muted">
                  {tr('セルフメディケーション không còn áp dụng cho năm {year}.', { year })}
                </div>
              )}
            </div>
            <p className="mt-2 text-sm text-fg-secondary">
              <span className="eink-gon:hidden">{tr('Chỉ được chọn một trong hai.')} </span>
              {ketQua.iryohi.nhanh === null ? (
                <>{tr('Chưa cái nào tới ngưỡng.')}</>
              ) : (
                <>
                  {trn('Lợi hơn: {name} (khấu trừ ≈ {amount})', {
                    name: ketQua.iryohi.nhanh === 'chinh' ? '医療費控除' : 'セルフメディケーション',
                    amount: <Money amount={ketQua.iryohi.khau_tru} currency="JPY" tone="in" />,
                  })}
                  {ketQua.iryohi.ketLuan.tiet_kiem_uoc !== null && (
                    <> · {trn('thuế bớt được ≈ {amount}', { amount: <Money amount={ketQua.iryohi.ketLuan.tiet_kiem_uoc} currency="JPY" tone="in" /> })}</>
                  )}
                </>
              )}
            </p>
            <ul className="mt-2 list-disc pl-5 text-2xs text-fg-muted">
              {ketQua.iryohi.ketLuan.ly_do.map((l) => <li key={l}>{l}</li>)}
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
