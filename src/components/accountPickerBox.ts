// Hình học của panel AccountPicker: đặt ở đâu, rộng bao nhiêu, CAO TỐI ĐA bao nhiêu.
//
// Tách thành hàm thuần vì phép kẹp chiều cao là chỗ đã sai một lần theo cách không nhìn
// thấy được: panel đặt `maxHeight: '70vh'` cứng, và khi chỗ dưới nút hẹp hơn thế mà nội
// dung lại NGẮN hơn 70vh, khối trong không cần cuộn — phần thừa tràn xuống dưới mép màn
// và không có cách nào tới, vì panel là `position: fixed` còn trang Nhập thì không cuộn.
// Triệu chứng người dùng thấy: mấy tài khoản cuối danh sách không bấm được.
//
// Bất biến hàm này giữ: panel LUÔN nằm trong màn ở hướng nó bung. Vượt là listbox phải
// cuộn, không phải màn phải cuộn.

/** Chiều cao một dòng tài khoản. */
export const ROW_H = 48
/** Lề tối thiểu tới mép màn. */
const EDGE = 12
/** Khoảng hở giữa nút và panel. */
const GAP = 4
/** Panel không thấp hơn mức này: neo ở chỗ ngặt vẫn còn ô tìm + vài dòng, và nó CUỘN. */
const MIN_H = 160

export interface AnchorRect {
  top: number
  bottom: number
  left: number
  width: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface PanelBox {
  left: number
  /** `top` khi bung xuống, `bottom` khi bung lên — theo `drop`. */
  anchor: number
  width: number
  drop: 'down' | 'up'
  maxH: number
}

export function panelBox(r: AnchorRect, v: ViewportSize, optionCount: number): PanelBox {
  // Máy nhỏ thì dùng gần hết bề ngang: tên tài khoản dài + số dư 9 chữ số (đồng VN) không
  // nhét nổi vào 300px. Máy rộng thì chỉ cần đủ 320px.
  const roomX = v.width - EDGE * 2
  const width = v.width < 480 ? roomX : Math.min(Math.max(r.width, 320), roomX)

  const want = Math.min(v.height * 0.7, optionCount * ROW_H + 96)
  const below = v.height - r.bottom
  const drop: 'down' | 'up' = below < want + 8 && r.top > below ? 'up' : 'down'
  const roomY = (drop === 'down' ? below : r.top) - EDGE

  return {
    left: Math.max(EDGE, Math.min(r.left, v.width - width - EDGE)),
    anchor: drop === 'down' ? r.bottom + GAP : v.height - r.top + GAP,
    width,
    drop,
    maxH: Math.max(MIN_H, Math.min(want, roomY)),
  }
}
