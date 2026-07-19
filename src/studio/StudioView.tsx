import { useEffect, useMemo, useRef, useState } from 'react'
import { parseFountain, estimateScript } from '../lib/fountain'
import { extractEntities } from '../lib/entities'
import { inferStyleProfile, type StyleProfile } from '../lib/style'
import {
  buildAutoAnchors,
  assemblePrompt,
  castSummary,
  overrideKey,
  type AnchorValues,
  type EntityKind,
} from '../lib/anchors'
import { runContinuityCheck, type ContinuityIssue } from '../lib/continuity'
import { runSceneAnalysis, runArcCheck, type SceneAnalysisReport, type ArcReport } from '../lib/analysis'
import { assembleVideoPrompt } from '../lib/video-prompt'
import {
  exportProjectJson,
  exportBackupJson,
  parseImport,
  mergeImported,
  safeFilename,
  todayStamp,
} from '../lib/transfer'
import {
  createProject,
  loadStore,
  saveStore,
  takeSnapshot,
  contentFingerprint,
  lastSnapshotFingerprint,
  normalizeShot,
  uid,
  type StudioStore,
} from '../lib/store'
import { STAGES, type Outline, type Project, type SceneCard, type Shot, type Stage } from '../lib/types'
import { createSampleProject } from './sampleScript'
import Sidebar from './Sidebar'
import OutlineStage from './OutlineStage'
import ScenesStage from './ScenesStage'
import ScriptStage from './ScriptStage'
import ShotsStage from './ShotsStage'
import { SnapshotsPanel, HealthPanel } from './Panels'
import { profile } from '../data/site'

/**
 * window.sisyphusStudio（API v2，供 Kimi WebBridge 全流程写入与检验）
 * 所有写操作与手输走同一条 React state 通道，并触发 600ms 防抖自动保存。
 * localStorage key（固定）：sisyphus.studio.projects.v2（旧版 sisyphus.studio.script.v1 会自动迁移）
 * 编辑器为原生 <textarea id="script-editor">，可直接 fill。
 */
declare global {
  interface Window {
    sisyphusStudio?: {
      listProjects: () => Array<{ id: string; title: string; updatedAt: number }>
      createProject: (title: string) => string
      switchProject: (id: string) => boolean
      getCurrentProject: () => unknown
      setStage: (stage: Stage) => void
      getStage: () => Stage
      setOutline: (outline: Partial<Outline>) => void
      getOutline: () => Outline
      setSceneList: (scenes: Array<Partial<SceneCard>>) => void
      getSceneList: () => SceneCard[]
      setScript: (text: string) => void
      getScript: () => string
      setShots: (shots: Array<Partial<Shot>>) => void
      getShots: () => Shot[]
      getVideoPrompts: () => Array<{
        scene: number
        label: string
        shots: Array<{ size: string; movement: string; duration: string; videoPrompt: string }>
      }>
      getEntities: () => unknown
      getStyleProfile: () => StyleProfile
      lockStyle: (profile: StyleProfile | null) => void
      setEntityAnchor: (type: EntityKind, name: string, anchors: AnchorValues) => void
      runContinuityCheck: () => ContinuityIssue[]
      runSceneAnalysis: () => SceneAnalysisReport
      runArcCheck: () => ArcReport
      exportProject: (id?: string) => string
      importProject: (json: string) => { ok: boolean; added: number; error?: string }
      listSnapshots: () => unknown[]
      takeSnapshot: (label?: string) => void
      restoreSnapshot: (ts: number) => boolean
    }
  }
}

function download(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function StudioView() {
  const [store, setStore] = useState<StudioStore>(() => {
    const loaded = loadStore()
    if (loaded) return loaded
    const sample = createSampleProject()
    return { projects: [sample], currentId: sample.id }
  })
  const [stage, setStageState] = useState<Stage>('script')
  const [savedAt, setSavedAt] = useState('')
  const [storageNote, setStorageNote] = useState('')
  const [panel, setPanel] = useState<'snapshots' | 'health' | null>(null)
  const [health, setHealth] = useState<{
    continuity: ContinuityIssue[]
    sceneReport: SceneAnalysisReport
    arcReport: ArcReport
  } | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  const current = store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]

  /* 派生数据 */
  const parsed = useMemo(() => parseFountain(current.script), [current.script])
  const stats = useMemo(() => estimateScript(parsed, current.script), [parsed, current.script])
  const entities = useMemo(() => extractEntities(parsed), [parsed])
  const inferredProfile = useMemo(() => inferStyleProfile(current.script), [current.script])
  const effectiveProfile = current.styleLock ?? inferredProfile
  const autoAnchors = useMemo(
    () => buildAutoAnchors(parsed, entities, effectiveProfile),
    [parsed, entities, effectiveProfile],
  )

  const effectiveAnchors = (kind: EntityKind, name: string): AnchorValues => {
    const auto =
      kind === 'character'
        ? autoAnchors.characters[name]
        : kind === 'scene'
          ? autoAnchors.scenes[name]
          : autoAnchors.props[name]
    const override = current.entityOverrides?.[overrideKey(kind, name)]
    return { ...(auto ?? {}), ...(override?.values ?? {}) }
  }

  /* 项目更新入口：统一打 updatedAt 并触发保存 */
  const updateCurrent = (fn: (p: Project) => Project) => {
    setStore((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === prev.currentId ? { ...fn(p), updatedAt: Date.now() } : p,
      ),
    }))
  }

  /* 自动保存（600ms 防抖） */
  useEffect(() => {
    saveTimer.current = window.setTimeout(() => {
      const result = saveStore(store)
      if (result.ok) {
        const d = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        setSavedAt(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
        setStorageNote(result.trimmed ? '存储空间接近上限，已自动淘汰最旧快照' : '')
      } else {
        setStorageNote('本地存储已满，保存失败，请及时导出备份')
      }
    }, 600)
    return () => window.clearTimeout(saveTimer.current)
  }, [store])

  /* 阶段切换：内容有变化时自动存档 */
  const setStage = (next: Stage) => {
    if (next !== stage && contentFingerprint(current) !== lastSnapshotFingerprint(current)) {
      updateCurrent((p) => takeSnapshot(p, stage, `离开「${STAGES.find((s) => s.key === stage)?.label}」前自动存档`))
    }
    setStageState(next)
  }

  const handleRestoreSnapshot = (ts: number) => {
    const snap = current.snapshots.find((s) => s.ts === ts)
    if (!snap) return
    updateCurrent((p) => {
      const withBackup = takeSnapshot(p, stage, '恢复前自动存档')
      return {
        ...withBackup,
        outline: { ...snap.data.outline },
        sceneList: snap.data.sceneList.map((s) => ({ ...s, characters: [...s.characters] })),
        script: snap.data.script,
        shots: snap.data.shots.map((s) => normalizeShot(s)),
      }
    })
    setPanel(null)
  }

  /* 三维度体检 */
  const runHealth = () => {
    const input = { outline: current.outline, sceneList: current.sceneList, script: current.script }
    setHealth({
      continuity: runContinuityCheck(input),
      sceneReport: runSceneAnalysis(input),
      arcReport: runArcCheck(input),
    })
    setPanel('health')
  }

  /* 项目导出 / 导入 */
  const handleExportProject = (id: string, askSnapshots: boolean) => {
    const proj = store.projects.find((p) => p.id === id)
    if (!proj) return
    let includeSnapshots = false
    if (askSnapshots && proj.snapshots.length > 0) {
      includeSnapshots = window.confirm(
        `「${proj.title}」有 ${proj.snapshots.length} 个快照。确定 = 含快照导出（文件更大），取消 = 不含快照。`,
      )
    }
    download(
      `sisyphus_${safeFilename(proj.title)}_${todayStamp()}.json`,
      exportProjectJson(proj, { includeSnapshots }),
      'application/json;charset=utf-8',
    )
  }

  const handleExportBackup = () => {
    download(
      `sisyphus_backup_${todayStamp()}.json`,
      exportBackupJson(store.projects),
      'application/json;charset=utf-8',
    )
  }

  const handleImportProjects = (json: string): { ok: boolean; added: number; error?: string } => {
    const result = parseImport(json)
    if (!result.ok) return { ok: false, added: 0, error: result.error }
    const merged = mergeImported(store.projects, result.projects)
    setStore((prev) => ({
      projects: [...prev.projects, ...mergeImported(prev.projects, result.projects)],
      currentId: merged[0]?.id ?? prev.currentId,
    }))
    return { ok: true, added: result.projects.length }
  }

  /* 从剧本导入分场骨架 */
  const importScenesFromScript = () => {
    if (entities.scenes.length === 0) {
      window.alert('当前剧本里还没有可识别的场景标题。')
      return
    }
    if (current.sceneList.length > 0 && !window.confirm('将用剧本场景重建分场大纲，现有分场卡片会被替换。继续吗？')) {
      return
    }
    updateCurrent((p) => ({
      ...p,
      sceneList: entities.scenes.map((s) => ({
        id: uid('sc'),
        location: s.location,
        io: s.io,
        time: s.times[0] ?? '日',
        characters: [],
        beat: '',
        purpose: '',
      })),
    }))
  }

  /* 镜头场景分组：优先分场大纲，空则回退剧本解析场景 */
  const sceneGroups = useMemo(() => {
    if (current.sceneList.length > 0) {
      return current.sceneList.map((s, i) => ({
        index: i + 1,
        label: `${s.io}·${s.location || '未命名'}·${s.time}`,
      }))
    }
    return entities.scenes.map((s) => ({
      index: s.firstIndex,
      label: `${s.io}·${s.location}${s.times[0] ? `·${s.times[0]}` : ''}`,
    }))
  }, [current.sceneList, entities.scenes])

  const shotCast = (sceneIndex: number) => {
    const scene = current.sceneList[sceneIndex - 1]
    return (scene?.characters ?? [])
      .slice(0, 2)
      .map((name) => castSummary(name, effectiveAnchors('character', name)))
  }

  const makeShotPrompt = (shot: Pick<Shot, 'sceneIndex' | 'size' | 'movement' | 'description'>) =>
    assemblePrompt('shot', '', {}, effectiveProfile, {
      size: shot.size,
      movement: shot.movement,
      description: shot.description,
      cast: shotCast(shot.sceneIndex),
    })

  const makeVideoPrompt = (
    shot: Pick<Shot, 'sceneIndex' | 'size' | 'movement' | 'description' | 'duration'>,
  ) => {
    const scene = current.sceneList[shot.sceneIndex - 1]
    return assembleVideoPrompt(shot, {
      cast: shotCast(shot.sceneIndex),
      sceneAnchors: scene ? effectiveAnchors('scene', scene.location) : {},
      time: scene?.time,
      location: scene?.location,
      profile: effectiveProfile,
    })
  }

  /* window API v2 */
  const stateRef = useRef({ store, stage, entities, effectiveProfile, autoAnchors })
  stateRef.current = { store, stage, entities, effectiveProfile, autoAnchors }

  useEffect(() => {
    const getCurrent = () => {
      const s = stateRef.current.store
      return s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]
    }
    window.sisyphusStudio = {
      listProjects: () =>
        stateRef.current.store.projects.map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt })),
      createProject: (title: string) => {
        const proj = createProject(title || '未命名项目')
        setStore((prev) => ({ projects: [...prev.projects, proj], currentId: proj.id }))
        return proj.id
      },
      switchProject: (id: string) => {
        const exists = stateRef.current.store.projects.some((p) => p.id === id)
        if (exists) setStore((prev) => ({ ...prev, currentId: id }))
        return exists
      },
      getCurrentProject: () => JSON.parse(JSON.stringify(getCurrent())),
      setStage: (next: Stage) => setStage(next),
      getStage: () => stateRef.current.stage,
      setOutline: (outline: Partial<Outline>) =>
        updateCurrent((p) => ({ ...p, outline: { ...p.outline, ...outline } })),
      getOutline: () => ({ ...getCurrent().outline }),
      setSceneList: (scenes: Array<Partial<SceneCard>>) =>
        updateCurrent((p) => ({
          ...p,
          sceneList: scenes.map((s) => ({
            id: s.id ?? uid('sc'),
            location: s.location ?? '',
            io: s.io ?? '内景',
            time: s.time ?? '日',
            characters: s.characters ?? [],
            beat: s.beat ?? '',
            purpose: s.purpose ?? '',
          })),
        })),
      getSceneList: () => getCurrent().sceneList.map((s) => ({ ...s })),
      setScript: (text: string) => updateCurrent((p) => ({ ...p, script: String(text) })),
      getScript: () => getCurrent().script,
      setShots: (shots: Array<Partial<Shot>>) =>
        updateCurrent((p) => ({ ...p, shots: shots.map((s) => normalizeShot(s)) })),
      getShots: () => getCurrent().shots.map((s) => ({ ...s })),
      getVideoPrompts: () => {
        const proj = getCurrent()
        const groups =
          proj.sceneList.length > 0
            ? proj.sceneList.map((s, i) => ({ index: i + 1, label: `${s.io}·${s.location || '未命名'}·${s.time}` }))
            : stateRef.current.entities.scenes.map((s) => ({
                index: s.firstIndex,
                label: `${s.io}·${s.location}${s.times[0] ? `·${s.times[0]}` : ''}`,
              }))
        return groups.map((g) => ({
          scene: g.index,
          label: g.label,
          shots: proj.shots
            .filter((s) => s.sceneIndex === g.index)
            .map((s) => ({
              size: s.size,
              movement: s.movement,
              duration: s.duration,
              videoPrompt: s.videoPrompt.trim() || makeVideoPrompt(s),
            })),
        }))
      },
      getEntities: () => {
        const { entities: ents, effectiveProfile: prof, autoAnchors: auto } = stateRef.current
        const proj = getCurrent()
        const eff = (kind: EntityKind, name: string) => ({
          ...(kind === 'character' ? auto.characters[name] : kind === 'scene' ? auto.scenes[name] : auto.props[name]),
          ...(proj.entityOverrides?.[overrideKey(kind, name)]?.values ?? {}),
        })
        return {
          styleProfile: prof,
          scenes: ents.scenes.map((s) => ({
            ...s,
            anchors: eff('scene', s.location),
            prompt: assemblePrompt('scene', s.location, eff('scene', s.location), prof, { io: s.io, time: s.times[0] }),
          })),
          characters: ents.characters.map((c) => ({
            ...c,
            anchors: eff('character', c.name),
            prompt: assemblePrompt('character', c.name, eff('character', c.name), prof),
          })),
          props: ents.props.map((pr) => ({
            ...pr,
            anchors: eff('prop', pr.name),
            prompt: assemblePrompt('prop', pr.name, eff('prop', pr.name), prof),
          })),
        }
      },
      getStyleProfile: () => stateRef.current.effectiveProfile,
      lockStyle: (next: StyleProfile | null) => updateCurrent((p) => ({ ...p, styleLock: next })),
      setEntityAnchor: (type: EntityKind, name: string, anchors: AnchorValues) =>
        updateCurrent((p) => ({
          ...p,
          entityOverrides: {
            ...(p.entityOverrides ?? {}),
            [overrideKey(type, name)]: { locked: true, values: { ...anchors } },
          },
        })),
      runContinuityCheck: () => {
        const proj = getCurrent()
        return runContinuityCheck({ outline: proj.outline, sceneList: proj.sceneList, script: proj.script })
      },
      runSceneAnalysis: () => {
        const proj = getCurrent()
        return runSceneAnalysis({ outline: proj.outline, sceneList: proj.sceneList, script: proj.script })
      },
      runArcCheck: () => {
        const proj = getCurrent()
        return runArcCheck({ outline: proj.outline, sceneList: proj.sceneList, script: proj.script })
      },
      exportProject: (id?: string) => {
        const s = stateRef.current.store
        const proj = id ? s.projects.find((p) => p.id === id) : s.projects.find((p) => p.id === s.currentId)
        return proj ? exportProjectJson(proj) : ''
      },
      importProject: (json: string) => handleImportProjects(json),
      listSnapshots: () => getCurrent().snapshots.map((s) => ({ ts: s.ts, stage: s.stage, label: s.label, summary: s.summary })),
      takeSnapshot: (label?: string) => updateCurrent((p) => takeSnapshot(p, stateRef.current.stage, label)),
      restoreSnapshot: (ts: number) => {
        const exists = getCurrent().snapshots.some((s) => s.ts === ts)
        if (exists) handleRestoreSnapshot(ts)
        return exists
      },
    }
    return () => {
      delete window.sisyphusStudio
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const baseName = `Sisyphus_${current.title}_${todayStamp()}`
  const actionBtn =
    'border border-border px-3 py-1.5 text-xs tracking-wide text-muted-foreground transition-colors duration-300 hover:border-gold hover:text-gold active:translate-y-[1px]'

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-4 md:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-serif text-lg tracking-wide text-foreground">{profile.penName}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {profile.penNameLatin}
          </span>
          <span className="hidden truncate border-l border-border pl-3 font-serif text-sm text-muted-foreground md:inline">
            {current.title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => updateCurrent((p) => takeSnapshot(p, stage))} className={actionBtn}>
            存快照
          </button>
          <button type="button" onClick={() => setPanel('snapshots')} className={actionBtn}>
            快照
          </button>
          <button type="button" onClick={runHealth} className={actionBtn}>
            体检
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => handleExportProject(current.id, true)}
            className={actionBtn}
            title="导出当前项目（可选含快照）"
          >
            导出项目
          </button>
          <button type="button" onClick={handleExportBackup} className={actionBtn} title="导出全部项目为一个备份文件">
            备份全部
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
          <button type="button" onClick={() => download(`${baseName}.fountain`, current.script)} className={actionBtn}>
            .fountain
          </button>
          <button type="button" onClick={() => download(`${baseName}.txt`, current.script)} className={actionBtn}>
            .txt
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="border border-gold/50 px-3 py-1.5 text-xs tracking-wide text-gold transition-all duration-300 hover:bg-gold hover:text-[hsl(30_9%_6%)] active:translate-y-[1px]"
          >
            打印 / 存 PDF
          </button>
        </div>
      </header>

      {/* 主体：左侧栏 + 阶段主区 */}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          projects={store.projects}
          current={current}
          stage={stage}
          onSelectProject={(id) => setStore((prev) => ({ ...prev, currentId: id }))}
          onCreateProject={(title) =>
            setStore((prev) => {
              const proj = createProject(title)
              return { projects: [...prev.projects, proj], currentId: proj.id }
            })
          }
          onRenameProject={(id, title) =>
            setStore((prev) => ({
              ...prev,
              projects: prev.projects.map((p) => (p.id === id ? { ...p, title, updatedAt: Date.now() } : p)),
            }))
          }
          onDeleteProject={(id) =>
            setStore((prev) => {
              const projects = prev.projects.filter((p) => p.id !== id)
              if (projects.length === 0) {
                const proj = createProject('未命名项目')
                return { projects: [proj], currentId: proj.id }
              }
              return {
                projects,
                currentId: prev.currentId === id ? projects[0].id : prev.currentId,
              }
            })
          }
          onSelectStage={setStage}
          onExportProject={(id) => handleExportProject(id, false)}
          onImportProjects={handleImportProjects}
        />

        <main className="min-w-0 flex-1">
          {stage === 'outline' && (
            <OutlineStage outline={current.outline} onChange={(outline) => updateCurrent((p) => ({ ...p, outline }))} />
          )}
          {stage === 'scenes' && (
            <ScenesStage
              sceneList={current.sceneList}
              onChange={(sceneList) => updateCurrent((p) => ({ ...p, sceneList }))}
              onImportFromScript={importScenesFromScript}
            />
          )}
          {stage === 'script' && (
            <ScriptStage
              script={current.script}
              onScriptChange={(script) => updateCurrent((p) => ({ ...p, script }))}
              parsed={parsed}
              entities={entities}
              profile={effectiveProfile}
              styleLocked={Boolean(current.styleLock)}
              onLockStyle={(next) => updateCurrent((p) => ({ ...p, styleLock: next }))}
              autoAnchors={autoAnchors}
              overrides={current.entityOverrides ?? {}}
              onSetAnchor={(kind, name, values) =>
                updateCurrent((p) => ({
                  ...p,
                  entityOverrides: {
                    ...(p.entityOverrides ?? {}),
                    [overrideKey(kind, name)]: {
                      locked: p.entityOverrides?.[overrideKey(kind, name)]?.locked ?? true,
                      values: { ...values },
                    },
                  },
                }))
              }
              onToggleAnchorLock={(kind, name, locked) =>
                updateCurrent((p) => {
                  const key = overrideKey(kind, name)
                  const existing = p.entityOverrides?.[key]
                  return {
                    ...p,
                    entityOverrides: {
                      ...(p.entityOverrides ?? {}),
                      [key]: { locked, values: existing?.values ?? effectiveAnchors(kind, name) },
                    },
                  }
                })
              }
            />
          )}
          {stage === 'shots' && (
            <ShotsStage
              scenes={sceneGroups}
              shots={current.shots}
              onChange={(shots) => updateCurrent((p) => ({ ...p, shots }))}
              makers={{ makeImagePrompt: makeShotPrompt, makeVideoPrompt }}
              projectTitle={current.title}
            />
          )}
        </main>
      </div>

      {/* 统计条 */}
      <footer className="flex h-10 shrink-0 items-center justify-between gap-4 border-t border-border bg-card px-4 font-mono text-[11px] tracking-wide text-muted-foreground md:px-6">
        <div className="flex items-center gap-5">
          <span>字数 <span className="text-foreground">{stats.chars.toLocaleString()}</span></span>
          <span>场景 <span className="text-foreground">{stats.scenes}</span></span>
          <span>约 <span className="text-gold">{stats.pages}</span> 页</span>
          <span>片长 ≈ <span className="text-gold">{stats.minutes}</span> 分钟</span>
          {storageNote && <span className="text-gold-dim">{storageNote}</span>}
        </div>
        <div className="hidden items-center gap-5 md:flex">
          <span>1 页 ≈ 1 分钟（剧情片基准）</span>
          <span>{savedAt ? `已自动保存 ${savedAt}` : '编辑后自动保存'}</span>
          <span className="text-muted-foreground/60">支持 Kimi 直接写入 · API v2</span>
        </div>
      </footer>

      {/* 面板 */}
      {panel === 'snapshots' && (
        <SnapshotsPanel snapshots={current.snapshots} onRestore={handleRestoreSnapshot} onClose={() => setPanel(null)} />
      )}
      {panel === 'health' && health && (
        <HealthPanel
          continuity={health.continuity}
          sceneReport={health.sceneReport}
          arcReport={health.arcReport}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  )
}
