// CÂU NGHĨA của hai loại đối tượng trong kế hoạch — CHỮ, không React, không JSX.
//
// VÌ SAO CÓ FILE NÀY (câu hỏi của người dùng, 2026-09-10: "cái chặng và cái mốc có đang bị
// giống nhau không?"). Trên đồ thị thì KHÔNG: chặng là dải TRẦM dưới trục và lấp kín trục,
// mốc là ghim TƯƠI phía trên vùng vẽ. Chỗ lẫn không nằm ở đó — nó nằm ở chỗ người dùng phải
// CHỌN, vì "chặng" và "mốc" đều là từ chỉ THỜI GIAN: không từ nào tự nói ra mình chở cái gì.
// Cách chữa là dán một câu NGHĨA vào cả hai từ, ở mọi chỗ chúng xuất hiện.
//
// MỘT CHỖ KHAI, KHÔNG SÁU BẢN CHÉP. Sáu chỗ đọc cặp câu này: hàng nút của dải chặng, cửa
// mẫu, hai bảng sửa trong dock, hai mục của "Danh sách đầy đủ", và chú giải đồ thị. Sáu bản
// chép tay là đúng cách một luật trôi lệch nhau — đã xảy ra thật ở chính màn này với phép tô
// màu mốc (Finding 6, review cuối nhánh 2026-09-09): ba bản chép, hai cặp độ mờ khác nhau ở
// hai lớp KỀ NHAU của cùng một đồ thị. `tests/lifetimePlanWords.test.ts` canh không cho bản
// chép thứ hai mọc lên.
//
// GIỮ NGẮN CÓ CHỦ Ý: `hint` dưới 45 ký tự nên nó là một PHỤ ĐỀ, không phải văn xuôi — nó
// KHÔNG bọc <Guide>, tức không biến mất ở mật độ Gọn (mặc định của app). Đó là cả điểm: câu
// nghĩa phải còn đó ĐÚNG LÚC người dùng đang sửa. Chữ DẠY dài hơn (chặng nối tiếp nhau kín
// trục; mốc chỉ cộng thêm, không bao giờ sửa nền) vẫn ở trong <Guide> như cũ — xem
// `PhaseRowTools`, và ranh giới ghi ở `src/components/Guide.tsx`.

/** CHẶNG ĐỜI — đặt mức NỀN của một quãng đời. */
export const PHASE_WORDS = {
  name: 'Chặng đời',
  /** Câu hỏi mà loại này trả lời. Cửa mẫu dùng làm tiêu đề nhóm. */
  question: 'Từ năm này tôi sống thế nào',
  /** Phụ đề một dòng, đứng ngay dưới tiêu đề. */
  hint: 'thu/chi mỗi năm của quãng đời này',
  /** Nhãn trong chú giải đồ thị — nói cả HÌNH, vì đó là việc của chú giải. */
  legend: 'Chặng — vùng màu ở chân đồ thị',
} as const

/** MỐC CUỘC ĐỜI — CỘNG THÊM lên cái nền đó, và không bao giờ sửa nền. */
export const EVENT_WORDS = {
  name: 'Mốc cuộc đời',
  question: 'Năm này có việc gì',
  hint: 'một khoản riêng, cộng lên nền của chặng',
  legend: 'Mốc — ghim phía trên đồ thị',
} as const
