import { Cashfree, CFEnvironment } from 'cashfree-pg'

const environment = process.env.CASHFREE_ENV === 'PRODUCTION' 
  ? CFEnvironment.PRODUCTION 
  : CFEnvironment.SANDBOX

export const cashfree = new Cashfree(
  environment,
  process.env.CASHFREE_CLIENT_ID || '',
  process.env.CASHFREE_CLIENT_SECRET || ''
)

// Configure the correct API Version
cashfree.XApiVersion = process.env.CASHFREE_API_VERSION || '2023-08-01'
