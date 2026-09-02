// Khung Quyền lợi trên Bản tin: TÌNH TRẠNG ba khoản của năm nay (①, ③, ④), mỗi khoản một
// dòng; bấm là sang /quyen-loi. Không lặp việc-cần-làm — TodoPanel đã nói VIỆC, khung này
// nói TÌNH TRẠNG. Khi cả ba đều xong hoặc chưa tới mùa thì thu lại MỘT dòng: có, cũng là
// một câu trả lời, và là lý do khung không biến mất.
import { Link } from 'react-router-dom'
import { Card, Money, SectionTitle } from '../../components/ui'
import { EstimateMark } from '../../components/EstimateMark'
import { calendarYearOf } from '../../lib/dates'
import type { KetLuan } from '../quyen-loi/ketLuan'
import { useQuyenLoi } from '../quyen-loi/useQuyenLoi'

const TEN: Partial<Record<KetLuan['id'], string>> = {
  fuyo: 'Người phụ thuộc',
  furusato: 'ふるさと納税',
  shelter: 'NISA / iDeCo',
}

export function QuyenLoiPanel({ todayISO }: { todayISO: string }) {
  const year = calendarYearOf(todayISO)
  const { ketQua, isReady } = useQuyenLoi(year, todayISO)
  if (!isReady || !ketQua) return null

  const dong = ketQua.ketLuan.filter((k) => k.id in TEN)
  const canLam = dong.filter((k) => k.trang_thai === 'thieu' || k.trang_thai === 'thieu-du-lieu')

  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>Quyền lợi năm {year}</SectionTitle>
        <Link to="/quyen-loi" className="-my-2 py-2 text-2xs font-medium text-fg-accent hover:underline">
          Xem chi tiết →
        </Link>
      </div>
      {canLam.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">Không có gì cần làm lúc này.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border-subtle">
          {canLam.map((k) => (
            <li key={k.id}>
              <Link to="/quyen-loi" className="flex flex-wrap items-center gap-x-2 py-2 transition hover:bg-surface-sunken">
                <span className="text-2xs font-medium uppercase text-fg-muted">{TEN[k.id]}</span>
                <span className="min-w-0 flex-1 text-sm text-fg-secondary">{k.viec}</span>
                {k.tiet_kiem_uoc !== null && (
                  <span className="text-sm">
                    <Money amount={k.tiet_kiem_uoc} currency="JPY" tone="in" />
                    <EstimateMark reason={k.ly_do[0]} />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
