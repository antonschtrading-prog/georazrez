import { useId } from 'react'
import { SOIL_HATCH_LABELS, type SoilAppearance } from '@/types/geology'
import { SoilPatternDefinition } from '@/components/SoilPattern'

interface Props {
  appearance: SoilAppearance
  className?: string
}

/** Общий SVG-образец; те же условные шаблоны можно использовать на оформленном профиле. */
export function SoilSwatch({ appearance, className = '' }: Props) {
  const patternId = `soil-${useId().replace(/:/g, '')}`
  return <svg className={`soil-swatch ${className}`} viewBox="0 0 120 48" role="img" aria-label={`Цвет ${appearance.color}, ${SOIL_HATCH_LABELS[appearance.hatch].toLocaleLowerCase('ru-RU')}`}>
    <defs><SoilPatternDefinition id={patternId} hatch={appearance.hatch} /></defs>
    <rect width="120" height="48" fill={appearance.color} />
    {appearance.hatch !== 'none' && <rect width="120" height="48" fill={`url(#${patternId})`} />}
    <rect x="0.5" y="0.5" width="119" height="47" fill="none" stroke="currentColor" strokeOpacity="0.25" />
  </svg>
}
