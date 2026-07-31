// Nối tên ví / đường dẫn danh mục Zaim -> id thật trong backup app.
//
// Dùng chung cho run.mjs (nạp) và audit.mjs (đối chiếu). Nếu hai đường tự nối riêng thì
// audit có thể "khớp" trong khi thực tế lệch, nên chỗ này phải là một bản duy nhất.

import {
  WALLET_TO_ACCOUNT_NAME,
  DEFAULT_ACCOUNT_NAME,
  NEW_CATEGORIES,
  resolveCategoryPath,
} from './mapping.mjs'

/**
 * @param {object} backup nội dung file backup app (BackupData)
 * @param {{ createMissing?: boolean, newId?: () => string }} opts
 *   createMissing: thêm các danh mục NEW_CATEGORIES còn thiếu vào `backup.categories`
 *   (chỉ đường NẠP mới được phép; đường AUDIT không sửa gì, chỉ ghi nhận vào `problems`).
 */
export function buildResolvers(backup, opts = {}) {
  const { createMissing = false, newId } = opts
  const problems = []
  const created = []

  const accByName = new Map(backup.accounts.map((a) => [a.name, a]))
  const catById = new Map(backup.categories.map((c) => [c.id, c]))
  const pathOf = (c) => {
    if (!c.parent_id) return c.name
    const p = catById.get(c.parent_id)
    return `${p ? p.name : '?'}>${c.name}`
  }
  const catIndex = new Map()
  for (const c of backup.categories) catIndex.set(`${c.type}|${pathOf(c)}`, c.id)

  if (createMissing) {
    for (const nc of NEW_CATEGORIES) {
      const key = `expense|${nc.path}`
      if (catIndex.has(key)) continue
      const [parentName, childName] = nc.path.split('>')
      const parent = backup.categories.find(
        (c) => c.type === 'expense' && !c.parent_id && c.name === parentName,
      )
      if (!parent) throw new Error(`Không thấy nhóm cha "${parentName}" để tạo "${childName}"`)
      const siblings = backup.categories.filter((c) => c.parent_id === parent.id)
      const cat = {
        id: newId(),
        user_id: backup.profile.user_id,
        name: childName,
        type: 'expense',
        icon: nc.icon,
        parent_id: parent.id,
        sort_order: Math.max(0, ...siblings.map((c) => c.sort_order ?? 0)) + 1,
        is_archived: false,
        need_level: 'flexible',
        cost_type: 'variable',
        created_at: new Date().toISOString(),
      }
      backup.categories.push(cat)
      catById.set(cat.id, cat)
      catIndex.set(key, cat.id)
      created.push(nc.path)
    }
  }

  function resolveAccountId(wallet) {
    const name = WALLET_TO_ACCOUNT_NAME[wallet] ?? DEFAULT_ACCOUNT_NAME
    const acc = accByName.get(name)
    if (!acc) {
      if (createMissing)
        throw new Error(`Không thấy tài khoản app tên "${name}" (ví Zaim: "${wallet}")`)
      problems.push(`Thiếu tài khoản app "${name}" (ví Zaim "${wallet}")`)
      return `MISSING:${name}`
    }
    return acc.id
  }

  function resolveCategoryId(type, main, sub) {
    const p = resolveCategoryPath(type, main, sub)
    if (p === 'SKIP') return null
    const id = catIndex.get(`${type}|${p}`)
    if (!id) {
      if (createMissing)
        throw new Error(`Không thấy danh mục app "${p}" (${type}) từ Zaim ${main}>${sub}`)
      problems.push(`Thiếu danh mục app "${p}" (${type}) — từ Zaim ${main}>${sub}`)
      return null
    }
    return id
  }

  return { resolveAccountId, resolveCategoryId, catIndex, catById, pathOf, created, problems }
}
