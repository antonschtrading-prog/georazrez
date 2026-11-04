import type { SoilHatch } from '@/types/geology'

interface Props {
  id: string
  hatch: SoilHatch
  stroke?: string
}

/** Единый набор условных SVG-штриховок для библиотеки и оформленного профиля. */
export function SoilPatternDefinition({ id, hatch, stroke = '#4B4A43' }: Props) {
  return <pattern id={id} width="12" height="12" patternUnits="userSpaceOnUse">
    {hatch === 'diagonal' && <path d="M-3 3 L3-3 M0 12 L12 0 M9 15 L15 9" fill="none" stroke={stroke} strokeWidth="1.2" />}
    {hatch === 'cross' && <path d="M-3 3 L3-3 M0 12 L12 0 M9 15 L15 9 M-3 9 L3 15 M0 0 L12 12 M9-3 L15 3" fill="none" stroke={stroke} strokeWidth="1.1" />}
    {hatch === 'dots' && <><circle cx="3" cy="3" r="1.15" fill={stroke} /><circle cx="9" cy="9" r="1.15" fill={stroke} /></>}
    {hatch === 'horizontal' && <path d="M0 6 H12" fill="none" stroke={stroke} strokeWidth="1.2" />}
    {hatch === 'vertical' && <path d="M6 0 V12" fill="none" stroke={stroke} strokeWidth="1.2" />}
    {hatch === 'grid' && <path d="M0 6 H12 M6 0 V12" fill="none" stroke={stroke} strokeWidth="1.1" />}
  </pattern>
}
