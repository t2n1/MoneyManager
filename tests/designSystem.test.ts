// Ràng buộc của design system, kiểm bằng chính vitest sẵn có (đọc file, không cần
// DOM — repo không có @testing-library nên không có test render nào để dựa vào).
//
// Hai loại luật, cố ý khác nhau:
//
//   BAN cứng  — phải bằng 0. Dùng cho những thứ ĐÃ dọn sạch. Tái xuất hiện là hồi quy.
//   NGƯỠNG    — số hiện tại là TRẦN, chỉ được giảm. Dùng cho idiom còn ~70-100 chỗ
//               chưa gộp: đặt về 0 ngay thì phải refactor 92 file trong một lần, mà
//               không có test UI nào đỡ. Ngưỡng cho phép gộp dần và vẫn chặn được
//               việc thêm mới. Gộp bớt được chỗ nào thì HẠ số xuống, đừng để nguyên.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Ở tests/ chứ không phải src/: file này đọc filesystem bằng `node:fs`, mà
// tsconfig.app.json cố ý chỉ khai `types: ["vite/client"]`. Nhét vào src thì phải
// thêm type Node cho toàn bộ code app — mất luôn ranh giới ngăn ai đó import `fs`
// vào file chạy trên trình duyệt. Đây là công cụ, không phải code app.
//
// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money
// Manager") nên pathname trả về đã percent-encode → ENOENT.
const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')

function sourceFiles(dir = SRC): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...sourceFiles(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/**
 * Bỏ comment trước khi đếm. Không bỏ thì chính lời giải thích "đừng dùng X" trong
 * comment lại làm guardrail đỏ — mà comment tại chỗ là nơi TỐT NHẤT để nói lý do.
 *
 * Chỉ bỏ block `/* *\/` và dòng bắt đầu bằng `//` hoặc `*`; KHÔNG cắt `//` giữa dòng
 * vì URL trong chuỗi (`https://…`) sẽ bị chặt mất phần sau.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

/**
 * Trần cho văn xuôi chưa đi qua cổng của chế độ Gọn — xem test cuối file.
 *
 * 49 (2026-08-11): đo sau khi bọc 35 đoạn vào <Guide>. Con số còn lại KHÔNG phải nợ
 * cần dọn hết: đã xét từng chỗ, phần lớn là cảnh báo dữ liệu (thiếu tỷ giá, chưa quy
 * đổi), dòng số liệu, câu giải thích ô đang bị vô hiệu, và trạng thái rỗng mà câu chữ
 * là đường đi tiếp duy nhất. Bọc chúng lại là bỏ chức năng, không phải bớt chữ.
 *
 * 51 (2026-08-12): mặt lập kế hoạch thêm hai dòng SỐ LIỆU, không phải chữ dạy —
 * "3 tháng gần đây: 2026-06 ¥42.100 · …" ở ô đặt hạn mức, và "định kỳ ×2 → Nhà ở" ở
 * danh sách cam kết. Cả hai chính là thứ khiến khối đó đáng nhìn; bọc <Guide> thì ở
 * chế độ Gọn ô đặt hạn mức lại thành ô trống, đúng cái lỗi đợt này đi sửa.
 *
 * 52 (2026-08-12): khối trần-theo-nhãn của mặt lập kế hoạch có câu cảnh báo thiếu tỷ
 * giá, y hệt câu đã có ở TagBudgetsCard. Cảnh báo "số đang tính thiếu" mà ẩn ở chế độ
 * Gọn thì người dùng đọc một con số sai mà không biết — đúng loại phải ở lại.
 *
 * 53 (2026-08-13): FundHoldingsSection lặp lại đúng dòng "theo giá phiên …/chưa có
 * bảng giá" đã có ở HoldingsSection, chỉ đổi nhãn 基準価額 cho quỹ Nhật. Đây là dòng
 * SỐ LIỆU nói rõ đang tính theo phiên nào — bọc <Guide> là mất thông tin đó ở chế độ
 * Gọn, đúng loại lỗi các lần nâng trần trước đã tránh.
 *
 * ── Đợt gộp danh mục đầu tư (2026-08-13/14) — ba lời ghi dưới đây theo thứ tự thời
 * gian, và cộng lại thì trần này **TĂNG** từ 53 lên 55. Nói thẳng ra vì đây là ngoại lệ
 * của cả đợt: năm ngưỡng khác (`active:scale-95` 93→82, `min-h-11 min-w-11` 28→22,
 * `tabular-nums` 97→96, `text-green-700 …` 34→32, `bg-green-700` 63→62) đều TỤT khi xoá
 * HoldingsSection/FundHoldingsSection, riêng văn xuôi thì không: hai tab mới và trang
 * tài khoản mới cần thêm câu cho những TRẠNG THÁI không có ở bản cũ (tab thứ hai có
 * trạng thái rỗng riêng; trang tài khoản có thêm một trạng thái "chưa tính được" thứ
 * hai). Ai đọc "55" mà tưởng đợt này dọn bớt văn xuôi là hiểu ngược — nó dọn bớt năm
 * ngưỡng kia, còn văn xuôi thì trả thêm 2 để có hai tab.
 *
 * 56 (2026-08-13): InvestFundsTab (tab Quỹ Nhật của vỏ /invest hai tab) lặp lại ba
 * dòng đã có bên InvestStocksTab, chỉ đổi từ "mã/giá" sang "quỹ/基準価額": trạng thái
 * rỗng chưa có tài khoản (đường đi tiếp duy nhất là liên kết tới Cài đặt), cảnh báo
 * "chưa tính được" khi thiếu giá, và trạng thái chưa giữ quỹ nào. Cùng loại ba dòng
 * này bên tab cổ phiếu đã nằm trong 53 phía trên — đây không phải chữ mới, chỉ là
 * bản song sinh cho tab thứ hai.
 *
 * 57 (2026-08-13): AccountDetailPage giờ có HAI câu cảnh báo "chưa tính được giá"
 * KHÁC NHAU cho HAI trạng thái khác nhau, không phải một câu chép hai lần:
 *
 *   - Khối KHÔNG có sổ lệnh: "Chưa cập nhật giá thị trường — đang tính theo vốn
 *     gốc." Guard của nó là `invStats.unrealizedPnl == null`, tức chưa từng có bản
 *     định giá tay nào — "chưa cập nhật" đúng nghĩa đen ở đây.
 *   - Khối CÓ sổ lệnh: "Chưa tính được — chưa có giá cho mã/quỹ nào đang giữ."
 *     (mượn nguyên chữ từ nhánh `p.marketValue === null` của InvestStocksTab, cách
 *     một cú bấm "Xem →"). Guard của nó là `danhMuc.marketValue == null`, và số lớn
 *     phía trên khối này có thể đang rơi về `invStats.marketValue` — MỘT BẢN ĐỊNH
 *     GIÁ TAY CŨ vẫn tồn tại. Dùng câu "chưa cập nhật" ở đây sẽ SAI: có snapshot,
 *     chỉ là buildPortfolio không có giá cho mã/quỹ nào đang giữ.
 *
 * Hai câu KHÔNG được gộp lại thành một dù trông giống nhau về hình dạng ("chưa
 * tính được…"/"fg-muted"): ai đọc thấy giống rồi "gộp" (rút thành một hằng chuỗi
 * dùng chung cho cả hai khối) sẽ làm câu sai quay lại ở đúng một trong hai trạng
 * thái — đây chính là lỗi mà chốt review Task 6 phát hiện lần đầu (một câu chép tay
 * sang khối không đúng ngữ cảnh của nó). Hai đoạn cảnh báo DỮ LIỆU cho hai trạng
 * thái thật khác nhau này VẪN giữ nguyên, không phải chữ dạy — bọc <Guide> sẽ giấu
 * cảnh báo ở chế độ Gọn, đúng lỗi các lần nâng trần trước đã tránh.
 *
 * 55 (2026-08-13, bước cuối đợt gộp danh mục): tụt TỪ 57 vì HoldingsSection và
 * FundHoldingsSection bị xoá — nội dung của chúng gom về hai tab của /invest, nơi mỗi câu
 * chỉ còn MỘT bản. Tụt từ 57, nhưng vẫn CAO HƠN 53 lúc đợt này bắt đầu: xem khối "──" ở
 * trên. Hạ trần theo đúng quy ước ở thông điệp lỗi của chính phép thử này: trần không hạ
 * là trần rỗng, để lần sau thêm văn xuôi mới mà không ai biết.
 *
 * 60 (2026-08-16, PR 4 của redesign 1a): +5 của màn Bản tin. Đã xét từng đoạn, cả năm
 * thuộc đúng hai loại mà bảng ranh giới ở docs/design-system.md xếp vào cột "KHÔNG bọc":
 *
 *   · BA trạng thái rỗng (chưa có tài khoản · chưa đặt hạn mức · chưa ghi giao dịch nào
 *     tháng này). Mỗi câu đi kèm MỘT <Link>, và cái link đó là đường đi tiếp DUY NHẤT
 *     của khối — Bản tin không có nút nào khác dẫn tới đó. Bọc <Guide> là ở chế độ Gọn
 *     khối rỗng thành một ô trống trơn, đúng loại lỗi các lần nâng trần trước đã tránh.
 * 63 (2026-08-17, bản vẽ 19a): +1 ở AccountDetailPage — câu "Đủ trả cả N thẻ dùng ví
 * này kỳ tới." của khối Nguồn trả. Hai lý do nó ở lại, mỗi lý do đủ một mình:
 *   · Nó là câu NÓI RA TRẠNG THÁI, đối trọng của banner đỏ "cần nạp thêm" ngay cạnh.
 *     Ẩn ở chế độ Gọn thì im lặng thành nhập nhằng — người đọc không biết là "đủ tiền"
 *     hay "app chưa tính được".
 *   · Chữ THẬT của nó chỉ ~35 ký tự; phần vượt 45 là do regex không bóc được `{}` lồng
 *     trong template literal. Cùng loại bắt nhầm đã ghi ở cuối khối này.
 *
 * 62 (2026-08-17, PR 9): +1 ở ReliabilityPanel — câu 'Không còn chỗ nào thiếu…'. Đó là
 * câu NÓI RA CHÍNH TRẠNG THÁI của khối (bảng ranh giới xếp vào cột KHÔNG bọc): ẩn nó ở
 * chế độ Gọn thì khối Độ tin cậy 100% chỉ còn một con số trơ và một thanh xanh, không
 * ai biết nó nghĩa là đã đủ hay chưa tính được.
 *
 * 61 (2026-08-17, PR 8): +1 ở PlanningView — dòng 'Thu dự kiến … đang dùng nền — TB 6
 * tháng có dữ liệu'. Đây là câu nói ra NGUỒN của mẫu số, tức cảnh báo dữ liệu: ẩn nó
 * ở chế độ Gọn thì người dùng chia hết một con số app đoán hộ mà tưởng là số mình khai.
 *
 *   · HAI dòng SỐ LIỆU bị regex bắt nhầm là văn xuôi: dòng "đã tiêu / tổng hạn mức" của
 *     panel Ngân sách và dòng "tháng · thu / chi" của panel Dòng tiền. Chữ thật trong
 *     chúng chỉ vài từ; phần vượt 45 ký tự là markup của <Money> và <span>.
 */
/*
 * 65 (2026-08-18, bản vẽ 26a/27a): +2 khi dựng lại hai tab Tháng này và Dài hạn. Cả hai
 * là loại "phải ở lại", đúng như danh sách ngoại lệ ngay trên:
 *
 *   · CHÂN TRANG của mỗi tab — "Tháng bắt đầu ngày 1 · so cùng số ngày · quy đổi ≈ JPY ·
 *     khoản chuyển tài sản tính riêng" và bản của tab Dài hạn ("mức nền = trung vị từ
 *     2024/12"). Đây là bốn QUY ƯỚC quyết định mọi con số ở trên nó, không phải chữ dạy.
 *     Ẩn ở chế độ Gọn thì người đọc mặc định app so với cả tháng trước, mặc định gửi về
 *     VN nằm trong chi, và mặc định mức nền là trung bình — cả ba đều sai.
 *     §G của gói việc đòi nói nguồn MỘT LẦN ở chân trang thay vì lặp từng dòng; đây chính
 *     là cái "một lần" đó, nên nó không được biến mất.
 *
 * Ba đoạn khác của cùng hai tab KHÔNG cộng vào trần vì chúng là trạng thái rỗng có đường
 * đi tiếp ("Cần 24 tháng dữ liệu…, hiện có 12") — regex bỏ qua nhờ `py-*`/`truncate`, và
 * bốn khối chú thích dạy cách đọc thì đã bọc <Guide>/<ExplainBox> sẵn.
 */
/*
 * 68 (2026-08-18, bản vẽ 27b): +3 khi dựng lại tab Sức khỏe. Cả ba nằm đúng ba loại
 * "phải ở lại" mà chú thích trên đã liệt kê:
 *
 *   · HealthTable — DÒNG TRỌNG SỐ ở chân bảng ("quỹ dự phòng 25% · cầm cự 20% · …").
 *     Đây là DỮ LIỆU, và việc gộp nó về một dòng chính là một trong năm việc 27b yêu cầu:
 *     in trọng số cạnh từng nhãn làm chỉ số rủi ro trông ít quan trọng vì nó chỉ nặng 10%.
 *     Ẩn ở chế độ Gọn thì điểm tổng thành một con số không ai kiểm được.
 *
 *   · HealthBlocks — "Chưa có tài khoản đầu tư nào nên thanh trượt thứ hai không có gì để
 *     kéo." Câu giải thích một Ô ĐANG BỊ VÔ HIỆU; đúng loại đã được nêu ngoại lệ.
 *
 *   · HealthView — CHÂN TRANG của tab, cùng loại với chân trang hai tab kia ở lời ghi 65:
 *     nó nói ra hai giới hạn của khối mô phỏng (không tính lạm phát, không tính thuế bán
 *     tài sản). Mất hai mệnh đề đó thì con số "35 tháng" đọc như một dự báo.
 */
/*
 * 71 (2026-08-18, bản vẽ 28a): +3 của tab thứ tư "Quyết định". Cả ba là dữ liệu hoặc là
 * lý-do-để-hành-động, không phải chữ dạy:
 *
 *   · Dòng dưới tiêu đề khối 02 ("Theo nhịp tiền mặt hiện tại: 10 tháng — mọi dòng dưới
 *     đây đo bằng CÙNG thước đó"). Nó khai ĐƠN VỊ của cả bảng đòn bẩy. Ẩn ở chế độ Gọn thì
 *     cột "Còn" thành một dãy số không có thước, và bảng mất lý do tồn tại.
 *
 *   · Câu trong TRẠNG THÁI RỖNG của khối 04 ("có mục tiêu thật thì bảng đòn bẩy ở khối 02
 *     đổi thứ tự"). Đây là lý do để bấm nút ngay dưới nó — không có nó thì nút "Đặt mục
 *     tiêu" là một nút không nói được vì sao nên bấm. Không thuộc ngoại lệ "trạng thái rỗng
 *     không còn đường đi tiếp" (khối này CÓ đường đi), nên đếm vào trần chứ không miễn.
 *
 *   · Chân trang của tab, cùng loại với ba tab kia (lời ghi 65 và 68). Nó nói ra một điều
 *     quyết định cách đọc mọi con số: "mọi mốc thời gian là suy từ nhịp, không phải cam kết".
 */
/*
 * 72 (2026-08-18, migration 0047): +1 ở form tài khoản — câu nói NGHĨA CỦA LỰA CHỌN đang
 * chọn cho cờ "rút ra tiêu được ngay" ("Đang để app suy từ loại tài khoản (coi là rút ngay
 * được). Tiền gửi CÓ KỲ HẠN là loại Ngân hàng nên sẽ bị đếm sai — hãy chọn Không.").
 *
 * Cùng loại với ngoại lệ "câu giải thích ô đang bị vô hiệu" đã nêu ở đầu file: nó không dạy
 * khái niệm nào, nó nói ô này hiện đang làm gì. Và nó là chỗ DUY NHẤT trong app nói ra rằng
 * tiền gửi có kỳ hạn đang bị đếm sai — ẩn ở chế độ Gọn thì người dùng không có cách nào biết
 * vì sao nên bấm "Không".
 *
 * 74 (2026-08-23, B41–B48 dựng lại thẻ "Chi từng ngày"): +2, cả hai là DÒNG SỐ LIỆU, không
 * phải chữ dạy — cùng loại với lời ghi 51 ở đầu file.
 *
 *   · `DailySpendPanel` — "ngày thường ¥X · theo nhịp này N ngày còn lại thêm ~¥Y → cả tháng
 *     ~¥Z". Ba con số, và cụm "theo nhịp" là thứ phân biệt nó với dự báo của khối Ngân sách
 *     (trung vị KHÔNG biết khoản định kỳ cuối tháng). Ẩn ở chế độ Gọn thì hai thẻ trên cùng
 *     một màn đưa ra hai con số dự phóng khác nhau mà không chỗ nào nói vì sao.
 *
 *   · `DayTagStrip` — "32% chi có nhãn (¥86.100 / ¥270.311) · các nhãn cộng lại ¥126.700 —
 *     lệch ¥40.600 là khoản mang nhiều nhãn cùng lúc". Đây đúng là mục CHẶN B44.2: một giao
 *     dịch mang được nhiều nhãn nên tổng các hàng lớn hơn tổng chi, và bỏ mệnh đề cuối thì
 *     hai con số ngay cạnh nhau đọc ra như một lỗi tính. Ẩn nó ở chế độ Gọn là để lại đúng
 *     hai con số không giải thích được.
 *
 * Hai dòng còn lại của đợt này KHÔNG tính vào đây vì chúng không phải văn xuôi: "còn N nhãn
 * nữa" và "¥X chưa gắn nhãn · N giao dịch" là nhãn đếm, dưới ngưỡng chữ của phép thử.
 *
 * 75 (2026-08-24, thẻ chi tiết khi rê chuột): +1 ở `DayCard` — dòng của một ngày CHƯA TỚI,
 * "chưa xảy ra — theo nhịp này ~¥X". Nó là dòng SỐ LIỆU, và là chỗ duy nhất nói ra rằng cột
 * nét đứt đang trỏ tới là dự phóng chứ không phải tiền đã tiêu; ẩn ở chế độ Gọn thì rê vào
 * một cột tương lai chỉ còn thấy một con số không nhãn.
 *
 * Ba dòng kia của cùng thẻ đó không lọt ngưỡng 45 ký tự (nhãn ngày, "Không ghi khoản nào.",
 * hàng chip nhãn) — nêu ra để lần sau không ai đọc "+1" rồi đi tìm một câu bị bỏ sót.
 *
 * 77 (2026-08-24, dựng lại tab Lịch theo gói 1a): +2 ở `CalendarPanels`, cả hai là CẢNH BÁO
 * DỮ LIỆU "số đang tính thiếu" — đúng loại đã được nêu ở lời ghi 52 và phải ở lại vì lý do
 * đó: ẩn nó ở chế độ Gọn thì người dùng đọc một con số sai mà không có gì báo.
 *
 *   · khối "Còn được tiêu" — thiếu tỷ giá là `convertToBase` trả null, tức khoản ngoại tệ
 *     bị bỏ khỏi `spent`, tức mức "còn tiêu được mỗi ngày" đang CAO hơn sự thật. Đó là con
 *     số hành động nhiều nhất của cả màn, nên nó không được cao hơn sự thật trong im lặng.
 *   · khối "Chi theo nhãn" — y hệt câu đã có ở `TagBudgetsCard`, và có mặt hai lần vì đây
 *     là hai màn khác nhau, không phải một câu bị chép.
 *
 * Phần chữ mới của đợt này KHÔNG tính vào đây vì đã đi qua cổng đúng cách: câu "ngày rút thẻ
 * không nằm trong con số trên" và câu "một khoản mang nhiều nhãn" đều bọc <Guide>, còn chú
 * giải lưới, dòng cam kết cột Tuần và câu B36.2 "đã hứa hết phần còn lại" là dòng số liệu
 * dưới ngưỡng 45 ký tự hoặc không mang class chữ phụ.
 *
 * 78 (2026-08-24, dựng lại trang Tài sản theo bản vẽ 2a/2b): +1 SAU KHI đã trừ những chỗ đi.
 * Đợt này bỏ bốn đoạn (khối thẻ tín dụng gộp lại, chú giải biểu đồ tròn, hai câu nhân đôi
 * của thẻ Tài sản ròng) và thêm năm, cả năm là CÂU DO SỐ DỰNG RA — cùng loại đã nêu ở lời
 * ghi 52 và 77, tức phải ở lại vì ẩn chúng là ẩn lý do một con số đang lệch:
 *
 *   · `AssetsTrendView` — "ròng sụt X gần như hoàn toàn ở nhóm G, tài khoản A −Y". Bảng ngay
 *     trên nó in năm dòng Δ; câu này nói dòng nào đang gánh cú sụt. Không có nó thì người
 *     đọc phải tự so năm con số để tìm ra điều mà `concentrationNote` đã tính.
 *   · `InvestmentPerformanceSection` ×2 — "chưa quy ra %/năm vì …" và "tính theo LOẠI nên gồm
 *     退職金 ¥50.000 đang ở nhóm Tiết kiệm, vì vậy lệch đúng ¥50.000 với nhóm Đầu tư". Câu thứ
 *     hai là chỗ DUY NHẤT trong app giải thích vì sao hai con số cách nhau 300px không khớp.
 *   · `NetWorthHistorySection`, `InvestmentValueHistorySection` — trạng thái "khoảng đang chọn
 *     chưa đủ hai mốc, chọn khoảng rộng hơn", tức một màn rỗng CÓ đường đi tiếp.
 *
 * Cả năm đều không phải chữ để DẠY, nên bọc <Guide> là sai: <Guide> ẩn ở chế độ Gọn, và ẩn
 * một câu nói "con số này lệch vì lý do X" là để lại đúng con số lệch mà bỏ mất lý do.
 */
const PROSE_MAX = 78

const FILES = sourceFiles().map((path) => ({
  path,
  text: stripComments(readFileSync(path, 'utf8')),
}))

/** Số lần `needle` xuất hiện trong toàn bộ src, kèm danh sách file để báo lỗi cho rõ. */
/**
 * Đếm số lần `needle` xuất hiện, KHÔNG tính khi nó chỉ là phần đầu của một class dài hơn.
 *
 * Vì sao cần chốt này: cây kim `rounded-xl bg-surface` (đếm thẻ viết tay) khớp luôn cả
 * `rounded-xl bg-surface-sunken` — mà track lún, nền segmented và nền chrome KHÔNG phải
 * thẻ. Trước bản 1a chỉ có mỗi `bg-surface` nên phép so chuỗi trần còn đúng; từ khi thang
 * bề mặt có bốn nấc (`-page`, `-chrome`, `-sunken`) thì nó bắt oan, và trần bị đẩy lên vì
 * một thứ không phải nợ.
 */
function occurrences(needle: string) {
  let count = 0
  const where: string[] = []
  // Chặn hậu tố: sau cây kim không được là chữ/số/gạch — tức không phải class dài hơn.
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'g')
  for (const f of FILES) {
    const n = f.text.match(re)?.length ?? 0
    if (n > 0) {
      count += n
      where.push(`${f.path.replace(SRC, '')} (${n})`)
    }
  }
  return { count, where }
}

/**
 * Số DÒNG chứa đồng thời cả `a` lẫn `b`. Vá đường lách của luật cặp-màu-liền-kề:
 * `text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100` — chèn một class xen
 * giữa là thoát khỏi phép so chuỗi liền. Từng có 48 chỗ lách kiểu này.
 */
/**
 * Bán kính khai trong THẺ MỞ của từng control. Trả về từng chỗ một để luật bán kính
 * control (§1.3) đếm được thứ mà phép so chuỗi không phân biệt nổi: `rounded-lg` trên một
 * cái nút là nợ, còn `rounded-lg` trên một khối bọc thì không.
 *
 * Chỉ `<button|input|select|textarea>`, CỐ Ý không có `<Link>`: một <Link> có thể là cả
 * một dòng/thẻ bấm được (CardsSection bọc nguyên tấm thẻ thẻ-tín-dụng trong Link), và lúc
 * đó bán kính của nó là bán kính PANEL — đúng chứ không sai. Không đọc được từ tên thẻ
 * nên không đếm; nếu sau này Link-dạng-nút gom hết vào <ActionButton> thì chỗ đó tự hết.
 */
function controlRadii(): { file: string; line: number; radius: string }[] {
  const out: { file: string; line: number; radius: string }[] = []
  const RADIUS = /\brounded-(none|sm|md|lg|xl|2xl|3xl|full)(?![\w-])/g
  for (const file of sourceFiles()) {
    // Che comment mà GIỮ số ký tự → số dòng báo lỗi vẫn đúng (cùng mẹo với luật <label>).
    const raw = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
    const tag = /<(button|input|select|textarea)\b/g
    let m: RegExpExecArray | null
    while ((m = tag.exec(raw))) {
      // Thẻ mở = tới `>` đầu tiên NGOÀI mọi ngoặc nhọn (className={`…${x > 1 ? …}`} có
      // dấu `>` bên trong không tính).
      let i = m.index + m[0].length
      let depth = 0
      for (; i < raw.length; i++) {
        const c = raw[i]
        if (c === '{') depth++
        else if (c === '}') depth--
        else if (c === '>' && depth === 0) break
      }
      const openTag = raw.slice(m.index, i + 1)
      const line = raw.slice(0, m.index).split('\n').length
      for (const r of openTag.match(RADIUS) ?? [])
        out.push({ file: file.slice(SRC.length + 1), line, radius: r })
    }
  }
  return out
}

function sameLineOccurrences(a: string, b: string) {
  let count = 0
  const where: string[] = []
  for (const f of FILES) {
    const n = f.text.split('\n').filter((l) => l.includes(a) && l.includes(b)).length
    if (n > 0) {
      count += n
      where.push(`${f.path.replace(SRC, '')} (${n})`)
    }
  }
  return { count, where }
}

describe('design system — ban cứng (phải bằng 0)', () => {
  // Lý do: gray-400 trên nền trắng chỉ 2,5:1, cần 4,5:1. Chiều đúng là
  // `text-gray-500 dark:text-gray-400` — nền tối thì chữ phụ phải SÁNG hơn.
  it('không dùng gray-400 làm chữ phụ ở light mode', () => {
    const { count, where } = occurrences('text-gray-400 dark:text-gray-500')
    expect(count, `Sai chiều màu. Dùng text-gray-500 dark:text-gray-400.\n${where.join('\n')}`).toBe(
      0,
    )
  })

  // Lý do: palette v4 dùng oklch, green-600 chỉ 3,22:1 và red-600 4,33:1 trên
  // gray-100. Quyết định 2026-07-29: Thu = green-800, Chi = red-700.
  it('không dùng green-600/red-600 cho số tiền', () => {
    for (const needle of ['text-green-600 dark:text-green-400', 'text-red-600 dark:text-red-400']) {
      const { count, where } = occurrences(needle)
      expect(count, `${needle} trượt AA. Dùng <Money> hoặc token.\n${where.join('\n')}`).toBe(0)
    }
  })

  // Lý do: đã có token `text-money-in`/`text-money-out` tự lật sáng/tối. Viết lại
  // cặp màu bằng tay nghĩa là quyết định bị nhân bản ra nhiều chỗ — đúng cái đã dẫn
  // tới 124 chỗ phải sửa một lượt hôm 2026-07-29.
  it('dùng token cho màu tiền, không viết lại cặp sáng/tối bằng tay', () => {
    for (const needle of ['text-green-800 dark:text-green-400', 'text-red-700 dark:text-red-400']) {
      const { count, where } = occurrences(needle)
      expect(count, `Dùng text-money-in / text-money-out.\n${where.join('\n')}`).toBe(0)
    }
  })

  // Lý do: `text-fg-accent` đã có, và cặp viết tay thì KHÔNG đi theo token.
  //
  // Đây từng là một TRẦN (32 chỗ) với ghi chú "xét nghĩa từng chỗ", và cái giá của việc
  // để nó làm trần hiện ra hôm 2026-08-17: khi `--fg-accent` phải đậm thêm một bậc (nền
  // trang tối đi theo mock 23b), 32 chỗ viết tay KHÔNG đi theo, và 3 trong số đó tụt
  // xuống 4,454:1 — phép quét bắt được ở /so và /search. Một trần thì token đổi mà chỗ
  // viết tay đứng yên; một luật thì không.
  //
  // Ở dark hai cách viết cho ra CÙNG một màu (green-400), nên đổi hết sang token không
  // làm dark khác một pixel — chỉ light được lợi.
  it('không viết tay cặp sáng/tối cho chữ màu nhấn', () => {
    const { count, where } = occurrences('text-green-700 dark:text-green-400')
    expect(count, `Dùng text-fg-accent (link/hành động).\n${where.join('\n')}`).toBe(0)
  })

  // Lý do: §5.0 + R7 (ĐÃ CHỐT) — câu kết luận ĐẦU MÀN là dữ liệu, không phải chữ để
  // dạy, nên nó "giữ nguyên ở CẢ HAI chế độ, không đi qua VerdictNote". Mà VerdictNote
  // ở chế độ Gọn nén nội dung thành một cái chip, VÀ Gọn là mặc định
  // (DEFAULT_DENSITY = 'visual') — nên vi phạm luật này nghĩa là mặc định người dùng
  // không đọc được kết luận của màn đang mở. Đo lúc phát hiện: trang Báo cáo có 7 câu
  // kết luận ở Đầy đủ, còn 3 chip ở Gọn.
  //
  // Dùng <ConclusionLine> (cùng file VerdictNote.tsx) cho những chỗ này. VerdictNote
  // vẫn đúng cho kết luận CỦA TỪNG THẺ — chúng được phép nén.
  //
  // Bốn màn thay cho hai: `PeriodHeadline.tsx` (chỗ cũ của phép thử) đã xoá cùng bản dựng
  // lại 26a — ba ô số + câu kết luận giờ nằm ngay trong từng view.
  //
  // Và phép đo đổi theo: "cả file không được chứa <VerdictNote>" đúng với PeriodHeadline
  // vì file đó CHỈ có câu kết luận, nhưng ba view mới còn chứa cả khối rỗng ("Chưa có giao
  // dịch", "Chưa khai khoản nợ nào") — những chỗ đó nén ở Gọn là ĐÚNG. Nên đo bằng THỨ TỰ:
  // câu kết luận đầu màn phải là <ConclusionLine>, và nó phải đứng TRƯỚC mọi <VerdictNote>
  // trong file. Đưa kết luận vào VerdictNote thì hoặc mất <ConclusionLine>, hoặc nó tụt
  // xuống sau — phép thử gãy ở cả hai đường.
  it('câu kết luận đầu màn không đi qua VerdictNote', () => {
    const screens = [
      'src/features/bulletin/BulletinPage.tsx',
      'src/features/reports/MonthView.tsx',
      'src/features/reports/LongView.tsx',
      'src/features/reports/DecideView.tsx',
    ]
    for (const f of screens) {
      const src = readFileSync(join(SRC, '..', f), 'utf8')
      const conclusion = src.indexOf('<ConclusionLine')
      expect(conclusion, `${f}: câu kết luận đầu màn phải dùng <ConclusionLine> (§5.0/R7).`)
        .toBeGreaterThan(-1)
      const verdict = src.indexOf('<VerdictNote')
      if (verdict !== -1) {
        expect(
          conclusion,
          `${f}: <ConclusionLine> phải đứng TRƯỚC mọi <VerdictNote> — kết luận đầu màn giữ ở cả hai chế độ, chú thích thẻ thì được nén (§5.0/R7).`,
        ).toBeLessThan(verdict)
      }
    }
  })

  // Lý do: sky-600 làm CHỮ trượt AA ở light — 4,02:1 trên nền thẻ trắng và 3,77:1 trên
  // bg-sky-50. Bốn chỗ dùng nó đều là nhãn 10–11px (badge "mới", nhãn thứ cuối tuần,
  // "≈ N giờ", nhãn Chuyển tài sản) nên không chỗ nào được hưởng ngưỡng 3:1 của chữ
  // lớn. sky-700 cho 5,86 / 5,49 — sửa cả bốn hôm 2026-08-17.
  //
  // Chỉ cấm khi làm CHỮ. `bg-sky-500`, `stroke="#0ea5e9"` v.v. là chuyện khác, và
  // sky-600 làm NÉT đồ thị thì vẫn hợp lệ (4,02 ≥ 3:1) — xem phép thử nét bên dưới.
  it('không dùng text-sky-600 (trượt AA ở light)', () => {
    const { count, where } = occurrences('text-sky-600')
    expect(
      count,
      `sky-600 chỉ 4,02:1 trên trắng và 3,77:1 trên sky-50. Dùng text-sky-700.\n${where.join('\n')}`,
    ).toBe(0)
  })

  // Lý do: nút chính là nền có CHỮ TRẮNG đè lên → cần 4,5:1 với trắng. green-600
  // (#00a63e) chỉ 3,22:1. Màu nhấn của app là green-700, khai ở token --accent.
  it('không dùng green-600 làm nền nút', () => {
    const { count, where } = occurrences('bg-green-600')
    expect(count, `Trắng trên green-600 chỉ 3,22:1. Dùng bg-green-700.\n${where.join('\n')}`).toBe(0)
  })

  // Lý do: <label> mồ côi — không có `htmlFor` và cũng không BỌC control nào — thì
  // screen reader đọc ra một nhãn rỗng và ô nhập bên dưới KHÔNG có tên gì (đã đo bằng
  // thuật toán tính accessible name trên app đang chạy hôm 2026-07-30: 7/8 ô ở
  // ScenarioEditorSheet — nay là ScenarioEditorDrawer — không có tên).
  //
  // Trước 2026-08-11 chỗ này chỉ chặn được đúng MỘT dạng (`<label className={label_}>`
  // của ba sheet Lifetime) và phần còn lại nằm dưới một NGƯỠNG đếm `<label className`.
  // Ngưỡng đó chỉ là đại diện gần đúng: nó đếm cả nhãn hợp lệ và bỏ sót nhãn viết
  // `className` sau `htmlFor`. Nay 71 nhãn mồ côi đã dọn hết nên thay bằng luật THẬT —
  // phân loại từng <label> đúng như spec, phải bằng 0.
  //
  // "labelable element" theo spec HTML: button, input, meter, output, progress, select,
  // textarea. `button` NẰM TRONG danh sách — nên <label> bọc một <button role="switch">
  // là hợp lệ, vừa đặt tên vừa thành vùng chạm. Bốn nhãn công tắc (AccountsPage,
  // AssetGroupsPage) sống nhờ điều đó; đổi chúng sang <div> là mất vùng chạm.
  it('không có <label> mồ côi (không htmlFor, không bọc control)', () => {
    // Component tự dựng mà BÊN TRONG là một thẻ labelable → <label> bọc nó vẫn hợp lệ,
    // nhưng đọc nguồn thì không thấy. Khai tên ở đây thay vì bỏ qua mọi `<Hoa…` —
    // bỏ qua tất thì <label> bọc <Guide> (chỉ có chữ) cũng lọt.
    //   AccountToggle (AccountsPage:707) và Toggle (AssetGroupsPage:34): cả hai render
    //   <button type="button" role="switch" aria-label>.
    const BOC_CONTROL_BEN_TRONG = ['AccountToggle', 'Toggle']
    const moCoi: string[] = []
    for (const file of sourceFiles()) {
      // Che comment nhưng GIỮ số ký tự, để số dòng báo lỗi vẫn đúng. Cần vì chính các
      // comment giải thích "chỗ này dùng <span> chứ không <label>" lại chứa chữ `<label`.
      const raw = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
      const re = /<label\b/g
      let m: RegExpExecArray | null
      while ((m = re.exec(raw))) {
        const start = m.index
        // Thẻ mở = tới dấu `>` đầu tiên NGOÀI mọi ngoặc nhọn (thuộc tính JSX như
        // htmlFor={`${uid}-x`} có `>` bên trong không tính).
        let i = start + '<label'.length
        let depth = 0
        for (; i < raw.length; i++) {
          const c = raw[i]
          if (c === '{') depth++
          else if (c === '}') depth--
          else if (c === '>' && depth === 0) break
        }
        const openTag = raw.slice(start, i + 1)
        if (/\bhtmlFor\b/.test(openTag)) continue
        const close = raw.indexOf('</label>', i)
        const body = close === -1 ? '' : raw.slice(i + 1, close)
        if (/<(input|select|textarea|button|meter|output|progress)\b/.test(body)) continue
        if (BOC_CONTROL_BEN_TRONG.some((c) => new RegExp(`<${c}\\b`).test(body))) continue
        moCoi.push(`${file.slice(SRC.length + 1)}:${raw.slice(0, start).split('\n').length}`)
      }
    }
    expect(
      moCoi.length,
      `<label> mồ côi: không đọc được tên ô. Cách sửa:\n` +
        `  · nhãn cho MỘT ô  → htmlFor + id sinh bằng useId (mẫu: EventFormSheet)\n` +
        `  · nhãn cho NHÓM / cho MoneyField → <span>, tên ô đi qua aria-label\n` +
        moCoi.join('\n'),
    ).toBe(0)
  })

  // Lý do: amber KHÔNG có sắc độ nào đạt AA cả hai chế độ (đo thật: amber-600 =
  // 3,20:1 trên trắng nhưng 5,55:1 trên gray-900; amber-700 thì 5,03:1 và 3,53:1).
  // Nên chọn sắc độ "trông vừa mắt" ở một chế độ là tự động trượt ở chế độ kia — đúng
  // cái đã xảy ra ở 11 chỗ trước 2026-07-30. Chữ cảnh báo phải đi qua token.
  it('không dùng amber-600/500 làm chữ (trượt AA ở light mode)', () => {
    for (const needle of ['text-amber-600', 'text-amber-500']) {
      const { count, where } = occurrences(needle)
      expect(
        count,
        `${needle} chỉ ${needle.endsWith('600') ? '3,20' : '2,13'}:1 trên trắng. Dùng text-fg-warn.\n${where.join('\n')}`,
      ).toBe(0)
    }
  })

  // Lý do: 896 chỗ đã đổi sang token. Viết lại cặp sáng/tối bằng tay nghĩa là quyết
  // định màu bị nhân bản trở lại. Chỉ ban những cặp TRÙNG KHỚP CHÍNH XÁC với token —
  // các biến thể khác (gray-700/200, gray-700/300, gray-900/100) cố ý để tự do, vì
  // gộp chúng vào token là đổi sắc độ chứ không phải đặt tên.
  it('dùng token cho cặp màu sáng/tối đã có tên', () => {
    const MAPPED: Record<string, string> = {
      'text-gray-500 dark:text-gray-400': 'text-fg-muted',
      'text-gray-800 dark:text-gray-100': 'text-fg-primary',
      'text-gray-600 dark:text-gray-300': 'text-fg-secondary',
      'bg-white dark:bg-gray-900': 'bg-surface',
      'bg-gray-100 dark:bg-gray-800': 'bg-surface-sunken',
      'bg-gray-50 dark:bg-gray-950': 'bg-surface-page',
      'border-gray-100 dark:border-gray-800': 'border-border-subtle',
      'border-gray-300 dark:border-gray-700': 'border-border-strong',
      'divide-gray-100 dark:divide-gray-800': 'divide-border-subtle',
      // Đúng y cặp của --fg-warn. Cố ý KHÔNG ban `text-amber-700 dark:text-amber-300`
      // (14 chỗ, nằm trên nền amber-50/amber-900-40): đó là cặp KHÁC, gộp vào token là
      // đổi sắc độ dark từ 300 sang 400 — đổi diện mạo, không phải đặt tên.
      'text-amber-700 dark:text-amber-400': 'text-fg-warn',
    }
    for (const [needle, token] of Object.entries(MAPPED)) {
      const { count, where } = occurrences(needle)
      expect(count, `Dùng ${token}.\n${where.join('\n')}`).toBe(0)
      // Cùng cặp nhưng bị chèn class xen giữa (đường lách của phép so chuỗi liền):
      // soi theo DÒNG chứa cả hai vế. Từng có 48 chỗ lách kiểu này.
      const [light, dark] = needle.split(' ')
      const inter = sameLineOccurrences(light, dark)
      expect(
        inter.count,
        `Cặp ${light} + ${dark} bị tách rời trên cùng dòng — vẫn là viết tay cặp màu đã có token ${token}.\n${inter.where.join('\n')}`,
      ).toBe(0)
    }
  })

  // LUẬT NÀY CỐ Ý CHƯA BẬT — đọc lý do trước khi bật.
  //
  // Nhánh fix/toan-bo-audit ban `outline-green-500` và `focus:border-green-500` vì ở ĐÓ,
  // commit bef36fd đã nới vòng focus toàn cục ra phủ cả input/select/textarea. Trên
  // MỞ 2026-08-18. Khối này từng `it.skip` với ghi chú: ":focus-visible ở index.css chỉ
  // phủ a/button/[role]/summary — KHÔNG có input, nên bật ban này mà chưa nới ring thì 57
  // ô nhập mất sạch chỉ báo tiêu điểm, tệ hơn hẳn một ring 2,3:1. Muốn bật: nới ring ra
  // input/select/textarea TRƯỚC, đo lại tương phản ring bằng cách vẽ ra pixel, rồi mới
  // xoá các chỗ tự chế."
  //
  // Đã làm đúng ba bước đó, theo đúng thứ tự: (1) ring toàn cục nay phủ cả
  // input/select/textarea; (2) ĐO bằng canvas pixel readback trên cả bốn nấc bề mặt —
  // light (green-700): thẻ 4,95 · trang 4,45 · lún 4,14; dark (green-500): thẻ 8,59 ·
  // trang 8,98 · lún 8,04 · chrome 8,77 — tất cả vượt xa 3:1 của WCAG 1.4.11, và chỗ mỏng
  // nhất (4,14 trên nền lún ở light) vẫn dư 38%; (3) rồi mới xoá 51 `outline-green-500`,
  // 8 cặp `focus:outline-none focus:border-green-500`, và 5 `outline-none` trong ô nhập.
  it('không tự chế focus style trượt chuẩn — ring toàn cục đã lo', () => {
    for (const needle of ['outline-green-500', 'focus:border-green-500', 'focus:outline-none']) {
      const { count, where } = occurrences(needle)
      expect(count, `${needle} trượt 3:1. Xoá đi — ring token ở index.css tự lấp.\n${where.join('\n')}`).toBe(0)
    }
  })

  /**
   * `outline-none` trên ô nhập tắt hẳn chỉ báo tiêu điểm, và ring toàn cục KHÔNG cứu được:
   * `outline-none` là tiện ích thường (specificity 0,1,0) còn ring đi qua `:where()`
   * (specificity 0) nên luôn thua.
   *
   * NGOẠI LỆ có thật: ô nhập nằm trong một khung bao dùng `focus-within:ring`. Lúc đó
   * khung mới là thứ vẽ chỉ báo, và để ô tự vẽ thêm một ring nữa là hai vòng lồng nhau.
   *
   * Kiểm theo FILE chứ không theo cây DOM — thô, nhưng đúng hướng và không đoán: file nào
   * có `focus-within:ring` thì widget ở đó đã tự lo. Muốn chặt hơn phải dựng cây JSX, mà
   * cái giá đó không xứng với năm chỗ.
   *
   * ĐÍNH CHÍNH một câu tôi từng viết ở lượt trước ("Tab vào thì không có gì hiện lên"):
   * đúng với HAI chỗ (ô tìm ở AppTopBar và ô tìm trong panel AccountPicker — khung bao là
   * <form>/<div> trơn, không có focus-within), nhưng SAI với ba chỗ còn lại (TagPicker ×2,
   * SearchPage): chúng có ring của khung bao, chỉ là ring đó tô green-500 ~1,9:1 — lỗi
   * TƯƠNG PHẢN chứ không phải lỗi thiếu chỉ báo. Cả ba nay đi qua `ring-accent`.
   */
  it('ô nhập chỉ được tắt outline khi khung bao có focus-within:ring', () => {
    const hits: string[] = []
    for (const file of sourceFiles()) {
      const raw = readFileSync(file, 'utf8')
      if (/focus-within:ring/.test(raw)) continue
      const tag = /<(input|select|textarea)\b/g
      let m: RegExpExecArray | null
      while ((m = tag.exec(raw))) {
        let i = m.index + m[0].length
        let depth = 0
        for (; i < raw.length; i++) {
          const c = raw[i]
          if (c === '{') depth++
          else if (c === '}') depth--
          else if (c === '>' && depth === 0) break
        }
        if (/\boutline-none\b/.test(raw.slice(m.index, i + 1)))
          hits.push(`${file.slice(SRC.length + 1)}:${raw.slice(0, m.index).split('\n').length}`)
      }
    }
    expect(
      hits,
      'Ô này tắt ring mà không có khung bao nào vẽ thay: hoặc bỏ outline-none, hoặc cho ' +
        'khung bao focus-within:ring-accent.\n' + hits.join('\n'),
    ).toEqual([])
  })

  // Lý do: red-400 trên trắng chỉ 2,89:1 và red-500 chỉ 4,05:1 — cả hai trượt 4,5:1
  // cho chữ ở light mode. Chúng CHỈ hợp lệ sau tiền tố dark:. Đếm bằng hiệu:
  // "text-red-400" đếm cả bản có dark: đứng trước, nên trừ đi là ra số dùng trần.
  it('không dùng red-400/red-500 làm chữ ở light mode', () => {
    for (const shade of ['text-red-400', 'text-red-500']) {
      const bare = occurrences(shade).count - occurrences(`dark:${shade}`).count
      expect(
        bare,
        `${shade} không có dark: đứng trước — trượt AA ở light. Dùng text-money-out hoặc red-700.`,
      ).toBe(0)
    }
  })

  // Lý do: #9ca3af là gray-400 (2,54:1) viết bằng hex — từng lọt vào fill của donut
  // và nét ngân sách vì guardrail cũ chỉ ban dạng stroke="...". Ban ở MỌI dạng.
  it('không còn hex gray-400 ở bất kỳ dạng nào', () => {
    const { count, where } = occurrences('#9ca3af')
    expect(count, `gray-400 hex chỉ 2,54:1. Dùng var(--color-gray-500) trở lên.\n${where.join('\n')}`).toBe(0)
  })

  // Lý do: màu đồ thị đi qua PROP của Recharts, không qua class Tailwind — nên MỌI
  // guardrail đếm class ở trên đều không thấy chúng. Đó là điểm mù thật: trước
  // 2026-07-30 có 21 chỗ đặt chữ nhãn trục bằng hex `#9ca3af` (gray-400) = 2,54:1 trên
  // nền trắng — đúng cái idiom mà test `text-gray-400` phía trên đã ban, chỉ khác là
  // viết bằng hex nên lọt qua. Hex còn KHÔNG lật được theo .dark, mà nhãn trục cần
  // 4,5:1 ở CẢ HAI chế độ và không sắc xám nào đạt cả hai → buộc phải là var(--fg-muted).
  //
  // Chỉ ban dạng object-literal `fill: '#`; KHÔNG ban `fill="#` vì đó là path của logo
  // Google ở LoginPage — màu thương hiệu, cố định là đúng.
  it('chữ trong đồ thị dùng token, không dùng hex', () => {
    const { count, where } = occurrences("fill: '#")
    expect(
      count,
      `Hex không lật được dark mode. Dùng fill: 'var(--fg-muted)'.\n${where.join('\n')}`,
    ).toBe(0)
  })

  // Lý do: nét trong đồ thị cần 3:1 (WCAG 1.4.11). Ba hex dưới đây ĐO THẬT là trượt
  // trên nền trắng, nên không được dùng làm nét — kể cả khi trông ổn ở dark mode, vì
  // "trông ổn ở một chế độ" chính là cách chúng lọt vào lần đầu.
  it('không dùng hex trượt 3:1 làm nét trong đồ thị', () => {
    const FAILS: Record<string, string> = {
      '#9ca3af': '2,54:1 (gray-400)',
      '#d1d5db': '1,47:1 (gray-300)',
      '#0ea5e9': '2,77:1 (sky-500)',
    }
    for (const [hex, ratio] of Object.entries(FAILS)) {
      const { count, where } = occurrences(`stroke="${hex}"`)
      expect(
        count,
        `${hex} chỉ ${ratio} trên trắng. Dùng var(--fg-muted) hoặc var(--color-sky-600).\n${where.join('\n')}`,
      ).toBe(0)
    }
  })

  // Lý do: đã có tên text-2xs (11px) / text-3xs (10px). Giá trị tuỳ ý quay lại là
  // scale lại bị chọc lỗ.
  it('dùng bậc chữ đã đặt tên, không chêm giá trị tuỳ ý', () => {
    for (const [needle, token] of [
      ['text-[0.6875rem]', 'text-2xs'],
      ['text-[0.625rem]', 'text-3xs'],
    ]) {
      const { count, where } = occurrences(needle)
      expect(count, `Dùng ${token}.\n${where.join('\n')}`).toBe(0)
    }
  })

  // Lý do: §13 — cỡ chữ viết bằng PX đứng yên khi người dùng phóng chữ ở Cài đặt → Cỡ
  // chữ, vì --app-font-scale chỉ co giãn được cái tính theo rem. Đây là luật KHÁC với
  // luật ngay trên: luật kia chặn dạng `rem` tuỳ ý (scale bị chọc lỗ), luật này chặn
  // dạng `px` (scale không ăn gì cả) — và chính vì thiếu nó mà `text-[11px]` nằm trong
  // LifetimeChartCard suốt cả đợt 1a mà không ai thấy.
  it('không viết cỡ chữ bằng px (không co theo Cỡ chữ)', () => {
    const hits = sourceFiles()
      .map((f) => [f, readFileSync(f, 'utf8')] as const)
      .filter(([, src]) => /text-\[\d+px\]/.test(src))
      .map(([f]) => f.replace(SRC, ''))
    expect(hits, `Quy về rem, hoặc dùng bậc đã đặt tên (text-2xs / text-3xs).`).toEqual([])
  })

  // Lý do: 0.5625rem = 9px, mà --app-font-scale nhỏ nhất là 0.9 → 8,1px.
  // Sàn dưới là text-3xs (10px), token cố ý không có tên cho 9px.
  it('không có chữ nhỏ hơn sàn 10px', () => {
    const { count, where } = occurrences('text-[0.5625rem]')
    expect(count, `Dưới sàn đọc được. Dùng text-3xs.\n${where.join('\n')}`).toBe(0)
  })

  /**
   * `active:scale-95` mà THIẾU `transition` thì nút không co giãn — nó NHẢY một nhịp rồi
   * nhảy về. Đây đúng là lý do <ActionButton>/<IconButton> ra đời: comment của cả hai
   * primitive đều ghi "hai thứ này phải đi cùng nhau, chép tay thì luôn có chỗ quên".
   *
   * Đo 2026-08-18: 51 trong 73 nút có `active:scale-95` đang thiếu `transition` — tức
   * cách chép tay hỏng ở 70% số chỗ, đúng như dự đoán viết trong primitive. Đã thêm cho
   * cả 51; luật này giữ cặp đó dính nhau.
   *
   * Chỉ soi trong MỘT thẻ mở, nên không bắt oan trường hợp `transition` nằm ở lớp cha —
   * mà cũng không nên có: transform co giãn là của chính nút.
   */
  it('active:scale-95 luôn đi kèm transition', () => {
    const hits: string[] = []
    for (const file of sourceFiles()) {
      const raw = readFileSync(file, 'utf8')
      const tag = /<(button|a|Link|label|div|span)\b/g
      let m: RegExpExecArray | null
      while ((m = tag.exec(raw))) {
        let i = m.index + m[0].length
        let depth = 0
        for (; i < raw.length; i++) {
          const c = raw[i]
          if (c === '{') depth++
          else if (c === '}') depth--
          else if (c === '>' && depth === 0) break
        }
        const open = raw.slice(m.index, i + 1)
        if (!/\bactive:scale-95\b/.test(open)) continue
        if (/\btransition(-[\w[\]]+)?\b/.test(open)) continue
        hits.push(`${file.slice(SRC.length + 1)}:${raw.slice(0, m.index).split('\n').length}`)
      }
    }
    expect(
      hits,
      'Thiếu `transition` thì `active:scale-95` giật cục. Thêm `transition`, hoặc tốt hơn ' +
        'là cho nút đi qua <ActionButton>/<IconButton>.\n' + hits.join('\n'),
    ).toEqual([])
  })

  /**
   * Lý do: §1.3 của bản 1a TÁCH hai bán kính — CONTROL 6px (`rounded-md`) và PANEL 8px
   * (`rounded-lg`). Trước 1a app chỉ có một bán kính 8px, nên mọi nút/ô nhập dựng từ hồi
   * đó mang bán kính panel: đo được **200 chỗ** hôm 2026-08-18.
   *
   * Luật này SINH RA LÀ MỘT NGƯỠNG (200, chỉ được giảm) đúng như lời hẹn ghi trong khối
   * ngưỡng — nó thay cho trần `rounded-md` vốn đếm ngược chiều. Cùng ngày, một codemod
   * đưa cả 200 chỗ về `rounded-md`, nên ngưỡng hết việc và luật lên hạng thành BAN CỨNG.
   * Ghi lại đường đi này vì nó là vòng đời mong muốn của mọi ngưỡng: đo → chặn mọc thêm
   * → dọn hết → hoá luật cứng.
   *
   * Chỉ soi THẺ MỞ của control, nên không đụng `rounded-full` (chip tròn, công tắc — cố
   * ý tròn) và `rounded-sm` (vạch mốc). `<Link>` cũng KHÔNG tính: một <Link> có thể là cả
   * một tấm thẻ bấm được, và ở đó bán kính panel mới là đúng.
   *
   * ĐIỂM MÙ đã thử và xác nhận: bán kính đi tới control qua một HẰNG SỐ (vd `BASE` trong
   * IconButton/ActionButton) thì luật này không thấy — nó chỉ đọc chữ nằm trong thẻ mở.
   * Thử sửa `rounded-md` thành `rounded-lg` trong IconButton.tsx: test vẫn xanh. Sửa cùng
   * class đó ngay trên một `<button>` thật thì test đỏ. Chấp nhận được vì hằng số như thế
   * chỉ có ở hai primitive và chính chúng là nơi §1.3 được khai — nhưng ai đổi bán kính ở
   * đó phải tự biết mình đang đổi cho cả app.
   */
  it('control không mang bán kính panel (§1.3: control là 6px)', () => {
    const PANEL = new Set(['rounded-lg', 'rounded-xl', 'rounded-2xl'])
    const sai = controlRadii()
      .filter((r) => PANEL.has(r.radius))
      .map((r) => `${r.file}:${r.line} (${r.radius})`)
    expect(
      sai,
      `Control của 1a là rounded-md (6px). Tốt hơn: cho nó đi qua <ActionButton>/` +
        `<IconButton>, nơi bán kính là quyết định của primitive chứ không của chỗ gọi.\n` +
        sai.join('\n'),
    ).toEqual([])
  })

  /**
   * Lý do: §13 gạch thứ hai — "bề rộng cột số cứng (`width:104px`…) đổi thành `ch`/`rem`
   * hoặc `minmax`; ở cỡ chữ lớn cột px cứng là chỗ vỡ ĐẦU TIÊN". Chữ trong cột giãn theo
   * `--app-font-scale`, cột thì không, nên nội dung tự ép xuống dòng hoặc bị cắt.
   *
   * NGƯỠNG 16px, không phải "mọi px": dưới 16px thì đó không còn là cột chứa chữ mà là
   * vạch/mốc — `min-w-[3px]` cho cột biểu đồ (để tháng chi gần 0 vẫn thấy một vạch) và
   * `gap-[3px]` giữa hai cột phải ĐỨNG YÊN khi chữ to ra, không thì hai vạch 3px giãn
   * thành hai vạch 4px và biểu đồ đổi hình vì người dùng phóng chữ.
   *
   * Chỉ soi tiện ích BỀ RỘNG: `left-[18px]`/`left-[22px]` (vị trí núm công tắc) không
   * nằm trong luật này — chúng đo theo đường ray, mà đường ray là hình chứ không phải chữ.
   */
  it('không đặt bề rộng cột bằng px (không co theo Cỡ chữ)', () => {
    const hits: string[] = []
    const RE = /\b(?:w|min-w|max-w|basis|grid-cols)-\[([^\]]*)\]/g
    for (const f of FILES)
      for (const m of f.text.matchAll(RE))
        if ([...m[1].matchAll(/(\d+(?:\.\d+)?)px/g)].some((px) => Number(px[1]) >= 16))
          hits.push(`${f.path.replace(SRC, '')}: ${m[0]}`)
    expect(
      hits,
      `Quy về rem (1rem = 16px ở cỡ chữ thường), ch, hoặc minmax().\n${hits.join('\n')}`,
    ).toEqual([])
  })

  /**
   * Lý do: bảng §12 gán mỗi VIỆC một thời lượng, và bảy con số đó đã thành token trong
   * index.css. Viết `duration-300` / `duration-[140ms]` thẳng trong JSX là đưa một con số
   * thứ tám vào mà không ai đối chiếu được với bảng — đúng cách mà app từng có 150ms,
   * 300ms và 1500ms (mặc định recharts) sống cạnh nhau trong khi spec chỉ nói tới 120–220.
   *
   * Tailwind v4 nhận bare value nên `duration-137` chạy trơn và không có gì báo. Đây là
   * chỗ báo.
   *
   * KHÔNG chặn `transition` trơ (150ms mặc định của Tailwind) ở hover/focus: bảng §12 nói
   * về những lúc DỮ LIỆU hay TRẠNG THÁI đổi, không nói về phản hồi khi trỏ chuột vào.
   */
  it('không viết thời lượng chuyển động bằng tay (phải qua token §12)', () => {
    const hits: string[] = []
    for (const f of FILES) {
      const found = f.text.match(/\bduration-(\[[^\]]+\]|\d+)/g)
      if (found) hits.push(`${f.path.replace(SRC, '')}: ${found.join(', ')}`)
    }
    expect(
      hits,
      `Dùng tiện ích motion-* (index.css). Cần một nhịp CHƯA có tên thì thêm token, ` +
        `đừng viết số tại chỗ.\n${hits.join('\n')}`,
    ).toEqual([])
  })
})

describe('design system — ngưỡng (chỉ được giảm)', () => {
  // Mỗi số dưới đây là ĐỘ NỢ kỹ thuật đo được lúc dựng hệ thống. Gộp vào
  // primitive ở src/components/ui thì hạ số tương ứng.
  const CEILINGS: { needle: string; max: number; use: string }[] = [
    // 93 chứ không 94: <ActionButton> gom dáng nút-có-chữ (viền mảnh / nền xanh),
    // kéo 4 chỗ viết tay ở AccountDetailPage + hai sheet điều chỉnh về một mối.
    //
    // 82 (2026-08-13, đợt gộp danh mục): tụt từ 93 vì HoldingsSection và
    // FundHoldingsSection bị xoá — nội dung của chúng gom về hai tab của /invest, nơi
    // mỗi nút chỉ còn MỘT bản viết tay thay vì lặp lại ở khu danh mục cũ. Hạ trần theo
    // đúng quy ước ở thông điệp lỗi của chính phép thử này.
    // ĐO LẠI 2026-08-18 — và con số này KHÔNG đọc như các trần khác. Chấm điểm cả 73
    // thẻ mở có `active:scale-95` so với bốn dáng của primitive (`primary`/`outline`/
    // `ghost`/`surface`): KHÔNG cái nào lệch dưới 3 class. Tức đây không phải "73 bản chép
    // tay của primitive" — chúng là những nút có DÁNG RIÊNG, chỉ tình cờ dùng chung một
    // idiom nhấn. Gộp chúng vào primitive là ĐỔI DIỆN MẠO từng nút, không phải dọn dẹp.
    //
    // Nên trần này chỉ còn một việc: chặn mọc thêm. Phần nợ THẬT trong đám đó đã tách ra
    // thành luật riêng ở khối ban cứng ("active:scale-95 luôn đi kèm transition") — 51/73
    // nút thiếu `transition`, đúng cái mà comment của hai primitive dự đoán sẽ quên.
    //
    // 82 (2026-08-19, PR 3 dung lai man Nhap): +1 cho chip Dạng trong DirectionTabs.
    // KHÔNG gộp được vào <IconButton>/<ActionButton>: cả hai khai `min-h-11` (44px) ở
    // BASE, mà chip Dạng cố ý cao 32px — miễn trừ vùng chạm cấp hai đã ghi ngay tại
    // DirectionTabs.tsx (luôn có ít nhất một chip đang bật). Ép qua primitive là đổi
    // chiều cao, đúng lỗi mà nhóm "DÁNG RIÊNG" ở trên đã né.
    { needle: 'active:scale-95', max: 82, use: '<IconButton> / <ActionButton>' },
    // 28 chứ không 26: lượt sửa vùng chạm 2026-08-11 đưa BA công tắc role="switch"
    // (AssetGroupsPage, DebtPaymentSheet, roleFields) về đúng khuôn ba công tắc đã
    // đúng từ trước — vùng chạm 44×44 ở <button>, đường ray nhỏ ở <span> bên trong.
    // Trước đó đường ray đặt thẳng lên nút nên chạm chỉ 36×20 / 24×44.
    // KHÔNG gộp được vào <IconButton>: nó render một nút-icon, không có đường ray và
    // không mang role="switch"/aria-checked. Đây là tăng đúng chỗ, không phải nợ mới.
    //
    // 22 (2026-08-13, đợt gộp danh mục): tụt từ 28 vì HoldingsSection và
    // FundHoldingsSection bị xoá — vùng chạm viết tay của chúng gom về hai tab của
    // /invest, nơi không còn lặp lại ở khu danh mục cũ. Hạ trần theo đúng quy ước ở
    // thông điệp lỗi của chính phép thử này.
    //
    // 23 (2026-08-19, task 8 dung lai man Nhap): +1 cho công tắc "Có chuyển tiền
    // thật" ở DebtPickerField (repay/collect) — CÙNG khuôn ba công tắc role="switch"
    // đã đúng ở trên (vùng chạm 44×44 ở <button>, đường ray ở <span> trong), không
    // phải nợ mới. Không gộp được vào <IconButton>: đây là công tắc mang
    // role="switch"/aria-checked, không phải một nút-icon.
    { needle: 'min-h-11 min-w-11', max: 23, use: '<IconButton> / iconButtonClass()' },
    // 85 chu khong 82: lượt chuẩn hoá đã kéo 29 thẻ TỪ dạng `rounded-xl bg-white …
    // dark:bg-gray-900` VÀO dạng này, nên con số tăng mà tổng số thẻ viết tay không
    // đổi. Không phải thêm thẻ mới. Gộp vào <Card> thì hạ tiếp.
    //
    // 83 (2026-08-11): ba khối tuỳ chọn trong Cài đặt (Giao diện / Cách trình bày / Cỡ
    // chữ) đã gộp về <Card as="section" padding="none">. Phải đổi cả ba cùng lúc —
    // chúng nằm liền nhau nên để lẻ một cái viết tay là cái đó lệch dáng.
    //
    // 82 (2026-08-16, PR 2 của redesign 1a): tụt 1 vì <Card> KHÔNG còn chứa chuỗi này —
    // bán kính chuyển vào bảng ELEVATION (dáng 'panel' là 8px chứ không 12px, mà hai lớp
    // bán kính cùng hạng thì Tailwind quyết theo thứ tự trong CSS, không theo thứ tự
    // trong chuỗi class). Tức con số này giờ đếm ĐÚNG số thẻ viết tay, không cộng thêm
    // chính primitive nữa.
    // 74 (2026-08-17, đợt dọn bảng màu thô): tụt từ 82 vì `bg-white dark:bg-gray-800`
    // viết tay đã đi qua token `bg-surface`. Con số này KHÔNG tăng vì chuyển đổi đó —
    // phép đếm giờ chặn hậu tố nên `bg-surface-sunken` không còn bị tính là thẻ.
    // 10 (2026-08-18, dot gop the): tut tu 74. Codemod doi 64 the viet tay o 40 file sang
    // <Card>, va cai loi ra ngay: bay gio chung DUNG bang primitive o dark — <Card
    // elevation="raised"> them `dark:border dark:border-border-panel dark:shadow-none`,
    // tuc bo bong va thay bang vien, dung quyet dinh cua 1a. 64 the viet tay truoc do van
    // giu `shadow-sm` o dark, noi bong tren nen #0e1014 gan nhu vo hinh nen chung mat
    // ranh gioi.
    // 10 cho con lai KHONG may moc doi duoc: hai cho dung template literal (class doi theo
    // trang thai keo-tha), mot cho co `key=` tren chinh the do, va bay cho khong co
    // `shadow-sm` (dang 'flat'/'panel' viet tay) — moi cai can xet nghia rieng.
    { needle: 'rounded-xl bg-surface', max: 10, use: '<Card>' },
    // 96 (2026-08-13, đợt gộp danh mục): tụt từ 97 vì HoldingsSection và
    // FundHoldingsSection bị xoá — nội dung của chúng gom về hai tab của /invest, nơi
    // mỗi câu chỉ còn MỘT bản. FundHoldingsSection từng ghi ngay tại chỗ ngưỡng này
    // "đã sát trần" (không thêm tabular-nums viết tay cho số 口 vì gần chạm 97); giờ
    // file đó không còn nên lời ghi đó cũng hết cần thiết. Hạ trần theo đúng quy ước ở
    // thông điệp lỗi của chính phép thử này: trần không hạ là trần rỗng.
    // 98 (2026-08-17, bản vẽ 15b): +2 ở RunwayBand — nhãn trung vị và các vạch trục của
    // dải phân vị. Cả hai là SỐ THÁNG, không phải tiền, nên <Money> ở đây là sai công cụ:
    // nó định dạng theo loại tiền và đi qua chế độ riêng tư (che số). Một trục thời gian
    // bị che thì cả dải mất luôn thước đo.
    // 101 (2026-08-17, bản vẽ 11a): +3 ở mặt theo dõi Ngân sách — "3 / 5 mục có hạn mức",
    // "· 9 danh mục", "ngày 15/31". Cùng lý do: đây là ĐẾM danh mục và ĐẾM ngày. Đưa qua
    // <Money> thì chúng bị định dạng theo loại tiền ("¥5") và bị che ở chế độ riêng tư —
    // mà mẫu số bị che thì con số bên cạnh nó hết nghĩa.
    // 102 (2026-08-18, bản vẽ 22e): +1 ở tiêu đề trang Danh mục — "14 chi · 3 thu".
    // Vẫn là ĐẾM, không phải tiền: cùng lý do với ba con số của 11a ngay trên.
    //
    // 103 (2026-08-18, bản vẽ 26a): +1 và đây là lần TĂNG có chủ ý — nói thẳng vì nó
    // ngược chiều mọi lời ghi trên.
    //
    // Ba lời ghi 98 / 101 / 102 đều nói cùng một điều: có một lớp con số KHÔNG phải tiền
    // (đếm, phần trăm, số tháng, Δ%) mà <Money> là sai công cụ cho nó — nó định dạng theo
    // loại tiền và đi qua chế độ che số. Mỗi lần lớp đó xuất hiện, trần lại phải nới thêm
    // vài chỗ. Tab "Tháng này" bản 26a có 12 chỗ như vậy trong một lần (bảng 12 danh mục,
    // bảng so cùng số ngày, ba tầng dòng tiền), tức trần sẽ phải lên 114.
    //
    // Nên thay vì nới, lớp đó có primitive riêng: <Num> ở components/ui/Num.tsx. Nó sở hữu
    // `font-mono tabular-nums`, có `tone`, và có `signedPct` để ba bảng dùng CÙNG một quy
    // ước dấu (− thật, "±0%", "—" cho không-so-được). 12 chỗ viết tay của 26a đi qua nó
    // hết, còn lại đúng 1 — chính dòng bên trong <Num>.
    //
    // +1 đó là giá của việc có primitive, và nó chỉ trả MỘT LẦN: mọi bảng sau này dùng
    // <Num> sẽ không cộng thêm gì. Đọc "103" mà tưởng đợt này viết tay nhiều hơn là hiểu
    // ngược — nó gộp 12 chỗ vào một chỗ.
    // 91 (2026-08-19): HẠ 103 → 91 sau khi xoá 11 component mồ côi của trang Báo cáo cũ
    // (TrendsView, MultiYearView, YearBarsCard, SeasonalityCard, SavingsDonutCard,
    // ParetoCard, CategoryCompareBarsCard, CategoryBreakdownCard, NetCashflowCard,
    // RemittanceSection, multiYear.ts). Đúng quy ước ở thông điệp lỗi của phép thử này:
    // trần không hạ là trần rỗng. `<Num>` đã hấp thụ 12 chỗ viết tay của bốn tab mới, nên
    // con số này giờ nói đúng phần nợ CŨ còn lại.
    // 85 (2026-08-19): HẠ 91 → 85 sau khi xoá 5 component chết của tab Sức khỏe cũ
    // (HealthMetricCard, HealthScoreCard, ScoreGauge, RunwayBand, PeriodHeadline). Trong
    // đó có đúng cái đã nới trần lên 98 ở trên: hai chỗ viết tay của RunwayBand — dải
    // phân vị đó giờ là `Scale` trong bảng 6 dòng, và bảng đi qua <Num>. Ba lời ghi
    // 98/101/102 nói về một lớp con số không phải tiền, và <Num> là chỗ nó về; 85 là số
    // chỗ viết tay còn lại sau khi lớp đó đã có nhà.
    { needle: 'tabular-nums', max: 85, use: '<Money> cho tiền, <Num> cho số không phải tiền' },
    // 35 (đo 2026-08-06): cặp xanh nhấn viết tay. Nợ này TĂNG từ 29 lúc dựng hệ thống
    // — quy ước mới chưa thắng thói quen cũ, nên phải có trần. Mỗi chỗ cần XÉT NGHĨA
    // khi gộp: link/hành động → text-fg-accent, giá trị tiền → text-money-in
    // (docs/design-system.md mục "Chưa làm"). Không quét máy móc được.
    // 34 (2026-08-11): hai <Link> "tạo bộ danh mục" ở HealthView đã đổi sang
    // text-fg-accent. Đúng nghĩa — chúng là LINK, không phải giá trị tiền.
    //
    // 32 (2026-08-13, đợt gộp danh mục): tụt từ 34 vì HoldingsSection và
    // FundHoldingsSection bị xoá — nội dung của chúng gom về hai tab của /invest, nơi
    // mỗi chỗ chỉ còn MỘT bản. Hạ trần theo đúng quy ước ở thông điệp lỗi của chính
    // phép thử này.
    // ĐÃ VỀ 0 (2026-08-17) — luật cứng nằm ở khối "ban cứng" phía trên, không còn là
    // trần ở đây. Xem `không viết tay cặp sáng/tối cho chữ màu nhấn`.
    // Hex xanh/đỏ đời Tailwind v3 trong hằng số biểu đồ — không sai contrast nhưng
    // lệch palette v4 (green-600 v4 = #00a63e). Cũng tăng từ lúc dựng hệ thống (12+
    // file → 16 file). Thay dần khi đụng tới file, đừng thêm chỗ mới.
    { needle: "'#16a34a'", max: 14, use: 'màu palette v4 cho hằng số biểu đồ (vd var(--color-green-700) khi vẽ SVG tay)' },
    { needle: "'#ef4444'", max: 13, use: 'màu palette v4 cho hằng số biểu đồ' },
    // ---- Bốn luật lấy từ nhánh fix/toan-bo-audit (2026-08-11) ----------------------
    //
    // Trần ở đây ĐO TRÊN MASTER, không copy số của nhánh: nhánh đó đã gộp 40+ màn vào
    // bộ primitive riêng của nó nên số của nó thấp hơn nhiều (vd active:scale-95 còn 68
    // so với 93 ở đây). Copy số sang là test đỏ ngay mà chẳng chỉ ra lỗi nào thật.
    //
    // Vẫn đáng thêm dù trần đang cao: việc của ngưỡng là chặn MỌC THÊM, không phải
    // chứng nhận đã sạch.
    //
    // Nút chính viết tay. Token là `bg-accent` (green-700) — dùng qua <ActionButton
    // variant="primary"> thì không bị đếm.
    //
    // 62 (2026-08-13, đợt gộp danh mục): tụt từ 63 vì HoldingsSection và
    // FundHoldingsSection bị xoá — nội dung của chúng gom về hai tab của /invest, nơi
    // mỗi nút chỉ còn MỘT bản. Hạ trần theo đúng quy ước ở thông điệp lỗi của chính
    // phép thử này.
    //
    // 61 (2026-08-16, PR 2 của redesign 1a): tụt 1 vì <ActionButton variant="primary">
    // đổi sang `bg-accent` + `text-fg-on-accent`. Chính primitive không còn nằm trong
    // số đếm, nên 61 là số chỗ viết tay thật.
    // 21 (2026-08-17, đợt dọn bảng màu thô): tụt từ 61. Ở LIGHT --accent chính là
    // green-700 nên `bg-green-700` → `bg-accent` là đổi tên, không đổi màu; nhưng phải
    // đổi kèm `text-white` → `text-fg-on-accent`, vì ở DARK --accent lật sang green-500
    // và chữ trắng trên nó chỉ còn 2,22:1. 21 chỗ còn lại là những nơi green-700 KHÔNG
    // mang vai accent (vùng thang đo của STATUS_FILL, chấm trạng thái, cột biểu đồ).
    // 1 (2026-08-18, đo lại khi soát §12): trần 21 đã RỖNG — thực tế chỉ còn MỘT chỗ, và
    // là chỗ đúng: `STATUS_FILL` trong statusColors.ts, nơi thang màu trạng thái được đo
    // và khai một lần cho cả app. 20 chỗ kia đã theo đợt dọn bảng màu thô đi hết mà không
    // ai hạ trần theo — đúng cái "trần không hạ là trần rỗng" mà thông điệp lỗi của phép
    // thử này vẫn dặn. Hạ về 1 nên từ giờ nó có nghĩa mới và chặt hơn: sắc độ này chỉ được
    // khai ở NGUỒN token, thêm một chỗ viết tay nữa là đỏ.
    { needle: 'bg-green-700', max: 1, use: 'STATUS_FILL (statusColors.ts) hoặc bg-accent' },
    // Hai bán kính ngoài scale 4 tầng (docs §Bán kính). `rounded-2xl` có chủ đích ở thẻ
    // hero và sheet trượt lên; phần còn lại là tuỳ tiện. `rounded-md` thì lạc hẳn.
    // 37 (2026-08-12): sheet khai thu dự kiến của mặt lập kế hoạch. Đúng ngoại lệ ghi
    // ngay trên — sheet trượt lên dùng rounded-t-2xl, và cả app đang thống nhất thế.
    // 38 (2026-08-13): FundTradeFormSheet (ghi/sửa lệnh quỹ Nhật) — cùng khuôn sheet
    // trượt lên với TradeFormSheet, một ngoại lệ hợp lệ khác chứ không phải nợ mới.
    //
    // 34 (2026-08-15, đợt biểu đồ đầu tư): cả BỐN khối của tab Diễn biến
    // (NetWorthHistorySection ×2 nhánh, InvestmentPerformanceSection, SavingsGoalsSection)
    // đổi sang <Card as="section" padding="lg">. Phải đổi cả bốn cùng lúc, không lẻ cái
    // nào: chúng xếp dọc liền nhau trong một mạch cuộn nên để lẫn hai bán kính là thấy
    // ngay — và khối thứ năm vừa thêm (InvestmentValueHistorySection) dùng <Card> từ đầu.
    { needle: 'rounded-2xl', max: 32, use: 'rounded-xl (scale chuẩn), trừ thẻ hero / sheet' },
    // ⚠️ TRẦN NÀY ĐANG TĂNG THEO KẾ HOẠCH, không phải nới cho dễ thở. Luật ở đầu file
    // là 'chỉ được giảm', nên phải nói rõ vì sao chỗ này khác.
    //
    // Tiền đề cũ: app có MỘT bán kính control là rounded-lg (8px, 278 chỗ), nên 16 chỗ
    // rounded-md là lạc. Bản 1a bỏ tiền đề đó — nó TÁCH bán kính CONTROL (6px =
    // rounded-md) khỏi bán kính PANEL (8px = rounded-lg), §1.3. Từ đó rounded-md là
    // bán kính ĐÚNG của nút, tab, chip vuông; và mỗi PR dựng thêm một màn 1a lại thêm
    // vài chỗ dùng nó một cách chính đáng.
    //
    // Vì vậy con số này KHÔNG còn đọc là "nợ kỹ thuật". Nó đọc là:
    //     13 (nợ cũ — phần DUY NHẤT còn được phép giảm)
    //   +  N (control của các màn đã chuyển sang 1a)
    // Mốc: 13 lúc bắt đầu redesign · 15 sau PR 2 (hai primitive) · 21 sau PR 3 (khung
    // app) · 22 sau PR 4 (cột biểu đồ Bản tin) · 26 sau PR 5 (Sổ + Tài sản) · 30 sau
    // PR 6 (form Nhập: nút Đóng, banner lỗi, nút Loại đặc biệt, nút Lưu mẫu) · 31 sau
    // PR 8 (ô KPI của mặt lập kế hoạch) · 37 sau PR 11 (sáu banner/ô nhập của Chi tiết
    // tài khoản, Đối chiếu và hai tab Đầu tư — đều là bề mặt CŨ đổi sang bề mặt trạng
    // thái 1a, không phải khối mới mọc thêm) · 41 sau PR 13 (bốn nút/banner của Cài đặt,
    // cũng là bề mặt cũ đổi sang bề mặt trạng thái) · 42 khi thêm nút ngữ cảnh của bản
    // vẽ 22a vào tấm trượt Thông báo — nó LÀ control 1a (6px đúng §1.3), và cố ý KHÔNG
    // dùng <ActionButton>: nó là <span> nằm trong <Link> của cả dòng, vì đích của nó
    // trùng đích của dòng nên một <button> thật ở đây là phần tử bấm lồng phần tử bấm.
    // 43 khi Chi tiết thẻ có banner "cần nạp thêm" của bản vẽ 19a — bề mặt trạng thái,
    // cùng khuôn với năm banner state-* đã đếm ở PR 11.
    // 46 khi mặt lập kế hoạch đổi ba chỗ amber-50 viết tay sang bề mặt state-warn (bản
    // vẽ 18a): một banner thiếu tỷ giá, một banner hạn mức chưa phân loại, và nút cảnh
    // báo trần hụt cam kết. Ba chỗ này KHÔNG phải khối mới — chúng đổi từ rounded-lg
    // sang rounded-md vì §1.3 xếp banner/control vào 6px, và đây là lần chúng đi theo
    // token thay vì bảng màu thô.
    // ---- TRẦN `rounded-md` ĐÃ BỎ (2026-08-18) --------------------------------------
    //
    // Lời hẹn ghi ngay tại đây từ lúc bắt đầu redesign: "khi 13 màn của bản 1a dựng xong,
    // THAY trần này bằng luật thật: đếm rounded-lg / rounded-xl trên CONTROL". 13 màn đã
    // xong, nên trần này đi và luật thật nằm ở test `bán kính control` dưới khối này.
    //
    // Vì sao phải bỏ chứ không chỉ nâng: từ §1.3, `rounded-md` là bán kính ĐÚNG của nút /
    // tab / chip vuông. Đặt trần lên nó là đếm ngược chiều — mỗi lần một control đi đúng
    // quy ước thì guardrail lại đỏ, và cách "sửa" là nới trần. Con số cuối là 47/47, tức
    // nó đã hết chỗ để nói gì thêm.
    // Ngưỡng `<label className` (106) đã BỎ hôm 2026-08-11, không phải vì hết nợ mà vì
    // nó được thay bằng luật thật ở trên ("không có <label> mồ côi") — luật đó phân loại
    // đúng theo spec nên không cần đại diện gần đúng nữa.
  ]

  for (const { needle, max, use } of CEILINGS) {
    it(`\`${needle}\` không vượt ${max} (gộp dần vào ${use})`, () => {
      const { count, where } = occurrences(needle)
      expect(
        count,
        count > max
          ? `Thêm mới ${count - max} chỗ. Dùng ${use} thay vì viết tay.\n${where.join('\n')}`
          : `Đã giảm xuống ${count} — hạ ngưỡng trong file test này xuống ${count}.`,
      ).toBeLessThanOrEqual(max)
    })
  }
})

describe('design system — token phải tồn tại', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')

  it('khai đủ token ngữ nghĩa cho cả hai chế độ', () => {
    const required = [
      '--fg-primary',
      '--fg-secondary',
      '--fg-muted',
      '--fg-on-track',
      '--money-in',
      '--money-out',
      '--fg-warn',
      '--surface',
      '--surface-sunken',
      '--border-subtle',
      // Hai token của bản 1a. Ở dark chúng là hai nấc thật (chrome nằm giữa page và
      // surface; border-panel giữa subtle và strong); ở light KHÔNG có chỗ cho nấc thứ
      // tư nên chúng cố ý trùng gray-50 / gray-200. "Trùng giá trị" là lý do dễ khiến
      // ai đó xoá khai báo ở :root cho gọn — mà xoá là dark rơi về giá trị light.
      '--surface-chrome',
      '--border-panel',
    ]
    // Mỗi token phải có ở :root VÀ .dark, không thì dark mode rơi về giá trị light.
    const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'))
    const darkBlock = css.slice(css.indexOf('.dark {'))
    for (const t of required) {
      expect(rootBlock, `${t} thiếu ở :root`).toContain(`${t}:`)
      expect(darkBlock, `${t} thiếu ở .dark`).toContain(`${t}:`)
    }
  })

  /**
   * Bảng §12 gán MỘT thời lượng cho mỗi việc. Ba phép thử dưới đây giữ cho bảng đó còn
   * đọc được từ trong code: token phải tồn tại, không ai được viết thời lượng bằng tay,
   * và bản sao JS (recharts, hẹn giờ React) phải khớp bản CSS.
   */
  const MOTION_TOKENS = {
    '--motion-period': 140,
    '--motion-segment': 120,
    '--motion-sheet': 180,
    '--motion-group': 160,
    '--motion-todo': 200,
    '--motion-drag': 120,
    '--motion-assume': 220,
  }

  it('khai đủ bảy token chuyển động của §12', () => {
    for (const [token, ms] of Object.entries(MOTION_TOKENS))
      expect(css, `${token} thiếu hoặc lệch giá trị trong index.css`).toContain(`${token}: ${ms}ms`)
    // Bốn animation có tên: sheet trượt đáy, sheet fade+scale ở desktop, lớp phủ, và số
    // vừa đổi. Thiếu một cái là một chỗ dùng `animate-*` im lặng không chạy gì.
    for (const anim of ['--animate-sheet-in', '--animate-sheet-pop', '--animate-overlay-in', '--animate-swap-in'])
      expect(css, `${anim} thiếu trong @theme`).toContain(`${anim}:`)
  })

  it('bản sao JS của token chuyển động khớp CSS', () => {
    // Hai hằng số này tồn tại vì recharts nhận số ms qua prop, và vì React phải chờ CSS
    // co xong mới tháo hàng — cả hai đều không đọc được var(). Xem src/lib/motion.ts.
    //
    // ĐỌC FILE chứ không `import`: cả file test này đọc nguồn bằng node:fs (xem chú thích
    // đầu file), mà tests/ biên dịch theo moduleResolution node16 nên import tương đối
    // vào src/ đòi phần mở rộng `.js` — một cái đuôi giả cho một file `.ts`. Đọc chuỗi
    // giữ đúng ranh giới: đây là công cụ soi nguồn, không phải code app.
    const motion = readFileSync(join(SRC, 'lib', 'motion.ts'), 'utf8')
    const readConst = (name: string) => {
      const m = motion.match(new RegExp(`export const ${name} = (\\d+)`))
      expect(m, `${name} không còn trong src/lib/motion.ts`).not.toBeNull()
      return Number(m![1])
    }
    expect(readConst('MOTION_ASSUME_MS'), '--motion-assume ≠ MOTION_ASSUME_MS').toBe(
      MOTION_TOKENS['--motion-assume'],
    )
    expect(readConst('MOTION_TODO_MS'), '--motion-todo ≠ MOTION_TODO_MS').toBe(
      MOTION_TOKENS['--motion-todo'],
    )
  })

  it('token ngữ nghĩa được map ra tiện ích Tailwind bằng @theme inline', () => {
    // Thiếu `inline` thì Tailwind copy giá trị lúc build, .dark sẽ không lật màu.
    expect(css).toContain('@theme inline')
    expect(css).toContain('--color-fg-muted: var(--fg-muted)')
    expect(css).toContain('--color-money-in: var(--money-in)')
    // Khai token mà quên map thì `bg-surface-chrome` / `border-border-panel` KHÔNG
    // sinh ra lớp nào — Tailwind lặng lẽ bỏ qua tên lạ, không có lỗi build nào.
    expect(css).toContain('--color-surface-chrome: var(--surface-chrome)')
    expect(css).toContain('--color-border-panel: var(--border-panel)')
  })

  // Kiểu chữ của bản 1a: IBM Plex Sans cho chữ, IBM Plex Mono cho mọi con số.
  it('font IBM Plex khai trong @theme và được nạp ở index.html', () => {
    expect(css, '--font-sans phải trỏ IBM Plex Sans').toMatch(
      /--font-sans:\s*['"]IBM Plex Sans['"]/,
    )
    expect(css, '--font-mono phải trỏ IBM Plex Mono').toMatch(
      /--font-mono:\s*['"]IBM Plex Mono['"]/,
    )
    const html = readFileSync(join(SRC, '..', 'index.html'), 'utf8')
    expect(html, 'index.html phải nạp css2 của Google Fonts').toMatch(
      /fonts\.googleapis\.com\/css2\?[^"']*IBM\+Plex/,
    )
  })

  // Lý do: app viết tiếng Việt. Chốt `subset=latin,latin-ext` là bỏ subset `vietnamese`
  // (U+1EA0–1EF9 cho dấu nặng/hỏi, và ₫ U+20AB) — mọi chữ có dấu rơi về font hệ thống,
  // lộ ra chữ lệch nét ngay giữa MỘT câu. Để mặc định không tốn thêm byte: css2 chia
  // @font-face theo unicode-range nên trình duyệt chỉ tải subset nó thật sự gặp.
  it('URL font không chốt subset (cần subset vietnamese)', () => {
    const html = readFileSync(join(SRC, '..', 'index.html'), 'utf8')
    for (const m of html.matchAll(/fonts\.googleapis\.com\/css2\?([^"']*)/g)) {
      expect(m[1], `URL font không được chốt subset: ${m[1]}`).not.toMatch(/[?&]subset=/)
    }
  })
})

// ============================================================================
// Chế độ trình bày Gọn / Đầy đủ (src/lib/density.ts)
//
// Cả tính năng dựa trên MỘT quy ước: chữ chỉ để dạy thì đi qua <Guide>/<FullOnly>/
// <ExplainBox>, còn lại thì không. Quy ước sống được hay không phụ thuộc việc đoạn chữ
// TIẾP THEO ai viết có nhớ nó — mà repo không có test render nào để bắt. Nên chặn ở
// mức nguồn, đúng cách các luật trên đang làm.
// ============================================================================
describe('chế độ Gọn — chữ để dạy phải đi qua cổng', () => {
  // Khối hướng dẫn nền xanh (`bg-blue-50` + chữ blue-800) là dạng chữ để dạy THUẦN
  // KHIẾT nhất trong app: 5 chỗ, chỗ nào cũng chỉ nói cách dùng màn hình, không mang
  // một con số nào. Đã đổi hết sang <Guide>. Viết lại bằng <p> nghĩa là chế độ Gọn
  // lặng lẽ hở một lỗ, mà nhìn màn hình ở chế độ Đầy đủ thì không thấy gì sai.
  it('khối hướng dẫn nền xanh luôn là <Guide>, không phải <p>', () => {
    const { count, where } = occurrences('<p className="mb-3 rounded-xl bg-blue-50')
    expect(
      count,
      `Khối hướng dẫn phải dùng <Guide> để chế độ Gọn ẩn được.\n${where.join('\n')}`,
    ).toBe(0)
  })

  // Ba sắc độ trạng thái (đỏ/vàng/xanh đạt 3:1 cho ĐỒ HOẠ) khai một chỗ ở
  // components/ui/statusColors.ts. Trước đây chúng nằm ở features/health với tên
  // zoneColors và chỉ tab Sức khỏe dùng; chế độ Gọn kéo chúng ra khắp app (chấm trạng
  // thái, chip kết luận, thanh nợ). Viết lại cặp sáng/tối bằng tay ở chỗ khác là mở
  // lại đúng cái bẫy đã ghi ở docs/design-system.md: hai chỗ vẽ cùng một ý nghĩa mà
  // lệch màu. Trừ chính file khai — ở đó cặp màu LÀ nội dung.
  it('không viết lại sắc độ trạng thái bằng tay ngoài statusColors.ts', () => {
    const needles = [
      'bg-red-600 dark:bg-red-400/70',
      'bg-amber-600 dark:bg-amber-500/70',
      'bg-green-700 dark:bg-green-500/70',
    ]
    for (const needle of needles) {
      const where: string[] = []
      let count = 0
      for (const f of FILES) {
        if (f.path.endsWith('statusColors.ts')) continue
        const n = f.text.split(needle).length - 1
        if (n > 0) {
          count += n
          where.push(`${f.path.replace(SRC, '')} (${n})`)
        }
      }
      expect(
        count,
        `Đọc STATUS_FILL từ components/ui thay vì viết lại.\n${where.join('\n')}`,
      ).toBe(0)
    }
  })

  // VerdictNote ở chế độ Gọn nén câu kết luận thành chip. Không có `short` (hoặc chí
  // ít `label`) thì chip rơi về một từ chung ("Cần chú ý") — vẫn còn màu, nhưng MẤT
  // con số, tức là mất đúng thứ khiến chip đáng nhìn. Đây là hỏng âm thầm: ở chế độ
  // Đầy đủ màn hình vẫn đẹp như thường.
  //
  // Trần ĐÃ VỀ 0 (2026-08-19). Trước là 1 vì một chỗ ở HealthScoreCard cố ý không có
  // `short`: nó nằm trong <FullOnly>, và đồng hồ ngay trên đã hiện cả điểm lẫn chữ Tốt/
  // Cần chú ý/Rủi ro nên ở chế độ Gọn câu đó bị bỏ hẳn, không nén thành chip. Bản 27b
  // đổi đồng hồ cung tròn thành dải ngang (`ScoreBand`) nên file đó không còn — hạ về 0
  // theo đúng quy ước "trần không hạ là trần rỗng".
  it('mỗi <VerdictNote> có short (hoặc label) để nén thành chip', () => {
    let count = 0
    const where: string[] = []
    for (const f of FILES) {
      // Cắt từ mỗi thẻ mở tới dấu '>' đầu tiên KHÔNG nằm trong {…}: prop `short` hay
      // là biểu thức nhiều dòng có chứa cả '>' (toán tử so sánh, JSX lồng).
      for (const m of f.text.matchAll(/<VerdictNote\b/g)) {
        let i = m.index + m[0].length
        let depth = 0
        while (i < f.text.length) {
          const c = f.text[i]
          if (c === '{') depth++
          else if (c === '}') depth--
          else if (c === '>' && depth === 0) break
          i++
        }
        const props = f.text.slice(m.index, i)
        if (!props.includes('short') && !props.includes('label')) {
          count++
          where.push(`${f.path.replace(SRC, '')} (dòng ${f.text.slice(0, m.index).split('\n').length})`)
        }
      }
    }
    expect(
      count,
      count > 1
        ? `Thiếu prop short → chip ở chế độ Gọn mất con số.\n${where.join('\n')}`
        : `Đã xuống ${count} — hạ ngưỡng trong file test này.`,
    ).toBeLessThanOrEqual(0)
  })

  // Trần cho đoạn văn xuôi CHƯA đi qua cổng: <p> mang class chữ phụ (`fg-muted`) mà
  // bên trong là ≥45 ký tự chữ thật (đã bỏ mọi {biểu thức}).
  //
  // Không thể đặt 0: phần lớn số còn lại là thứ PHẢI ở lại — cảnh báo thiếu tỷ giá,
  // dòng số liệu, câu giải thích ô đang bị vô hiệu, trạng thái rỗng không còn đường
  // đi tiếp. Xét từng chỗ mới biết, không quét máy móc được. Trần chỉ để chặn việc
  // thêm văn xuôi mới mà quên bọc <Guide>.
  it('văn xuôi trong <p class="…fg-muted…"> không vượt trần', () => {
    const PROSE = /<p className="([^"]*fg-muted[^"]*)"\s*>([\s\S]*?)<\/p>/g
    // Bỏ: phụ đề dữ liệu (truncate), trạng thái rỗng căn giữa (py-*), nhãn in đậm
    const SKIP = ['truncate', 'py-6', 'py-8', 'py-10', 'font-semibold', 'font-medium']
    let count = 0
    const where: string[] = []
    for (const f of FILES) {
      for (const m of f.text.matchAll(PROSE)) {
        if (SKIP.some((s) => m[1].includes(s))) continue
        const chu = m[2].replace(/\{[^{}]*\}/g, '').replace(/\s+/g, ' ').trim()
        if (chu.length < 45) continue
        count++
        where.push(`${f.path.replace(SRC, '')}: ${chu.slice(0, 60)}…`)
      }
    }
    expect(
      count,
      count > PROSE_MAX
        ? `Thêm ${count - PROSE_MAX} đoạn văn xuôi mới. Nếu là chữ để DẠY thì bọc <Guide>; nếu là cảnh báo/dữ liệu thì để nguyên và nâng trần kèm lý do.\n${where.join('\n')}`
        : `Đã xuống ${count} — hạ PROSE_MAX xuống ${count}.`,
    ).toBeLessThanOrEqual(PROSE_MAX)
  })
})

describe('vong focus + san co chu cua O NHAP', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')

  it('ring cua o nhap ve VAO TRONG, khong bi khoi cuon cat mat hai dau', () => {
    // `outline` ve NGOAI hop vien. O nhap o app nay gan nhu luon `w-full` trong mot khoi
    // `overflow-y-auto` — truc ngang cua khoi do thanh `auto`, tuc CUNG clip — va khoi
    // khong co padding ngang, nen long khoi trung dung mep o. Do o 375px tren man Nhap:
    // o 12→363, long khoi cuon cung 12→363, nen 2px vach + 2px offset roi het ra ngoai
    // va bi cat sach hai ben; con lai dung hai vach ngang, doc ra thanh "cai khung mat
    // hai dau" (dung chu cua bao loi). Bo quy tac nay la loi do quay lai o MOI o nhap.
    expect(css).toMatch(
      /:where\(input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\), select, textarea\):focus-visible \{\s*outline-offset: -2px;/,
    )
  })

  it('nut/link van giu ring ve ra NGOAI — khong keo ca app vao trong', () => {
    // Nut khong trai het be rong khoi cuon nen khong bi cat; keo ring vao trong o nut
    // 44px la an vao chu.
    const i = css.indexOf('outline: 2px solid var(--accent);')
    expect(i).toBeGreaterThan(0)
    expect(css.slice(i, i + 80)).toMatch(/outline-offset: 2px;/)
  })

  it('san 16px cho o nhap tren man hep — chan cu tu-phong cua trinh duyet', () => {
    // Duoi 16px la trinh duyet tu phong to ca trang khi cham vao o, va phong roi trang
    // KHONG tu thu lai. `max()` chu khong dat cung 16px: o nac chu "Rat lon" (1,25) thi
    // 1rem = 20px, dat cung la thu nho chu cua dung nguoi da xin chu to.
    //
    // Khoi theo BE RONG quet MOI o nhap, nen no phai o lai dieu kien `max-width: 1023px`:
    // duoi 1024px hai o LON duy nhat deu `hidden lg:block` nen vo hai, con noi dieu kien
    // ra pointer tho la keo iPad ngang vao va o so tien chinh tut 30px -> 16px.
    const i = css.indexOf('@media (max-width: 1023px)')
    expect(i).toBeGreaterThan(0)
    expect(css.slice(i, i + 200)).toMatch(/font-size: max\(16px, 1rem\);/)
    expect(css).not.toMatch(/@media \(max-width: 1023px\), \(pointer: coarse\)/)
  })

  it('thiet bi cham be rong lon: san chi dat len o CO NHO', () => {
    // iPad ngang dung 1024px truot qua khoi tren dung mot pixel. Khoi cho pointer tho
    // phai chi nham `.text-sm`/`.text-base` — quet ca o co lon la thu nho o so tien
    // chinh cua man Nhap tren iPad, dat hon cu phong ma no chan.
    const i = css.indexOf('@media (pointer: coarse)')
    expect(i).toBeGreaterThan(0)
    const block = css.slice(i, css.indexOf('text-base', i) + 200)
    expect(block).toMatch(/:is\(input, select, textarea\)\.text-sm/)
    expect(block).toMatch(/:is\(input, select, textarea\)\.text-base/)
    // Moi co giu gia tri cua chinh no roi moi chan san.
    expect(block).toMatch(/max\(16px, 0\.875rem\)/)
    expect(block).toMatch(/max\(16px, 1rem\)/)
    // KHONG duoc co o co lon trong khoi nay.
    expect(block).not.toMatch(/text-lg|1\.875rem|font-mono/)
  })
})
