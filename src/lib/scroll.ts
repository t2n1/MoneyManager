// Đưa vùng nội dung về đầu.
//
// Cuộn của app KHÔNG nằm ở window mà ở <main> (xem AppLayout: khung cao h-dvh, chỉ
// <main> overflow-y-auto), nên `window.scrollTo` không có tác dụng gì cả.
//
// AppLayout đã tự đưa về đầu mỗi lần đổi ĐƯỜNG DẪN. Hàm này dành cho những chỗ đổi
// nội dung mà đường dẫn không đổi — đổi tab trong Sổ chỉ đổi `?view=`, nên trước đây
// bấm sang tab khác là rơi vào giữa nội dung tab mới, đúng chỗ đang cuộn ở tab cũ.
export function scrollContentToTop() {
  document.querySelector('main')?.scrollTo({ top: 0 })
}
