import { Cashfree, CFEnvironment } from 'cashfree-pg'
import { decrypt } from '@/lib/whatsapp/encryption'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getCashfreeClient(supabase: SupabaseClient, accountId: string) {
  try {
    // 1) Query credentials from Supabase cashfree_config table
    const { data: config, error } = await supabase
      .from('cashfree_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (error) {
      console.warn(`[cashfree-client] DB error loading config for account ${accountId}, checking environment fallback:`, error)
    }

    if (config) {
      // Decrypt client_secret safely
      let decryptedSecret = config.client_secret
      try {
        decryptedSecret = decrypt(config.client_secret)
      } catch (decErr) {
        decryptedSecret = config.client_secret
      }

      const env = config.environment === 'PRODUCTION' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX
      
      // Initialize instance
      const cashfreeInstance = new Cashfree(env, config.client_id, decryptedSecret)
      cashfreeInstance.XApiVersion = config.api_version || '2023-08-01'
      
      console.log(`[cashfree-client] Loaded Cashfree credentials dynamically from Supabase for account ${accountId} (Mode: ${config.environment})`)
      return cashfreeInstance
    }
  } catch (err) {
    console.error('[cashfree-client] Failed to load credentials from Supabase, checking environment fallback:', err)
  }

  // 2) Fallback to Environment Variables
  const ClientId = process.env.CASHFREE_CLIENT_ID || ''
  const ClientSecret = process.env.CASHFREE_CLIENT_SECRET || ''
  const Env = process.env.CASHFREE_ENV === 'PRODUCTION' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX

  const cashfreeInstance = new Cashfree(Env, ClientId, ClientSecret)
  cashfreeInstance.XApiVersion = process.env.CASHFREE_API_VERSION || '2023-08-01'

  console.log(`[cashfree-client] Using environment variables fallback for Cashfree credentials`)
  return cashfreeInstance
}
