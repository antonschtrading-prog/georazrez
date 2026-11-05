export type GostFamily = 'sand' | 'cohesive' | 'other'

export type GostIndicatorKey =
  | 'particlesGt2'
  | 'particlesGt05'
  | 'particlesGt025'
  | 'particlesGt01'
  | 'voidRatio'
  | 'saturationDegree'
  | 'plasticityIndex'
  | 'sandFraction'
  | 'liquidityIndex'

export interface GostSourceRef {
  standard: 'ГОСТ 25100-2020'
  edition: 'с поправкой, опубликованной в ИУС № 7, 2023'
  table: 'Б.7' | 'Б.9' | 'Б.10' | 'Б.13' | 'Б.14' | 'Б.16'
  row: string
  pdfPage: number
}

export interface GostRule {
  id: string
  group: 'Пески' | 'Глинистые грунты'
  indicators: readonly string[]
  conditions: readonly string[]
  result: string
  source: GostSourceRef
}

export interface GostClassificationInput {
  family: GostFamily
  values: Partial<Record<GostIndicatorKey, number>>
}

export interface GostIssue {
  code: 'invalid-number' | 'out-of-range' | 'inconsistent-gradation' | 'unsupported' | 'outside-table'
  message: string
  indicator?: GostIndicatorKey
}

export interface GostTraceEntry {
  ruleId: string
  actual: string
}

export interface GostUnassessed {
  indicator: GostIndicatorKey
  message: string
}

export interface GostClassificationResult {
  status: 'classified' | 'needs-data' | 'out-of-scope' | 'invalid'
  family: GostFamily
  name: string | null
  missing: GostIndicatorKey[]
  optionalMissing: GostIndicatorKey[]
  issues: GostIssue[]
  unassessed: GostUnassessed[]
  trace: GostTraceEntry[]
  notes: string[]
}

const source = (
  table: GostSourceRef['table'],
  row: string,
  pdfPage: number
): GostSourceRef => ({
  standard: 'ГОСТ 25100-2020',
  edition: 'с поправкой, опубликованной в ИУС № 7, 2023',
  table,
  row,
  pdfPage
})

const rule = (
  id: string,
  group: GostRule['group'],
  indicators: readonly string[],
  conditions: readonly string[],
  result: string,
  ruleSource: GostSourceRef
): GostRule => ({ id, group, indicators, conditions, result, source: ruleSource })

const densityRules = (
  prefix: string,
  varieties: string,
  denseLimit: number,
  mediumLimit: number,
  firstPage: number
): GostRule[] => [
  rule(
    `${prefix}-dense`,
    'Пески',
    ['Коэффициент пористости e, д.е.'],
    [`e ≤ ${denseLimit.toFixed(2).replace('.', ',')}`],
    'Плотный',
    source('Б.10', `${varieties} — плотные`, firstPage)
  ),
  rule(
    `${prefix}-medium`,
    'Пески',
    ['Коэффициент пористости e, д.е.'],
    [
      `${denseLimit.toFixed(2).replace('.', ',')} < e ≤ ${mediumLimit.toFixed(2).replace('.', ',')}`
    ],
    'Средней плотности',
    source('Б.10', `${varieties} — средней плотности`, firstPage)
  ),
  rule(
    `${prefix}-loose`,
    'Пески',
    ['Коэффициент пористости e, д.е.'],
    [`e > ${mediumLimit.toFixed(2).replace('.', ',')}`],
    'Рыхлый',
    source('Б.10', `${varieties} — рыхлые`, firstPage === 17 ? 18 : firstPage)
  )
]

export const GOST_25100_RULES: readonly GostRule[] = [
  rule('b7-coarse-fragment', 'Пески', ['Содержание частиц крупнее 2 мм, %'], ['Частиц > 2 мм более 50 %'], 'Крупнообломочный грунт гравийный/дресвяный', source('Б.7', 'Крупнообломочный грунт гравийный/дресвяный', 16)),
  rule('b7-gravelly', 'Пески', ['Содержание частиц крупнее 2 мм, %'], ['Частиц > 2 мм более 25 %'], 'Песок гравелистый', source('Б.7', 'Песок гравелистый', 16)),
  rule('b7-coarse', 'Пески', ['Содержание частиц крупнее 0,50 мм, %'], ['Частиц > 0,50 мм более 50 %'], 'Песок крупный', source('Б.7', 'Песок крупный', 16)),
  rule('b7-medium', 'Пески', ['Содержание частиц крупнее 0,25 мм, %'], ['Частиц > 0,25 мм более 50 %'], 'Песок средней крупности', source('Б.7', 'Песок средней крупности', 16)),
  rule('b7-fine', 'Пески', ['Содержание частиц крупнее 0,10 мм, %'], ['Частиц > 0,10 мм не менее 75 %'], 'Песок мелкий', source('Б.7', 'Песок мелкий', 17)),
  rule('b7-silty', 'Пески', ['Содержание частиц крупнее 0,10 мм, %'], ['Частиц > 0,10 мм менее 75 %'], 'Песок пылеватый', source('Б.7', 'Песок пылеватый', 17)),

  rule('b9-low', 'Пески', ['Степень водонасыщения Sr, д.е.'], ['0 < Sr ≤ 0,5'], 'Малой степени водонасыщения', source('Б.9', 'Пески малой степени водонасыщения', 17)),
  rule('b9-medium', 'Пески', ['Степень водонасыщения Sr, д.е.'], ['0,5 < Sr ≤ 0,8'], 'Средней степени водонасыщения', source('Б.9', 'Пески средней степени водонасыщения', 17)),
  rule('b9-saturated', 'Пески', ['Степень водонасыщения Sr, д.е.'], ['0,8 < Sr ≤ 1'], 'Водонасыщенный', source('Б.9', 'Пески водонасыщенные', 17)),

  ...densityRules('b10-coarse', 'Гравелистые, крупные и средней крупности', 0.55, 0.70, 17),
  ...densityRules('b10-fine', 'Мелкие', 0.60, 0.75, 18),
  ...densityRules('b10-silty', 'Пылеватые', 0.60, 0.80, 18),

  rule('b13-sandy-loam', 'Глинистые грунты', ['Число пластичности Ip, д.е.'], ['0,01 ≤ Ip ≤ 0,07'], 'Супесь', source('Б.13', 'Супесь', 18)),
  rule('b13-loam', 'Глинистые грунты', ['Число пластичности Ip, д.е.'], ['0,07 < Ip ≤ 0,17'], 'Суглинок', source('Б.13', 'Суглинок', 18)),
  rule('b13-clay', 'Глинистые грунты', ['Число пластичности Ip, д.е.'], ['Ip > 0,17'], 'Глина', source('Б.13', 'Глина', 18)),

  rule('b14-sandy-loam-sandy', 'Глинистые грунты', ['Ip, д.е.', 'Песчаные частицы 2–0,05 мм, %'], ['0,01 ≤ Ip ≤ 0,07', 'Песчаных частиц ≥ 50 %'], 'Супесь песчанистая', source('Б.14', 'Супесь песчанистая', 19)),
  rule('b14-sandy-loam-silty', 'Глинистые грунты', ['Ip, д.е.', 'Песчаные частицы 2–0,05 мм, %'], ['0,01 ≤ Ip ≤ 0,07', 'Песчаных частиц < 50 %'], 'Супесь пылеватая', source('Б.14', 'Супесь пылеватая', 19)),
  rule('b14-loam-light-sandy', 'Глинистые грунты', ['Ip, д.е.', 'Песчаные частицы 2–0,05 мм, %'], ['0,07 < Ip ≤ 0,12', 'Песчаных частиц ≥ 40 %'], 'Суглинок лёгкий песчанистый', source('Б.14', 'Суглинок лёгкий песчанистый', 19)),
  rule('b14-loam-light-silty', 'Глинистые грунты', ['Ip, д.е.', 'Песчаные частицы 2–0,05 мм, %'], ['0,07 < Ip ≤ 0,12', 'Песчаных частиц < 40 %'], 'Суглинок лёгкий пылеватый', source('Б.14', 'Суглинок лёгкий пылеватый', 19)),
  rule('b14-loam-heavy-sandy', 'Глинистые грунты', ['Ip, д.е.', 'Песчаные частицы 2–0,05 мм, %'], ['0,12 < Ip ≤ 0,17', 'Песчаных частиц ≥ 40 %'], 'Суглинок тяжёлый песчанистый', source('Б.14', 'Суглинок тяжёлый песчанистый', 19)),
  rule('b14-loam-heavy-silty', 'Глинистые грунты', ['Ip, д.е.', 'Песчаные частицы 2–0,05 мм, %'], ['0,12 < Ip ≤ 0,17', 'Песчаных частиц < 40 %'], 'Суглинок тяжёлый пылеватый', source('Б.14', 'Суглинок тяжёлый пылеватый', 19)),
  rule('b14-clay-light-sandy', 'Глинистые грунты', ['Ip, д.е.', 'Песчаные частицы 2–0,05 мм, %'], ['0,17 < Ip ≤ 0,27', 'Песчаных частиц ≥ 40 %'], 'Глина лёгкая песчанистая', source('Б.14', 'Глина лёгкая песчанистая', 19)),
  rule('b14-clay-light-silty', 'Глинистые грунты', ['Ip, д.е.', 'Песчаные частицы 2–0,05 мм, %'], ['0,17 < Ip ≤ 0,27', 'Песчаных частиц < 40 %'], 'Глина лёгкая пылеватая', source('Б.14', 'Глина лёгкая пылеватая', 19)),
  rule('b14-clay-heavy', 'Глинистые грунты', ['Ip, д.е.'], ['Ip > 0,27', 'Содержание песчаных частиц не регламентируется'], 'Глина тяжёлая', source('Б.14', 'Глина тяжёлая', 19)),

  rule('b16-sandy-loam-solid', 'Глинистые грунты', ['Показатель текучести IL, д.е.'], ['IL < 0'], 'Твёрдая', source('Б.16', 'Супесь твёрдая', 19)),
  rule('b16-sandy-loam-plastic', 'Глинистые грунты', ['Показатель текучести IL, д.е.'], ['0 ≤ IL ≤ 1'], 'Пластичная', source('Б.16', 'Супесь пластичная', 19)),
  rule('b16-sandy-loam-fluid', 'Глинистые грунты', ['Показатель текучести IL, д.е.'], ['IL > 1'], 'Текучая', source('Б.16', 'Супесь текучая', 19)),
  rule('b16-solid', 'Глинистые грунты', ['Показатель текучести IL, д.е.'], ['IL < 0'], 'Твёрдый / твёрдая', source('Б.16', 'Суглинки и глины твёрдые', 19)),
  rule('b16-semi-solid', 'Глинистые грунты', ['Показатель текучести IL, д.е.'], ['0 ≤ IL ≤ 0,25'], 'Полутвёрдый / полутвёрдая', source('Б.16', 'Суглинки и глины полутвёрдые', 19)),
  rule('b16-stiff-plastic', 'Глинистые грунты', ['Показатель текучести IL, д.е.'], ['0,25 < IL ≤ 0,50'], 'Тугопластичный / тугопластичная', source('Б.16', 'Суглинки и глины тугопластичные', 19)),
  rule('b16-soft-plastic', 'Глинистые грунты', ['Показатель текучести IL, д.е.'], ['0,50 < IL ≤ 0,75'], 'Мягкопластичный / мягкопластичная', source('Б.16', 'Суглинки и глины мягкопластичные', 19)),
  rule('b16-fluid-plastic', 'Глинистые грунты', ['Показатель текучести IL, д.е.'], ['0,75 < IL ≤ 1'], 'Текучепластичный / текучепластичная', source('Б.16', 'Суглинки и глины текучепластичные', 19)),
  rule('b16-fluid', 'Глинистые грунты', ['Показатель текучести IL, д.е.'], ['IL > 1'], 'Текучий / текучая', source('Б.16', 'Суглинки и глины текучие', 19))
] as const

export const GOST_INDICATOR_LABELS: Record<GostIndicatorKey, string> = {
  particlesGt2: 'содержание частиц > 2 мм',
  particlesGt05: 'содержание частиц > 0,50 мм',
  particlesGt025: 'содержание частиц > 0,25 мм',
  particlesGt01: 'содержание частиц > 0,10 мм',
  voidRatio: 'коэффициент пористости e',
  saturationDegree: 'степень водонасыщения Sr',
  plasticityIndex: 'число пластичности Ip',
  sandFraction: 'содержание песчаных частиц 2–0,05 мм',
  liquidityIndex: 'показатель текучести IL'
}

const ruleMap = new Map(GOST_25100_RULES.map(item => [item.id, item]))

export function getGostRule(id: string): GostRule {
  const found = ruleMap.get(id)
  if (!found) throw new Error(`Неизвестное правило ГОСТ: ${id}`)
  return found
}

const emptyResult = (family: GostFamily): GostClassificationResult => ({
  status: 'needs-data',
  family,
  name: null,
  missing: [],
  optionalMissing: [],
  issues: [],
  unassessed: [],
  trace: [],
  notes: []
})

const formatNumber = (value: number) => String(value).replace('.', ',')

const validateValues = (input: GostClassificationInput, result: GostClassificationResult) => {
  const relevant: GostIndicatorKey[] = input.family === 'sand'
    ? ['particlesGt2', 'particlesGt05', 'particlesGt025', 'particlesGt01', 'voidRatio', 'saturationDegree']
    : input.family === 'cohesive'
      ? ['plasticityIndex', 'sandFraction', 'liquidityIndex']
      : []

  for (const key of relevant) {
    const value = input.values[key]
    if (value === undefined) continue
    if (!Number.isFinite(value)) {
      result.issues.push({ code: 'invalid-number', indicator: key, message: `${GOST_INDICATOR_LABELS[key]}: введите конечное число.` })
      continue
    }
    const isPercent = key === 'particlesGt2' || key === 'particlesGt05' || key === 'particlesGt025' || key === 'particlesGt01' || key === 'sandFraction'
    if (isPercent && (value < 0 || value > 100)) {
      result.issues.push({ code: 'out-of-range', indicator: key, message: `${GOST_INDICATOR_LABELS[key]}: допустим диапазон от 0 до 100 %.` })
    }
    if (key === 'voidRatio' && value < 0) {
      result.issues.push({ code: 'out-of-range', indicator: key, message: 'Коэффициент пористости e не может быть отрицательным.' })
    }
    if (key === 'saturationDegree' && (value < 0 || value > 1)) {
      result.issues.push({ code: 'out-of-range', indicator: key, message: 'Степень водонасыщения Sr должна быть в диапазоне от 0 до 1 д.е.' })
    }
    if (key === 'plasticityIndex' && value < 0) {
      result.issues.push({ code: 'out-of-range', indicator: key, message: 'Число пластичности Ip не может быть отрицательным.' })
    }
  }

  const gradation: GostIndicatorKey[] = input.family === 'sand'
    ? ['particlesGt2', 'particlesGt05', 'particlesGt025', 'particlesGt01']
    : []
  for (let index = 1; index < gradation.length; index += 1) {
    const previous = input.values[gradation[index - 1]]
    const current = input.values[gradation[index]]
    if (previous === undefined || current === undefined || !Number.isFinite(previous) || !Number.isFinite(current)) continue
    if (current < previous) {
      result.issues.push({
        code: 'inconsistent-gradation',
        indicator: gradation[index],
        message: 'Накопительные содержания должны быть неубывающими: > 2 мм ≤ > 0,50 мм ≤ > 0,25 мм ≤ > 0,10 мм.'
      })
    }
  }
}

const addSandExtras = (
  input: GostClassificationInput,
  result: GostClassificationResult,
  densityPrefix: 'b10-coarse' | 'b10-fine' | 'b10-silty'
) => {
  const e = input.values.voidRatio
  if (e === undefined) {
    result.unassessed.push({ indicator: 'voidRatio', message: 'Плотность не определялась: не введён коэффициент пористости e.' })
  } else {
    const limits = densityPrefix === 'b10-coarse'
      ? { dense: 0.55, medium: 0.70 }
      : densityPrefix === 'b10-fine'
        ? { dense: 0.60, medium: 0.75 }
        : { dense: 0.60, medium: 0.80 }
    const suffix = e <= limits.dense ? 'dense' : e <= limits.medium ? 'medium' : 'loose'
    result.trace.push({ ruleId: `${densityPrefix}-${suffix}`, actual: `e = ${formatNumber(e)} д.е.` })
  }

  const sr = input.values.saturationDegree
  if (sr === undefined) {
    result.unassessed.push({ indicator: 'saturationDegree', message: 'Степень водонасыщения не определялась: не введён Sr.' })
  } else if (sr === 0) {
    result.unassessed.push({ indicator: 'saturationDegree', message: 'Степень водонасыщения не определена: Sr = 0 не входит в диапазон 0 < Sr ≤ 1 таблицы Б.9.' })
    result.issues.push({ code: 'outside-table', indicator: 'saturationDegree', message: 'Таблица Б.9 не даёт наименования для Sr = 0.' })
  } else {
    const ruleId = sr <= 0.5 ? 'b9-low' : sr <= 0.8 ? 'b9-medium' : 'b9-saturated'
    result.trace.push({ ruleId, actual: `Sr = ${formatNumber(sr)} д.е.` })
  }
}

const classifySand = (input: GostClassificationInput, result: GostClassificationResult) => {
  const gt2 = input.values.particlesGt2
  if (gt2 === undefined) {
    result.missing.push('particlesGt2')
    return
  }
  if (gt2 > 50) {
    result.status = 'out-of-scope'
    result.name = 'Крупнообломочный грунт гравийный/дресвяный'
    result.trace.push({ ruleId: 'b7-coarse-fragment', actual: `Частиц > 2 мм: ${formatNumber(gt2)} %` })
    result.issues.push({ code: 'unsupported', message: 'Это не песок по таблице Б.7. Подразделение крупнообломочных грунтов не входит в текущую область помощника.' })
    return
  }

  let baseRuleId: string
  let densityPrefix: 'b10-coarse' | 'b10-fine' | 'b10-silty'
  let actual: string
  if (gt2 > 25) {
    baseRuleId = 'b7-gravelly'
    densityPrefix = 'b10-coarse'
    actual = `Частиц > 2 мм: ${formatNumber(gt2)} %`
  } else {
    const gt05 = input.values.particlesGt05
    if (gt05 === undefined) {
      result.missing.push('particlesGt05')
      return
    }
    if (gt05 > 50) {
      baseRuleId = 'b7-coarse'
      densityPrefix = 'b10-coarse'
      actual = `Частиц > 0,50 мм: ${formatNumber(gt05)} %`
    } else {
      const gt025 = input.values.particlesGt025
      if (gt025 === undefined) {
        result.missing.push('particlesGt025')
        return
      }
      if (gt025 > 50) {
        baseRuleId = 'b7-medium'
        densityPrefix = 'b10-coarse'
        actual = `Частиц > 0,25 мм: ${formatNumber(gt025)} %`
      } else {
        const gt01 = input.values.particlesGt01
        if (gt01 === undefined) {
          result.missing.push('particlesGt01')
          return
        }
        baseRuleId = gt01 >= 75 ? 'b7-fine' : 'b7-silty'
        densityPrefix = gt01 >= 75 ? 'b10-fine' : 'b10-silty'
        actual = `Частиц > 0,10 мм: ${formatNumber(gt01)} %`
      }
    }
  }

  result.status = 'classified'
  result.trace.push({ ruleId: baseRuleId, actual })
  addSandExtras(input, result, densityPrefix)
}

const addCohesiveConsistency = (
  input: GostClassificationInput,
  result: GostClassificationResult,
  sandyLoam: boolean
) => {
  const il = input.values.liquidityIndex
  if (il === undefined) {
    result.unassessed.push({ indicator: 'liquidityIndex', message: 'Консистенция не определялась: не введён показатель текучести IL.' })
    return
  }
  let ruleId: string
  if (sandyLoam) {
    ruleId = il < 0 ? 'b16-sandy-loam-solid' : il <= 1 ? 'b16-sandy-loam-plastic' : 'b16-sandy-loam-fluid'
  } else {
    ruleId = il < 0
      ? 'b16-solid'
      : il <= 0.25
        ? 'b16-semi-solid'
        : il <= 0.50
          ? 'b16-stiff-plastic'
          : il <= 0.75
            ? 'b16-soft-plastic'
            : il <= 1
              ? 'b16-fluid-plastic'
              : 'b16-fluid'
  }
  result.trace.push({ ruleId, actual: `IL = ${formatNumber(il)} д.е.` })
}

const classifyCohesive = (input: GostClassificationInput, result: GostClassificationResult) => {
  const ip = input.values.plasticityIndex
  if (ip === undefined) {
    result.missing.push('plasticityIndex')
    return
  }
  if (ip < 0.01) {
    result.status = 'out-of-scope'
    result.issues.push({ code: 'outside-table', indicator: 'plasticityIndex', message: 'Ip < 0,01 не входит в диапазоны супеси, суглинка и глины таблицы Б.13. Помощник не присваивает другое наименование автоматически.' })
    return
  }

  result.status = 'classified'
  const sandFraction = input.values.sandFraction
  let baseRuleId: string
  let subtypeRuleId: string | null = null
  let sandyLoam = false

  if (ip <= 0.07) {
    baseRuleId = 'b13-sandy-loam'
    sandyLoam = true
    if (sandFraction === undefined) result.optionalMissing.push('sandFraction')
    else subtypeRuleId = sandFraction >= 50 ? 'b14-sandy-loam-sandy' : 'b14-sandy-loam-silty'
  } else if (ip <= 0.17) {
    baseRuleId = 'b13-loam'
    if (sandFraction === undefined) {
      result.optionalMissing.push('sandFraction')
    } else if (ip <= 0.12) {
      subtypeRuleId = sandFraction >= 40 ? 'b14-loam-light-sandy' : 'b14-loam-light-silty'
    } else {
      subtypeRuleId = sandFraction >= 40 ? 'b14-loam-heavy-sandy' : 'b14-loam-heavy-silty'
    }
  } else {
    baseRuleId = 'b13-clay'
    if (ip > 0.27) {
      subtypeRuleId = 'b14-clay-heavy'
      if (sandFraction !== undefined) {
        result.notes.push('Для тяжёлой глины содержание песчаных частиц по таблице Б.14 не регламентируется и в наименование не добавляется.')
      }
    } else if (sandFraction === undefined) {
      result.optionalMissing.push('sandFraction')
    } else {
      subtypeRuleId = sandFraction >= 40 ? 'b14-clay-light-sandy' : 'b14-clay-light-silty'
    }
  }

  result.trace.push({ ruleId: baseRuleId, actual: `Ip = ${formatNumber(ip)} д.е.` })
  if (subtypeRuleId) {
    result.trace.push({
      ruleId: subtypeRuleId,
      actual: sandFraction === undefined ? `Ip = ${formatNumber(ip)} д.е.` : `Ip = ${formatNumber(ip)} д.е.; песчаных частиц 2–0,05 мм: ${formatNumber(sandFraction)} %`
    })
  }
  addCohesiveConsistency(input, result, sandyLoam)
}

const SHARED_CONSISTENCY_NAMES: Record<string, { loam: string; clay: string }> = {
  'b16-solid': { loam: 'твёрдый', clay: 'твёрдая' },
  'b16-semi-solid': { loam: 'полутвёрдый', clay: 'полутвёрдая' },
  'b16-stiff-plastic': { loam: 'тугопластичный', clay: 'тугопластичная' },
  'b16-soft-plastic': { loam: 'мягкопластичный', clay: 'мягкопластичная' },
  'b16-fluid-plastic': { loam: 'текучепластичный', clay: 'текучепластичная' },
  'b16-fluid': { loam: 'текучий', clay: 'текучая' }
}

const composeName = (result: GostClassificationResult) => {
  if (result.status !== 'classified') return
  const names = result.trace.map(entry => getGostRule(entry.ruleId).result)
  const base = names[0]
  const subtype = result.family === 'cohesive' && result.trace.length > 1 && result.trace[1].ruleId.startsWith('b14-')
    ? names[1]
    : null
  const isClay = result.trace.some(entry => entry.ruleId === 'b13-clay')
  const extras = result.trace.filter(entry => {
    if (result.family === 'sand') return !entry.ruleId.startsWith('b7-')
    return entry.ruleId.startsWith('b16-')
  }).map(entry => {
    const shared = SHARED_CONSISTENCY_NAMES[entry.ruleId]
    if (shared) return isClay ? shared.clay : shared.loam
    return getGostRule(entry.ruleId).result.toLocaleLowerCase('ru-RU')
  })
  result.name = [subtype || base, ...extras].join(', ')
}

/** Чистый расчёт: не читает и не изменяет CoreModel, скважины или паспорта ИГЭ. */
export function classifyGost25100(input: GostClassificationInput): GostClassificationResult {
  const result = emptyResult(input.family)
  if (input.family === 'other') {
    result.status = 'out-of-scope'
    result.issues.push({ code: 'unsupported', message: 'Скальные, мёрзлые, органические, техногенные и другие классы пока не поддерживаются. Выберите песок или глинистый грунт либо выполните классификацию вручную по полному тексту ГОСТ.' })
    return result
  }

  validateValues(input, result)
  if (result.issues.length > 0) {
    result.status = 'invalid'
    return result
  }

  if (input.family === 'sand') classifySand(input, result)
  else classifyCohesive(input, result)
  composeName(result)
  return result
}
