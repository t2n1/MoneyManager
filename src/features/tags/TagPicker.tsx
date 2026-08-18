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
//  - Tạo nhãn bằng dấu "+" ở CUỐI TỪNG HÀNG: bấm là hiện ngay ô gõ tên tại đúng hàng
//    đó, xong là nhãn nằm luôn trong nhóm ấy. Trước đây phải gõ tên vào ô nhập chung
//    rồi bấm chip "＋ Tạo …", còn dưới cùng có thêm nút "＋ Thêm nhãn" — ba thứ cho một
//    việc, và cái nút dưới cùng làm form dài thêm một hàng.
//    Ô nhập chung giờ chỉ còn một vai: TÌM nhãn.
//
// Nhãn theo dịp/dự án chỉ tăng theo thời gian, nên khối này KHÔNG vẽ hết. Mỗi nhóm chỉ
// hiện vài nhãn dùng nhiều nhất + nhãn đang chọn, còn lại nằm sau nút "Tất cả" kèm ô
// tìm. Xếp hạng nằm trong `pickerSections`, số nhãn hiện sẵn trong `collapsedLimit`.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Plus, Search, Tag as TagIcon, X } from 'lucide-react'
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
import { collapsedLimit, pickerSections } from './groups'
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

const LINK = 'inline-flex min-h-9 items-center gap-0.5 text-xs font-medium text-fg-accent'

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
  /**
   * Hàng đang mở ô "tên nhãn mới": id nhóm, hoặc '' cho hàng "Khác" (nhãn không nhóm).
   * null = không hàng nào đang mở. Dùng '' thay vì null cho hàng Khác để phân biệt
   * được với "đang đóng".
   */
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
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

  // Ô nhập chung giờ chỉ để TÌM (việc tạo đã về dấu "+" của từng hàng), nên chỉ hiện
  // khi mở "Tất cả" và có đủ nhãn để phải tìm.
  const inputShown = expanded && total >= SEARCH_FROM

  // Mở "Tất cả" thì tìm được theo tên, bỏ dấu (dùng lại normalizeText của Tìm kiếm).
  // Tìm xuyên mọi mục, nhưng kết quả vẫn nằm đúng mục của nó.
  const needle = normalizeText(query)
  const visible = useMemo(() => {
    const withList = sections.map((s) => {
      const all = expanded ? [...s.shown, ...s.rest] : s.shown
      return {
        ...s,
        list: needle ? all.filter((t) => normalizeText(t.name).includes(needle)) : all,
      }
    })
    // Mục nào không còn nhãn nào khớp thì ẩn cả tên, không để lại hàng trống. TRỪ hàng
    // đang mở ô gõ tên (ẩn đi là ô nhập biến mất giữa lúc đang gõ), và TRỪ khi chẳng
    // mục nào khớp — lúc đó phải giữ đủ các hàng, vì dấu + của chúng chính là đường
    // tạo nhãn mà câu "không có nhãn nào khớp" đang chỉ tới.
    if (!needle || !withList.some((s) => s.list.length > 0)) return withList
    return withList.filter((s) => s.list.length > 0 || (s.group?.id ?? '') === addingTo)
  }, [sections, expanded, needle, addingTo])

  // Chưa có nhóm nào và chưa có nhãn nào: `sections` rỗng nên không có hàng nào để vẽ
  // dấu "+" vào. Vẽ một hàng ảo "Khác" — không thì đúng lúc đó app không tạo được nhãn.
  const rows =
    sections.length === 0
      ? [{ group: null, shown: [], rest: [], list: [] as TagRow[] }]
      : visible

  // Bàn phím hệ thống bật lên che ô vừa mở (khối này ở gần đáy vùng cuộn của form).
  useEffect(() => {
    if (addingTo !== null) rootRef.current?.scrollIntoView({ block: 'center' })
  }, [addingTo])

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
    setNewName('')
    setAddingTo(null)
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
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
          {/* KHÔNG tự bật con trỏ: mở "Tất cả" để LƯỚT là chuyện thường, bàn phím tự
              bật lên che mất danh sách vừa mở thì hại hơn lợi. */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Tìm trong ${total} nhãn…`}
            aria-label="Tìm nhãn"
            className="min-h-9 min-w-0 flex-1 bg-transparent py-1 text-sm"
          />
        </div>
      )}

      {/* Mở rộng thì cho cả khối cuộn riêng, đừng đẩy dài vô hạn vùng cuộn của form */}
      <div className={`flex flex-col gap-1.5 ${expanded ? 'max-h-56 overflow-y-auto' : ''}`}>
        {rows.map((s) => {
          const groupId = s.group?.id ?? ''
          const adding = addingTo === groupId
          const name = s.group?.name ?? 'Khác'
          const labelId = `${uid}-${s.group?.id ?? 'other'}`
          const empty = s.list.length === 0 && !adding
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
                className="flex h-11 w-14 shrink-0 items-center text-xs font-medium text-fg-muted"
              >
                <span className="truncate">{name}</span>
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {empty && (
                  <span className="flex h-11 items-center text-xs text-fg-muted">chưa có nhãn</span>
                )}
                {s.list.map(chip)}
                {adding ? (
                  // Ô gõ tên nằm NGAY trong hàng, cùng dòng với các chip: nhãn tạo ra
                  // thuộc đúng nhóm này, không phải chọn nhóm thêm một bước nữa.
                  // Enter để lưu, Esc/✕ để bỏ. Có nút ✓ vì bàn phím điện thoại không
                  // phải lúc nào cũng có Enter dễ thấy.
                  <span className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-border-strong bg-surface pl-3 pr-1 focus-within:ring-2 focus-within:ring-green-500">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void addTag(s.group?.id ?? null, newName)
                        }
                        if (e.key === 'Escape') {
                          // Chặn để sheet mẹ đang nghe Esc không đóng theo, mất cả form.
                          e.preventDefault()
                          e.stopPropagation()
                          setAddingTo(null)
                        }
                      }}
                      placeholder={`Tên nhãn mới trong “${name}”…`}
                      aria-label={`Tên nhãn mới trong nhóm ${name}`}
                      className="min-h-11 min-w-0 flex-1 bg-transparent text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void addTag(s.group?.id ?? null, newName)}
                      disabled={!newName.trim()}
                      aria-label={`Lưu nhãn mới vào nhóm ${name}`}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-accent disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingTo(null)}
                      aria-label="Bỏ tạo nhãn"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      // Đang tìm mà không thấy thì lấy luôn chữ vừa gõ làm tên nhãn mới —
                      // gõ lại lần nữa là việc thừa.
                      setNewName(query.trim())
                      setAddingTo(groupId)
                    }}
                    aria-label={`Thêm nhãn vào nhóm ${name}`}
                    className={`${CHIP} w-11 justify-center border-dashed border-border-strong px-0 text-fg-accent`}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
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
        {/* Không thêm câu "bấm + để tạo" vào đây: các hàng vẫn còn nguyên bên trên
            (xem `visible`) nên dấu + đang nhìn thấy được, mà câu dài hơn 45 ký tự thì
            thành một đoạn văn xuôi mới phải đi qua cổng <Guide> (test canh chế độ Gọn). */}
        {needle && visible.length === 0 && (
          <p className="py-1 text-xs text-fg-muted">Không có nhãn nào khớp “{query}”</p>
        )}
      </div>

      {/* Hàng đáy chỉ còn mở/thu gọn. Nút "＋ Thêm nhãn" đã về dấu + của từng hàng. */}
      <div className="mt-1 flex items-center gap-3">
        {(hasRest || expanded) && (
          <button
            type="button"
            onClick={() => {
              setExpanded((e) => !e)
              setQuery('')
              setAddingTo(null)
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
      </div>
    </div>
  )
}
