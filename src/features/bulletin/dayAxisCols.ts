// Trục ngày dùng CHUNG cho biểu đồ "Chi từng ngày" và dải nhãn ngay dưới nó.
//
// Vì sao phải có file này thay vì mỗi chỗ tự đặt bề rộng: B44 chốt hai khối nằm trên CÙNG
// MỘT TRỤC NGÀY, và đó là toàn bộ lý do dải nhãn đáng nhìn — ô màu của `#Osaka` phải thẳng
// hàng với đúng hai cụm cột vọt lên thì mắt mới nối được "hai đợt đi chơi" với "hai cái gồ".
// Lệch một chút thôi là người đọc phải đếm ngày ở cả hai khối để tự nối, và lúc đó dải nhãn
// chỉ còn là một bảng số nằm dưới một biểu đồ.
//
// Bản vẽ `44a` vẽ hai khối bằng hai lề khác nhau (trục tung 46px cho biểu đồ, cột tên 104px
// cho dải nhãn) — chỗ đó bản vẽ TỰ MÂU THUẪN với câu nó viết ở B44, và code đi theo câu chứ
// không đi theo hình. Giá phải trả là cột trục tung rộng ra bằng cột tên; nhãn trục canh
// phải nên nó vẫn nằm sát vùng vẽ, chỉ dôi ra một khoảng trắng bên trái.
//
// Đổi một hằng ở đây là đổi cho CẢ HAI khối. Đặt riêng ở một trong hai file thì file kia
// vẫn chạy, chỉ lệch đi vài pixel — loại lỗi không ai thấy cho tới khi nó lệch nhiều.

/** Cột đầu hàng: tên nhãn ở dải nhãn, nhãn trục tung ở biểu đồ. */
export const AXIS_LEAD = 'w-full md:w-[6.5rem] md:flex-none'

/** Cột `tổng` bên phải mỗi hàng nhãn. Biểu đồ để trống đúng bề rộng này. */
export const AXIS_TOTAL = 'w-[3.5rem] flex-none text-right'

/** Cột `trần` bên phải cùng. Biểu đồ để trống đúng bề rộng này. */
export const AXIS_CAP = 'w-[7.5rem] flex-none text-right'

/** Khe giữa cột đầu · vùng ngày · hai cột số. Ở mobile cột đầu biến mất nên khe cũng vậy. */
export const AXIS_GAP = 'gap-x-0 md:gap-x-2'

/** Khe giữa hai ô ngày. `px` cố ý — nó là HÌNH, phải đứng yên khi người dùng phóng cỡ chữ. */
export const CELL_GAP_PX = 3

/**
 * In nhãn ngày cách mấy ngày một lần, theo bề rộng cột ĐO ĐƯỢC.
 *
 * Cùng lý lẽ với `labelThreshold` (B43): thẻ này chiếm hết chiều ngang Bản tin, mà chiều
 * ngang đó đổi theo cửa sổ, theo bố cục cột của trang và theo `--app-font-scale`. Trước đây
 * chỗ này chốt cứng "mỗi 5 ngày" nên ở màn rộng trục ngày thưa một cách vô cớ — mỗi nhãn
 * cách nhau tới 190px, và muốn biết một cột là ngày mấy thì phải đếm.
 *
 * Ngưỡng đo từ nhãn hai chữ số ở IBM Plex Mono 10px: "01" rộng 12px, cộng 2px đệm mỗi bên.
 */
export function dayLabelStep(colWidthPx: number): number {
  if (colWidthPx >= 16) return 1
  if (colWidthPx >= 8) return 2
  return 5
}
