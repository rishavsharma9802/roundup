/**
 * Outward-facing links.
 *
 * FILL THESE IN BEFORE PUBLISHING. They are the only three strings in the
 * codebase that point at you rather than at the extension, so they live alone
 * in one file instead of being scattered through the UI.
 *
 * Everything here opens in the user's browser or mail client. Nothing is ever
 * sent anywhere by the extension itself — there is no server to send it to.
 */
export const LINKS = {
  /** Public repository. Used for the issue tracker link. */
  repo: 'https://github.com/rishavsharma9802/roundup',
  /** Contact address for people who would rather not use GitHub. */
  email: 'kungfupanda792@gmail.com',
  /** Buy Me a Coffee page. Set to '' to hide the support link entirely. */
  support: '',
  /** Shown next to the support link so people know what they are supporting. */
  supportLabel: 'Buy me a coffee',
}

/** True once the repo placeholder has actually been replaced. */
export function linksConfigured(): boolean {
  return !LINKS.repo.includes('CHANGE-ME')
}

export function emailConfigured(): boolean {
  return !LINKS.email.includes('CHANGE-ME')
}

export function supportConfigured(): boolean {
  return LINKS.support.length > 0 && !LINKS.support.includes('CHANGE-ME')
}

interface SiteReport {
  domain: string
  landedIn: string
  expected?: string
}

/**
 * A pre-filled GitHub issue for a site that grouped wrong.
 *
 * Only the domain travels in the URL — never the full page address — and the
 * user still sees and edits the issue before anything is submitted.
 */
export function reportSiteIssueUrl(report: SiteReport): string {
  const title = `Wrong category: ${report.domain}`
  const body = [
    `**Site:** ${report.domain}`,
    `**It landed in:** ${report.landedIn}`,
    `**It should be:** ${report.expected ?? '(which category?)'}`,
    '',
    'Anything else worth knowing:',
    '',
  ].join('\n')
  return `${LINKS.repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}

/** A blank feedback issue, for anything that is not a mis-categorised site. */
export function feedbackIssueUrl(): string {
  return `${LINKS.repo}/issues/new?title=${encodeURIComponent('Feedback: ')}`
}

export function feedbackMailto(subject = 'Roundup feedback'): string {
  return `mailto:${LINKS.email}?subject=${encodeURIComponent(subject)}`
}
