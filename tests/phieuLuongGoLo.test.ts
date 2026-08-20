// Nut "Xoa moi dong phieu luong" tung chi hien khi `daGhi` — state cua component, mat
// khi reload. Nguoi da nhap o luot truoc thi khong con duong go lo nao trong giao dien,
// va cung khong the lam nut hien lai: moi ky deu da nhap nen chang con gi de ghi. Da gap
// that (2026-08-20) khi phai nhap lai toan bo lich su.
//
// Khong co @testing-library/react trong repo (xem ImportPhieuLuongPage.test.ts) nen chot
// bang soat ma nguon, giong tests/phieuLuongXoa.test.ts.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const doc = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('Nút gỡ lô hỏi theo SỔ, không theo state của lượt hiện tại', () => {
  const src = doc('../src/features/phieu-luong/ImportPhieuLuongPage.tsx')

  it('điều kiện hiện nút gồm cả số kỳ đang có trong sổ', () => {
    expect(src).toContain('{(daGhi || dauTrongSo.length > 0) && (')
  })

  it('lấy số kỳ qua hook useDauPhieuLuong, không gọi repo trong thân render', () => {
    expect(src).toContain('useDauPhieuLuong()')
  })

  // Nut nay quyet dinh mot hanh dong XOA — de no dung trang thai cu sau khi ghi/xoa la
  // moi de bam vao khoang khong, hoac tuong da het ma chua het.
  it('invalidateTransactionData làm mới tập dấu', () => {
    expect(doc('../src/hooks/queries.ts')).toContain("queryKey: ['dauPhieuLuong']")
  })
})
