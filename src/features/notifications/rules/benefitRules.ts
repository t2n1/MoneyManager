// Bốn luật Quyền lợi (spec 2026-09-03). Luật này CỐ Ý ngu: bộ kiểm ở features/quyen-loi đã
// quyết trạng thái, mức khẩn, câu chữ; ở đây chỉ chép sang hình dạng AppNotification.
// Nhờ vậy chuông, push và màn Quyền lợi không bao giờ nói ba câu khác nhau về một khoản.
//
// THUẦN: chỉ import type. purity.test.ts canh.
import type { KetLuan } from '../../quyen-loi/ketLuan'
import type { AppNotification, NotificationInput } from '../types'

const TO = '/quyen-loi'

export function benefitRules(input: NotificationInput): AppNotification[] {
  const b = input.benefits
  if (!b) return []
  const out: AppNotification[] = []
  const boi = (id: KetLuan['id']) => b.find((k) => k.id === id)

  const fuyo = boi('fuyo')
  if (fuyo?.trang_thai === 'thieu')
    out.push({
      // Mã KHÔNG kèm kỳ: thiếu → đủ thì mã biến mất và trạng thái được dọn; năm sau lại
      // thiếu thì đỏ như mới (vòng đời mục E).
      key: 'benefit-fuyo-shortfall:all',
      kind: 'action',
      type: 'benefit-fuyo-shortfall',
      severity: fuyo.muc,
      title: fuyo.viec,
      detail: fuyo.ly_do[0],
      onISO: fuyo.han ?? undefined,
      to: TO,
    })

  const chuaGan = boi('remit-unassigned')
  if (chuaGan?.trang_thai === 'thieu')
    out.push({
      key: 'benefit-remit-unassigned:all',
      kind: 'action',
      type: 'benefit-remit-unassigned',
      severity: 'low',
      title: chuaGan.viec,
      detail: chuaGan.ly_do[0],
      to: TO,
    })

  const refund = boi('refund')
  if (refund?.trang_thai === 'thieu')
    out.push({
      key: 'benefit-refund-years:all',
      kind: 'action',
      type: 'benefit-refund-years',
      severity: refund.muc,
      title: refund.viec,
      detail: refund.ly_do[0],
      onISO: refund.han ?? undefined,
      to: TO,
    })

  // Cuối năm: một tin gộp furusato + NISA. Kỳ = năm, để năm sau lại là tin mới.
  const cuoiNam = [boi('furusato'), boi('shelter')].filter((k): k is KetLuan => k?.trang_thai === 'thieu')
  if (cuoiNam.length > 0)
    out.push({
      key: `benefit-year-end:${cuoiNam[0].year}`,
      kind: 'info',
      type: 'benefit-year-end',
      severity: cuoiNam.some((k) => k.muc === 'high') ? 'high' : 'low',
      title: cuoiNam[0].viec,
      detail: cuoiNam.length > 1 ? cuoiNam[1].viec : cuoiNam[0].ly_do[0],
      onISO: cuoiNam[0].han ?? undefined,
      to: TO,
    })

  return out
}
