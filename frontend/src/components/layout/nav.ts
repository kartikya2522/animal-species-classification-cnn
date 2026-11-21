export interface NavItem {
  to: string
  label: string
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/identify', label: 'Identify' },
  { to: '/species', label: 'Species Atlas' },
  { to: '/ask', label: 'Field Guide' },
  { to: '/research', label: 'Research' },
  { to: '/about', label: 'About' },
]
