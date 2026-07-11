'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2, ShoppingBag } from 'lucide-react'

function CheckoutReturnContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('order_id')
  
  const [status, setStatus] = useState<'LOADING' | 'PAID' | 'PENDING' | 'FAILED'>('LOADING')
  const [shopifyOrderNumber, setShopifyOrderNumber] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  const storeUrl = 'https://divyaprabhafoods.com'

  useEffect(() => {
    if (!orderId) {
      setStatus('FAILED')
      setErrorMessage('Missing order identifier.')
      return
    }

    let isMounted = true
    let timeoutId: NodeJS.Timeout

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/cashfree/order-status/${orderId}`)
        if (!res.ok) {
          throw new Error('Failed to retrieve payment status.')
        }

        const data = await res.json()
        if (!isMounted) return

        if (data.order_status === 'PAID') {
          setStatus('PAID')
          setShopifyOrderNumber(data.shopify_order_number || null)
        } else if (data.order_status === 'PAID_NOT_CONVERTED') {
          setStatus('PENDING')
        } else if (data.order_status === 'FAILED') {
          setStatus('FAILED')
          setErrorMessage('Payment failed or was cancelled.')
        } else {
          // If status is ACTIVE/PENDING, retry up to 8 times (16 seconds total)
          if (attempts < 8) {
            setAttempts((prev) => prev + 1)
            timeoutId = setTimeout(checkStatus, 2000)
          } else {
            setStatus('PENDING')
          }
        }
      } catch (err: any) {
        console.error('[checkout-return] status check error:', err)
        if (isMounted) {
          // Fallback to retrying on connection errors
          if (attempts < 8) {
            setAttempts((prev) => prev + 1)
            timeoutId = setTimeout(checkStatus, 2000)
          } else {
            setStatus('FAILED')
            setErrorMessage(err.message || 'Error verifying payment.')
          }
        }
      }
    }

    checkStatus()

    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [orderId, attempts])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-100 overflow-hidden border border-slate-100 p-8 text-center transition-all duration-300">
        
        {/* Loading State */}
        {status === 'LOADING' && (
          <div className="space-y-6 py-6">
            <div className="flex justify-center">
              <Loader2 className="h-16 w-16 text-emerald-600 animate-spin" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-slate-800">Confirming Payment</h2>
              <p className="text-slate-500 text-sm">
                Please do not close this window or press the back button. We are verifying your transaction with the bank...
              </p>
            </div>
            {attempts > 0 && (
              <span className="inline-block text-xs bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-medium">
                Verification attempt {attempts} of 8
              </span>
            )}
          </div>
        )}

        {/* Success State */}
        {status === 'PAID' && (
          <div className="space-y-6 py-4 animate-in fade-in zoom-in duration-500">
            <div className="flex justify-center">
              <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center animate-bounce">
                <CheckCircle2 className="h-14 w-14 text-emerald-500" />
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-widest bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-bold">
                Payment Successful
              </span>
              <h2 className="text-3xl font-bold text-slate-800 mt-2">Order Confirmed!</h2>
              {shopifyOrderNumber ? (
                <p className="text-lg font-medium text-emerald-700">
                  Shopify Order Number: #{shopifyOrderNumber}
                </p>
              ) : (
                <p className="text-slate-500 text-sm">
                  Your payment has been received successfully.
                </p>
              )}
              <p className="text-slate-500 text-sm max-w-xs mx-auto mt-2">
                Thank you for your purchase! A confirmation email and WhatsApp message will be sent to you shortly with tracking details.
              </p>
            </div>

            <div className="pt-4 space-y-3">
              <a
                href={storeUrl}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-6 rounded-2xl transition-colors duration-200 shadow-md shadow-emerald-100"
              >
                <ShoppingBag className="h-5 w-5" />
                Continue Shopping
              </a>
            </div>
          </div>
        )}

        {/* Pending State */}
        {status === 'PENDING' && (
          <div className="space-y-6 py-4 animate-in fade-in duration-500">
            <div className="flex justify-center">
              <div className="h-20 w-20 bg-amber-50 rounded-full flex items-center justify-center">
                <Loader2 className="h-12 w-12 text-amber-500 animate-spin" />
              </div>
            </div>
            <div className="space-y-2 animate-pulse">
              <span className="text-xs uppercase tracking-widest bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-bold">
                Payment Acknowledged
              </span>
              <h2 className="text-2xl font-bold text-slate-800 mt-2">Reconciling with Bank</h2>
              <p className="text-slate-500 text-sm max-w-xs mx-auto">
                We are still waiting for a final confirmation from your bank. Your order will be placed as soon as it clears.
              </p>
              <p className="text-slate-500 text-xs mt-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                You can safely close this page. If the payment succeeds, you will receive your order details via SMS/Email within 10 minutes.
              </p>
            </div>

            <div className="pt-4">
              <a
                href={storeUrl}
                className="w-full flex items-center justify-center bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3.5 px-6 rounded-2xl transition-colors duration-200"
              >
                Return to Store
              </a>
            </div>
          </div>
        )}

        {/* Failure State */}
        {status === 'FAILED' && (
          <div className="space-y-6 py-4 animate-in fade-in zoom-in duration-500">
            <div className="flex justify-center">
              <div className="h-20 w-20 bg-rose-50 rounded-full flex items-center justify-center">
                <XCircle className="h-14 w-14 text-rose-500" />
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-widest bg-rose-100 text-rose-800 px-3 py-1 rounded-full font-bold">
                Transaction Failed
              </span>
              <h2 className="text-3xl font-bold text-slate-800 mt-2">Payment Declined</h2>
              <p className="text-slate-500 text-sm max-w-xs mx-auto">
                {errorMessage || 'The payment session could not be completed. Your account has not been charged.'}
              </p>
            </div>

            <div className="pt-4 space-y-3">
              <a
                href={`${storeUrl}/cart`}
                className="w-full flex items-center justify-center bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3.5 px-6 rounded-2xl transition-colors duration-200 shadow-md shadow-rose-100"
              >
                Retry Payment
              </a>
              <a
                href={storeUrl}
                className="w-full flex items-center justify-center text-slate-500 hover:text-slate-700 font-medium py-2 transition-colors duration-200 text-sm"
              >
                Cancel and return to store
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-100 p-8 text-center">
          <Loader2 className="h-12 w-12 text-emerald-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-500 font-medium">Loading checkout details...</p>
        </div>
      </div>
    }>
      <CheckoutReturnContent />
    </Suspense>
  )
}
