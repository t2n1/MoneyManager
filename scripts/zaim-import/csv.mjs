// Đọc CSV thuần (không phụ thuộc thư viện): hỗ trợ trường bọc nháy kép, phẩy và
// xuống dòng bên trong trường. Dùng chung cho run.mjs (nạp) và audit.mjs (đối chiếu)
// — hai đường phải đọc y hệt nhau, nếu không thì báo cáo đối chiếu vô nghĩa.

/** @param {string} text nội dung file CSV (UTF-8, có thể có BOM) @returns {string[][]} */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let q = false
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else q = false
      } else field += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}

/** Đọc file Zaim -> các dòng dữ liệu (đã bỏ dòng tiêu đề). */
export function readZaimRows(readFileSync, csvPath) {
  return parseCsv(readFileSync(csvPath, 'utf-8')).slice(1)
}
