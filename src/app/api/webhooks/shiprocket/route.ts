import { handleShiprocketTrackingWebhook } from '@/lib/logistics/courier-webhook'

export async function POST(request: Request) {
  return handleShiprocketTrackingWebhook(request)
}
