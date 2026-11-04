import { useId } from 'react'
import { SOIL_HATCH_LABELS, type SoilAppearance } from '@/types/geology'

interface Props {
  appearance: SoilAppearance
  className?: string
}

/** Общий SVG-образец; те же условные шаблоны можно использовать на оформленном профиле. */
export function SoilSwatch({ appearance, className = '' }: Props) {
  const patternId = `soil-${useId().replace(/:/g, '')}`
  const stroke = '#4B4A43'
  return <svg className={`soil-swatch ${className}`} viewBox="0 0 120 48" role="img" aria-label={`Цвет ${appearance.color}, ${SOIL_HATCH_LABELS[appearance.hatch].toLocaleLowerCase('ru-RU')}`}>
    <defs>
      <pattern id={patternId} width="12" height="12" patternUnits="userSpaceOnUse">
        {appearance.hatch === 'diagonal' && <path d="M-3 3 L3-3 M0 12 L12 0 M9 15 L15 9" fill="none" stroke={stroke} strokeWidth="1.2" />}
        {appearance.hatch === 'cross' && <path d="M-3 3 L3-3 M0 12 L12 0 M9 15 L15 9 M-3 9 L3 15 M0 0 L12 12 M9-3 L15 3" fill="none" stroke={stroke} strokeWidth="1.1" />}
        {appearance.hatch === 'dots' && <><circle cx="3" cy="3" r="1.15" fill={stroke} /><circle cx="9" cy="9" r="1.15" fill={stroke} /></>}
        {appearance.hatch === 'horizontal' && <path d="M0 6 H12" fill="none" stroke={stroke} strokeWidth="1.2" />}
        {appearance.hatch === 'vertical' && <path d="M6 0 V12" fill="none" stroke={stroke} strokeWidth="1.2" />}
        {appearance.hatch === 'grid' && <path d="M0 6 H12 M6 0 V12" fill="none" stroke={stroke} strokeWidth="1.1" />}
      </pattern>
    </defs>
    <rect width="120" height="48" fill={appearance.color} />
    {appearance.hatch !== 'none' && <rect width="120" height="48" fill={`url(#${patternId})`} />}
    <rect x="0.5" y="0.5" width="119" height="47" fill="none" stroke="currentColor" strokeOpacity="0.25" />
  </svg>
}
