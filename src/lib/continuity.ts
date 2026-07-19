/**
 * 连续性体检：对当前项目跑一组纯函数检查，按 警告 / 提示 分级。
 * 输入为大纲 + 分场 + 剧本文本，不依赖 UI。
 */

import { parseFountain } from './fountain'
import { extractEntities } from './entities'
import type { Outline, SceneCard } from './types'

export interface ContinuityIssue {
  level: 'warn' | 'info'
  rule: string
  message: string
}

const TIME_ORDER = ['黎明前', '凌晨', '清晨', '黎明', '日', '白天', '正午', '午后', '黄昏', '傍晚', '夜', '雨夜', '深夜', '午夜']

function timeRank(time: string): number {
  const idx = TIME_ORDER.indexOf(time)
  return idx >= 0 ? idx : TIME_ORDER.length
}

export function runContinuityCheck(input: {
  outline: Outline
  sceneList: SceneCard[]
  script: string
}): ContinuityIssue[] {
  const issues: ContinuityIssue[] = []
  const { outline, sceneList, script } = input
  const parsed = parseFountain(script)
  const entities = extractEntities(parsed)

  /* 1. 完整性：logline 与三幕 */
  if (!outline.logline.trim()) {
    issues.push({ level: 'warn', rule: '完整性', message: 'logline（一句话梗概）为空。' })
  }
  const acts: Array<[string, string]> = [
    ['建置（第一幕）', outline.act1],
    ['对抗（第二幕）', outline.act2],
    ['结局（第三幕）', outline.act3],
  ]
  for (const [label, content] of acts) {
    if (!content.trim()) {
      issues.push({ level: 'warn', rule: '完整性', message: `三幕结构缺失：${label}未填写。` })
    }
  }
  if (!outline.theme.trim()) {
    issues.push({ level: 'info', rule: '完整性', message: '主题阐述为空，建议补一句这部戏在说什么。' })
  }

  /* 2. 分场大纲 vs 正式剧本对账 */
  const outlineLocs = new Set(sceneList.map((s) => s.location.trim()).filter(Boolean))
  const scriptLocs = new Set(entities.scenes.map((s) => s.location.trim()).filter(Boolean))
  for (const loc of outlineLocs) {
    if (!scriptLocs.has(loc)) {
      issues.push({ level: 'warn', rule: '对账', message: `分场大纲中的「${loc}」在正式剧本中没有对应场景。` })
    }
  }
  for (const loc of scriptLocs) {
    if (!outlineLocs.has(loc)) {
      issues.push({ level: 'warn', rule: '对账', message: `剧本场景「${loc}」未登记进分场大纲。` })
    }
  }

  /* 3. 道具先用后交代：对白提及早于动作行出现 */
  {
    let sceneIndex = 0
    const firstDialogue = new Map<string, number>()
    const firstAction = new Map<string, number>()
    const propNames = entities.props.map((p) => p.name)
    for (const el of parsed.elements) {
      if (el.type === 'scene') {
        sceneIndex += 1
        continue
      }
      if (el.type !== 'dialogue' && el.type !== 'action') continue
      for (const name of propNames) {
        if (!el.text.includes(name)) continue
        const target = el.type === 'dialogue' ? firstDialogue : firstAction
        if (!target.has(name)) target.set(name, sceneIndex)
      }
    }
    for (const [name, dlgScene] of firstDialogue) {
      const actScene = firstAction.get(name)
      if (actScene !== undefined && dlgScene < actScene) {
        issues.push({
          level: 'info',
          rule: '道具',
          message: `道具「${name}」在对白中（第 ${dlgScene} 场）先于动作行交代（第 ${actScene} 场）出现，确认观众是否已见过它。`,
        })
      }
    }
  }

  /* 4. 人物称谓不统一：相似角色名 */
  {
    const names = entities.characters.map((c) => c.name)
    const seen = new Set<string>()
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i]
        const b = names[j]
        const similar =
          a.includes(b) ||
          b.includes(a) ||
          (a[0] === b[0] && Math.abs(a.length - b.length) <= 1)
        if (similar && !seen.has(`${a}|${b}`)) {
          seen.add(`${a}|${b}`)
          issues.push({
            level: 'info',
            rule: '称谓',
            message: `「${a}」与「${b}」写法相近，确认是同一人物的不同称谓，还是笔误。`,
          })
        }
      }
    }
  }

  /* 5. 时间线：相邻场景时段 */
  {
    const scenes = entities.scenes
    // 用原始出现顺序（entities.scenes 已按 firstIndex 排序，但合并了相同地点；这里需要逐场序列）
    const sequence: Array<{ location: string; time: string; index: number }> = []
    let sceneIndex = 0
    for (const el of parsed.elements) {
      if (el.type !== 'scene') continue
      sceneIndex += 1
      const found = scenes.find((s) => el.text.includes(s.location))
      const timeWord = TIME_ORDER.filter((t) => el.text.includes(t)).pop() ?? ''
      sequence.push({ location: found?.location ?? el.text, time: timeWord, index: sceneIndex })
    }
    for (let i = 1; i < sequence.length; i++) {
      const prev = sequence[i - 1]
      const curr = sequence[i]
      if (prev.location === curr.location && prev.time === curr.time && prev.time !== '') {
        issues.push({
          level: 'info',
          rule: '时间线',
          message: `第 ${prev.index} 场与第 ${curr.index} 场同为「${curr.location}·${curr.time}」，考虑合并或推进时段。`,
        })
      } else if (
        prev.location === curr.location &&
        prev.time !== '' &&
        curr.time !== '' &&
        timeRank(curr.time) < timeRank(prev.time)
      ) {
        issues.push({
          level: 'info',
          rule: '时间线',
          message: `「${curr.location}」的时段从 ${prev.time}（第 ${prev.index} 场）倒退到 ${curr.time}（第 ${curr.index} 场），确认是否有意为之。`,
        })
      }
    }
  }

  return issues
}
