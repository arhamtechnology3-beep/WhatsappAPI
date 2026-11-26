/**
 * Marketing follow-ups only go out 9:30 AM–8:30 PM India time
 * (IST, UTC+5:30, no DST).
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const WINDOW_START_MIN = 9 * 60 + 30
const WINDOW_END_MIN = 20 * 60 + 30

function istParts(when: Date) {
  const ist = new Date(when.getTime() + IST_OFFSET_MS)
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth(),
    day: ist.getUTCDate(),
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  }
}

function istWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return new Date(Date.UTC(year, month, day, hour, minute) - IST_OFFSET_MS)
}

/** True when `when` is inside 09:30–20:30 IST (end exclusive). */
export function isInsideIstSendWindow(when: Date): boolean {
  const { minutes } = istParts(when)
  return minutes >= WINDOW_START_MIN && minutes < WINDOW_END_MIN
}

/**
 * If `when` is inside the window, return it. If it is before 9:30 AM IST
 * that calendar day, return that day's 9:30 AM. After 8:30 PM IST, return
 * the next day's 9:30 AM.
 */
export function clampToIstSendWindow(when: Date): Date {
  const { year, month, day, minutes } = istParts(when)
  if (minutes >= WINDOW_START_MIN && minutes < WINDOW_END_MIN) return when
  if (minutes < WINDOW_START_MIN) {
    return istWallToUtc(year, month, day, 9, 30)
  }
  return istWallToUtc(year, month, day + 1, 9, 30)
}

export function shouldClampWelcomeFollowup(args: {
  triggerType: string
  currentStep: number
}): boolean {
  if (
    args.triggerType === 'inquiry_no_purchase' ||
    args.triggerType === 'offer_unlock_no_purchase'
  ) {
    return true
  }
  return args.triggerType === 'shopify_customer_created' && args.currentStep >= 2
}

/**
 * Decide whether a welcome/inquiry send should wait for IST daytime.
 *
 * Important for once-daily Hostinger cron at 00:00 UTC (05:30 IST):
 * deferring to 09:30 IST means the next tick is tomorrow — the message
 * never goes out. So before morning open we **send on this tick**; after
 * evening close we defer to the next day's 09:30 IST.
 */
export function shouldDeferOutsideIstWindow(now: Date = new Date()): {
  defer: boolean
  nextAt: Date
  reason: 'inside' | 'before_open_send_now' | 'after_close'
} {
  if (isInsideIstSendWindow(now)) {
    return { defer: false, nextAt: now, reason: 'inside' }
  }
  const { minutes } = istParts(now)
  if (minutes < WINDOW_START_MIN) {
    return { defer: false, nextAt: now, reason: 'before_open_send_now' }
  }
  return {
    defer: true,
    nextAt: clampToIstSendWindow(now),
    reason: 'after_close',
  }
}
