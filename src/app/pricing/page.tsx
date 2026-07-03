import { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, ArrowRight, Sparkles, Star } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Pricing Plans | WhatsApp CRM for Shopify - Arham Technology',
  description: 'Choose a plan that fits your shop. Start with a 15-day free trial on Basic, Growth, or Scale packages. Scale your cart recovery on autopilot.',
}

export default function PricingPage() {
  const plans = [
    {
      name: 'Basic Plan',
      price: '₹999',
      shopifyPrice: '$19.99',
      description: 'Ideal for early-stage Shopify stores wanting to automate basic checkouts and alerts.',
      features: [
        'Shopify Store Integration',
        'Abandoned Cart Recovery (Step 1)',
        'Order Confirmation alerts',
        '10 Message Templates limit',
        'Single Team Inbox (1 agent)',
        'Basic statistics & logs',
      ],
      isPopular: false,
      cta: 'Start Free Trial',
    },
    {
      name: 'Growth Plan',
      price: '₹1,499',
      shopifyPrice: '$26.99',
      description: 'Our most popular plan. Advanced recovery sequences, broadcasts, and scheduling rules.',
      features: [
        'Everything in Basic included',
        'Multi-step Abandoned Cart Recovery (Steps 1, 2 & 3)',
        'Auto Reply / COD Status confirmations',
        '20 Message Templates limit',
        'Broadcast marketing (30k messages/mo)',
        'Up to 3 team members',
        'Automation Scheduling (10 rules)',
        'Priority Slack & email support',
      ],
      isPopular: true,
      cta: 'Start Free Trial',
    },
    {
      name: 'Scale Plan',
      price: '₹2,499',
      shopifyPrice: '$36.99',
      description: 'For high-volume stores needing robust templating, custom tagging, and maximum broadcast quotas.',
      features: [
        'Everything in Growth included',
        'Dynamic 24h Coupon Generator',
        'Unlimited Sequences & Steps',
        '50 Message Templates limit',
        'Broadcast marketing (50k messages/mo)',
        'Up to 10 team members',
        'Automation Scheduling (50 rules)',
        'Dedicated account manager',
      ],
      isPopular: false,
      cta: 'Start Free Trial',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {/* Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-10 right-1/4 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[140px]" />
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
            <Link href="/shopify-whatsapp-automation" className="hover:text-white transition-colors">Shopify App</Link>
            <Link href="/pricing" className="text-white transition-colors font-semibold">Pricing</Link>
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

      {/* Main Container */}
      <main className="relative pt-32 pb-24 px-6 max-w-7xl mx-auto z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 mb-6">
            <Sparkles className="size-3.5 text-indigo-400" />
            <span>15-Day Free Trial on all Shopify App subscriptions</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Flexible plans for stores <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              of all scales
            </span>
          </h1>

          <p className="mt-4 text-slate-400 text-base md:text-lg">
            No upfront setup fees, no complex pricing. Billed securely through Shopify App Store Billing. Start recovering sales immediately.
          </p>
        </div>

        {/* Pricing Grid */}
        <div className="grid gap-8 lg:grid-cols-3 items-stretch max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`p-8 rounded-2xl border flex flex-col justify-between relative overflow-hidden transition-all duration-300 ${
                plan.isPopular
                  ? 'border-indigo-500 bg-indigo-950/20 shadow-xl shadow-indigo-500/5 lg:scale-105 z-10'
                  : 'border-slate-900 bg-slate-950/60'
              }`}
            >
              {plan.isPopular && (
                <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] px-3.5 py-1.5 font-bold tracking-wider uppercase rounded-bl-xl flex items-center gap-1">
                  <Star className="size-2.5 fill-white" /> Most Popular
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-indigo-400 tracking-wide uppercase">{plan.name}</p>
                <div className="mt-4 flex items-baseline text-white">
                  <span className="text-4xl font-extrabold tracking-tight">{plan.price}</span>
                  <span className="ml-1 text-xs text-slate-400">/ month</span>
                  <span className="ml-3 text-xs bg-slate-900 border border-slate-800 text-slate-400 rounded-full px-2 py-0.5">
                    {plan.shopifyPrice} USD
                  </span>
                </div>
                <p className="mt-4 text-xs text-slate-400 leading-relaxed min-h-[40px]">
                  {plan.description}
                </p>

                {/* Features List */}
                <div className="mt-8 space-y-3.5 border-t border-slate-900/60 pt-6">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2.5 text-xs text-slate-300">
                      <CheckCircle2 className="size-4 text-indigo-400 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8">
                <Link
                  href="/signup"
                  className={`w-full inline-flex items-center justify-center px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                    plan.isPopular
                      ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {plan.cta}
                  <ArrowRight className="ml-1.5 size-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Pricing FAQs or Compliance info */}
        <div className="mt-20 max-w-3xl mx-auto rounded-2xl border border-slate-900 bg-slate-950/40 p-6 md:p-8">
          <h2 className="text-lg font-bold text-white mb-4">Pricing Frequently Asked Questions</h2>
          <div className="space-y-6 text-xs text-slate-400 leading-relaxed">
            <div>
              <p className="font-semibold text-slate-200 text-sm">How does the 15-day free trial work?</p>
              <p className="mt-1">
                You can install our app from Shopify App Store on any plan. The billing cycle will only begin after the 15th day. You can uninstall anytime before then to avoid being charged.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-200 text-sm">Do I need to pay Meta separately for WhatsApp messages?</p>
              <p className="mt-1">
                Our subscription covers CRM usage and automation features. Per-message charges are billed directly under Meta Cloud API rates, without any extra markup from Arham Technology.
              </p>
            </div>
          </div>
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
