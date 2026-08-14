/**
 * Minimal 5-field cron matcher (UTC). Supports *, comma lists, and step
 * values like * /n. Used by time_based automations.
 */
export function cronMatchesNow(expr: string, now: Date = new Date()): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return false
  const [min, hour, day, month, dow] = parts
  return (
    fieldMatches(min, now.getUTCMinutes()) &&
    fieldMatches(hour, now.getUTCHours()) &&
    fieldMatches(day, now.getUTCDate()) &&
    fieldMatches(month, now.getUTCMonth() + 1) &&
    fieldMatches(dow, now.getUTCDay())
  )
}

function fieldMatches(field: string, value: number): boolean {
  if (field === '*') return true
  return field.split(',').some((part) => {
    const trimmed = part.trim()
    if (trimmed.includes('/')) {
      const [range, stepStr] = trimmed.split('/')
      const step = parseInt(stepStr, 10)
      if (!step) return false
      const start = range === '*' ? 0 : parseInt(range, 10)
      if (Number.isNaN(start)) return false
      return (value - start) % step === 0 && value >= start
    }
    return parseInt(trimmed, 10) === value
  })
}
