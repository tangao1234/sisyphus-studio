/**
 * 剧本分析双维度（纯函数，启发式评估，供体检面板与 window API 使用）：
 *
 * 1. 场景功能维度（runSceneAnalysis）——框架来自 scene-analysis 技能：
 *    每场戏必须回答「什么改变了」，需同时具备情节功能与人物功能。
 *    对每场评估：是否有明确冲突/目标、是否有转折或信息增量、是否疑似过场戏。
 *
 * 2. 人物弧光维度（runArcCheck）——框架来自 arc-check 技能：
 *    弧光 = 人物在叙事中的情感/立场变化，变化必须可见、由事件支撑。
 *    定位每个有戏份人物的首现/末现、对白量曲线与「变化场」，
 *    主角全片无变化场 → 弧光缺失警告。
 *
 * 所有判断均为关键词与统计启发式，UI 需注明「启发式评估，仅供参考」。
 */

import { parseFountain } from './fountain'
import { extractEntities } from './entities'
import type { Outline, SceneCard } from './types'

export interface AnalysisIssue {
  level: 'warn' | 'info'
  rule: string
  message: string
}

/** 冲突/目标关键词（beat/purpose/对白 中命中即视为有对抗性内容） */
const CONFLICT_WORDS = [
  '冲突', '争执', '争吵', '对峙', '质问', '拒绝', '逼迫', '威胁', '摊牌', '分歧',
  '阻拦', '挣扎', '隐瞒', '逼迫', '怀疑', '犹豫', '矛盾', '秘密', '谎言', '困境', '不安',
]

/** 转折/信息增量关键词 */
const TURN_WORDS = [
  '发现', '揭示', '真相', '决定', '改变', '转折', '承认', '曝光', '得知',
  '突然', '原来', '认出', '出现', '找回', '失去',
]

/** 人物变化/抉择关键词（弧光定位用） */
export const CHANGE_WORDS = [
  '决定', '放弃', '承认', '离开', '回来', '原谅', '坦白', '选择', '告别', '醒悟', '面对', '改变',
]

interface SceneSlice {
  index: number
  heading: string
  location: string
  time: string
  dialogueCount: number
  actionCount: number
  text: string
  characters: string[]
}

/** 把剧本切成逐场片段（不合并相同地点） */
function sliceScenes(script: string): SceneSlice[] {
  const parsed = parseFountain(script)
  const entities = extractEntities(parsed)
  const slices: SceneSlice[] = []
  let sceneIndex = 0
  let currentCharacter = ''
  for (const el of parsed.elements) {
    if (el.type === 'scene') {
      sceneIndex += 1
      const found = entities.scenes.find((s) => el.text.includes(s.location))
      slices.push({
        index: sceneIndex,
        heading: el.text,
        location: found?.location ?? el.text,
        time: found?.times[0] ?? '',
        dialogueCount: 0,
        actionCount: 0,
        text: '',
        characters: [],
      })
      currentCharacter = ''
      continue
    }
    const slice = slices[slices.length - 1]
    if (!slice) continue
    if (el.type === 'character') {
      currentCharacter = el.text.replace(/[(（][^)）]*[)）]/g, '').replace(/\^$/, '').trim()
      if (!slice.characters.includes(currentCharacter)) slice.characters.push(currentCharacter)
    } else if (el.type === 'dialogue' || el.type === 'parenthetical') {
      slice.dialogueCount += 1
      slice.text += `${currentCharacter}：${el.text}\n`
    } else if (el.type === 'action') {
      slice.actionCount += 1
      slice.text += `${el.text}\n`
    }
  }
  return slices
}

function hitAny(text: string, words: string[]): string[] {
  return words.filter((w) => text.includes(w))
}

/** 相邻两场 beat 的字符二元组重合度（> 0.6 视为高度雷同） */
function beatSimilarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const set = new Set<string>()
    const clean = s.replace(/\s/g, '')
    for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2))
    return set
  }
  const sa = bigrams(a)
  const sb = bigrams(b)
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const g of sa) if (sb.has(g)) inter += 1
  return inter / Math.min(sa.size, sb.size)
}

/* ── 维度一：场景功能 ─────────────────────────────────── */

export interface SceneDiagnosis {
  index: number
  label: string
  /** 0 弱 / 1 偏弱 / 2 健康 */
  grade: 0 | 1 | 2
  hasConflict: boolean
  hasTurn: boolean
  isTransition: boolean
  notes: string[]
}

export interface SceneAnalysisReport {
  score: number
  scenes: SceneDiagnosis[]
  issues: AnalysisIssue[]
  summary: string
}

export function runSceneAnalysis(input: {
  outline: Outline
  sceneList: SceneCard[]
  script: string
}): SceneAnalysisReport {
  const slices = sliceScenes(input.script)
  const issues: AnalysisIssue[] = []
  const scenes: SceneDiagnosis[] = []

  // 分场卡按地点索引（用于补充 beat / purpose / characters）
  const cardByLocation = new Map<string, SceneCard>()
  for (const card of input.sceneList) {
    if (card.location.trim()) cardByLocation.set(card.location.trim(), card)
  }

  // 骨架：优先逐场切片；剧本为空时退化为分场卡
  const rows: Array<{
    index: number
    label: string
    card?: SceneCard
    slice?: SceneSlice
  }> =
    slices.length > 0
      ? slices.map((s) => ({
          index: s.index,
          label: s.heading,
          card: cardByLocation.get(s.location),
          slice: s,
        }))
      : input.sceneList.map((card, i) => ({
          index: i + 1,
          label: `${card.io}·${card.location || '未命名'}·${card.time}`,
          card,
        }))

  rows.forEach((row, i) => {
    const beat = row.card?.beat ?? ''
    const purpose = row.card?.purpose ?? ''
    const sceneText = `${beat}\n${purpose}\n${row.slice?.text ?? ''}`

    const conflictHits = hitAny(sceneText, CONFLICT_WORDS)
    const turnHits = hitAny(sceneText, TURN_WORDS)
    const hasConflict = conflictHits.length > 0 || (row.slice?.dialogueCount ?? 0) >= 4
    const hasTurn = turnHits.length > 0

    const dialogueCount = row.slice?.dialogueCount ?? 0
    const actionCount = row.slice?.actionCount ?? 0

    const notes: string[] = []
    let grade: 0 | 1 | 2 = 2

    // 疑似过场戏：无功能陈述、无节拍、几乎无对白无动作
    const isTransition =
      !purpose.trim() && !beat.trim() && dialogueCount === 0 && actionCount <= 1 && row.slice !== undefined

    const prevBeat = i > 0 ? (rows[i - 1].card?.beat ?? '') : ''
    const beatEcho = beat.trim() !== '' && prevBeat.trim() !== '' && beatSimilarity(beat, prevBeat) > 0.6

    if (isTransition) {
      grade = 0
      notes.push('疑似过场戏：无戏剧功能陈述，几乎无对白与动作，考虑删除或并入邻场')
      issues.push({
        level: 'warn',
        rule: '场景功能',
        message: `第 ${row.index} 场「${row.label}」疑似过场戏：无 purpose / beat，几乎无对白与动作。`,
      })
    } else {
      if (!purpose.trim()) {
        grade = Math.min(grade, 1) as 0 | 1 | 2
        notes.push('戏剧功能未填写：这场戏为什么存在？')
      }
      if (!hasConflict && !hasTurn) {
        grade = Math.min(grade, 1) as 0 | 1 | 2
        notes.push('未检出明显冲突或转折：「什么改变了」不明确')
        issues.push({
          level: 'warn',
          rule: '场景功能',
          message: `第 ${row.index} 场「${row.label}」未检出冲突或转折，考虑给它一个任务或合并。`,
        })
      }
      if (beatEcho) {
        grade = Math.min(grade, 1) as 0 | 1 | 2
        notes.push('本场节拍与上一场高度雷同')
        issues.push({
          level: 'info',
          rule: '场景功能',
          message: `第 ${row.index} 场节拍与第 ${row.index - 1} 场高度雷同，信息增量不足。`,
        })
      }
      if (hasConflict) notes.push(`冲突/目标：${conflictHits.length > 0 ? conflictHits.slice(0, 2).join('、') : '对白交锋'}`)
      if (hasTurn) notes.push(`转折/增量：${turnHits.slice(0, 2).join('、')}`)
      if (notes.length === 0) notes.push('功能完整')
    }

    scenes.push({
      index: row.index,
      label: row.label,
      grade,
      hasConflict,
      hasTurn,
      isTransition,
      notes,
    })
  })

  const healthy = scenes.filter((s) => s.grade === 2).length
  const score = scenes.length === 0 ? 0 : Math.round((healthy / scenes.length) * 100)
  const weak = scenes.length - healthy
  const summary =
    scenes.length === 0
      ? '没有可分析的场景：先在剧本里写场景标题，或在分场大纲建场。'
      : weak === 0
        ? `${scenes.length} 场戏均有明确功能，没有发现弱场。`
        : `${scenes.length} 场戏中 ${weak} 场偏弱：重点看无冲突无转折或过场戏标记的场次。`

  return { score, scenes, issues, summary }
}

/* ── 维度二：人物弧光 ─────────────────────────────────── */

export interface ArcDiagnosis {
  name: string
  role: '主角' | '配角'
  firstScene: number
  lastScene: number
  sceneCount: number
  dialogueCount: number
  /** 逐场对白量曲线 */
  dialogueCurve: number[]
  /** 检出「变化/抉择」的场序（弧光链） */
  changeScenes: number[]
  notes: string[]
}

export interface ArcReport {
  score: number
  characters: ArcDiagnosis[]
  issues: AnalysisIssue[]
  summary: string
}

export function runArcCheck(input: {
  outline: Outline
  sceneList: SceneCard[]
  script: string
}): ArcReport {
  const parsed = parseFountain(input.script)
  const entities = extractEntities(parsed)
  const slices = sliceScenes(input.script)
  const issues: AnalysisIssue[] = []
  const totalScenes = Math.max(slices.length, input.sceneList.length)

  // 三幕文本（用于弧光补充定位）
  const actsText = `${input.outline.act1}\n${input.outline.act2}\n${input.outline.act3}`

  const characters: ArcDiagnosis[] = entities.characters.map((c) => {
    // 逐场对白量曲线
    const curve: number[] = []
    const present: number[] = []
    for (const slice of slices) {
      const count = slice.characters.includes(c.name)
        ? slice.text.split('\n').filter((l) => l.startsWith(`${c.name}：`)).length
        : 0
      curve.push(count)
      if (slice.characters.includes(c.name)) present.push(slice.index)
    }
    const firstScene = present[0] ?? c.firstSceneIndex
    const lastScene = present[present.length - 1] ?? c.firstSceneIndex

    // 变化场定位：该人物在场 且 当场文本 / 分场 beat / 三幕文本命中变化关键词
    const changeScenes = new Set<number>()
    for (const slice of slices) {
      if (!slice.characters.includes(c.name)) continue
      if (hitAny(slice.text, CHANGE_WORDS).length > 0) changeScenes.add(slice.index)
    }
    input.sceneList.forEach((card, i) => {
      if (!card.characters.includes(c.name)) return
      if (hitAny(`${card.beat}\n${card.purpose}`, CHANGE_WORDS).length > 0) changeScenes.add(i + 1)
    })
    if (hitAny(actsText, CHANGE_WORDS).length > 0 && actsText.includes(c.name)) {
      // 三幕中点名且有变化词，归入末场（无法精确定位到幕内场次）
      if (lastScene > 0) changeScenes.add(lastScene)
    }

    const notes: string[] = []
    if (changeScenes.size > 0) {
      notes.push(`弧光链：第 ${[...changeScenes].sort((a, b) => a - b).join(' → ')} 场`)
    } else {
      notes.push('未检出变化/抉择场')
    }

    return {
      name: c.name,
      role: c.role,
      firstScene,
      lastScene,
      sceneCount: c.sceneCount,
      dialogueCount: c.dialogueCount,
      dialogueCurve: curve,
      changeScenes: [...changeScenes].sort((a, b) => a - b),
      notes,
    }
  })

  // 主角弧光判定
  const lead = characters[0]
  if (lead) {
    if (lead.changeScenes.length === 0) {
      issues.push({
        level: 'warn',
        rule: '人物弧光',
        message: `主角「${lead.name}」全片未检出任何变化/抉择场：弧光缺失，观众看不到他变成了谁。`,
      })
      lead.notes.push('弧光缺失：为他安排至少一场可见的抉择')
    } else if (lead.changeScenes.length === 1 && lead.changeScenes[0] === lead.firstScene && totalScenes > 2) {
      issues.push({
        level: 'info',
        rule: '人物弧光',
        message: `主角「${lead.name}」的变化全部发生在开场（第 ${lead.firstScene} 场），弧光可能过早完成。`,
      })
    }
  }

  // 配角功能定位
  for (const ch of characters.slice(1)) {
    if (ch.sceneCount >= 3) {
      const hasFunction = input.sceneList.some(
        (card) => card.characters.includes(ch.name) && card.purpose.includes(ch.name),
      )
      if (!hasFunction) {
        issues.push({
          level: 'info',
          rule: '人物弧光',
          message: `配角「${ch.name}」出场 ${ch.sceneCount} 场，但没有任何一场的戏剧功能提到他：他的存在理由是什么？`,
        })
        ch.notes.push('出场较多但功能定位不明')
      }
    }
  }

  const withArc = characters.filter((c) => c.changeScenes.length > 0).length
  const score =
    characters.length === 0
      ? 0
      : Math.round(
          (characters.reduce((acc, c) => acc + (c.changeScenes.length > 0 ? (c.role === '主角' ? 2 : 1) : 0), 0) /
            (characters.length + 1)) *
            100,
        )
  const summary =
    characters.length === 0
      ? '剧本里还没有可分析的人物。'
      : lead && lead.changeScenes.length > 0
        ? `${characters.length} 个人物中 ${withArc} 个检出了变化场；主角弧光链覆盖第 ${lead.changeScenes.join('、')} 场。`
        : `${characters.length} 个人物中 ${withArc} 个检出了变化场；主角弧光需要补强。`

  return { score, characters, issues, summary }
}
