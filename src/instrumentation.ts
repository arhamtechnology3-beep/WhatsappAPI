export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startInProcessCron } = await import('./lib/cron/in-process')
    startInProcessCron()
  }
}
