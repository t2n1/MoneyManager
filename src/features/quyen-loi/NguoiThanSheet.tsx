// Thêm / sửa một người thân nhận tiền. Ba ô: tên, năm sinh, quan hệ. Năm sinh BẮT BUỘC —
// tuổi quyết định ngưỡng 38万 và mức khấu trừ, không có thì bộ kiểm không nói được gì.
import { useState } from 'react'
import { ActionButton, SectionTitle, Select } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { useEscClose } from '../../hooks/useEscClose'
import { useCreateRelative, useUpdateRelative } from '../../hooks/queries'
import { showToast } from '../../lib/dialog'
import type { RelativeRow, Relationship } from '../../types/database.types'

export const QUAN_HE: readonly (readonly [Relationship, string])[] = [
  ['parent', 'Cha / mẹ'],
  ['spouse', 'Vợ / chồng'],
  ['child', 'Con'],
  ['sibling', 'Anh / chị / em'],
  ['grandparent', 'Ông / bà'],
  ['other', 'Người thân khác'],
]

interface Props {
  /** null = thêm mới */
  relative: RelativeRow | null
  onClose: () => void
  /** Gọi sau khi lưu xong (form gửi tiền dùng để chọn luôn người vừa thêm). */
  onSaved?: (r: RelativeRow) => void
}

export function NguoiThanSheet({ relative, onClose, onSaved }: Props) {
  useEscClose(onClose)
  const create = useCreateRelative()
  const update = useUpdateRelative()
  const [name, setName] = useState(relative?.name ?? '')
  const [birthYear, setBirthYear] = useState(relative ? String(relative.birth_year) : '')
  const [relationship, setRelationship] = useState<Relationship>(relative?.relationship ?? 'parent')
  const [country, setCountry] = useState<'VN' | 'JP'>(relative?.country === 'JP' ? 'JP' : 'VN')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nam = Number(birthYear)
  const canSave = name.trim().length > 0 && Number.isInteger(nam) && nam >= 1900 && nam <= 2100 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const input = { name: name.trim(), birth_year: nam, relationship, country }
      const row = relative
        ? await update.mutateAsync({ id: relative.id, patch: input })
        : await create.mutateAsync(input)
      showToast(relative ? 'Đã sửa người thân' : 'Đã thêm người thân')
      onSaved?.(row)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
      setSaving(false)
    }
  }

  async function handleArchive() {
    if (!relative) return
    try {
      await update.mutateAsync({ id: relative.id, patch: { is_archived: !relative.is_archived } })
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Thao tác thất bại, thử lại.', 'error')
    }
  }

  const labelCls = 'mb-1 block text-sm font-medium text-fg-muted'
  // Chép nguyên từ ô tiêu đề của PlannedFormSheet (features/planned/PlannedFormSheet.tsx)
  // — không tự đặt màu/bán kính mới (guardrail tests/designSystem.test.ts).
  const inputCls = 'mb-3 w-full rounded-md border border-border-strong px-3 py-2 text-base sm:text-sm'

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-3">
          {relative ? 'Sửa người thân' : 'Thêm người thân'}
        </SectionTitle>
        <Guide className="mb-3 text-sm text-fg-muted">
          Khấu trừ người phụ thuộc tính riêng từng người, theo tuổi tại 31/12 — nên cần năm sinh.
        </Guide>

        <label className={labelCls} htmlFor="nt-name">Tên gọi</label>
        <input
          id="nt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mẹ, Em Hùng…"
          className={inputCls}
        />

        <label className={labelCls} htmlFor="nt-year">Năm sinh</label>
        <input
          id="nt-year"
          inputMode="numeric"
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="1958"
          className={inputCls}
        />

        <label className={labelCls} htmlFor="nt-rel">Quan hệ</label>
        <Select
          id="nt-rel"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value as Relationship)}
          wrapClassName="mb-3 w-full"
        >
          {QUAN_HE.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </Select>

        <label className={labelCls} htmlFor="nt-country">Đang sống ở</label>
        <Select
          id="nt-country"
          value={country}
          onChange={(e) => setCountry(e.target.value as 'VN' | 'JP')}
          wrapClassName="mb-3 w-full"
        >
          <option value="VN">Việt Nam (ngoài Nhật)</option>
          <option value="JP">Nhật — ngoài phạm vi khấu trừ này</option>
        </Select>

        {error && <p className="mb-2 text-sm text-money-out">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          {relative ? (
            <ActionButton variant="outline" onClick={handleArchive}>
              {relative.is_archived ? 'Hiện lại' : 'Ẩn người này'}
            </ActionButton>
          ) : <span />}
          <div className="flex gap-2">
            <ActionButton variant="outline" onClick={onClose}>Đóng</ActionButton>
            <ActionButton variant="primary" onClick={handleSave} disabled={!canSave}>Lưu</ActionButton>
          </div>
        </div>
      </div>
    </div>
  )
}
