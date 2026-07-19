/**
 * 工作室持久化层（v2 多项目）。
 *
 * localStorage keys（固定不变，外部工具可依赖）：
 *   sisyphus.studio.projects.v2  当前数据：{ projects: Project[], currentId: string }
 *   sisyphus.studio.script.v1    旧版单稿（仅用于首次启动时的自动迁移，迁移后保留不删）
 *
 * 容量策略：快照为全量存储，整体序列化超过 4MB 时自动淘汰最旧快照，
 * 并返回 trimmed 标记供 UI 提示。
 */

import {
  EMPTY_OUTLINE,
  type Outline,
  type Project,
  type SceneCard,
  type Shot,
  type Snapshot,
  type Stage,
} from './types'

export const STORAGE_KEY_V2 = 'sisyphus.studio.projects.v2'
export const STORAGE_KEY_V1 = 'sisyphus.studio.script.v1'

const MAX_SNAPSHOTS = 20
const MAX_STORE_BYTES = 4_000_000

export interface StudioStore {
  projects: Project[]
  currentId: string
}

export interface SaveResult {
  ok: boolean
  trimmed: boolean
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function createProject(title: string): Project {
  const now = Date.now()
  return {
    id: uid('proj'),
    title,
    createdAt: now,
    updatedAt: now,
    outline: { ...EMPTY_OUTLINE },
    sceneList: [],
    script: '',
    shots: [],
    styleLock: null,
    entityOverrides: {},
    snapshots: [],
  }
}

export const DEFAULT_SHOT_DURATION = '10s'
export const SHOT_DURATIONS = ['5s', '10s', '15s']

/** 旧数据迁移：为缺少 videoPrompt / duration 的镜头（含快照内的）补默认值，不丢字段 */
export function normalizeShot(shot: Partial<Shot> & { id?: string }): Shot {
  return {
    id: shot.id ?? uid('shot'),
    sceneIndex: shot.sceneIndex ?? 1,
    size: shot.size ?? '全',
    movement: shot.movement ?? '固定',
    description: shot.description ?? '',
    prompt: shot.prompt ?? '',
    videoPrompt: shot.videoPrompt ?? '',
    duration: SHOT_DURATIONS.includes(shot.duration ?? '') ? (shot.duration as string) : DEFAULT_SHOT_DURATION,
  }
}

export function normalizeProject(p: Project): Project {
  return {
    ...p,
    shots: (p.shots ?? []).map((s) => normalizeShot(s)),
    snapshots: (p.snapshots ?? []).map((snap) => ({
      ...snap,
      data: { ...snap.data, shots: (snap.data.shots ?? []).map((s) => normalizeShot(s)) },
    })),
  }
}

/** 载入：优先 v2；无 v2 则尝试迁移 v1 单稿；都没有返回 null（由调用方决定给示例项目） */
export function loadStore(): StudioStore | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_V2)
    if (raw) {
      const parsed = JSON.parse(raw) as StudioStore
      if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
        const projects = parsed.projects.map((p) => normalizeProject(p))
        const currentId = projects.some((p) => p.id === parsed.currentId)
          ? parsed.currentId
          : projects[0].id
        return { projects, currentId }
      }
    }
    const legacy = window.localStorage.getItem(STORAGE_KEY_V1)
    if (legacy) {
      const migrated = createProject('未命名项目')
      migrated.script = legacy
      return { projects: [migrated], currentId: migrated.id }
    }
  } catch {
    // localStorage 不可用或数据损坏时回退示例
  }
  return null
}

/** 保存：超出 4MB 时从最旧快照开始淘汰，重试至放得下为止 */
export function saveStore(store: StudioStore): SaveResult {
  const working: StudioStore = {
    currentId: store.currentId,
    projects: store.projects.map((p) => ({ ...p, snapshots: [...p.snapshots] })),
  }
  let trimmed = false
  for (let attempt = 0; attempt < MAX_SNAPSHOTS * working.projects.length + 1; attempt++) {
    const payload = JSON.stringify(working)
    if (payload.length <= MAX_STORE_BYTES) {
      try {
        window.localStorage.setItem(STORAGE_KEY_V2, payload)
        return { ok: true, trimmed }
      } catch {
        // 写入失败（配额满）：继续淘汰
      }
    }
    const victim = oldestSnapshotProject(working.projects)
    if (!victim) break
    victim.snapshots.shift()
    trimmed = true
  }
  return { ok: false, trimmed }
}

function oldestSnapshotProject(projects: Project[]): Project | null {
  let best: Project | null = null
  for (const p of projects) {
    if (p.snapshots.length === 0) continue
    if (!best || p.snapshots[0].ts < best.snapshots[0].ts) best = p
  }
  return best
}

/* ── 快照 ─────────────────────────────────────────────── */

export function snapshotSummary(p: Project): string {
  const source = p.script.trim() || p.outline.logline || p.title
  return source.replace(/\s+/g, ' ').slice(0, 50)
}

export function takeSnapshot(p: Project, stage: Stage, label?: string): Project {
  const snap: Snapshot = {
    ts: Date.now(),
    stage,
    label,
    summary: snapshotSummary(p),
    data: {
      outline: { ...p.outline },
      sceneList: p.sceneList.map((s) => ({ ...s, characters: [...s.characters] })),
      script: p.script,
      shots: p.shots.map((s) => ({ ...s })),
    },
  }
  const snapshots = [...p.snapshots, snap].slice(-MAX_SNAPSHOTS)
  return { ...p, snapshots }
}

/** 阶段内容指纹：判断距上次快照是否有变化 */
export function contentFingerprint(p: Project): string {
  return JSON.stringify({
    outline: p.outline,
    sceneList: p.sceneList,
    script: p.script,
    shots: p.shots,
  })
}

export function lastSnapshotFingerprint(p: Project): string | null {
  const last = p.snapshots[p.snapshots.length - 1]
  return last ? JSON.stringify(last.data) : null
}

export const MAX_SNAPSHOT_COUNT = MAX_SNAPSHOTS

export type { Outline, SceneCard, Shot }
