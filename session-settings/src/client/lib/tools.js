/** Sort the tool list without mutating the snapshot. */
export function sortTools(tools, mode) {
  const list = tools.slice()
  const nameOrder = (left, right) => left.name.localeCompare(right.name)
  const countOf = (tool) => (typeof tool.callCount === 'number' && Number.isFinite(tool.callCount) ? tool.callCount : 0)
  if (mode === 'name-desc') return list.sort((left, right) => nameOrder(right, left))
  if (mode === 'count-desc') {
    return list.sort((left, right) => countOf(right) - countOf(left) || nameOrder(left, right))
  }
  if (mode === 'count-asc') {
    return list.sort((left, right) => countOf(left) - countOf(right) || nameOrder(left, right))
  }
  return list.sort(nameOrder)
}
