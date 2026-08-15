// Khong co bo may test component (khong @testing-library/react, khong moi truong
// jsdom/happy-dom trong repo — da kiem truoc khi viet file nay) nen khong dung
// render() de bat loi song trong onChange. Thay vao do, phan chup FileList thanh
// File[] duoc tach thanh mot ham THUAN rieng (layDanhSachFile, export tu
// ImportPhieuLuongPage.tsx) va test truc tiep o day.
import { describe, expect, it } from 'vitest'
import { layDanhSachFile } from './ImportPhieuLuongPage'

/** FileList that trong trinh duyet la object array-like + length; day la ban gia
 *  toi thieu du de Array.from() doc dung, va du de MO PHONG viec no bi "don rong"
 *  ngay sau khi component dat input.value = ''. */
function fileListGia(files: File[]): FileList {
  const obj: Record<number, File> & { length: number } = { length: files.length }
  files.forEach((f, i) => { obj[i] = f })
  return obj as unknown as FileList
}

describe('layDanhSachFile', () => {
  it('null -> mang rong', () => {
    expect(layDanhSachFile(null)).toEqual([])
  })

  it('chuyen FileList thanh mang thuong, giu dung thu tu va so luong', () => {
    const a = { name: 'a.pdf' } as File
    const b = { name: 'b.pdf' } as File
    const ds = layDanhSachFile(fileListGia([a, b]))
    expect(ds).toEqual([a, b])
  })

  // Day la chinh cai bug da xay ra that: input.value = '' xoa file BEN TRONG
  // FileList SONG, khong phai mot ban sao roi rac. Neu chonFile() giu tham chieu
  // toi chinh FileList do (thay vi mang da chup), no se thay danh sach RONG ngay
  // khi doc toi — chon file xong khong co gi xay ra, khong loi, khong dong nao.
  it('mang da chup KHONG doi khi FileList goc bi don rong sau do', () => {
    const a = { name: 'a.pdf' } as File
    const b = { name: 'b.pdf' } as File
    const fl = fileListGia([a, b])
    const ds = layDanhSachFile(fl)
    // Mo phong dung dieu component lam: dat input.value = '' -> trinh duyet don
    // rong CHINH FileList nay (cung mot doi tuong).
    ;(fl as unknown as { length: number }).length = 0
    expect(ds).toHaveLength(2)
    expect(ds).toEqual([a, b])
  })
})
