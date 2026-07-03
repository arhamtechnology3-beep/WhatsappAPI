import { Metadata } from 'next'
import Link from 'next/link'
import {
  MessageSquare,
  ShoppingBag,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  ShieldCheck,
  Percent,
  CheckCircle2,
  Zap,
  LogIn,
  LayoutDashboard
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Arham Technology | WhatsApp CRM for Shopify Store Automations',
  description: 'Boost your Shopify sales with Arham Technology WhatsApp CRM. Recover abandoned checkouts, automate sequence reminders, track product browse views, and manage customer chats from a unified team inbox.',
  keywords: 'WhatsApp CRM, Shopify CRM, cart recovery, browse abandonment, automated WhatsApp messages, Shopify cart recovery, WhatsApp marketing, Arham Technology',
}

export default function RootPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {/* Background Gradient Orbs - Wrapped to prevent mobile layout overflow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[140px]" />
      </div>

      {/* Navigation Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-900 px-4 md:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            {/* White-labeled Logo for Arham Technology */}
            <img
              src="/logo-dark.png?v=2"
              alt="Arham Technology Logo - WhatsApp CRM Services"
              className="h-9 md:h-12 w-auto object-contain group-hover:scale-105 transition-transform duration-200"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <Link href="/shopify-whatsapp-automation" className="hover:text-white transition-colors">Shopify App</Link>
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/demo" className="hover:text-white transition-colors">Watch Demo</Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 active:scale-95 transition-all duration-150">
              Get Started
            </Link>
          </div>

          {/* Mobile Actions */}
          <div className="flex md:hidden items-center gap-2">
            <Link href="/login" aria-label="Sign in" className="p-2 text-slate-300 hover:text-white active:scale-90 transition-transform">
              <LogIn className="size-5" />
            </Link>
            <Link href="/signup" aria-label="Go to Dashboard" className="p-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 active:scale-90 transition-transform">
              <LayoutDashboard className="size-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-6 text-center max-w-7xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 mb-8 animate-fade-in">
          <Sparkles className="size-3.5 text-indigo-400" />
          <span>Trial Plan: Free 15-day cart recovery and tracking trial</span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight md:leading-none">
          Recover Shopify sales from <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            one WhatsApp Inbox
          </span>
        </h1>

        <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          The ultimate WhatsApp CRM for Shopify. Run recovery campaigns, browse abandonment tracking, and transactional order updates using the Meta Cloud API.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/signup" className="inline-flex items-center justify-center w-full sm:w-auto px-6 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl shadow-lg shadow-indigo-600/30 active:scale-98 transition-all duration-150 group">
            Start 15-Day Free Trial
            <ArrowRight className="ml-2 size-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link href="/shopify-whatsapp-automation" className="inline-flex items-center justify-center w-full sm:w-auto px-6 py-3.5 text-sm font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-850 hover:border-slate-700 transition-all duration-150">
            Explore Features
          </Link>
        </div>

        {/* Hero Interactive App Preview */}
        <div className="mt-16 rounded-2xl border border-slate-900 bg-slate-950 p-2 shadow-2xl shadow-indigo-500/5 max-w-5xl mx-auto overflow-hidden">
          <div className="rounded-xl border border-slate-850 overflow-hidden bg-slate-900/50 h-[280px] sm:h-auto sm:aspect-video relative flex flex-col items-center justify-center text-slate-400">
            {/* Visual simulation of the Inbox inside home screen */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950/80 pointer-events-none" />
            <div className="w-full h-8 border-b border-slate-850 bg-slate-900/80 flex items-center px-4 gap-1.5 shrink-0">
              <div className="size-2.5 rounded-full bg-red-500/80" />
              <div className="size-2.5 rounded-full bg-yellow-500/80" />
              <div className="size-2.5 rounded-full bg-green-500/80" />
              <span className="text-[10px] text-slate-500 font-mono ml-4">whatsapp.arhamtechnology.com/inbox</span>
            </div>
            
            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-850 bg-slate-950/50 font-sans text-left overflow-hidden">
              <div className="p-4 space-y-3 hidden sm:block">
                <div className="h-6 bg-slate-900 rounded w-1/3" />
                <div className="h-12 bg-slate-900 rounded p-2 flex items-center gap-2">
                  <div className="size-7 rounded-full bg-indigo-500/20" />
                  <div className="space-y-1 flex-1">
                    <div className="h-2 bg-slate-800 rounded w-3/4" />
                    <div className="h-1.5 bg-slate-800 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-12 bg-slate-900/50 rounded p-2 flex items-center gap-2 opacity-60">
                  <div className="size-7 rounded-full bg-slate-800" />
                  <div className="space-y-1 flex-1">
                    <div className="h-2 bg-slate-800 rounded w-3/4" />
                    <div className="h-1.5 bg-slate-800 rounded w-1/2" />
                  </div>
                </div>
              </div>
              <div className="col-span-1 sm:col-span-2 p-6 flex flex-col justify-between overflow-hidden">
                <div className="space-y-4">
                  <div className="flex justify-start">
                    <div className="bg-slate-900 rounded-lg p-3 max-w-sm text-xs leading-relaxed text-slate-300">
                      Hi, is the Organic Honey Jam available?
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-indigo-600 rounded-lg p-3 max-w-sm text-xs leading-relaxed text-white">
                      Hi! Yes, it is in stock. You can order it here: https://shopify.com/checkout
                    </div>
                  </div>
                </div>
                
                <div className="h-10 border border-slate-850 bg-slate-900/20 rounded-lg px-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Type a message...</span>
                  <div className="flex gap-2">
                    <span className="bg-indigo-500 text-white rounded px-2 py-0.5 text-[10px]">Send Template</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Showcase Section */}
      <section id="features" className="py-24 px-6 max-w-7xl mx-auto border-t border-slate-900">
        <div className="text-center space-y-3 mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white">Engineered for Shopify conversion</h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm md:text-base">
            Powering smart, compliant, and automated customer marketing via the Meta Cloud API.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Feature 1 */}
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950 hover:border-slate-800 transition-all duration-200 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="inline-flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
                <TrendingUp className="size-5" />
              </div>
              <h3 className="font-bold text-lg text-white">Multi-Step Cart Drips</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Sequence up to 3 escalating reminder messages (initial check &rarr; product price focus &rarr; discount codes) automatic stopping the minute the customer purchases.
              </p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950 hover:border-slate-800 transition-all duration-200 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="inline-flex size-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
                <ShoppingBag className="size-5" />
              </div>
              <h3 className="font-bold text-lg text-white">Browse Abandonment</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Identified store visitors viewing specific product pages receive soft, automated WhatsApp follow-ups to nudge them back to checkout.
              </p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950 hover:border-slate-800 transition-all duration-200 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="inline-flex size-10 items-center justify-center rounded-xl bg-pink-500/10 text-pink-400">
                <Percent className="size-5" />
              </div>
              <h3 className="font-bold text-lg text-white">Dynamic Coupon Generator</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Integrates directly with Shopify Admin API to issue time-limited, single-use 10% discount codes at the final push step of cart sequences.
              </p>
            </div>
          </div>

          {/* Feature 4 */}
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950 hover:border-slate-800 transition-all duration-200 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="inline-flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                <ShieldCheck className="size-5" />
              </div>
              <h3 className="font-bold text-lg text-white">Smart Opt-out & Compliance</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Adheres strictly to Meta marketing guidelines. Automatically filters out promotional drips for unsubscribed numbers, and listens for the "STOP" opt-out message.
              </p>
            </div>
          </div>

          {/* Feature 5 */}
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950 hover:border-slate-800 transition-all duration-200 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="inline-flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <MessageSquare className="size-5" />
              </div>
              <h3 className="font-bold text-lg text-white">Shared Teams Inbox</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Manage conversations together, route customers through custom Flows, assign leads to agents, and classify contacts using custom tags.
              </p>
            </div>
          </div>

          {/* Feature 6 */}
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950 hover:border-slate-800 transition-all duration-200 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="inline-flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <Clock className="size-5" />
              </div>
              <h3 className="font-bold text-lg text-white">Transactional Confirmations</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Automated order confirmation templates, real-time tracking links on fulfillment, and feedback loops when delivered.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section (with 15 days Free Trial) */}
      <section id="pricing" className="py-24 px-6 max-w-7xl mx-auto border-t border-slate-900">
        <div className="text-center space-y-3 mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white">Start for free. Grow with scale.</h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm">
            Try all premium Shopify integrations and WhatsApp templates free for 15 days. No credit card required.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 max-w-3xl mx-auto">
          {/* Trial Card */}
          <div className="p-8 rounded-2xl border border-slate-900 bg-slate-950/60 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 bg-indigo-500/10 text-indigo-400 text-[10px] px-3 py-1.5 font-bold tracking-wider uppercase rounded-bl-xl border-l border-b border-slate-850">
              First 15 Days
            </div>
            <div>
              <p className="text-xs font-semibold text-indigo-400 tracking-wide uppercase">Trial Plan</p>
              <div className="mt-4 flex items-baseline text-white">
                <span className="text-5xl font-extrabold tracking-tight">₹0</span>
                <span className="ml-1 text-sm font-semibold text-slate-400">/ 15 days</span>
              </div>
              <p className="mt-4 text-xs text-slate-400 leading-relaxed">
                Experience full automation, connect your storefront, start collecting customer opt-ins, and recover open carts without paying a single rupee.
              </p>
            </div>
            <div className="mt-8 space-y-3 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-indigo-400 shrink-0" />
                <span>Shopify store integration</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-indigo-400 shrink-0" />
                <span>Full cart & browse sequence drops</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-indigo-400 shrink-0" />
                <span>Unlimited contacts and chats</span>
              </div>
            </div>
            <Link href="/signup" className="mt-8 inline-flex items-center justify-center px-4 py-2.5 text-xs font-semibold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg transition-colors">
              Activate 15-Day Free Trial
            </Link>
          </div>

          {/* Growth Plan Card */}
          <div className="p-8 rounded-2xl border border-indigo-500/30 bg-indigo-950/10 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] px-3 py-1.5 font-bold tracking-wider uppercase rounded-bl-xl">
              Most Popular
            </div>
            <div>
              <p className="text-xs font-semibold text-indigo-400 tracking-wide uppercase">Growth Plan</p>
              <div className="mt-4 flex items-baseline text-white">
                <span className="text-5xl font-extrabold tracking-tight">₹1499</span>
                <span className="ml-1 text-sm font-semibold text-slate-400">/ month</span>
              </div>
              <p className="mt-4 text-xs text-slate-400 leading-relaxed">
                Full-featured CRM and Shopify automation plan billed monthly. Charged only after your 15-day trial period expires.
              </p>
            </div>
            <div className="mt-8 space-y-3 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-indigo-400 shrink-0" />
                <span>All Trial Plan features included</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-indigo-400 shrink-0" />
                <span>Automatic 24h coupon generator</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-indigo-400 shrink-0" />
                <span>Dedicated support agent access</span>
              </div>
            </div>
            <Link href="/signup" className="mt-8 inline-flex items-center justify-center px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 transition-all duration-150">
              Get Started Now
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-900 bg-slate-950 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <img
              src="/logo-dark.png?v=2"
              alt="Arham Technology Logo - WhatsApp CRM Services"
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
