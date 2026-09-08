/** One linear-time changed region, with shared edges omitted explicitly. */
export const textChange = (before: string, after: string): string => {
  if (before === after) return 'Text unchanged.'
  const oldLines = before === '' ? [] : before.split('\n')
  const newLines = after === '' ? [] : after.split('\n')
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++
  let oldEnd = oldLines.length
  let newEnd = newLines.length
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--
    newEnd--
  }
  return [
    ...(start ? [`… ${start} unchanged leading lines`] : []),
    ...oldLines.slice(start, oldEnd).map((line) => `− ${line}`),
    ...newLines.slice(start, newEnd).map((line) => `+ ${line}`),
    ...(oldEnd < oldLines.length ? [`… ${oldLines.length - oldEnd} unchanged trailing lines`] : []),
  ].join('\n')
}
