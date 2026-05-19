export const FRUIT_TYPES = [
  'Blueberry',
  'Hazelnut',
  'Walnut',
  'Tea',
] as const

export const FRUIT_COLOR_MAP: Record<string, string> = {
  blueberry: 'bg-fruit-blueberry text-white',
  hazelnut: 'bg-fruit-hazelnut text-white',
  walnut: 'bg-fruit-walnut text-white',
  tea: 'bg-fruit-tea text-white',
}