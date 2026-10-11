import { handleShiprocketTrackingWebhook } from '@/lib/logistics/courier-webhook'

/** Shiprocket rejects webhook URLs containing "shiprocket", "sr" or "kr". */
export async function POST(request: Request) {
  return handleShiprocketTrackingWebhook(request)
}
