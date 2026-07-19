/**
 * 视觉锚点：人物/场景/道具的结构化视觉描述，供生图提示词统一组装。
 *
 * - 初值由启发式自动提取（buildAutoAnchors）
 * - 用户在元素面板中编辑/锁定后存 project.entityOverrides（锁定后不再被自动覆盖）
 * - 提示词模板：名称 + 非空锚点槽位 + 风格画像；空槽位自动省略，零随机
 */

import type { ParsedScript } from './fountain'
import type { Entities } from './entities'
import type { StyleProfile } from './style'

export type EntityKind = 'character' | 'scene' | 'prop'

export type AnchorValues = Record<string, string>

export const ANCHOR_SLOTS: Record<EntityKind, Array<{ key: string; label: string }>> = {
  character: [
    { key: 'age', label: '年龄段' },
    { key: 'face', label: '脸型气质' },
    { key: 'hair', label: '发型' },
    { key: 'costume', label: '服装' },
    { key: 'prop', label: '标志物' },
  ],
  scene: [
    { key: 'light', label: '光线' },
    { key: 'palette', label: '色调' },
    { key: 'set', label: '关键陈设' },
    { key: 'mood', label: '氛围' },
  ],
  prop: [
    { key: 'material', label: '材质' },
    { key: 'era', label: '年代感' },
    { key: 'condition', label: '状态' },
  ],
}

export function overrideKey(kind: EntityKind, name: string): string {
  return `${kind}:${name}`
}

/* ── 自动提取启发式 ───────────────────────────────────── */

const LIGHT_WORDS = ['台灯', '月光', '霓虹', '晨光', '钨丝', '汽灯', '烛光', '路灯', '自然光', '逆光']
const MATERIAL_WORDS = ['纸', '木', '铁', '铜', '皮', '布', '玻璃', '金属', '瓷', '竹']
const CONDITION_WORDS = ['旧', '破', '锈', '泛黄', '潮湿', '新', '褪色', '开裂', '磨损']

/** 按场景范围切分动作/对白行（key = 场景地点，场景前的内容归入空串） */
function linesByScene(parsed: ParsedScript): Map<string, string[]> {
  const map = new Map<string, string[]>()
  let current = ''
  const stripIo = (heading: string) =>
    heading
      .split(/[·\-—、，,/／]/)
      .map((t) => t.trim())
      .filter(
        (t) =>
          t !== '' &&
          !/^(内景|外景|内外景|内外|INT\.?|EXT\.?|EST\.?|INT\.\/EXT\.?|INT\/EXT|I\/E)$/i.test(t) &&
          !/^(黎明前|凌晨|清晨|黎明|正午|午后|黄昏|傍晚|深夜|午夜|雨夜|白天|夜|日|晨)$/.test(t),
      )
      .join('·')
  for (const el of parsed.elements) {
    if (el.type === 'scene') {
      current = stripIo(el.text)
      continue
    }
    if (el.type === 'action' || el.type === 'dialogue') {
      const arr = map.get(current) ?? []
      arr.push(el.text)
      map.set(current, arr)
    }
  }
  return map
}

function pickFirst(text: string, words: string[]): string | undefined {
  return words.find((w) => text.includes(w))
}

export interface AutoAnchors {
  characters: Record<string, AnchorValues>
  scenes: Record<string, AnchorValues>
  props: Record<string, AnchorValues>
}

export function buildAutoAnchors(
  parsed: ParsedScript,
  entities: Entities,
  profile: StyleProfile,
): AutoAnchors {
  const sceneLines = linesByScene(parsed)
  const allText = parsed.elements.map((e) => e.text).join('\n')

  const characters: Record<string, AnchorValues> = {}
  for (const c of entities.characters) {
    const anchors: AnchorValues = {}
    if (c.clue) {
      // 线索中含年龄信息则入年龄段槽，否则入脸型气质槽
      if (/[岁年老幼]/.test(c.clue)) anchors.age = c.clue
      else anchors.face = c.clue
    }
    // 标志物：与该人物同场景首现的道具里取最常见的一件
    const prop = entities.props.find((p) => allText.includes(`${c.name}`) && allText.includes(p.name))
    if (prop) anchors.prop = prop.name
    characters[c.name] = anchors
  }

  const scenes: Record<string, AnchorValues> = {}
  for (const s of entities.scenes) {
    const lines = (sceneLines.get(s.location) ?? []).join('\n')
    const anchors: AnchorValues = {}
    const light = pickFirst(lines, LIGHT_WORDS)
    if (light) anchors.light = light
    if (profile.tones.length > 0) anchors.palette = profile.tones.join('、')
    const setProps = entities.props
      .filter((p) => p.firstSceneIndex === s.firstIndex)
      .slice(0, 3)
      .map((p) => p.name)
    if (setProps.length > 0) anchors.set = setProps.join('、')
    if (profile.genre) anchors.mood = `${profile.genre}片氛围`
    scenes[s.location] = anchors
  }

  const props: Record<string, AnchorValues> = {}
  for (const p of entities.props) {
    const anchors: AnchorValues = { era: `${profile.era}风` }
    const idx = allText.indexOf(p.name)
    const context = idx >= 0 ? allText.slice(Math.max(0, idx - 12), idx + p.name.length + 12) : ''
    const material = pickFirst(context, MATERIAL_WORDS)
    if (material) anchors.material = material
    const condition = pickFirst(context, CONDITION_WORDS)
    if (condition) anchors.condition = condition
    props[p.name] = anchors
  }

  return { characters, scenes, props }
}

/* ── 统一提示词组装 ───────────────────────────────────── */

function join(parts: Array<string | undefined | false>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join('，')
}

function anchorList(anchors: AnchorValues, slots: Array<{ key: string }>): string[] {
  return slots.map((s) => anchors[s.key]).filter((v): v is string => Boolean(v && v.trim()))
}

export interface AssembleOptions {
  /** 场景：内外景与时段 */
  io?: string
  time?: string
  /** 镜头：景别 / 运镜 / 画面描述 */
  size?: string
  movement?: string
  description?: string
  /** 镜头：涉及人物的锚点摘要（如「林晚（三十出头，素色衬衫）」） */
  cast?: string[]
}

/** 统一组装：名称 + 锚点（空槽省略） + 风格画像 */
export function assemblePrompt(
  kind: EntityKind | 'shot',
  name: string,
  anchors: AnchorValues,
  profile: StyleProfile,
  opts: AssembleOptions = {},
): string {
  const toneTex = join([...profile.tones, ...profile.textures])
  switch (kind) {
    case 'character':
      return join([
        name,
        ...anchorList(anchors, ANCHOR_SLOTS.character),
        `${profile.era}中国${profile.region}${profile.genre}片角色设定图`,
        `${profile.era}服装质感`,
        toneTex,
        '半身肖像',
      ])
    case 'scene':
      return join([
        `${profile.era}中国${profile.region}`,
        `${name}${opts.io ?? ''}`,
        opts.time ? `${opts.time}时分` : undefined,
        ...anchorList(anchors, ANCHOR_SLOTS.scene).filter((a) => a !== anchors.palette),
        anchors.palette,
        toneTex,
        '电影感构图',
      ])
    case 'prop':
      return join([
        `${name}特写`,
        ...anchorList(anchors, ANCHOR_SLOTS.prop),
        join([...profile.tones, '光影']),
        join(profile.textures),
        '静物摄影构图',
      ])
    case 'shot':
      return join([
        opts.size ? `${opts.size}景` : undefined,
        opts.movement && opts.movement !== '固定' ? `${opts.movement}镜头` : '固定机位',
        opts.description,
        ...(opts.cast ?? []),
        `${profile.era}中国${profile.region}${profile.genre}片`,
        toneTex,
        '电影分镜',
      ])
  }
}

/** 人物锚点摘要（供镜头提示词引用） */
export function castSummary(name: string, anchors: AnchorValues): string {
  const parts = [anchors.age, anchors.costume].filter((v): v is string => Boolean(v && v.trim()))
  return parts.length > 0 ? `${name}（${parts.join('，')}）` : name
}
