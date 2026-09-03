// MCP server của Sổ Gạo — Vercel function.
//
// VỎ MỎNG là chủ ý: file này chỉ xác thực, khai tool, và nối transport. Không một luật tiền
// nào ở đây. Nhờ vậy chặng 2 (thêm OAuth cho điện thoại) chỉ sửa phần xác thực, không đụng
// tool nào.
//
// Chặng 1 xác thực bằng bearer token trong header. Token đó là hàng rào DUY NHẤT (Supabase
// đọc bằng service-role, đi vòng qua RLS) — bù lại server không có đường ghi nào, nên token
// lộ thì thiệt hại là bị đọc, không bị sửa.
//
// GIỚI HẠN TÀI NGUYÊN nằm ở `functions` trong vercel.json (file đó là JSON thuần, không đặt
// được ghi chú, nên lý do ghi ở đây):
//
//   maxDuration: 30   — cái chặn cứng, và là núm DUY NHẤT có. Hobby mặc định 300 giây, cũng
//                       là trần. Vercel tính tiền RAM × thời gian function còn chạy, mà thời
//                       gian đó "includes sending the response, including streamed responses"
//                       — nên một stream bị giữ mở ăn trọn 300s × 2 GB = 0,167 GB-giờ MỘT
//                       LẦN. Đó là cách hạn mức free bốc hơi hồi 8/2026: ~2.290 lần như thế
//                       = 382 GB-giờ. Truy vấn thật mất 2–5 giây, nên 30 là dư 6 lần; có ngày
//                       timeout thật thì xem lại đây, đừng vội nới.
//
// ĐỪNG thêm `memory` vào đó. Vercel từ chối: "Memory cannot be set in vercel.json with Fluid
// compute enabled", và gói Hobby khoá cứng 2 GB / 1 vCPU — không đổi được cả ở dashboard. Đo
// thật thì function chỉ dùng ~310 MB, tức 85% tiền RAM là trả cho không khí, nhưng đó là thứ
// KHÔNG sửa được ở tầng này; cách duy nhất giảm là bớt thời gian sống, không phải bớt RAM.
import { McpServer } from '@modelcontextprotocol/server'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'

import { docCauhinh, taoClient } from '../src/mcp/env'
import { napDuLieu } from '../src/mcp/load'
import { truyVan } from '../src/mcp/tools/truyVan'
import { thoiQuenGhiChep } from '../src/mcp/tools/thoiQuenGhiChep'
import { lichSuTyGia } from '../src/mcp/tools/lichSuTyGia'
import { baoCaoThang, nganSach } from '../src/mcp/tools/moc'
import type { DuLieu } from '../src/mcp/basket'

const KHOANG = z.object({
  tu_thang: z.string().optional().describe("Tháng đầu, dạng 'YYYY-MM'"),
  den_thang: z.string().optional().describe('Tháng cuối; bỏ trống = bằng tu_thang'),
  tu_ngay: z.string().optional().describe("Ngày đầu, dạng 'YYYY-MM-DD'"),
  den_ngay: z.string().optional().describe('Ngày cuối, TÍNH CẢ ngày này'),
})

/** Bọc kết quả tool thành content block. Trả JSON để Claude đọc số chính xác. */
const ra = (v: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }],
})

function dungServer(du: DuLieu): McpServer {
  const server = new McpServer({ name: 'so-gao', version: '1.0.0' })

  server.registerTool(
    'truy_van',
    {
      description:
        'Truy vấn chéo sổ chi tiêu: chọn ĐO GÌ và XẺ THEO CHIỀU NÀO, tự do phối. Đây là tool ' +
        'chính — dùng nó cho hầu hết câu hỏi. Nó trả lời được những câu app không có màn hình ' +
        'nào trả lời, ví dụ chi vào ngày lễ Nhật so với ngày thường, hay khoản ghi muộn có to ' +
        'hơn khoản ghi ngay không. Tiền trả về kèm chuỗi đã format — ĐỪNG tự chia đơn vị. ' +
        'Nếu thieu_ty_gia = true thì phải nói rõ với người dùng là số chưa đủ.',
      inputSchema: z.object({
        do_luong: z.enum(['tong_tien', 'so_lan', 'trung_binh_moi_lan', 'lon_nhat', 'do_tre_ghi']),
        xe_theo: z
          .array(
            z.enum([
              'danh_muc', 'danh_muc_cha', 'nhan', 'tai_khoan', 'thang', 'tuan', 'thu_trong_tuan',
              'gio_nhap', 'ngay_le_nhat', 'co_khoan', 'need_level', 'cost_type', 'la_gui_tien',
            ]),
          )
          .max(2)
          .describe('0 tới 2 chiều. Rỗng = một dòng tổng.'),
        loai: z
          .enum(['chi', 'thu', 'chuyen'])
          .optional()
          .describe(
            "Mặc định 'chi'. 'chuyen' = chuyển tài sản (gửi tiền về VN); khoản chuyển giữa " +
              'hai tài khoản của chính mình không thuộc loại nào, đúng như tab Báo cáo.',
          ),
        loc: z
          .object({
            danh_muc: z.array(z.string()).optional().describe('TÊN danh mục, không phải id'),
            nhan: z.array(z.string()).optional().describe('TÊN nhãn'),
            tai_khoan: z.array(z.string()).optional().describe('TÊN tài khoản'),
            tien_te: z.array(z.enum(['JPY', 'VND', 'USD'])).optional(),
            la_gui_tien: z.boolean().optional().describe('true = chỉ khoản gửi tiền về VN'),
            need_level: z
              .array(z.string())
              .optional()
              .describe("Mức nhu cầu của danh mục: 'essential' (thiết yếu) / 'flexible' (linh hoạt) / 'education' (giáo dục) / 'giving' (cho đi) / 'buffer' (dự phòng)"),
            cost_type: z
              .array(z.string())
              .optional()
              .describe("Chi cố định vs biến đổi: 'fixed' / 'variable'"),
          })
          .optional(),
        khoang: KHOANG,
        sap_xep: z.enum(['giam', 'tang', 'ten']).optional(),
        gioi_han: z.number().int().positive().max(200).optional(),
      }),
    },
    async (input) => ra(truyVan(input, du)),
  )

  server.registerTool(
    'thoi_quen_ghi_chep',
    {
      description:
        'Thói quen ghi chép: độ trễ từ lúc tiền đi tới lúc vào sổ, giờ nhập, thứ trong tuần, và ' +
        'danh mục nào hay bị ghi muộn nhất. Đây là dữ liệu KHÔNG màn hình nào của app hiện. ' +
        'ĐỌC `phien_nhap` VÀ `ghi_chu` TRƯỚC: sổ này có lịch sử nhập từ Zaim và sao kê nhập theo ' +
        'tháng, nên phần lớn `created_at` là giờ CHẠY LỆNH NHẬP chứ không phải lúc người dùng gõ. ' +
        'Khi ghi_chu báo nhập theo lô thì tuyệt đối không kết luận gì về thói quen của người dùng ' +
        '— nói thẳng là dữ liệu không cho phép. Đây là dữ liệu HÀNH VI, không phải tiền.',
      inputSchema: z.object({ khoang: KHOANG }),
    },
    async (input) => ra(thoiQuenGhiChep(input, du)),
  )

  server.registerTool(
    'lich_su_ty_gia',
    {
      description:
        'Lịch sử tỷ giá theo ngày. Bảng này chỉ tích từ cuối tháng 7/2026 và chỉ ghi vào những ' +
        'ngày người dùng mở app, nên khoảng trống là bình thường. LUÔN đọc trường `chieu` trước ' +
        'khi diễn giải con số — chiều tỷ giá là chỗ dễ đọc ngược nhất.',
      inputSchema: z.object({
        tu_ngay: z.string().describe("'YYYY-MM-DD'"),
        den_ngay: z.string().describe("'YYYY-MM-DD', tính cả ngày này"),
      }),
    },
    async (input) => ra(lichSuTyGia(input, du)),
  )

  server.registerTool(
    'bao_cao_thang',
    {
      description:
        'MỐC ĐỐI CHIẾU: thu / chi / chuyển tài sản / phần để lại của một tháng, đúng bằng số mà ' +
        'tab Báo cáo trong app hiện. Dùng tool này để kiểm chứng con số bạn lấy từ truy_van. Nếu ' +
        'hai bên lệch nhau, hãy nói thẳng với người dùng là có bất thường thay vì chọn một số.',
      inputSchema: z.object({ thang: z.string().describe("'YYYY-MM'") }),
    },
    async (input) => ra(baoCaoThang(input, du)),
  )

  server.registerTool(
    'ngan_sach',
    {
      description:
        'MỐC ĐỐI CHIẾU: hạn mức, đã tiêu, còn lại của từng ngân sách trong một tháng — đúng bằng ' +
        'số tab Ngân sách hiện. Dòng có chi_la_moc_theo_doi = true là mốc theo dõi của một danh ' +
        'mục con, KHÔNG phải một trần thật; đừng cộng nó vào tổng.',
      inputSchema: z.object({ thang: z.string().describe("'YYYY-MM'") }),
    },
    async (input) => ra(nganSach(input, du)),
  )

  return server
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let cauhinh
  try {
    cauhinh = docCauhinh(process.env)
  } catch (e) {
    // Sai cấu hình là lỗi của người dựng, không phải của người gọi → 500, và nói thật lý do.
    res.status(500).json({ error: (e as Error).message })
    return
  }

  const header = req.headers.authorization ?? ''
  const gui = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (gui !== cauhinh.token) {
    res.status(401).json({ error: 'Thiếu hoặc sai bearer token.' })
    return
  }

  // CHỈ NHẬN POST — và chốt ở đây, TRƯỚC napDuLieu. Đây là chỗ đã đốt hết hạn mức Vercel:
  //
  // Client MCP mở một `GET` với `Accept: text/event-stream` để nghe thông báo do server tự
  // đẩy. Ở chế độ không phiên, transport vẫn nhận GET đó (validateSession thoát ngay khi
  // sessionIdGenerator === undefined), mở stream, rồi bơm keep-alive mỗi 15 giây MÃI MÃI —
  // không có đường tự đóng. Vercel tính tiền theo RAM × thời gian function còn sống, nên một
  // kênh ngồi không vẫn đốt y như đang chạy: 382 GB-giờ bộ nhớ trong khi CPU chỉ dùng 1,5%
  // thời gian đó. Client bị Vercel cắt ở maxDuration rồi nối lại, lặp vô hạn.
  //
  // Server này có 5 tool CHỈ ĐỌC và không đẩy thông báo nào, nên kênh đó không chở gì cả.
  // Spec MCP cho phép đúng câu trả lời này: server không mở SSE ở endpoint thì trả 405.
  //
  // Nằm trước napDuLieu cũng là chủ ý: trước đây mỗi lần client nối lại kênh, hàm vẫn phân
  // trang kéo ~14.000 giao dịch + 7 bảng từ Supabase về để rồi mở một stream trống.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Chỉ nhận POST. Server này không mở kênh SSE, không có phiên.' })
    return
  }

  try {
    const sb = taoClient(cauhinh)
    // Nạp dữ liệu MỘT LẦN mỗi request rồi truyền vào mọi tool: tool là hàm thuần, không tự
    // đọc gì. Một request MCP có thể gọi nhiều tool, nên đọc một lần là đủ và nhanh hơn.
    const du = await napDuLieu(sb, cauhinh.userId)
    const server = dungServer(du)
    // sessionIdGenerator: undefined = chế độ không phiên. Đúng cho serverless: mỗi request là
    // một tiến trình mới, không có chỗ giữ phiên giữa hai lần gọi.
    //
    // enableJsonResponse: true = trả JSON thẳng thay vì mở SSE stream cho POST. Mặc định của
    // thư viện là SSE (kèm keep-alive 15 giây), thứ chỉ có nghĩa khi server còn muốn nói thêm
    // sau khi đã trả lời — mà ở đây thì không bao giờ. Một request, một câu trả lời, đóng.
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (e) {
    // Trả lỗi THẬT kèm nguyên nhân, không trả rỗng giả vờ thành công — số tiền sai lặng lẽ
    // tệ hơn một lỗi nhìn thấy được.
    if (!res.headersSent) res.status(500).json({ error: (e as Error).message })
  }
}
