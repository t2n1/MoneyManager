// Design system — tầng primitive. Token ngữ nghĩa ở src/index.css, tài liệu ở
// docs/design-system.md. Ràng buộc được kiểm bằng designSystem.test.ts.
export { ActionButton, actionButtonClass, type ActionButtonVariant } from './ActionButton'
export { Card, type CardElevation, type CardPadding } from './Card'
export { Collapse } from './Collapse'
export { IconButton, iconButtonClass, type IconButtonVariant } from './IconButton'
export { Money, type MoneyTone } from './Money'
export { Num, deltaTone, pct1, signedPct, type NumTone } from './Num'
export { SectionTitle, type TitleRole } from './SectionTitle'
export { PageHeader } from './PageHeader'
export { FilterChip, filterChipClass, type FilterChipSize } from './FilterChip'
export { Select } from './Select'
export { EmptyState } from './EmptyState'
export { Sparkline } from './Sparkline'
export { StatTile } from './StatTile'
export { Swap } from './Swap'
export { StatusChip } from './StatusChip'
export { StatusDot } from './StatusDot'
export {
  STATUS_CHIP,
  STATUS_FILL,
  STATUS_STROKE,
  type StatusTone,
} from './statusColors'
export {
  SegmentedControl,
  type SegmentedItem,
  type SegmentedSize,
} from './SegmentedControl'
