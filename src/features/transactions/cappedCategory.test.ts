import { describe, expect, it } from 'vitest'
import { type CapCategory, cappedCategory } from './cappedCategory'
import { shapeOf } from './entryShape'

const cat = (
  id: string,
  name: string,
  kind: CapCategory['kind'] = 'expense',
  type: CapCategory['type'] = 'expense',
  parent_id: string | null = null,
): CapCategory => ({ id, name, type, kind, parent_id })

const AN = cat('an', 'Ăn uống')
const GUI = cat('gui', 'Gửi tiền về VN', 'transfer')
const ALL = [AN, GUI, cat('luong', 'Lương', 'expense', 'income')]

/**
 * Shape GIA "vua auto vua co tran" — dung cho cac test ve NHANH AUTO cua cappedCategory.
 *
 * Truoc day cac test nay dung `shapeOf('family')`, khi do la dang duy nhat vua `auto` vua
 * co tran. Tu khi `family` doi sang `categoryPicker: 'user'` (nguoi dung chon muc dich, xem
 * entryShape.ts) thi KHONG con shape that nao nhu vay — ma nhanh auto cua ham van phai
 * duoc kiem. Dung mot shape gia o day de test noi ve HAM, khong phu thuoc mot dang co the
 * doi thiet ke lan nua.
 */
const AUTO_CAP = { capBase: 'full', categoryPicker: 'auto' } as const

describe('cappedCategory', () => {
  it('capBase none -> khong tra gi, ke ca khi dang chon danh muc', () => {
    expect(cappedCategory(shapeOf('lend'), AN, ALL, null)).toBeNull()
    expect(cappedCategory(shapeOf('earn'), AN, ALL, null)).toBeNull()
  })

  it('picker user -> dung o nguoi dung bam', () => {
    expect(cappedCategory(shapeOf('spend'), AN, ALL, null)).toBe(AN)
    expect(cappedCategory(shapeOf('split'), AN, ALL, null)).toBe(AN)
  })

  it('picker user chua chon -> null', () => {
    expect(cappedCategory(shapeOf('spend'), null, ALL, null)).toBeNull()
  })

  it('picker auto -> tra theo ten app se gan, KHONG dung o dang bam', () => {
    // `family` la dang duy nhat vua `auto` vua co tran. O nguoi dung bam khong lien quan.
    const found = cappedCategory(AUTO_CAP, AN, [cat('gui', 'Gửi tiền về VN')], 'Gửi tiền về VN')
    expect(found?.id).toBe('gui')
  })

  it('danh muc kind=transfer -> null, du bang co capBase full', () => {
    // Day la ca that cua `family` theo mac dinh migration 0046.
    expect(shapeOf('family').capBase).toBe('full')
    expect(cappedCategory(AUTO_CAP, null, ALL, 'Gửi tiền về VN')).toBeNull()
  })

  it('nguoi dung gat danh muc ve expense -> tran chay lai (0046 phai ton trong)', () => {
    const guiLaChi = [cat('gui', 'Gửi tiền về VN', 'expense')]
    expect(cappedCategory(AUTO_CAP, null, guiLaChi, 'Gửi tiền về VN')?.id).toBe('gui')
  })

  it('chon tay mot danh muc transfer o dang spend -> cung khong canh bao', () => {
    expect(cappedCategory(shapeOf('spend'), GUI, ALL, null)).toBeNull()
  })

  it('khong tim thay ten app gan -> null, khong nem loi', () => {
    expect(cappedCategory(AUTO_CAP, null, ALL, 'Danh muc khong ton tai')).toBeNull()
  })

  it('transfer co CHA dat tran -> van null, khong de roi ve tran cua cha', () => {
    // Chinh la bug: `Gui tien ve VN` la con cua `Tai chinh`. Khong chan o day thi capWarning
    // khong thay dong ngan sach cua no (danh muc transfer khong dat duoc han muc) va roi ve
    // dong cua cha — bao "them Y30,000 vao Tai chinh" trong khi progress.ts loai dung khoan
    // do khoi chi cua ca nhom. Con so trong cau canh bao khong bao gio toi.
    const conCuaTaiChinh = [cat('gui', 'Gửi tiền về VN', 'transfer', 'expense', 'taichinh')]
    expect(cappedCategory(AUTO_CAP, null, conCuaTaiChinh, 'Gửi tiền về VN')).toBeNull()
  })

  it('chi khop type=expense khi tra theo ten', () => {
    const trung = [cat('thu', 'Gửi tiền về VN', 'expense', 'income')]
    expect(cappedCategory(AUTO_CAP, null, trung, 'Gửi tiền về VN')).toBeNull()
  })
})
