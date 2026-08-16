/**
 * Rules for Settings → Templates "Sync from Meta".
 *
 * Meta still owns every Approved HSM on the WABA. Sync used to INSERT
 * every one of those into wacrm, so Delete all / local delete was undone
 * the next time someone clicked Sync.
 */

export function isSkippedMetaCatalogTemplate(name: string): boolean {
  const n = name.toLowerCase()
  return (
    n.startsWith('jaspers_') ||
    n.startsWith('sample_') ||
    n.startsWith('wacrm_') ||
    n === 'hello_world' ||
    n.includes('3p_direct_integration')
  )
}

/**
 * Only refresh rows that already exist in wacrm. Deleted templates stay
 * gone even if Meta still has an Approved copy.
 */
export function shouldImportNewMetaTemplate(): boolean {
  return false
}
