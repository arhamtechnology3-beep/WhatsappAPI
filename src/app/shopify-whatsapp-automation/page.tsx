import { Metadata } from 'next'
import Link from 'next/link'
import {
  ShoppingBag,
  Percent,
  CheckCircle2,
  TrendingUp,
  MessageSquare,
  Clock,
  ArrowRight,
  ShieldCheck,
  Zap,
  RefreshCw
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Shopify WhatsApp Marketing & Cart Recovery App | Arham Technology',
  description: 'Recover up to 25% of abandoned checkout carts using automated multi-step WhatsApp drips. Integrate order confirmations and COD verification.',
}

export default function ShopifyAppPage() {
  const steps = [
    {
      title: 'Step 1: Friendly Inquiry',
      time: '30 Minutes After Abandonment',
      desc: 'Send a gentle WhatsApp reminder with the customer\'s name, product image, and a direct link to complete checkout.',
    },
    {
      title: 'Step 2: Value Nudge',
      time: '24 Hours Later',
      desc: 'Focus on product benefits, review counts, or answer questions to help customers overcome hesitation. Requires opt-in.',
    },
    {
      title: 'Step 3: Dynamic Discount Nudge',
      time: '48 Hours Later',
      desc: 'Automatically generate a single-use 10% coupon code via Shopify API and send a final check-in. Requires opt-in.',
    },
  ]

  const features = [
    {
      title: 'Abandoned Checkout recovery',
      desc: 'Automatic multi-step sequences that stop instantly once the customer completes their purchase.',
      icon: TrendingUp,
      badge: 'Main Focus',
    },
    {
      title: 'COD Verification alerts',
      desc: 'Verify Cash on Delivery orders with an automated WhatsApp template asking customers to tap "Confirm" or "Cancel".',
      icon: ShieldCheck,
      badge: 'Recommended',
    },
    {
      title: 'Order Status updates',
      desc: 'Deliver real-time order confirmed, package shipped, and tracking URL notifications via Meta official WABA.',
      icon: Clock,
      badge: 'Transactional',
    },
    {
      title: 'Unified Team Inbox',
      desc: 'Your support and sales agents can converse with buyers, manage contact tags, and close sales together.',
      icon: MessageSquare,
      badge: 'CRM Feature',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {/* Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Navigation Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-900 px-4 md:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <img
              src="/logo-dark.png"
              alt="Arham Technology Logo"
              className="h-9 md:h-12 w-auto object-contain"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <Link href="/shopify-whatsapp-automation" className="text-white font-semibold transition-colors">Shopify App</Link>
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/demo" className="hover:text-white transition-colors">Watch Demo</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 transition-all">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative pt-32 pb-24 px-6 max-w-7xl mx-auto z-10">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 mb-6">
            <ShoppingBag className="size-3.5 text-indigo-400" />
            <span>Shopify App Store Certified</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Stop losing sales at <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              Shopify Checkout
            </span>
          </h1>

          <p className="mt-6 text-slate-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Connect your Shopify storefront with Arham Technology WhatsApp CRM. Turn cart abandoners into lifetime loyal customers with automated, high-conversion recovery sequence drips.
          </p>

          <div className="mt-8">
            <Link href="/signup" className="inline-flex items-center justify-center px-6 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl shadow-lg shadow-indigo-600/30 transition-all">
              Connect Your Store Now
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid gap-8 md:grid-cols-2 max-w-5xl mx-auto mb-24">
          {features.map((feat) => {
            const IconComponent = feat.icon
            return (
              <div key={feat.title} className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 hover:border-slate-800 transition-all duration-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="inline-flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
                    <IconComponent className="size-5" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-500/10 rounded-full px-2.5 py-1">
                    {feat.badge}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{feat.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{feat.desc}</p>
              </div>
            )
          })}
        </div>

        {/* Step-by-Step Sequences Visual Explanation */}
        <div className="border-t border-slate-900 pt-20 max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white">How multi-step recovery drives conversions</h2>
            <p className="text-xs text-slate-400 mt-2">Our sequence drip automatically shuts off the second Shopify reports the checkout is recovered.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((st, i) => (
              <div key={st.title} className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40 relative">
                <div className="absolute top-4 right-4 text-3xl font-extrabold text-indigo-500/10">0{i+1}</div>
                <p className="text-[10px] text-indigo-400 font-bold tracking-wider uppercase mb-1">{st.time}</p>
                <h3 className="text-base font-bold text-slate-100 mb-2">{st.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{st.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick App Installation Guide */}
        <div className="mt-24 border-t border-slate-900 pt-20 max-w-4xl mx-auto rounded-2xl bg-indigo-950/10 border border-indigo-500/20 p-8 flex flex-col md:flex-row items-center gap-8 justify-between">
          <div className="space-y-3 max-w-md">
            <div className="inline-flex items-center gap-1.5 bg-indigo-500/20 text-indigo-300 rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
              <Zap className="size-3 fill-indigo-300" /> Fast Installation
            </div>
            <h3 className="text-xl font-bold text-white">Integrate in under 3 minutes</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Log in with your Shopify store domain, authorize permissions, connect your WhatsApp number via our settings wizard, and watch recovered checkouts stream into your sales funnel.
            </p>
          </div>
          <Link href="/signup" className="inline-flex items-center justify-center px-5 py-3 rounded-xl text-xs font-bold bg-white text-slate-950 hover:bg-slate-100 transition-colors shrink-0">
            Install via Shopify <ArrowRight className="ml-1.5 size-3.5" />
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-900 bg-slate-950 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <img
              src="/logo-dark.png"
              alt="Arham Technology Logo"
              className="h-12 w-auto object-contain"
            />
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-400">
            <Link href="/shopify-whatsapp-automation" className="hover:text-white transition-colors">Shopify App</Link>
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/demo" className="hover:text-white transition-colors">Watch Demo</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
          </div>
          <p className="text-slate-500">&copy; {new Date().getFullYear()} Arham Technology. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
