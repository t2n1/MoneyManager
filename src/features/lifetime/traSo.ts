// Dựng câu hỏi gửi cho model — THUẦN, không React, không mạng, không đồng hồ.
//
// VÌ SAO CÓ FILE NÀY. Cái làm một câu trả lời về chi phí cưới ĐÚNG không phải model
// giỏi, mà là việc BIẾT phải hỏi "đã trừ ご祝儀 chưa". Khảo sát ゼクシィ 2024 cho ¥3.439.000
// là 総額 — số tổng cả tiệc; tiền người ta thực móc ra thấp hơn nhiều sau tiền mừng.
// Model không tự biết mình phải trừ. Bảng LUAT_HOI dưới đây là chỗ giữ những cái "phải
// hỏi cho đúng" đó.
//
// KHOÁ RIÊNG TƯ. `MocDeTra` CỐ Ý không có trường tiền nào — không số dư, không thu nhập,
// không số tiền hiện tại của mốc. Một lượt tra không cần chúng, nên chúng không được có
// đường nào lọt vào câu hỏi gửi ra ngoài. Đây là ràng buộc ở tầng KIỂU DỮ LIỆU, và
// `traSo.test.ts` khoá lại bằng phép thử. Thêm trường tiền vào đây là phá lời hứa đó.
import type { CurrencyCode } from '../../lib/currencies'

/** Mốc cần tra. Không mang tiền — xem khối chú thích đầu file. */
export interface MocDeTra {
  /** Nhãn của mốc. Khớp đúng ký tự với khoá `LUAT_HOI` thì được hỏi kỹ. */
  nhan: string
  kind: 'income' | 'expense'
  namBatDau: number
  namKetThuc: number | null
  /** Nước của CHẶNG phủ năm bắt đầu (từ `phaseForYear`), không phải của mốc. */
  nuoc: string | null
  /** Tiền của CHẶNG (từ `currencyAt`). Câu trả lời phải theo đúng đồng này. */
  tien: CurrencyCode
}

export interface CauHoi {
  van: string
  /**
   * true = nhãn khớp `LUAT_HOI`, câu hỏi dựng TỪ LUẬT nên không chứa chữ người dùng gõ.
   * false = mốc tự đặt tên, nhãn đi vào câu hỏi nguyên văn → UI phải cảnh báo trước khi gửi.
   */
  laMocCoSan: boolean
}

/**
 * "Phải hỏi cho đúng cái gì" của 11 loại mốc mà `LIFE_PRESETS` sinh ra.
 *
 * KHOÁ LÀ NHÃN, KHÔNG PHẢI MÃ MẪU: `DraftEvent` không mang mã mẫu nào, nên đây là đường
 * ghép duy nhất không cần đổi schema. Người dùng đổi tên mốc thì rơi về "tra chung" —
 * đúng ý bản thiết kế, không phải lỗi.
 *
 * 6 mẫu sinh ra 11 mốc: riêng "Sinh con" đẻ ra 5. Chép nhãn từ `presets.ts` NGUYÊN VĂN,
 * kể cả gạch nối dài (–, U+2013) trong "Nuôi con 0–6 tuổi".
 */
export const LUAT_HOI: Record<string, string> = {
  'Chi phí cưới':
    'Lấy TỔNG chi phí (総額) trung bình rồi TRỪ tiền mừng (ご祝儀) ước tính, để ra số tiền ' +
    'người ta THỰC MÓC RA. Nói rõ giả định bao nhiêu khách. Nếu khảo sát đổi cách đo giữa ' +
    'các năm thì phải cảnh báo là không so trực tiếp được.',
  'Trợ cấp trẻ em (児童手当)':
    'Tra LUẬT hiện hành, không tra bài báo cũ — mức này đổi theo luật. Nói rõ mức theo độ ' +
    'tuổi và theo thứ tự con, và ngưỡng thu nhập nếu còn áp dụng.',
  'Nuôi con 0–6 tuổi':
    'Nói rõ có gồm tiền nhà trẻ / mẫu giáo không, và chính sách miễn học phí mầm non ' +
    '(幼保無償化) đã được trừ chưa.',
  'Nuôi con 7–15 tuổi':
    'Tách trường công và trường tư. Nói rõ có gồm tiền học thêm (塾) không.',
  'Nuôi con 16–17 tuổi':
    'Tách cấp ba công và tư. Nói rõ trợ cấp học phí cấp ba (高等学校等就学支援金) đã trừ chưa.',
  'Con vào đại học':
    'TÁCH ba mức: quốc lập, tư thục thường, và y/nha khoa — chênh nhau nhiều lần. Tách ' +
    'tiền nhập học năm đầu (入学金) ra khỏi học phí hằng năm.',
  'Trả trước mua nhà':
    'Nói rõ tỷ lệ trả trước thông thường và trên giá nhà bao nhiêu. Cộng cả các khoản ' +
    'thuế phí lúc mua (諸費用) và nói rõ chúng chiếm bao nhiêu phần trăm.',
  // KHÔNG viết con số nào vào luật (kể cả "nhân 12"): luật nói model phải HỎI cái gì,
  // không nói sẵn đáp án — và phép thử khoá ở traSo.test.ts cấm mọi chữ số ngoài năm.
  'Trả vay mua nhà':
    'Nói rõ lãi suất giả định, kỳ hạn bao nhiêu năm, và đây là số MỖI NĂM. Nếu nguồn cho ' +
    'số theo tháng thì phải quy sang số mỗi năm và nói rõ là đã quy.',
  'Lương hưu':
    'TÁCH 老齢基礎年金 (phần quốc dân) và 老齢厚生年金 (phần công ty) thành hai khoản, đừng ' +
    'gộp. Nói rõ số 満額 của phần cơ bản đổi HÀNG NĂM và đang lấy của năm nào.',
  'Chi phí chuyển nhà, thủ tục':
    'Khoản một lần. Nói rõ gồm những gì — vận chuyển, visa/thủ tục, đặt cọc nhà mới.',
  'Hỗ trợ bố mẹ':
    'Số theo mức sống ở Việt Nam, tra nguồn Việt Nam. KHÔNG quy từ số của Nhật sang.',
}

const CHUNG =
  'Tôi không rõ khoản này thường hết bao nhiêu. Đây là mốc do tôi tự đặt tên nên có thể ' +
  'có những cái bẫy tôi không biết — nếu con số phổ biến trên mạng là số gộp, số chưa trừ ' +
  'trợ cấp, hay số của một phạm vi khác với điều tôi hỏi, hãy nói ra.'

/** Phần chung mọi câu hỏi: khuôn trả lời + quyền nói "không biết". */
function khuonTraLoi(tien: CurrencyCode): string {
  return [
    '',
    'CÁCH TRẢ LỜI — chỉ trả về JSON, không thêm chữ nào ngoài JSON:',
    '{',
    '  "khong_biet": false,',
    `  "tien": "${tien}",`,
    '  "thap": <số>, "giua": <số>, "cao": <số>,   // đơn vị LỚN, không phải cent',
    '  "dien_giai": "<một đoạn ngắn: số này là gì, đã trừ/chưa trừ những gì>",',
    '  "canh_bao": ["<mỗi cảnh báo một chuỗi>"],',
    '  "nguon": { "ten": "<tên khảo sát/cơ quan>", "url": "<link>", "nam": <năm khảo sát> }',
    '}',
    '',
    'BA RÀNG BUỘC BẮT BUỘC:',
    `1. Mọi số phải theo đồng ${tien}. Không được trả lời bằng đồng khác.`,
    '2. Phải có nguồn tra được. Không bịa số. Không tìm được nguồn đáng tin thì đặt',
    '   "khong_biet": true và nói lý do ở "dien_giai" — trả lời "không biết" là ĐÚNG,',
    '   không phải thất bại.',
    '3. "thap"/"cao" là dải thật của khoản này, không phải ±10% quanh "giua".',
  ].join('\n')
}

/**
 * Dựng câu hỏi cho một mốc.
 *
 * Nhãn khớp `LUAT_HOI` thì câu hỏi dựng TỪ LUẬT — nhãn không đi vào phần mô tả, nên
 * không có chữ nào người dùng gõ lọt ra ngoài. Không khớp thì nhãn đi vào nguyên văn và
 * `laMocCoSan` là false để UI cảnh báo trước khi gửi.
 */
export function dungCauHoi(moc: MocDeTra): CauHoi {
  const luat = LUAT_HOI[moc.nhan]
  const laMocCoSan = luat !== undefined
  const nuoc = moc.nuoc ?? 'không rõ nước'
  const loai = moc.kind === 'income' ? 'khoản THU' : 'khoản CHI'
  const khoang =
    moc.namKetThuc === null
      ? `từ năm ${moc.namBatDau} trở đi`
      : moc.namBatDau === moc.namKetThuc
        ? `năm ${moc.namBatDau}`
        : `mỗi năm trong khoảng ${moc.namBatDau}–${moc.namKetThuc}`

  const than = laMocCoSan ? luat : `Khoản "${moc.nhan}". ${CHUNG}`

  return {
    laMocCoSan,
    van: [
      `Tôi đang dựng bản chiếu tài sản dài hạn. Cần một con số cho một ${loai} ở ${nuoc}, ${khoang}.`,
      '',
      than,
      khuonTraLoi(moc.tien),
    ].join('\n'),
  }
}
