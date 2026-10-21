"use client"

import Link from 'next/link'
import { UserPlus, Briefcase, Radio, Zap } from 'lucide-react'
import type { ComponentType } from 'react'

// Quick-action shortcuts. Each navigates to the page that owns the
// relevant "create" flow. We deliberately don't try to auto-open any
// modal on the target page — that'd require touching those pages,
// which is out of scope here.
interface Action {
  label: string
  hint: string
  href: string
  icon: ComponentType<{ className?: string }>
  tint: string
}

const ACTIONS: Action[] = [
  { label: 'New contact', hint: 'Add one person', href: '/contacts', icon: UserPlus, tint: 'text-primary' },
  { label: 'New deal', hint: 'Track a sale', href: '/pipelines', icon: Briefcase, tint: 'text-blue-400' },
  { label: 'New broadcast', hint: 'Message many people', href: '/broadcasts/new', icon: Radio, tint: 'text-amber-400' },
  { label: 'New automation', hint: 'Send it automatically', href: '/automations/new', icon: Zap, tint: 'text-primary' },
]

export function QuickActions() {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">Create</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The four things people add most often.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((a) => {
          const Icon = a.icon
          return (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ${a.tint}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{a.label}</span>
                <span className="block text-xs text-muted-foreground">{a.hint}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
