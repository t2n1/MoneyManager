// Chọn nhãn khi nhập/sửa giao dịch. Nhãn là thứ CẮT NGANG danh mục: một bữa ăn
// vẫn thuộc danh mục "Ăn ngoài" nhưng có thể mang nhãn "Về VN 2026" để cuối năm
// cộng được tổng chi phí cả chuyến.
//
// Nhãn xếp theo NHÓM (migration 0039): mỗi nhóm là một câu hỏi — "Ai?", "Ở đâu?" —
// và tên nhóm nằm CÙNG HÀNG với chip của nó, một nhóm một hàng. Nhãn ngoài nhóm nằm
// ở mục "Khác" cuối cùng.
//
// Khối này nói đúng thứ tiếng của form Nhập, không tự nghĩ luật riêng (thiết kế
// 2026-08-12):
//  - Chip chưa chọn thì XÁM (`CHIP_OFF`), chọn rồi mới lên màu của nhãn — y như nút
//    "Nhắc sau" / "Lặp lại" cạnh ô ngày.
//  - Cao 44px như mọi chip khác trong trang.
//  - Không có nút "+ mới" ở từng nhóm. Tạo nhãn bằng cách gõ tên vào ô nhập, rồi bấm
//    chip "＋ Tạo …" của đúng nhóm muốn đặt vào.
//
// Nhãn theo dịp/dự án chỉ tăng theo thời gian, nên khối này KHÔNG vẽ hết. Mỗi nhóm chỉ
// hiện vài nhãn dùng nhiều nhất + nhãn đang chọn, còn lại nằm sau nút "Tất cả" kèm ô
// tìm. Xếp hạng nằm trong `pickerSections`, số nhãn hiện sẵn trong `collapsedLimit`.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Search, Tag as TagIcon } from 'lucide-react'
import {
  useCreateTag,
  useTagGroups,
  useTags,
  useTransactionTags,
  useUpdateTag,
} from '../../hooks/queries'
import { CHIP_OFF } from '../../components/chip'
import { normalizeText } from '../transactions/filter'
import type { TagRow } from '../../types/database.types'
import { collapsedLimit, createTargets, pickerSections } from './groups'
import { TAG_CHIP_CLASS, tagColor } from './colors'

/**
 * Ngưỡng hiện ô tìm. Dưới ngưỡng thì mở "Tất cả" ra chỉ có danh sách, không có ô nào:
 * "Tìm trong 5 nhãn…" là một ô vô nghĩa chiếm 36px, mắt đọc 5 nhãn nhanh hơn tay gõ.
 */
const SEARCH_FROM = 6

/**
 * `truncate` KHÔNG đặt ở nền chung mà ở <span> con: trên hộp `inline-flex` thì
 * text-overflow không cắt chữ của con, tên nhãn dài sẽ tràn ra thay vì hiện "…".
 */
const CHIP =
  'inline-flex min-h-11 max-w-full items-center rounded-full border px-3.5 text-sm transition active:scale-95'

const LINK = 'inline-flex min-h-9 items-center gap-0.5 text-xs font-medium text-green-700 dark:text-green-400'

interface Props {
  /** id nhãn đang chọn */
  value: string[]
  onChange: (next: string[]) => void
}

export function TagPicker({ value, onChange }: Props) {
  const { data: tags = [] } = useTags()
  const { data: groups = [] } = useTagGroups()
  const { data: links = [] } = useTransactionTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  /** 'create' = mở bằng nút "Thêm nhãn" → ô nhập tự bật con trỏ. */
  const [openMode, setOpenMode] = useState<'browse' | 'create'>('browse')
  const rootRef = useRef<HTMLDivElement>(null)
  const uid = useId()

  const selected = new Set(value)
  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id])

  const limit = collapsedLimit(groups.length)
  const sections = useMemo(
    () => pickerSections(tags, groups, links, value, limit),
    [tags, groups, links, value, limit],
  )
  const total = sections.reduce((n, s) => n + s.shown.length + s.rest.length, 0)
  const hasRest = sections.some((s) => s.rest.length > 0)

  const targets = useMemo(() => createTargets(tags, sections, query), [tags, sections, query])
  const creating = targets.length > 0
  // Ô nhập có hai vai: tìm nhãn, và nhập tên nhãn mới. Buộc nút "＋ Thêm nhãn" ở dưới
  // vào việc ô này đang ẩn → luôn có ĐÚNG MỘT đường tạo nhãn nhìn thấy được.
  const inputShown = expanded && (total >= SEARCH_FROM || openMode === 'create')

  // Mở "Tất cả" thì tìm được theo tên, bỏ dấu (dùng lại normalizeText của Tìm kiếm).
  // Tìm xuyên mọi mục, nhưng kết quả vẫn nằm đúng mục của nó.
  const needle = normalizeText(query)
  const visible = useMemo(
    () =>
      sections
        .map((s) => {
          const all = expanded ? [...s.shown, ...s.rest] : s.shown
          return {
            ...s,
            list: needle ? all.filter((t) => normalizeText(t.name).includes(needle)) : all,
          }
        })
        // Mục nào không còn nhãn nào khớp thì ẩn cả tên, không để lại hàng trống. TRỪ
        // khi đang mời tạo: ẩn đi là mất luôn đường tạo nhãn vào mục đó.
        .filter((s) => creating || !needle || s.list.length > 0),
    [sections, expanded, needle, creating],
  )

  // Chưa có nhóm nào và chưa có nhãn nào: `sections` rỗng nên không có hàng nào để vẽ
  // chip tạo vào. Vẽ một hàng ảo "Khác" — không thì đúng lúc đó app không tạo được nhãn.
  const rows =
    creating && sections.length === 0
      ? [{ group: null, shown: [], rest: [], list: [] as TagRow[] }]
      : visible

  // Bàn phím hệ thống bật lên che chip tạo (nó nằm ngay dưới ô nhập, mà khối này ở gần
  // đáy vùng cuộn của form).
  useEffect(() => {
    if (expanded && openMode === 'create') rootRef.current?.scrollIntoView({ block: 'center' })
  }, [expanded, openMode])

  async function addTag(groupId: string | null, rawName: string) {
    const name = rawName.trim()
    if (!name) return
    // Gõ đúng tên nhãn đã có thì chọn luôn thay vì báo lỗi trùng. `createTargets` đã
    // chặn ca này, đây là lưới an toàn cho ca đua (máy khác vừa tạo nhãn cùng tên).
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      // Dùng lại một nhãn đã lưu trữ = nó sống lại, không thì chip vừa chọn sẽ
      // biến mất khỏi ô chọn ở lần nhập sau mà không rõ vì sao.
      if (existing.is_archived) updateTag.mutate({ id: existing.id, patch: { is_archived: false } })
      if (!selected.has(existing.id)) onChange([...value, existing.id])
    } else {
      // Xoay vòng bảng màu theo số nhãn hiện có để các nhãn không trùng màu nhau
      const palette = ['sky', 'green', 'amber', 'pink', 'indigo', 'red', 'gray']
      // try/catch: tạo nhãn hỏng (trùng tên trên DB, offline) thì GIỮ chữ vừa gõ + giữ
      // khối đang mở để sửa lại, thay vì unhandled rejection và mất chữ. `return` TRƯỚC
      // khi dọn query ở dưới — đó mới là chỗ giữ lại chữ vừa gõ.
      let created
      try {
        created = await createTag.mutateAsync({
          name,
          color: palette[tags.length % palette.length],
          // Tạo ngay trong nhóm vừa bấm: nhãn mới sinh ra đã đúng chỗ, không đẻ thêm
          // việc "vào Cài đặt xếp lại sau".
          group_id: groupId,
        })
      } catch {
        return
      }
      onChange([...value, created.id])
    }
    setQuery('')
    setExpanded(false)
  }

  const chip = (t: TagRow) => {
    const on = selected.has(t.id)
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => toggle(t.id)}
        aria-pressed={on}
        // `border-transparent` chứ không bỏ viền: bỏ hẳn thì chip đã chọn hẹp hơn 2px và
        // bấm một chip sẽ đẩy các chip sau nó nhảy chỗ. CategoryTile cũng làm cách này.
        //
        // Và KHÔNG đổi độ đậm chữ theo trạng thái: đo trên 375×812 thấy `font-medium` ở
        // riêng trạng thái đã chọn làm chip rộng thêm 1px, đủ để đẩy các chip sau nó
        // dịch chỗ. Đã chọn hay chưa phân biệt bằng nền + màu chữ + viền, cả ba đều
        // không đổi kích thước. Nhãn màu xám là ca sát nhất: nền L 0.21 → 0.278, chữ
        // L 0.707 → 0.872, viền biến mất — vẫn đọc ra được, đã soi ở nền tối.
        className={`${CHIP} ${
          on ? `border-transparent ${TAG_CHIP_CLASS[tagColor(t.color)]}` : CHIP_OFF
        }`}
      >
        <span className="truncate">{t.name}</span>
      </button>
    )
  }

  return (
    <div ref={rootRef}>
      {/* <span> chứ không <label>: đây là tiêu đề cho CẢ khối (nhiều hàng chip + ô nhập
          + nút "Tất cả"), không có một ô nào để `htmlFor` trỏ vào. Từng control bên
          trong đã tự mang tên (`aria-label` ở ô nhập, tên nhóm ở từng hàng).
          Cỡ chữ theo `labelCls` của roleFields — app đã có token cho nhãn của một nhóm
          chip, không tự nghĩ ra cỡ mới. */}
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-fg-muted">
        <TagIcon className="h-3.5 w-3.5" aria-hidden />
        Nhãn <span className="font-normal">(tùy chọn)</span>
      </span>

      {inputShown && (
        <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2 focus-within:ring-2 focus-within:ring-green-500">
          {openMode === 'create' ? (
            <Plus className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
          ) : (
            <Search className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
          )}
          {/* Tự bật con trỏ CHỈ ở chế độ tạo: mở "Tất cả" để LƯỚT là chuyện thường, bàn
              phím tự bật lên che mất danh sách vừa mở thì hại hơn lợi. */}
          <input
            autoFocus={openMode === 'create'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={openMode === 'create' ? 'Tên nhãn mới…' : `Tìm trong ${total} nhãn…`}
            aria-label={openMode === 'create' ? 'Tên nhãn mới' : 'Tìm nhãn'}
            className="min-h-9 min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
          />
        </div>
      )}

      {/* Mở rộng thì cho cả khối cuộn riêng, đừng đẩy dài vô hạn vùng cuộn của form */}
      <div className={`flex flex-col gap-1.5 ${expanded ? 'max-h-56 overflow-y-auto' : ''}`}>
        {rows.map((s) => {
          const groupId = s.group?.id ?? ''
          const target = targets.find((x) => (x.group?.id ?? '') === groupId)
          const name = s.group?.name ?? 'Khác'
          const labelId = `${uid}-${s.group?.id ?? 'other'}`
          const empty = s.list.length === 0 && !target
          return (
            <div
              key={labelId}
              role="group"
              aria-labelledby={labelId}
              className="flex items-start gap-2"
            >
              {/* Cao bằng hàng đầu, không thì chữ lệch so với chip.
                  Rộng 56px: đo với hai tên thật ("Ai?", "Ở đâu?") thì tên dài nhất chiếm
                  40px, còn dư. Tên nhóm do người dùng tự đặt nên vẫn `truncate` + `title`
                  cho ca đặt tên dài. */}
              <span
                id={labelId}
                title={name}
                className={`flex w-14 shrink-0 items-center text-xs font-medium text-fg-muted ${
                  empty ? 'h-7' : 'h-11'
                }`}
              >
                <span className="truncate">{name}</span>
              </span>
              {empty ? (
                <span className="flex h-7 items-center text-xs text-fg-muted">chưa có nhãn</span>
              ) : (
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {s.list.map(chip)}
                  {target && (
                    <button
                      type="button"
                      onClick={() => void addTag(target.group?.id ?? null, query)}
                      className={`${CHIP} border-dashed border-border-strong text-green-700 dark:text-green-400`}
                    >
                      <Plus className="mr-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">Tạo “{query.trim()}”</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Gần như không bao giờ hiện: không khớp gì thì đã có chip "＋ Tạo …" thay chỗ.
            Còn lại đúng MỘT ca — gõ đúng tên một nhãn đã lưu trữ: `createTargets` không
            mời tạo (tạo sẽ trùng tên), mà nhãn lưu trữ thì không nằm trong danh sách.
            Đường bật lại nhãn đó là Cài đặt → Nhãn. Đã thử ghi câu chỉ đường ngay đây,
            nhưng câu chỉ đường KHÔNG được bọc <Guide> (xem Guide.tsx) nên nó thành một
            đoạn văn xuôi mới, tức phải nâng trần của test canh chế độ Gọn — quá đắt cho
            một ca hiếm đến vậy. */}
        {needle && !creating && visible.length === 0 && (
          <p className="py-1 text-xs text-fg-muted">Không có nhãn nào khớp “{query}”</p>
        )}
      </div>

      {/* Hàng đáy: mở/thu gọn + tạo nhãn. Nút tạo buộc vào "ô nhập đang ẩn" nên LUÔN có
          đúng một đường tạo nhãn nhìn thấy được — không dư, không ngõ cụt. */}
      <div className="mt-1 flex items-center gap-3">
        {(hasRest || expanded) && (
          <button
            type="button"
            onClick={() => {
              setExpanded((e) => !e)
              setOpenMode('browse')
              setQuery('')
            }}
            aria-expanded={expanded}
            className={LINK}
          >
            {expanded ? (
              <>
                Thu gọn <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              </>
            ) : (
              <>
                Tất cả ({total}) <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </>
            )}
          </button>
        )}
        {!inputShown && (
          <button
            type="button"
            onClick={() => {
              setExpanded(true)
              setOpenMode('create')
              setQuery('')
            }}
            className={LINK}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Thêm nhãn
          </button>
        )}
      </div>
    </div>
  )
}
