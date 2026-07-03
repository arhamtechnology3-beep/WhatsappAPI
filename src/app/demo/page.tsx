import { Metadata } from 'next'
import Link from 'next/link'
import { Play, Sparkles, CheckCircle2, ArrowRight, Video } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Watch Product Demo | WhatsApp CRM for Shopify - Arham Technology',
  description: 'See how Arham Technology CRM automates checkouts, templates, alerts, and campaigns. Watch a short 3-minute video walkthrough.',
}

export default function DemoPage() {
  const steps = [
    {
      step: '1',
      title: 'Install the App',
      desc: 'Enter your shopify store domain at sign-in, authorize permissions, and Arham Technology automatically maps webhook events.',
    },
    {
      step: '2',
      title: 'Connect WhatsApp API',
      desc: 'Add your Meta Phone Number ID and System User token via settings. We provide synthetic approval mocks for testing.',
    },
    {
      step: '3',
      title: 'Activate Automations',
      desc: 'Turn on the Cart Recovery sequence. Checkouts automatically trigger sequence drips and stop upon successful payment.',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {/* Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[140px]" />
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
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/demo" className="text-white font-semibold transition-colors">Watch Demo</Link>
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
            <span>Product Walkthrough Video</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
            See the WhatsApp CRM <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              in action
            </span>
          </h1>

          <p className="mt-4 text-slate-400 text-base max-w-xl mx-auto">
            Take a 3-minute video tour to learn how to connect Shopify and recover sales on autopilot.
          </p>
        </div>

        {/* Video Mockup Player Container */}
        <div className="max-w-4xl mx-auto rounded-2xl border border-slate-900 bg-slate-950 p-2 shadow-2xl shadow-indigo-500/5 overflow-hidden mb-20">
          <div className="rounded-xl border border-slate-850 bg-slate-900/50 aspect-video relative flex flex-col items-center justify-center group overflow-hidden">
            {/* Background Graphic representing a video thumbnail */}
            <div className="absolute inset-0 bg-slate-950/40 group-hover:scale-105 transition-transform duration-700 flex items-center justify-center">
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-slate-950/80 rounded-full px-3 py-1.5 border border-slate-800 text-[10px] text-slate-300 font-medium">
                <Video className="size-3.5 text-indigo-400" /> Walkthrough Demo
              </div>
              <div className="h-20 w-20 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center cursor-pointer shadow-lg shadow-indigo-600/30 transform transition-transform group-hover:scale-110 active:scale-95 duration-200">
                <Play className="size-8 fill-white ml-1.5" />
              </div>
            </div>
            {/* Visual background simulation */}
            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center bg-slate-950/85 backdrop-blur-md p-3.5 rounded-lg border border-slate-800 text-xs">
              <span className="text-slate-200 font-medium">Arham Technology WhatsApp CRM Setup Tour</span>
              <span className="text-indigo-400 font-bold">2:45 Mins</span>
            </div>
          </div>
        </div>

        {/* 3 Step Setup Guide */}
        <div className="border-t border-slate-900 pt-16 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-12">Getting started is simple</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((st) => (
              <div key={st.step} className="flex gap-4">
                <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-bold text-sm">
                  {st.step}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100 mb-1">{st.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{st.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Call to Action card */}
        <div className="mt-20 text-center max-w-xl mx-auto">
          <h3 className="text-lg font-bold text-white mb-2">Ready to recover your first cart?</h3>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            Get started with a 15-day free trial. Setup takes under 3 minutes.
          </p>
          <Link href="/signup" className="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20">
            Start Free Trial <ArrowRight className="ml-1.5 size-3.5" />
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
