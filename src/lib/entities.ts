/**
 * 剧本元素识别：从解析后的剧本元素中实时提取 场景 / 人物 / 道具。
 * 全部为纯函数，不依赖 UI，可独立测试。
 *
 * - 场景：解析场景标题（中文「内景·地点·夜」或英文「INT. PLACE - NIGHT」），
 *   拆分 内/外景、地点、时段，相同地点合并并记录首次出现次序。
 * - 人物：以角色行为准（含中文短人名与 @ 强制行），剥离（画外音）类扩展，
 *   统计对白次数与出场场景数，按戏份排序，第一名标注「主角」；
 *   并从动作行中抓取「姓名（特征描述）」作为人物线索。
 * - 道具：双通道启发式——常见道具词典匹配 + 动词搭配模式
 *   （拿起|掏出|递给|…… + 名词），记录首次出现的场景序号。
 */

import type { ParsedScript } from './fountain'

export interface SceneEntity {
  location: string
  io: string
  /** 出现过的时段（去重，按出现顺序） */
  times: string[]
  /** 该地点出现次数 */
  count: number
  /** 首次出现是第几场（1 起） */
  firstIndex: number
}

export interface CharacterEntity {
  name: string
  dialogueCount: number
  sceneCount: number
  /** 首次登场于第几场 */
  firstSceneIndex: number
  role: '主角' | '配角'
  /** 从动作行抓到的人物特征线索（如「四十多岁，胡须花白」） */
  clue?: string
}

export interface PropEntity {
  name: string
  count: number
  /** 首次出现于第几场（0 = 场景标题出现之前） */
  firstSceneIndex: number
}

export interface Entities {
  scenes: SceneEntity[]
  characters: CharacterEntity[]
  props: PropEntity[]
}

/* ── 场景解析 ─────────────────────────────────────────── */

const TIME_WORDS = [
  '黎明前',
  '凌晨',
  '清晨',
  '黎明',
  '正午',
  '午后',
  '黄昏',
  '傍晚',
  '深夜',
  '午夜',
  '雨夜',
  '白天',
  '夜',
  '日',
  '晨',
]

const IO_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /内外景|内外|^INT\.\/EXT\.|^INT\/EXT|^I\/E/i, label: '内外景' },
  { re: /内景|^INT\.|^INT\s/i, label: '内景' },
  { re: /外景|^EXT\.|^EXT\s|^EST\./i, label: '外景' },
]

interface SceneParts {
  io: string
  location: string
  time: string
}

function parseSceneHeading(heading: string): SceneParts {
  let io = ''
  for (const p of IO_PATTERNS) {
    if (p.re.test(heading)) {
      io = p.label
      break
    }
  }

  let time = ''
  for (const w of TIME_WORDS) {
    // 取最后一个命中的时段词（场景行习惯把时段放在末尾）
    if (heading.includes(w)) time = w
  }

  // 地点 = 去掉内外景标记与时段词后的剩余部分
  const location = heading
    .split(/[·\-—、，,/／]/)
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .filter((t) => !/^(内景|外景|内外景|内外|INT\.?|EXT\.?|EST\.?|INT\.\/EXT\.?|INT\/EXT|I\/E)$/i.test(t))
    .filter((t) => !TIME_WORDS.includes(t))
    .join('·')

  return { io: io || '内景', location: location || heading, time }
}

/* ── 道具词典与动词模式 ───────────────────────────────── */

const PROP_DICT = [
  '手机', '电话', '电报', '信封', '明信片', '信', '照片', '相框', '底片',
  '香烟', '打火机', '火柴', '烟灰缸', '烟', '蜡烛',
  '雨伞', '伞', '手枪', '匕首', '刀', '枪',
  '钥匙', '锁', '戒指', '项链', '手镯', '耳环', '手表', '怀表', '眼镜',
  '酒杯', '酒瓶', '茶杯', '茶壶', '咖啡', '药瓶', '药',
  '日记本', '日记', '稿纸', '钢笔', '毛笔', '墨水', '报纸', '地图', '书',
  '行李箱', '箱子', '公文包', '钱包', '钞票', '支票', '合同', '文件', '档案',
  '船票', '车票', '机票', '门票',
  '录音机', '磁带', '唱片', '相机', '摄像机', '手电筒', '台灯', '灯笼',
  '吉他', '钢琴', '小提琴', '口琴',
  '玫瑰', '花束', '围巾', '帽子', '面具', '旗袍', '花',
  '巨石', '石头', '自行车', '摩托车', '渡轮',
]
// 注意：长词排在短词之前；匹配时先命中的长词会遮蔽其覆盖区域，避免「船票」与「票」重复计数

/** 动词搭配通道：动作动词 + 可选助词 + 名词 */
const VERB_PATTERN =
  /(拿起|拾起|捡起|掏出|取出|摸出|递给|交给|塞给|盯着|凝视|攥着|握着|捧着|抱着|打开|拆开|点燃|点上|收起|放下|挂上|摘下|撕碎|烧毁|戴上|翻看|翻阅|抚摸|举起|挥舞|擦拭|转动|藏起|推开)[了着过]?([一-龥]{1,5})/g

/** 动词通道停用词（身体部位、场景构件等非道具） */
const PROP_STOP = new Set([
  '手', '双手', '眼', '眼睛', '头', '头发', '脸', '嘴', '心', '眼泪',
  '门', '窗', '窗户', '窗帘', '灯', '火', '人', '脚步', '声音', '话',
])

/* ── 主提取函数 ───────────────────────────────────────── */

export function extractEntities(parsed: ParsedScript): Entities {
  const sceneMap = new Map<string, SceneEntity>()
  const charMap = new Map<
    string,
    { dialogue: number; scenes: Set<number>; firstScene: number; clue?: string }
  >()
  const propMap = new Map<string, { count: number; firstScene: number }>()
  const actionLines: string[] = []

  let sceneIndex = 0
  let currentCharacter: string | null = null

  const recordProp = (name: string) => {
    if (!name || PROP_STOP.has(name)) return
    const hit = propMap.get(name)
    if (hit) {
      hit.count += 1
    } else {
      propMap.set(name, { count: 1, firstScene: sceneIndex })
    }
  }

  for (const el of parsed.elements) {
    switch (el.type) {
      case 'scene': {
        sceneIndex += 1
        currentCharacter = null
        const parts = parseSceneHeading(el.text)
        const key = parts.location
        const existing = sceneMap.get(key)
        if (existing) {
          existing.count += 1
          if (parts.time && !existing.times.includes(parts.time)) {
            existing.times.push(parts.time)
          }
        } else {
          sceneMap.set(key, {
            location: parts.location,
            io: parts.io,
            times: parts.time ? [parts.time] : [],
            count: 1,
            firstIndex: sceneIndex,
          })
        }
        break
      }
      case 'character': {
        const name = el.text
          .replace(/[(（][^)）]*[)）]/g, '') // 剥离（画外音）/(V.O.) 类扩展
          .replace(/\^$/, '')
          .trim()
        currentCharacter = name
        const entry = charMap.get(name) ?? {
          dialogue: 0,
          scenes: new Set<number>(),
          firstScene: sceneIndex,
        }
        entry.scenes.add(sceneIndex)
        charMap.set(name, entry)
        break
      }
      case 'dialogue':
      case 'parenthetical': {
        if (currentCharacter) {
          const entry = charMap.get(currentCharacter)
          if (entry) entry.dialogue += 1
        }
        break
      }
      case 'action': {
        actionLines.push(el.text)
        break
      }
      default:
        break
    }
  }

  /* 道具：词典通道 + 动词通道（按场景顺序扫动作与对白，记录首现场景） */
  sceneIndex = 0
  for (const el of parsed.elements) {
    if (el.type === 'scene') {
      sceneIndex += 1
      continue
    }
    if (el.type !== 'action' && el.type !== 'dialogue' && el.type !== 'parenthetical') continue
    const text = el.text
    // 词典通道：长词优先，命中区域遮蔽，避免子串词重复计数
    let masked = text
    for (const word of PROP_DICT) {
      const occurrences = masked.split(word).length - 1
      if (occurrences === 0) continue
      for (let n = 0; n < occurrences; n++) recordProp(word)
      masked = masked.split(word).join('\0'.repeat(word.length))
    }
    // 动词通道：剥离指示词与量词（那封/一张/这只……）取名词本体
    for (const m of text.matchAll(VERB_PATTERN)) {
      const noun = m[2].replace(/^[这那一]?[张封信件只条块个把]/, '').replace(/^[这那]/, '')
      if (noun.length >= 2 || PROP_DICT.includes(noun)) recordProp(noun)
    }
  }

  /* 人物线索：动作行中「姓名（特征）」模式 */
  for (const line of actionLines) {
    for (const [name, entry] of charMap) {
      if (entry.clue) continue
      const clueRe = new RegExp(`${name}[（(]([^)）]{2,30})[)）]`)
      const m = line.match(clueRe)
      if (m) entry.clue = m[1]
    }
  }

  const characters: CharacterEntity[] = [...charMap.entries()]
    .map(([name, v]) => ({
      name,
      dialogueCount: v.dialogue,
      sceneCount: v.scenes.size,
      firstSceneIndex: v.firstScene,
      role: '配角' as const,
      clue: v.clue,
    }))
    .sort((a, b) => b.dialogueCount - a.dialogueCount || b.sceneCount - a.sceneCount)
  if (characters.length > 0) characters[0] = { ...characters[0], role: '主角' }

  const props: PropEntity[] = [...propMap.entries()]
    .map(([name, v]) => ({ name, count: v.count, firstSceneIndex: v.firstScene }))
    .sort((a, b) => b.count - a.count || a.firstSceneIndex - b.firstSceneIndex)

  return {
    scenes: [...sceneMap.values()].sort((a, b) => a.firstIndex - b.firstIndex),
    characters,
    props,
  }
}
