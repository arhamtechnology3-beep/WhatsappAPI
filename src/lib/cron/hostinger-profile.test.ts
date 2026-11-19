import { describe, expect, it } from 'vitest'
import {
  areChildCronRoutesDisabled,
  cronBatchLimits,
  enabledCronJobs,
  isAllCronDisabled,
  resolveCronProfile,
} from './hostinger-profile'

describe('hostinger-profile', () => {
  it('defaults to hostinger (light) off Vercel', () => {
    expect(resolveCronProfile({})).toBe('hostinger')
    expect([...enabledCronJobs({})].sort()).toEqual([
      'followups',
      'sequences',
      'shopify',
    ])
  })

  it('defaults to full on Vercel', () => {
    expect(resolveCronProfile({ VERCEL: '1' })).toBe('full')
    expect(enabledCronJobs({ VERCEL: '1' }).size).toBe(9)
  })

  it('honours CRON_PROFILE and CRON_JOBS overrides', () => {
    expect(resolveCronProfile({ CRON_PROFILE: 'full' })).toBe('full')
    expect([...enabledCronJobs({ CRON_JOBS: 'shopify,visitors' })].sort()).toEqual([
      'shopify',
      'visitors',
    ])
  })

  it('exposes kill switch and child-route gate', () => {
    expect(isAllCronDisabled({ DISABLE_ALL_CRON: '1' })).toBe(true)
    expect(areChildCronRoutesDisabled({})).toBe(true)
    expect(areChildCronRoutesDisabled({ VERCEL: '1' })).toBe(false)
    expect(areChildCronRoutesDisabled({ ALLOW_CHILD_CRON_ROUTES: '1' })).toBe(
      false,
    )
  })

  it('uses tiny batches on hostinger profile', () => {
    expect(cronBatchLimits({}).sendJobs).toBe(3)
    expect(cronBatchLimits({ CRON_PROFILE: 'full' }).sendJobs).toBe(20)
  })
})
