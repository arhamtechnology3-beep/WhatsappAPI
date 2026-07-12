import { NextResponse } from 'next/server'

export async function POST() {
  // Respond with 200 to satisfy Shopify App compliance
  return NextResponse.json({ received: true })
}
