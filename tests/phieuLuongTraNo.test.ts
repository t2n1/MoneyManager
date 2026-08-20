// Duong no KOME cho 立替経費精算. Hai chot, ca hai canh mot lop loi LANG LE.
// Thiet ke: docs/superpowers/specs/2026-08-20-phieu-luong-thu-nhap-thuc-notes.md (vong ba)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const doc = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

/**
 * `debt_payments.transaction_id` la FK `on delete set null` (0007_debts.sql). Xoa giao dich
 * tra no ma khong xu bang nay thi HANG debt_payments con nguyen: no van bi tru trong khi
 * tien da mat khoi so. So cong ty con no sai vinh vien, khong dau vet.
 */
describe('xoaPhieuLuong: xoa debt_payments truoc khi xoa giao dich', () => {
  const src = doc('../src/data/supabaseRepo.ts')
  const than = (() => {
    const i = src.indexOf('async xoaPhieuLuong()')
    expect(i, 'khong thay xoaPhieuLuong').toBeGreaterThan(-1)
    return src.slice(i, src.indexOf('\n  },', i))
  })()

  it('doc debt_payments theo tien to 給与 truoc phep xoa giao dich hang loat', () => {
    const iTra = than.indexOf("from('debt_payments')")
    const iXoa = than.indexOf(".delete({ count: 'exact' })")
    expect(iTra).toBeGreaterThan(-1)
    expect(iXoa).toBeGreaterThan(iTra)
  })

  // Xoa payment TRUOC roi moi xoa giao dich cua no: nguoc lai thi transaction_id da bi
  // set null, khong con duong tim giao dich.
  it('xoa hang debt_payments truoc, roi moi xoa giao dich lien ket', () => {
    const iPayment = than.indexOf(".delete().eq('id', t.id)")
    const iTx = than.indexOf("eq('id', t.transaction_id)")
    expect(iPayment).toBeGreaterThan(-1)
    expect(iTx).toBeGreaterThan(iPayment)
  })

  it('bao ra so lan tra no da hoan', () => {
    expect(than).toContain('traNo')
  })
})

/**
 * Lan tra no PHAI di qua createDebtPayment: no tu doc `debts.origin` de dat `is_debt_flow`
 * (features/debts/debtPaymentPosting.ts:31). Importer tu dat co la gianh viec cua khoan no,
 * va sai ngay khi khoan no mang origin = 'earned'.
 */
describe('Trang import ghi lan tra no dung duong', () => {
  const src = doc('../src/features/phieu-luong/ImportPhieuLuongPage.tsx')

  it('dung repo.createDebtPayment cho traNo', () => {
    expect(src).toContain('repo.createDebtPayment(')
  })

  // So khoa `is_debt_flow:` (co dau hai cham), khong so chuoi tho: chinh chu thich trong
  // file NHAC TOI `is_debt_flow` bang loi de giai thich vi sao khong dat no — so tho thi cau
  // giai thich do lam test do gia. Cung cai bay da ghi o tests/phieuLuongXoa.test.ts.
  it('khong tu dat khoa is_debt_flow o tang trang', () => {
    expect(src).not.toContain('is_debt_flow:')
  })

  it('note cua lan tra mang dau 給与 (de go lo tim duoc)', () => {
    expect(src).toContain('note: k.traNo.dong.note')
  })

  // Khop dung tung ky tu: so that co `Minh KOME` (mot NGUOI), khop kieu "chua" la tru tien
  // cong ty vao khoan Minh no.
  it('khop ten doi tac dung tung ky tu, khong dung includes de CHON', () => {
    expect(src).toContain('d.counterparty === TEN_NO_CONG_TY')
  })

  it('noi ra ten gan giong de cach roi-lai khong lang le', () => {
    expect(src).toContain('tenGanGiong')
  })
})
