// `trn()` — như `tr()` nhưng biến được là phần tử React, cho câu có con số/nút nằm giữa:
//   trn('khoảng {pct} phí mỗi năm', { pct: <Num>0,3%</Num> })
// Tiếng Anh đảo trật tự từ thoải mái mà phần tử vẫn đúng chỗ — điều mà cắt câu thành
// mảnh `tr('khoảng')` + <Num/> + `tr('phí mỗi năm')` không làm được.
import { Fragment, type ReactNode } from 'react'
import { pick } from './index'

export function trn(vi: string, vars: Record<string, ReactNode>): ReactNode {
  const template = pick(vi, vars)
  const parts = template.split(/(\{\w+\})/g)
  return parts.map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part)
    const node = m && m[1] in vars ? vars[m[1]] : part
    return <Fragment key={i}>{node}</Fragment>
  })
}
