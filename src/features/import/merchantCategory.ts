// Đoán danh mục cho từng dòng sao kê, và gom dòng theo TÊN QUÁN.
//
// VÌ SAO GOM THEO QUÁN: trang nhập cũ ghi thẳng `category_id: null`, nên mọi
// khoản nhập vào đều rơi khỏi bảng "tiêu vào việc gì" (aggregate.ts bỏ qua khoản
// thiếu danh mục — tổng Chi vẫn đúng nhờ foldUncategorized, nhưng không biết
// tiêu vào đâu). Gán tay từng dòng thì 229 dòng là một buổi tối; gom theo quán
// thì còn 102 ô chọn, và 30 ô đầu đã lo xong hai phần ba số dòng.
//
// BA NGUỒN ĐOÁN, xếp theo độ tin cậy:
//   1. Sổ của chính người dùng — quán này trước đây họ gắn danh mục nào nhiều nhất
//   2. Bảng tên quán Nhật dựng sẵn ở dưới
//   3. Không ra thì để TRỐNG. Đoán bừa nguy hiểm hơn bỏ trống: giá trị điền sẵn
//      hay bị bấm qua mà không đọc.
// Bảng dựng sẵn cố tình CHỈ chứa quán không thể hiểu nhầm. ＴＥＭＵ, Amazon,
// メルカリ bán đủ thứ nên không có mặt ở đây — để người dùng chọn một lần, rồi
// nguồn (1) tự nhớ cho lần sau.
import type { ImportItem } from './csvImport'

/**
 * Quy tên quán về dạng so sánh được: chữ rộng (ＴＥＭＵ) về chữ hẹp, bỏ khoảng
 * trắng và dấu ngăn.
 *
 * Bỏ CẢ `-` lẫn `ー` là cố ý: cùng một hãng mà sao kê lúc ghi 「セブン-イレブン」
 * lúc ghi 「セブンーイレブン」. Cái giá là 「スーパー」 co thành 「スパ」 — chấp
 * nhận được, vì cả tên quán lẫn từ khóa đều đi qua đúng hàm này nên hai bên co
 * giống hệt nhau.
 */
export function normalizeMerchant(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・,.()*/\\|'"&＆–—‐-]/g, '')
    .replace(/ー/g, '')
}

export interface MerchantGroup {
  /** Tên quán như trong file, giữ nguyên để hiện cho người dùng. */
  merchant: string
  /** Vị trí các dòng thuộc nhóm này trong mảng `items` gốc. */
  indexes: number[]
  count: number
  /** Tổng tiền của nhóm (minor units). */
  total: number
}

/** Gom dòng theo tên quán đã chuẩn hóa; nhóm nhiều dòng nhất lên đầu. */
export function groupByMerchant(items: ImportItem[]): MerchantGroup[] {
  const map = new Map<string, MerchantGroup>()
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const k = normalizeMerchant(it.note) || it.note
    const g = map.get(k)
    if (g) {
      g.indexes.push(i)
      g.count++
      g.total += it.amount
    } else {
      map.set(k, { merchant: it.note, indexes: [i], count: 1, total: it.amount })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.total - a.total)
}

/**
 * Dòng nạp ví, không phải tiêu tiền: tiền chạy từ thẻ sang ví PayPay rồi mới
 * tiêu ở quán. Nhập nguyên xi là đếm hai lần.
 */
const TOPUP_NAMES = ['チャージ', 'オートチャージ', 'チャージ入金'].map(normalizeMerchant)

export function isTopUp(note: string): boolean {
  // So BẰNG chứ không so chứa: 「ChargeSPOT」 là dịch vụ thuê pin dự phòng,
  // không phải nạp ví.
  return TOPUP_NAMES.includes(normalizeMerchant(note))
}

/** Từ khóa → tên danh mục ứng viên (xếp theo ưu tiên; lấy cái đầu tiên người dùng thật sự có). */
interface BuiltinRule {
  needles: string[]
  categories: string[]
}

const BUILTIN: BuiltinRule[] = [
  {
    categories: ['Cơm ngoài'],
    needles: [
      '吉野家', '松屋', 'すき家', 'なか卯', 'やよい軒', 'かつや', '大戸屋', '幸楽苑',
      'マクドナルド', 'モスバーガー', 'ケンタッキー', 'ロッテリア', 'フレッシュネス',
      'サイゼリヤ', 'ガスト', 'バーミヤン', 'ジョナサン', '夢庵', '日高屋',
      '餃子の王将', '大阪王将', '丸亀製麺', 'はなまるうどん', 'CoCo壱番屋', 'ココイチ',
      'ラーメン', '焼肉', '寿司', '天丼', '天ぷら', '定食', '食堂', '居酒屋',
      '串かつ', 'とんかつ', 'うどん', '牛丼', 'ビュッフェ', 'レストラン',
    ],
  },
  {
    categories: ['Ăn vặt & Cafe', 'Cơm ngoài'],
    needles: [
      'スターバックス', 'starbucks', 'ドトール', 'タリーズ', 'コメダ', 'サンマルク',
      'ベローチェ', 'エクセルシオール', 'カフェ', 'cafe', 'coffee', 'コーヒー',
      'ミスタードーナツ', 'クリスピー', 'ゴンチャ', 'タピオカ', '不二家', 'シャトレーゼ',
    ],
  },
  {
    categories: ['Đi chợ'],
    needles: [
      'セブンイレブン', 'seveneleven', 'ローソン', 'ファミリーマート', 'ミニストップ',
      'デイリーヤマザキ', 'ニューデイズ', '業務スーパー', 'まいばすけっと', '西友',
      'オーケーストア', 'イオンモール', 'イオンスタイル', 'イオン', '東急ストア',
      'マルエツ', 'サミットストア', 'いなげや', '食品館', '肉のハナマサ',
      'ドンキホーテ', 'ドン・キホーテ',
    ],
  },
  {
    categories: ['Đồ dùng trong nhà'],
    needles: [
      'ダイソー', 'セリア', 'キャンドゥ', 'ニトリ', 'カインズ', 'コーナン', 'ビバホーム',
      'ホームセンター', 'ikea', '無印良品', 'スリーコインズ',
    ],
  },
  {
    categories: ['Thuốc'],
    needles: [
      'マツモトキヨシ', 'ウエルシア', 'スギ薬局', 'ツルハ', 'サンドラッグ',
      'ココカラファイン', '薬局', 'ドラッグ',
    ],
  },
  {
    categories: ['Tàu xe'],
    needles: [
      'jr東日本', 'jr東海', 'jr西日本', 'モバイルsuica', 'suica', 'pasmo', '定期券',
      '東京メトロ', '東京地下鉄', '都営', '東急電鉄', '京王電鉄', '小田急', '西武鉄道',
      '京成', '京急', '相鉄', 'つくばエクスプレス', 'スカイライナー', '新幹線', 'モノレール',
    ],
  },
  {
    categories: ['Taxi'],
    needles: ['s.ride', '日本交通', 'goタクシー', 'didi', 'タクシー', 'kmタクシー'],
  },
  {
    categories: ['Thuê xe & đỗ xe', 'Tàu xe'],
    needles: [
      'タイムズカー', 'カーシェア', 'リパーク', 'パーキング', '駐車場', 'レンタカー',
      'times24', 'ニコニコレンタカー',
    ],
  },
  { categories: ['Điện'], needles: ['東京電力', '関西電力', '中部電力', '電力'] },
  { categories: ['Gas'], needles: ['東京ガス', '大阪ガス', '東邦ガス', '都市ガス'] },
  { categories: ['Nước'], needles: ['水道局', '水道料金'] },
  {
    categories: ['Điện thoại'],
    needles: [
      '楽天モバイル', 'nttドコモ', 'ドコモ', 'ソフトバンク', 'softbank', 'uqモバイル',
      'ワイモバイル', 'ymobile', 'ahamo', 'povo',
    ],
  },
  {
    categories: ['Dịch vụ & Đăng ký'],
    needles: [
      'apple.com', 'アップルジャパン', 'itunes', 'google', 'netflix', 'spotify',
      'openai', 'anthropic', 'adobe', 'microsoft', 'dropbox', 'youtube', 'dazn',
      'amazonプライム', 'primevideo', 'chargespot', 'disney',
    ],
  },
  { categories: ['Khóa học & Chứng chỉ'], needles: ['udemy', 'coursera', 'スクール'] },
  {
    categories: ['Quần áo & Giày dép'],
    needles: ['ユニクロ', 'uniqlo', 'ジーユー', 'しまむら', 'abcマート', '洋服の青山'],
  },
  {
    categories: ['Giải trí & Vé'],
    needles: ['tohoシネマズ', 'イオンシネマ', '映画', 'カラオケ', 'ラウンドワン', '水族館', '動物園'],
  },
  { categories: ['Cắt tóc'], needles: ['qbハウス', '美容室', '理容', 'ヘアサロン'] },
  { categories: ['Khách sạn'], needles: ['ホテル', '東横イン', 'アパホテル', 'hotel', '旅館'] },
  { categories: ['Bệnh viện', 'Sức khỏe'], needles: ['病院', 'クリニック', '医院', '歯科'] },
]

// Dựng phẳng một lần lúc nạp module. Từ khóa DÀI thắng từ khóa ngắn, nên
// 「ガスト」 (quán ăn) không bị 「ガス」 (tiền ga) giành mất.
const FLAT = BUILTIN.flatMap((r) =>
  r.needles.map((n) => ({ needle: normalizeMerchant(n), categories: r.categories })),
)
  .filter((f) => f.needle.length > 0)
  .sort((a, b) => b.needle.length - a.needle.length)

export type GuessSource = 'history' | 'builtin'

export interface CategoryGuess {
  categoryId: string
  source: GuessSource
}

export interface CategoryLike {
  id: string
  name: string
}

export interface HistoryTx {
  note: string | null
  category_id: string | null
  type: string
}

const nameKey = (s: string) => s.normalize('NFKC').trim().toLowerCase()

const topOf = (m: Map<string, number>) =>
  [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

/**
 * Đoán danh mục cho từng tên quán. Trả Map: tên quán (nguyên văn) → đoán.
 * Không đoán được thì KHÔNG có khóa trong Map — để trống, người dùng chọn.
 */
export function guessCategoryForMerchants(
  merchants: string[],
  history: HistoryTx[],
  categories: CategoryLike[],
): Map<string, CategoryGuess> {
  // Sổ cũ: ghi chú (đã chuẩn hóa) → danh mục nào được gắn bao nhiêu lần.
  const byNote = new Map<string, Map<string, number>>()
  for (const t of history) {
    if (t.type !== 'expense' || !t.category_id || !t.note) continue
    const k = normalizeMerchant(t.note)
    if (!k) continue
    const inner = byNote.get(k) ?? new Map<string, number>()
    inner.set(t.category_id, (inner.get(t.category_id) ?? 0) + 1)
    byNote.set(k, inner)
  }

  const byName = new Map<string, string>()
  for (const c of categories) byName.set(nameKey(c.name), c.id)
  const valid = new Set(categories.map((c) => c.id))

  const out = new Map<string, CategoryGuess>()
  for (const merchant of merchants) {
    const nm = normalizeMerchant(merchant)
    if (!nm) continue

    // (1) Sổ của chính người dùng — khớp y hệt trước, rồi mới khớp chứa nhau.
    const exact = byNote.get(nm)
    let fromHistory = exact ? topOf(exact) : null
    if (!fromHistory && nm.length >= 3) {
      const pooled = new Map<string, number>()
      for (const [note, inner] of byNote) {
        // Ghi chú ngắn quá thì "chứa nhau" thành ngẫu nhiên, bỏ.
        if (note.length < 3) continue
        if (!note.includes(nm) && !nm.includes(note)) continue
        for (const [cat, n] of inner) pooled.set(cat, (pooled.get(cat) ?? 0) + n)
      }
      if (pooled.size > 0) fromHistory = topOf(pooled)
    }
    if (fromHistory && valid.has(fromHistory)) {
      out.set(merchant, { categoryId: fromHistory, source: 'history' })
      continue
    }

    // (2) Bảng dựng sẵn.
    const hit = FLAT.find((f) => nm.includes(f.needle))
    if (!hit) continue
    for (const name of hit.categories) {
      const id = byName.get(nameKey(name))
      if (id) {
        out.set(merchant, { categoryId: id, source: 'builtin' })
        break
      }
    }
  }
  return out
}
