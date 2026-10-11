import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { asRecord, firstString, mapShipmentStatus, type ShipmentMilestone } from './status'

const API = 'https://apiv2.shiprocket.in/v1/external'
// Shiprocket tokens live 10 days; refresh a day early.
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000

const tokenCache = new Map<string, { token: string; at: number }>()

export interface LiveShipment {
  awb: string
  /** Raw courier status, e.g. "IN TRANSIT", "DELIVERED". */
  status: string
  milestone: ShipmentMilestone | 'unknown'
  courier: string
  /** Expected delivery date as given by Shiprocket (YYYY-MM-DD…). */
  edd: string
  deliveredAt: string
  lastActivity: string
  lastLocation: string
  lastActivityAt: string
  trackUrl: string
}

async function shiprocketToken(
  db: SupabaseClient,
  accountId: string,
): Promise<string | null> {
  const cached = tokenCache.get(accountId)
  if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.token

  const { data } = await db
    .from('merchant_integrations')
    .select('status, config')
    .eq('account_id', accountId)
    .eq('integration_key', 'shiprocket')
    .maybeSingle()
  const config = asRecord(data?.config)
  if (data?.status !== 'connected' || !config?.email || !config.encrypted_password) {
    return null
  }

  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: String(config.email),
      password: decrypt(String(config.encrypted_password)),
    }),
  })
  if (!res.ok) {
    console.warn('[shiprocket] login failed:', res.status)
    return null
  }
  const json = (await res.json()) as { token?: string }
  if (!json.token) return null
  tokenCache.set(accountId, { token: json.token, at: Date.now() })
  return json.token
}

export function parseTrackResponse(awb: string, body: unknown): LiveShipment | null {
  const root = asRecord(body) || {}
  // The endpoint returns either { tracking_data } or { <awb>: { tracking_data } }.
  const tracking =
    asRecord(root.tracking_data) ||
    asRecord(asRecord(root[awb])?.tracking_data) ||
    asRecord(asRecord(Object.values(root)[0])?.tracking_data)
  if (!tracking) return null
  if (Number(tracking.track_status) === 0 && !tracking.shipment_track) return null

  const track = Array.isArray(tracking.shipment_track)
    ? asRecord(tracking.shipment_track[0]) || {}
    : {}
  const activities = Array.isArray(tracking.shipment_track_activities)
    ? (tracking.shipment_track_activities as unknown[]).map((a) => asRecord(a) || {})
    : []
  const latest = activities[0] || {}

  const status = firstString(track.current_status, latest['sr-status-label'], latest.activity)
  return {
    awb: firstString(track.awb_code, awb),
    status,
    milestone: status ? mapShipmentStatus(status) : 'unknown',
    courier: firstString(track.courier_name, tracking.courier_name),
    edd: firstString(track.edd, tracking.etd),
    deliveredAt: firstString(track.delivered_date),
    lastActivity: firstString(latest.activity),
    lastLocation: firstString(latest.location),
    lastActivityAt: firstString(latest.date),
    trackUrl: firstString(tracking.track_url),
  }
}

/** Live courier status for an AWB, or null when Shiprocket is not connected / unknown AWB. */
export async function fetchShiprocketShipment(
  db: SupabaseClient,
  accountId: string,
  awb: string,
): Promise<LiveShipment | null> {
  const code = awb.trim()
  if (!code) return null
  try {
    const token = await shiprocketToken(db, accountId)
    if (!token) return null
    const res = await fetch(`${API}/courier/track/awb/${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) tokenCache.delete(accountId)
    if (!res.ok) return null
    return parseTrackResponse(code, await res.json())
  } catch (err) {
    console.warn(
      '[shiprocket] track failed:',
      code,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
