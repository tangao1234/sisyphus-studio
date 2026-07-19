/** 剧本工作室 v2 数据模型（长篇流水线：大纲 → 分场 → 剧本 → 镜头） */

export type Stage = 'outline' | 'scenes' | 'script' | 'shots'

export interface Outline {
  logline: string
  theme: string
  /** 三幕：建置 / 对抗 / 结局 */
  act1: string
  act2: string
  act3: string
  /** 人物小传草稿 */
  characters: string
}

export interface SceneCard {
  id: string
  location: string
  /** 内景 / 外景 / 内外景 */
  io: string
  /** 日 / 夜 / 黎明 … */
  time: string
  /** 出场人物 */
  characters: string[]
  /** 本场节拍：发生了什么 */
  beat: string
  /** 戏剧功能：这场戏为什么存在 */
  purpose: string
}

export interface Shot {
  id: string
  /** 关联分场序（1 起，对应分场大纲序号） */
  sceneIndex: number
  /** 景别：远 / 全 / 中 / 近 / 特 */
  size: string
  /** 运镜：固定 / 推 / 拉 / 摇 / 跟 … */
  movement: string
  /** 画面描述 */
  description: string
  /** 概念图生图提示词（自动组装，可手动改） */
  prompt: string
  /** Seedance 视频提示词（自动组装，可手动改） */
  videoPrompt: string
  /** 建议生成时长：5s / 10s / 15s（即梦单镜头 4-15s） */
  duration: string
}

export interface Snapshot {
  ts: number
  stage: Stage
  label?: string
  /** 摘要（剧本前 50 字或 logline） */
  summary: string
  /** 全量阶段数据 */
  data: {
    outline: Outline
    sceneList: SceneCard[]
    script: string
    shots: Shot[]
  }
}

/** 视觉锚点覆盖（可编辑、锁定后不再被自动推断覆盖），key 形如 character:林晚 */
export interface EntityOverride {
  locked: boolean
  values: Record<string, string>
}

export interface Project {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  outline: Outline
  sceneList: SceneCard[]
  script: string
  shots: Shot[]
  /** 锁定风格后以此为准，自动推断仅作建议 */
  styleLock?: import('./style').StyleProfile | null
  entityOverrides?: Record<string, EntityOverride>
  snapshots: Snapshot[]
}

export const EMPTY_OUTLINE: Outline = {
  logline: '',
  theme: '',
  act1: '',
  act2: '',
  act3: '',
  characters: '',
}

export const STAGES: Array<{ key: Stage; label: string; index: string }> = [
  { key: 'outline', label: '故事大纲', index: '①' },
  { key: 'scenes', label: '分场大纲', index: '②' },
  { key: 'script', label: '正式剧本', index: '③' },
  { key: 'shots', label: '镜头提示词', index: '④' },
]
