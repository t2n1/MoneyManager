// Nút "quay lại" phải đưa người dùng về ĐÚNG trang vừa rời, không phải về trang cha
// trong sơ đồ menu.
//
// Ca hỏng thật: Ngân sách → "Đổi trần" → /settings/tags. Nút quay lại ở đó viết cứng
// `to="/settings"` (cha của nó trong cây đường dẫn), nên bấm là rơi sang tab Cài đặt —
// một chỗ người dùng chưa từng đi qua.
//
// Nhưng KHÔNG phải lúc nào cũng lùi được. Mở thẳng link từ tin nhắn, bấm thông báo
// nhảy vào giữa app, hay mở tab mới: lùi một bước là ra khỏi app luôn. Những lúc đó
// vẫn phải đi bằng đường cứng.
//
// Cách phân biệt: react-router đánh số thứ tự cho từng mục lịch sử vào
// `window.history.state.idx`, và đặt 0 cho mục ĐẦU TIÊN của tab này. Nên idx > 0 nghĩa
// là mục đứng trước do chính app đẩy vào — lùi lại thì vẫn ở trong app. Số này nằm
// trong history state nên sống qua F5, và `replace` giữ nguyên nó.

/** Có mục lịch sử nào TRƯỚC mục hiện tại, do chính app đẩy vào, hay không. */
export function hasAppHistory(state: unknown): boolean {
  if (typeof state !== 'object' || state === null) return false
  const { idx } = state as { idx?: unknown }
  return typeof idx === 'number' && idx > 0
}
