// Bộ icon cho MỐC CUỘC ĐỜI (migration 0066).
//
// Vì sao cần: chip mốc trên đồ thị trước đây chỉ có mũi tên lên/xuống theo Thu/Chi, nên
// năm chip Chi nằm cạnh nhau trông y hệt nhau — phải đọc chữ mới biết cái nào là "Cưới",
// cái nào là "Mua nhà". Trên màn hẹp chữ lại bị cắt, tức đúng lúc cần phân biệt nhất thì
// không phân biệt được.
//
// VÌ SAO BỘ CHỌN SẴN CHỨ KHÔNG PHẢI EMOJI TỰ GÕ (người dùng chọn, 2026-09-07): icon ở
// đây bé (12–14px) và nằm trên nền màu của chip. Emoji thì mỗi hệ điều hành vẽ một kiểu,
// mang màu riêng không theo bảng màu của app, và không đổi theo chế độ Sáng/Tối — ba thứ
// đó ở cỡ 12px cho ra một vệt màu không đọc được. Icon lucide kế thừa `currentColor` nên
// tự đúng ở cả hai chế độ.
//
// KHOÁ LÀ CHUỖI, không phải số thứ tự: dòng DB mang `icon = 'cuoi-hoi'` thì đọc được
// bằng mắt trong bản sao lưu, và xoá một icon khỏi bộ này KHÔNG làm các icon khác đổi
// nghĩa. Khoá không còn trong bộ (dòng cũ, hoặc bộ bị rút gọn) rơi về mũi tên Thu/Chi —
// xem `EventIcon`.
import {
  Armchair,
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Car,
  CreditCard,
  Dog,
  Dumbbell,
  Gift,
  GraduationCap,
  Hammer,
  HandHeart,
  Heart,
  HeartPulse,
  House,
  Landmark,
  Luggage,
  MapPin,
  PiggyBank,
  Plane,
  Receipt,
  School,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Sunset,
  Trees,
  TreePalm,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import { tr, trx } from '../../i18n'

type IconComponent = typeof Heart

interface EventIconDef {
  /** Nhãn tiếng Việt — hiện trong bộ chọn và làm `aria-label`. */
  label: string
  Icon: IconComponent
}

/** Nhóm trong bộ chọn. Chỉ để xếp hàng cho dễ tìm, KHÔNG lưu xuống DB. */
export interface EventIconGroup {
  title: string
  keys: string[]
}

export const EVENT_ICONS: Record<string, EventIconDef> = {
  'cuoi-hoi': { label: tr('Cưới hỏi'), Icon: Heart },
  'sinh-con': { label: tr('Sinh con'), Icon: Baby },
  'gia-dinh': { label: tr('Gia đình'), Icon: Users },
  'cham-cha-me': { label: tr('Chăm cha mẹ'), Icon: HandHeart },
  'thu-cung': { label: tr('Thú cưng'), Icon: Dog },

  'hoc-phi': { label: tr('Học phí'), Icon: GraduationCap },
  truong: { label: tr('Trường học'), Icon: School },
  'sach-khoa-hoc': { label: tr('Sách, khoá học'), Icon: BookOpen },
  'viec-lam': { label: tr('Việc làm'), Icon: Briefcase },

  'mua-nha': { label: tr('Mua nhà'), Icon: House },
  'chung-cu': { label: tr('Chung cư'), Icon: Building2 },
  'sua-nha': { label: tr('Sửa nhà'), Icon: Hammer },
  'chuyen-nha': { label: tr('Chuyển nhà'), Icon: Truck },
  dat: { label: tr('Đất'), Icon: MapPin },
  'cay-vuon': { label: tr('Cây, vườn'), Icon: Trees },

  'xe-hoi': { label: tr('Xe hơi'), Icon: Car },
  'xe-may': { label: tr('Xe máy'), Icon: Bike },
  'may-bay': { label: tr('Máy bay, về nước'), Icon: Plane },
  'du-lich': { label: tr('Du lịch'), Icon: Luggage },
  'nghi-duong': { label: tr('Nghỉ dưỡng'), Icon: TreePalm },

  'y-te': { label: tr('Y tế'), Icon: Stethoscope },
  'benh-nang': { label: tr('Bệnh nặng'), Icon: HeartPulse },
  'the-thao': { label: tr('Thể thao'), Icon: Dumbbell },
  'an-uong': { label: tr('Ăn uống'), Icon: UtensilsCrossed },
  'do-dien-tu': { label: tr('Đồ điện tử'), Icon: Smartphone },

  'tiet-kiem': { label: tr('Tiết kiệm'), Icon: PiggyBank },
  'ngan-hang': { label: tr('Ngân hàng, vay'), Icon: Landmark },
  'tra-no': { label: tr('Trả nợ'), Icon: CreditCard },
  'dau-tu': { label: tr('Đầu tư'), Icon: TrendingUp },
  thue: { label: tr('Thuế'), Icon: Receipt },
  'bao-hiem': { label: tr('Bảo hiểm'), Icon: ShieldCheck },
  'qua-tang': { label: tr('Quà, được tặng'), Icon: Gift },

  'nghi-huu': { label: tr('Nghỉ hưu'), Icon: Armchair },
  'cuoi-doi': { label: tr('Cuối đời'), Icon: Sunset },
}

export const EVENT_ICON_GROUPS: EventIconGroup[] = [
  { title: tr('Gia đình'), keys: ['cuoi-hoi', 'sinh-con', 'gia-dinh', 'cham-cha-me', 'thu-cung'] },
  { title: tr('Học và việc'), keys: ['hoc-phi', 'truong', 'sach-khoa-hoc', 'viec-lam'] },
  { title: tr('Nhà và đất'), keys: ['mua-nha', 'chung-cu', 'sua-nha', 'chuyen-nha', 'dat', 'cay-vuon'] },
  { title: tr('Đi lại'), keys: ['xe-hoi', 'xe-may', 'may-bay', 'du-lich', 'nghi-duong'] },
  { title: tr('Sức khoẻ và đồ dùng'), keys: ['y-te', 'benh-nang', 'the-thao', 'an-uong', 'do-dien-tu'] },
  {
    title: trx('group', 'Tiền'),
    keys: ['tiet-kiem', 'ngan-hang', 'tra-no', 'dau-tu', 'thue', 'bao-hiem', 'qua-tang'],
  },
  { title: tr('Về sau'), keys: ['nghi-huu', 'cuoi-doi'] },
]

/** Nhãn tiếng Việt của một khoá icon; chuỗi rỗng khi khoá không có trong bộ. */
export function eventIconLabel(icon: string | null | undefined): string {
  if (!icon) return ''
  return EVENT_ICONS[icon]?.label ?? ''
}

/**
 * Icon của một mốc. Không có icon riêng — hoặc mang khoá không còn trong bộ — thì về
 * mũi tên lên/xuống theo `kind`, đúng thứ chip mốc vẽ trước migration 0066.
 *
 * `aria-hidden` trong CẢ HAI nhánh: chip mốc đã đọc ra "2029 · Cưới" bằng chữ, nên icon
 * là hình minh hoạ, không phải thông tin. Đặt `aria-label` ở đây sẽ khiến người dùng
 * screen reader nghe tên icon rồi nghe lại tên mốc.
 */
export function EventIcon({
  icon,
  kind,
  className = 'h-3 w-3 shrink-0',
}: {
  icon: string | null | undefined
  kind: 'income' | 'expense'
  className?: string
}) {
  const def = icon ? EVENT_ICONS[icon] : undefined
  const Icon = def?.Icon ?? (kind === 'income' ? TrendingUp : TrendingDown)
  // strokeWidth 1.6 giống `AccountTypeIcon`: nét 2px mặc định của lucide bên cạnh chữ
  // 11–13px giành mất điểm nhìn của chính dòng nó đứng cạnh.
  return <Icon className={className} strokeWidth={1.6} aria-hidden />
}
