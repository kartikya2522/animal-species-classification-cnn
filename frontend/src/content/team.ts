/**
 * Team section on the About page (hidden if this list is empty; see frontend/README.md,
 * "Content"). Names as provided by the team; only add roles or links people agreed to publish.
 *
 * Optional fields, e.g.:
 *   { name: 'A. Person', role: 'Model training and evaluation', link: 'https://example.org' }
 */
export interface TeamMember {
  name: string
  /** What they worked on, e.g. "Frontend and design". */
  role?: string
  /** Optional profile or homepage URL (http/https). */
  link?: string
}

export const TEAM: TeamMember[] = [
  { name: 'Sameer Kadam' },
  { name: 'Kartikya Gawali' },
  { name: 'Yash More' },
  { name: 'Pratik Bhosale' },
]
