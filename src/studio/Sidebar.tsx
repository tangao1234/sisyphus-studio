import { useRef, useState } from 'react'
import { STAGES, type Project, type Stage } from '../lib/types'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function stageDone(p: Project, stage: Stage): boolean {
  switch (stage) {
    case 'outline':
      return Boolean(p.outline.logline.trim() || p.outline.act1.trim() || p.outline.act2.trim() || p.outline.act3.trim())
    case 'scenes':
      return p.sceneList.length > 0
    case 'script':
      return p.script.trim().length > 0
    case 'shots':
      return p.shots.length > 0
  }
}

/** 左侧栏：项目列表 + 四阶流水线步骤导航 */
export default function Sidebar({
  projects,
  current,
  stage,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onSelectStage,
  onExportProject,
  onImportProjects,
}: {
  projects: Project[]
  current: Project
  stage: Stage
  onSelectProject: (id: string) => void
  onCreateProject: (title: string) => void
  onRenameProject: (id: string, title: string) => void
  onDeleteProject: (id: string) => void
  onSelectStage: (stage: Stage) => void
  onExportProject: (id: string) => void
  onImportProjects: (json: string) => { ok: boolean; added: number; error?: string }
}) {
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const submitCreate = () => {
    const title = newTitle.trim()
    if (title) onCreateProject(title)
    setNewTitle('')
    setCreating(false)
  }

  const handleImportFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = onImportProjects(String(reader.result ?? ''))
      if (result.ok) {
        window.alert(`成功导入 ${result.added} 个项目。`)
      } else {
        window.alert(`导入失败：${result.error ?? '未知错误'}`)
      }
    }
    reader.onerror = () => window.alert('导入失败：文件读取错误。')
    reader.readAsText(file)
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/40">
      {/* 项目列表 */}
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            项目
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-xs text-muted-foreground transition-colors duration-300 hover:text-gold"
            >
              导入
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="text-xs text-muted-foreground transition-colors duration-300 hover:text-gold"
            >
              ＋新建
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportFile(file)
              e.target.value = ''
            }}
          />
        </div>

        {creating && (
          <div className="mt-3 flex gap-2">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreate()
                if (e.key === 'Escape') setCreating(false)
              }}
              placeholder="片名"
              className="min-w-0 flex-1 border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-gold focus:outline-none"
            />
            <button
              type="button"
              onClick={submitCreate}
              className="shrink-0 border border-gold/50 px-2 text-xs text-gold hover:bg-gold hover:text-[hsl(30_9%_6%)]"
            >
              建
            </button>
          </div>
        )}

        <ul className="mt-3 space-y-1">
          {projects.map((p) => (
            <li key={p.id} className="group">
              <div
                className={`flex cursor-pointer items-center justify-between gap-2 px-2 py-2 transition-colors duration-300 ${
                  p.id === current.id ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                }`}
                onClick={() => onSelectProject(p.id)}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{p.title}</p>
                  <p className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground/70">
                    {formatTime(p.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <button
                    type="button"
                    title="导出项目 .json"
                    onClick={(e) => {
                      e.stopPropagation()
                      onExportProject(p.id)
                    }}
                    className="px-1 text-[11px] text-muted-foreground hover:text-gold"
                  >
                    导
                  </button>
                  <button
                    type="button"
                    title="重命名"
                    onClick={(e) => {
                      e.stopPropagation()
                      const next = window.prompt('重命名项目', p.title)
                      if (next && next.trim()) onRenameProject(p.id, next.trim())
                    }}
                    className="px-1 text-[11px] text-muted-foreground hover:text-gold"
                  >
                    改
                  </button>
                  <button
                    type="button"
                    title="删除项目"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (window.confirm(`删除项目「${p.title}」？其全部阶段内容与快照将一并删除。`)) {
                        onDeleteProject(p.id)
                      }
                    }}
                    className="px-1 text-[11px] text-muted-foreground hover:text-red-400"
                  >
                    删
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 流水线步骤 */}
      <nav className="flex-1 px-4 py-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          流水线
        </p>
        <ul className="mt-3 space-y-1">
          {STAGES.map((s) => {
            const active = s.key === stage
            const done = stageDone(current, s.key)
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => onSelectStage(s.key)}
                  className={`flex w-full items-center gap-3 px-2 py-2.5 text-left text-sm transition-colors duration-300 ${
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className={`font-mono text-xs ${active ? 'text-gold' : 'text-muted-foreground/60'}`}>
                    {s.index}
                  </span>
                  <span className="flex-1">{s.label}</span>
                  {done && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-label="已有内容" />}
                </button>
                {active && <div className="ml-2 h-px w-8 bg-gold" />}
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-border px-4 py-3">
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground/60">
          快照 {current.snapshots.length} / 20
        </p>
      </div>
    </aside>
  )
}
