/**
 * 项目导出 / 导入（跨设备衔接，纯函数）。
 *
 * 文件格式：
 *   单项目：{ format: 'sisyphus-project@1', exportedAt, project }
 *   全量备份：{ format: 'sisyphus-backup@1', exportedAt, projects: [] }
 * 单项目导出默认不含快照（控制体积），可选 includeSnapshots。
 * 导入时两种 format 都识别；字段缺失/格式非法给出清晰中文报错。
 */

import { normalizeProject, uid, createProject } from './store'
import type { Project } from './types'

export const FORMAT_PROJECT = 'sisyphus-project@1'
export const FORMAT_BACKUP = 'sisyphus-backup@1'

export function todayStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** 文件名安全化：去掉文件系统非法字符 */
export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '') || '未命名'
}

export function exportProjectJson(project: Project, opts: { includeSnapshots?: boolean } = {}): string {
  const copy: Project = JSON.parse(JSON.stringify(project))
  if (!opts.includeSnapshots) copy.snapshots = []
  return JSON.stringify(
    { format: FORMAT_PROJECT, exportedAt: new Date().toISOString(), project: copy },
    null,
    2,
  )
}

export function exportBackupJson(projects: Project[]): string {
  const copies: Project[] = JSON.parse(JSON.stringify(projects))
  for (const p of copies) p.snapshots = []
  return JSON.stringify(
    { format: FORMAT_BACKUP, exportedAt: new Date().toISOString(), projects: copies },
    null,
    2,
  )
}

export interface ImportResult {
  ok: boolean
  projects: Project[]
  error?: string
}

function validateProjectShape(p: unknown, index: number): string | null {
  if (typeof p !== 'object' || p === null) return `第 ${index + 1} 个项目不是有效对象`
  const proj = p as Record<string, unknown>
  if (typeof proj.title !== 'string' || !proj.title.trim()) return `第 ${index + 1} 个项目缺少有效标题（title）`
  if (typeof proj.script !== 'string') return `项目「${proj.title}」缺少剧本文本（script）`
  if (typeof proj.outline !== 'object' || proj.outline === null) return `项目「${proj.title}」缺少大纲字段（outline）`
  if (!Array.isArray(proj.sceneList)) return `项目「${proj.title}」的分场（sceneList）不是数组`
  if (!Array.isArray(proj.shots)) return `项目「${proj.title}」的镜头（shots）不是数组`
  return null
}

/** 解析导入内容：识别两种 format，校验必填字段，规范化旧镜头字段 */
export function parseImport(json: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return { ok: false, projects: [], error: '文件不是合法的 JSON，无法导入。' }
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, projects: [], error: '文件内容不是有效的项目数据。' }
  }
  const payload = data as Record<string, unknown>

  let rawProjects: unknown[]
  if (payload.format === FORMAT_PROJECT) {
    if (!payload.project) return { ok: false, projects: [], error: '格式正确但缺少 project 字段。' }
    rawProjects = [payload.project]
  } else if (payload.format === FORMAT_BACKUP) {
    if (!Array.isArray(payload.projects) || payload.projects.length === 0) {
      return { ok: false, projects: [], error: '备份文件里没有可导入的项目。' }
    }
    rawProjects = payload.projects
  } else {
    return {
      ok: false,
      projects: [],
      error: `无法识别的文件格式（format 应为 ${FORMAT_PROJECT} 或 ${FORMAT_BACKUP}）。`,
    }
  }

  for (let i = 0; i < rawProjects.length; i++) {
    const err = validateProjectShape(rawProjects[i], i)
    if (err) return { ok: false, projects: [], error: err }
  }

  const projects = rawProjects.map((raw) => {
    const base = { ...createProject(''), ...(raw as Project) }
    return normalizeProject({
      ...base,
      snapshots: Array.isArray(base.snapshots) ? base.snapshots : [],
    })
  })
  return { ok: true, projects }
}

/** 合并导入的项目进现有列表：id 冲突换新 id，同名加「(导入)」后缀 */
export function mergeImported(existing: Project[], imported: Project[]): Project[] {
  const ids = new Set(existing.map((p) => p.id))
  const titles = new Set(existing.map((p) => p.title))
  return imported.map((p) => {
    const next = { ...p }
    if (ids.has(next.id)) next.id = uid('proj')
    if (titles.has(next.title)) next.title = `${next.title}(导入)`
    next.updatedAt = Date.now()
    return next
  })
}
