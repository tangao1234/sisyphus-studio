/**
 * 剧本风格画像推断 + 规则化生图提示词生成。
 * 全部为纯函数：关键词计分推断年代 / 地域 / 类型 / 影调，
 * 提示词由「模板 + 词槽」确定性生成，不含随机。
 * 置信度不足（零命中）时回退到中性默认：当代都市 · 写实电影感。
 */

import type { SceneEntity, CharacterEntity, PropEntity, Entities } from './entities'

export interface StyleProfile {
  era: string
  region: string
  genre: string
  /** 影调（1-2 个） */
  tones: string[]
  /** 质感标签 */
  textures: string[]
  /** 顶部展示的 3-6 个画像标签 */
  tags: string[]
  /** 是否回退到了默认画像 */
  fallback: boolean
}

interface KeywordGroup {
  label: string
  words: string[]
}

const ERA_GROUPS: KeywordGroup[] = [
  { label: '民国', words: ['民国', '旗袍', '黄包车', '电报', '租界', '长衫', '留声机', '战火'] },
  { label: '50-70年代', words: ['知青', '公社', '粮票', '广播站', '大字报', '生产队'] },
  { label: '80-90年代', words: ['九十年代', '八十年代', '改革', '下海', '录像厅', '磁带', 'BB机', '供销社', '筒子楼', '渡轮', '船票'] },
  { label: '近未来', words: ['人工智能', '机器人', '全息', '芯片', '太空', '虚拟', '算法'] },
  { label: '当代', words: ['手机', '微信', '地铁', '外卖', '写字楼', '快递', '网约车', '直播'] },
]

const REGION_GROUPS: KeywordGroup[] = [
  { label: '南方小镇', words: ['梅雨', '骑楼', '渡口', '巷子', '祠堂', '潮湿', '南方', '水乡', '河'] },
  { label: '北方小城', words: ['雪', '胡同', '煤', '北风', '北方', '冰'] },
  { label: '都市', words: ['写字楼', '地铁', '霓虹', '高楼', '天桥', '便利店'] },
  { label: '乡村山野', words: ['田', '麦田', '村庄', '山坡', '山', '农'] },
]

const GENRE_GROUPS: KeywordGroup[] = [
  { label: '悬疑', words: ['秘密', '失踪', '真相', '尸体', '谎言', '谜', '血迹'] },
  { label: '爱情', words: ['爱情', '吻', '恋人', '思念', '情书'] },
  { label: '黑色犯罪', words: ['枪', '追杀', '交易', '债', '赃款', '绑架'] },
  { label: '温情家庭', words: ['母亲', '父亲', '孩子', '团圆', '家', '婆婆'] },
]

const TONE_GROUPS: KeywordGroup[] = [
  { label: '阴雨', words: ['雨', '梅雨', '阴', '潮湿', '水汽'] },
  { label: '夜色', words: ['夜', '霓虹', '灯', '黑'] },
  { label: '暖黄', words: ['黄昏', '夕阳', '暖', '台灯', '钨丝'] },
  { label: '冷蓝', words: ['雪', '冷', '冬', '清晨', '冰'] },
]

const DEFAULT_TEXTURES = ['电影剧照', '胶片颗粒质感']

function scoreGroups(text: string, groups: KeywordGroup[]): { label: string; hits: number }[] {
  return groups
    .map((g) => ({
      label: g.label,
      hits: g.words.reduce((acc, w) => acc + (text.split(w).length - 1), 0),
    }))
    .sort((a, b) => b.hits - a.hits)
}

export function inferStyleProfile(source: string): StyleProfile {
  const era = scoreGroups(source, ERA_GROUPS)
  const region = scoreGroups(source, REGION_GROUPS)
  const genre = scoreGroups(source, GENRE_GROUPS)
  const tone = scoreGroups(source, TONE_GROUPS)

  const eraHits = era[0]?.hits ?? 0
  const regionHits = region[0]?.hits ?? 0
  const fallback = eraHits === 0 && regionHits === 0

  const eraLabel = fallback ? '当代' : (eraHits > 0 ? era[0].label : '当代')
  const regionLabel = fallback ? '都市' : (regionHits > 0 ? region[0].label : '都市')
  const genreLabel = genre[0]?.hits > 0 ? genre[0].label : '剧情'
  const tones = tone.filter((t) => t.hits > 0).slice(0, 2).map((t) => t.label)
  if (tones.length === 0) tones.push(fallback ? '写实自然光' : '自然光')

  const textures = [...DEFAULT_TEXTURES]
  const tags = [eraLabel, regionLabel, genreLabel, ...tones, textures[1]].slice(0, 6)

  return { era: eraLabel, region: regionLabel, genre: genreLabel, tones, textures, tags, fallback }
}

/* ── 生图提示词（模板 + 词槽，确定性生成） ─────────────── */

function join(parts: Array<string | undefined | false>): string {
  return parts.filter((p): p is string => Boolean(p)).join('，')
}

function toneAndTexture(p: StyleProfile): string {
  return join([...p.tones, ...p.textures])
}

/** 场景概念图：地点 + 时段 + 内/外 + 氛围 + 影调 + 质感 */
export function scenePrompt(s: SceneEntity, p: StyleProfile): string {
  return join([
    `${p.era}中国${p.region}`,
    `${s.location}${s.io}`,
    s.times[0] ? `${s.times[0]}时分` : undefined,
    `${p.genre}片氛围`,
    toneAndTexture(p),
    '电影感构图',
  ])
}

/** 角色设定图：姓名 + 剧本线索 + 年代服装 + 风格 */
export function characterPrompt(c: CharacterEntity, p: StyleProfile): string {
  return join([
    c.name,
    c.clue,
    `${p.era}中国${p.region}${p.genre}片角色设定图`,
    `${p.era}服装质感`,
    toneAndTexture(p),
    '半身肖像',
  ])
}

/** 道具特写：道具 + 年代质感 + 光影 */
export function propPrompt(pr: PropEntity, p: StyleProfile): string {
  return join([
    `${pr.name}特写`,
    `${p.era}风道具质感`,
    join([...p.tones, '光影']),
    join(p.textures),
    '静物摄影构图',
  ])
}

export interface PromptExport {
  styleProfile: StyleProfile
  scenes: Array<SceneEntity & { prompt: string }>
  characters: Array<CharacterEntity & { prompt: string }>
  props: Array<PropEntity & { prompt: string }>
}

export function buildPromptExport(entities: Entities, profile: StyleProfile): PromptExport {
  return {
    styleProfile: profile,
    scenes: entities.scenes.map((s) => ({ ...s, prompt: scenePrompt(s, profile) })),
    characters: entities.characters.map((c) => ({ ...c, prompt: characterPrompt(c, profile) })),
    props: entities.props.map((pr) => ({ ...pr, prompt: propPrompt(pr, profile) })),
  }
}
