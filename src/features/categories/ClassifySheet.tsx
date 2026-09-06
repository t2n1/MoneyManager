// Bảng chọn phân loại — BA trục của một danh mục Chi trong một lần mở.
//
// ---- Vì sao có file này (gộp Danh mục · Phân loại, 06/09/2026) ---------------------
//
// Trước bản này, cùng ba trục `kind` / `need_level` / `cost_type` sửa được ở HAI chỗ:
// form "Sửa danh mục" (CategoriesPage) và trang Phân loại chi tiêu riêng. Hai giao diện
// cho một bảng dữ liệu là kiểu nợ chỉ lộ ra khi luật đổi mà chỉ một bên được sửa.
//
// Gộp lại thì form chỉ còn DANH TÍNH (tên, biểu tượng, cha, Chi/Thu) và bảng này giữ trọn
// Ý NGHĨA. `kind` đi cùng hai trục kia chứ không ở lại form vì nó là câu hỏi cùng họ, và
// đứng ĐẦU thì nó làm được việc mà ở form nó không làm được: chọn "Chuyển tài sản" là hai
// trục dưới tự biến mất — chúng vô nghĩa với khoản không phải tiêu.
//
// Draft nằm trong chính component, nơi gọi truyền `key` để mở danh mục khác là state mới:
// nhấc draft lên trên thành hai nguồn phải đồng bộ tay mỗi lần mở.
import { useState } from 'react'
import { useEscClose } from '../../hooks/useEscClose'
import type { CategoryKind, CategoryRow, CostType, NeedLevel } from '../../types/database.types'
import { COST_OPTIONS, KIND_OPTIONS, NEED_OPTIONS } from './ClassificationToggle'
import { ActionButton, Card, FilterChip, Num, SectionTitle } from '../../components/ui'

/** Ba trục phân loại — thứ bảng này trả về khi lưu. */
export interface ClassifyValue {
  kind: CategoryKind
  need_level: NeedLevel | null
  cost_type: CostType | null
}

/** Bảng đang mở cho ai: một danh mục, hay cả nhóm của một danh mục cha. */
export type ClassifyTarget =
  | { mode: 'one'; category: CategoryRow; parent: CategoryRow | null }
  | { mode: 'group'; parent: CategoryRow; memberCount: number }

/**
 * `NEED_OPTIONS`/`COST_OPTIONS` mỗi cái đều gồm cả mục "Chưa" (giá trị `null`) — bảng
 * chọn chỉ bày giá trị THẬT ("Chưa" đi bằng nút "Xoá phân loại" riêng, để 5 chip không
 * chen một lựa chọn chẳng ai chủ động chọn). Ép kiểu tường minh vì phần tử của hai hằng
 * trên là union các tuple literal (do `as const satisfies`) — type predicate không tự
 * thu hẹp được từ đó.
 */
const NEED_CHOICES = (
  NEED_OPTIONS as readonly (readonly [NeedLevel | null, string])[]
).filter((o): o is readonly [NeedLevel, string] => o[0] !== null)
const COST_CHOICES = (
  COST_OPTIONS as readonly (readonly [CostType | null, string])[]
).filter((o): o is readonly [CostType, string] => o[0] !== null)

const needLabel = (v: NeedLevel) => NEED_CHOICES.find(([o]) => o === v)![1]
const costLabel = (v: CostType) => COST_CHOICES.find(([o]) => o === v)![1]

/**
 * Chữ mô tả một tổ hợp đã chọn đủ — dùng cho câu xác nhận "Gán «…» cho nhóm X?".
 * `null` = chưa chọn đủ, nơi gọi khoá nút Lưu theo đúng giá trị này.
 */
export function classifyLabel(v: ClassifyValue): string | null {
  if (v.kind === 'transfer') return 'Chuyển tài sản'
  if (v.need_level === null || v.cost_type === null) return null
  return `${needLabel(v.need_level)} · ${costLabel(v.cost_type)}`
}

interface Props {
  target: ClassifyTarget
  onClose: () => void
  /** Lưu cho MỘT danh mục. Chỉ gọi khi `classifyLabel` khác null. */
  onSave: (v: ClassifyValue) => void
  /** Gán cho CẢ nhóm. `label` là chữ đã chốt, để câu xác nhận nói đúng cái vừa chọn. */
  onApplyGroup: (v: ClassifyValue, label: string) => void
  /** Xoá cả ba trục về "chưa"; `null` = không có gì để xoá nên nút không hiện. */
  onClear: (() => void) | null
  /** Nhảy sang mục chưa xong kế tiếp; `null` = hết, nút "Bỏ qua" và chữ "→" biến mất. */
  onSkip: (() => void) | null
  saving: boolean
}

export function ClassifySheet({ target, onClose, onSave, onApplyGroup, onClear, onSkip, saving }: Props) {
  useEscClose(onClose)

  // Nhóm KHÔNG mồi chip: một nhóm không có "giá trị hiện tại" chung, mồi bằng giá trị của
  // riêng danh mục cha là nói dối về 5 đứa con bên dưới.
  const seed = target.mode === 'one' ? target.category : null
  const [kind, setKind] = useState<CategoryKind>(seed?.kind ?? 'expense')
  const [need, setNeed] = useState<NeedLevel | null>(seed?.need_level ?? null)
  const [cost, setCost] = useState<CostType | null>(seed?.cost_type ?? null)

  // 'transfer' KHÔNG mang theo hai trục kia: khoản không phải tiêu thì không có tính chất
  // cũng không có loại chi, và giữ lại giá trị cũ là để một số chết nằm trong DB chờ ngày
  // ai đó đọc nhầm.
  const value: ClassifyValue =
    kind === 'transfer'
      ? { kind, need_level: null, cost_type: null }
      : { kind, need_level: need, cost_type: cost }
  const label = classifyLabel(value)

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <SectionTitle role="block">
            {target.mode === 'group' ? (
              <>Áp cho cả nhóm {target.parent.name}</>
            ) : (
              <>
                <span aria-hidden>{target.category.icon}</span> {target.category.name}
              </>
            )}
          </SectionTitle>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Đóng
          </button>
        </div>

        {target.mode === 'group' ? (
          // font-medium: đây là NHÃN dữ liệu (đếm thành viên nhóm), không phải văn xuôi
          // dạy — guardrail của bộ design system phân theo đó.
          <p className="text-sm font-medium text-fg-muted">
            <span aria-hidden>{target.parent.icon}</span>{' '}
            <Num tone="muted">{target.memberCount}</Num> danh mục, tính cả nhóm cha
          </p>
        ) : target.parent ? (
          <p className="text-sm text-fg-muted">
            thuộc nhóm <span aria-hidden>{target.parent.icon}</span> {target.parent.name}
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-3">
          <Card as="section" padding="md">
            <SectionTitle role="micro" as="h3">
              Khoản này là
            </SectionTitle>
            <div role="group" aria-label="Khoản này là" className="mt-1.5 flex flex-wrap gap-2">
              {KIND_OPTIONS.map(([v, text]) => (
                <FilterChip key={v} on={kind === v} onClick={() => setKind(v)}>
                  {text}
                </FilterChip>
              ))}
            </div>

            {kind === 'transfer' ? (
              <p className="mt-3 rounded-lg bg-state-warn-bg px-3 py-2 text-2xs text-state-warn-fg">
                Chuyển tài sản = tiền vẫn của bạn, chỉ đứng ở chỗ khác (gửi về VN, nạp đầu
                tư, điều chỉnh số dư). Khoản này sẽ <b>không</b> vào tổng chi, không vào tỷ
                lệ giữ lại, và <b>không đặt được hạn mức</b> — nên cũng không cần Tính chất
                hay Loại chi.
              </p>
            ) : (
              <>
                <SectionTitle role="micro" as="h3" className="mt-3">
                  Tính chất
                </SectionTitle>
                <div role="group" aria-label="Tính chất" className="mt-1.5 flex flex-wrap gap-2">
                  {NEED_CHOICES.map(([v, text]) => (
                    <FilterChip key={v} on={need === v} onClick={() => setNeed(v)}>
                      {text}
                    </FilterChip>
                  ))}
                </div>
                <SectionTitle role="micro" as="h3" className="mt-3">
                  Loại chi
                </SectionTitle>
                <div role="group" aria-label="Loại chi" className="mt-1.5 flex flex-wrap gap-2">
                  {COST_CHOICES.map(([v, text]) => (
                    <FilterChip key={v} on={cost === v} onClick={() => setCost(v)}>
                      {text}
                    </FilterChip>
                  ))}
                </div>
              </>
            )}
          </Card>

          {target.mode === 'group' ? (
            <ActionButton
              variant="primary"
              className="w-full"
              disabled={label === null || saving}
              onClick={() => label !== null && onApplyGroup(value, label)}
            >
              Gán cho cả nhóm
            </ActionButton>
          ) : (
            <>
              <ActionButton
                variant="primary"
                className="w-full"
                disabled={label === null}
                onClick={() => label !== null && onSave(value)}
              >
                {onSkip ? 'Lưu · mục kế tiếp →' : 'Lưu'}
              </ActionButton>
              {(onSkip || onClear) && (
                <div className="flex items-center justify-between">
                  {onClear ? (
                    <button
                      type="button"
                      onClick={onClear}
                      className="text-sm text-fg-muted hover:text-fg-primary"
                    >
                      Xoá phân loại
                    </button>
                  ) : (
                    <span />
                  )}
                  {onSkip && (
                    <button
                      type="button"
                      onClick={onSkip}
                      className="text-sm font-medium text-fg-accent"
                    >
                      Bỏ qua — mục kế tiếp ›
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
