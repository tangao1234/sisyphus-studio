import { useState } from 'react'
import type { Snapshot } from '../lib/types'
import type { ContinuityIssue } from '../lib/continuity'
import type { ArcReport, SceneAnalysisReport, AnalysisIssue } from '../lib/analysis'

function formatTs(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function PanelShell({
  title,
  wide,
  onClose,
  children,
}: {
  title: string
  wide?: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className={`flex max-h-[78vh] w-full flex-col border border-border bg-card ${wide ? 'max-w-2xl' : 'max-w-xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="font-serif text-lg text-foreground">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground transition-colors hover:text-foreground">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

/** 快照面板：时间列表 + 摘要 + 恢复 */
export function SnapshotsPanel({
  snapshots,
  onRestore,
  onClose,
}: {
  snapshots: Snapshot[]
  onRestore: (ts: number) => void
  onClose: () => void
}) {
  return (
    <PanelShell title="版本快照" onClose={onClose}>
      {snapshots.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          还没有快照。点顶栏「存快照」手动存档，切换阶段时如有改动也会自动存档。
        </p>
      ) : (
        <ul className="space-y-2.5">
          {[...snapshots].reverse().map((snap) => (
            <li key={snap.ts} className="border border-border bg-background/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
                  {formatTs(snap.ts)}
                  {snap.label && <span className="ml-2 text-gold-dim">{snap.label}</span>}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('恢复此快照将覆盖当前内容（恢复前会自动先存一份当前快照）。继续吗？')) {
                      onRestore(snap.ts)
                    }
                  }}
                  className="shrink-0 border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors duration-300 hover:border-gold hover:text-gold active:translate-y-[1px]"
                >
                  恢复
                </button>
              </div>
              <p className="mt-1.5 truncate text-xs text-muted-foreground/80">{snap.summary || '（空）'}</p>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  )
}

/* ── 体检面板：三维度 ─────────────────────────────────── */

type HealthTab = 'structure' | 'scenes' | 'arcs'

/** 启发式评分圆点（5 分制），UI 已注明为启发式评估 */
function ScoreDots({ score }: { score: number }) {
  const filled = Math.round((score / 100) * 5)
  return (
    <span className="font-mono text-sm tracking-[0.15em] text-gold" title={`${score} 分（启发式评估）`}>
      {'●'.repeat(filled)}
      <span className="text-muted-foreground/40">{'●'.repeat(5 - filled)}</span>
    </span>
  )
}

function IssueList({ issues, empty }: { issues: AnalysisIssue[]; empty: string }) {
  if (issues.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
  }
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1))
  const warns = sorted.filter((i) => i.level === 'warn')
  const infos = sorted.filter((i) => i.level === 'info')
  return (
    <div className="space-y-5">
      {warns.length > 0 && (
        <section>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold-dim">警告 · {warns.length}</p>
          <ul className="mt-2 space-y-2">
            {warns.map((issue, i) => (
              <li key={i} className="border-l-2 border-gold/60 bg-background/60 px-3 py-2 text-xs leading-relaxed text-foreground/90">
                <span className="mr-2 font-mono text-[10px] text-muted-foreground">{issue.rule}</span>
                {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}
      {infos.length > 0 && (
        <section>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">提示 · {infos.length}</p>
          <ul className="mt-2 space-y-2">
            {infos.map((issue, i) => (
              <li key={i} className="border-l border-border bg-background/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                <span className="mr-2 font-mono text-[10px] text-muted-foreground/60">{issue.rule}</span>
                {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function gradeMark(grade: 0 | 1 | 2): { text: string; cls: string } {
  if (grade === 2) return { text: '健康', cls: 'text-muted-foreground' }
  if (grade === 1) return { text: '偏弱', cls: 'text-gold' }
  return { text: '弱场', cls: 'text-red-400' }
}

/** 体检面板：结构 / 场景 / 人物 三维度报告 */
export function HealthPanel({
  continuity,
  sceneReport,
  arcReport,
  onClose,
}: {
  continuity: ContinuityIssue[]
  sceneReport: SceneAnalysisReport
  arcReport: ArcReport
  onClose: () => void
}) {
  const [tab, setTab] = useState<HealthTab>('structure')
  const structureScore = continuity.some((i) => i.level === 'warn') ? (continuity.length > 4 ? 20 : 50) : continuity.length > 0 ? 80 : 100

  const tabs: Array<{ key: HealthTab; label: string; score: number }> = [
    { key: 'structure', label: '结构', score: structureScore },
    { key: 'scenes', label: '场景', score: sceneReport.score },
    { key: 'arcs', label: '人物', score: arcReport.score },
  ]

  return (
    <PanelShell title="体检报告" wide onClose={onClose}>
      {/* 总览 */}
      <div className="flex items-center gap-8 border-b border-border pb-3">
        {tabs.map((t) => (
          <div key={t.key} className="flex items-baseline gap-2.5">
            <span className="text-sm text-muted-foreground">{t.label}</span>
            <ScoreDots score={t.score} />
          </div>
        ))}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
          启发式评估，仅供参考
        </span>
      </div>

      {/* Tab 切换 */}
      <div className="mt-3 flex border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-2 text-sm transition-colors duration-300 ${
              tab === t.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {tab === t.key && <span className="absolute inset-x-0 bottom-0 h-px bg-gold" />}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'structure' && (
          <IssueList issues={continuity} empty="结构层面没有发现问题：大纲、分场与剧本彼此对得上。" />
        )}

        {tab === 'scenes' && (
          <div>
            <p className="text-xs leading-relaxed text-muted-foreground">{sceneReport.summary}</p>
            {sceneReport.scenes.length > 0 && (
              <ul className="mt-4 space-y-2.5">
                {sceneReport.scenes.map((scene) => {
                  const mark = gradeMark(scene.grade)
                  return (
                    <li key={scene.index} className="border border-border bg-background/60 px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-sm text-foreground">
                          <span className="mr-2 font-mono text-xs text-gold-dim">{String(scene.index).padStart(2, '0')}</span>
                          {scene.label}
                        </p>
                        <span className={`shrink-0 font-mono text-[11px] ${mark.cls}`}>{mark.text}</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {scene.notes.join('；')}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
            {sceneReport.issues.length > 0 && (
              <div className="mt-5">
                <IssueList issues={sceneReport.issues} empty="" />
              </div>
            )}
          </div>
        )}

        {tab === 'arcs' && (
          <div>
            <p className="text-xs leading-relaxed text-muted-foreground">{arcReport.summary}</p>
            {arcReport.characters.length > 0 && (
              <ul className="mt-4 space-y-2.5">
                {arcReport.characters.map((ch) => (
                  <li key={ch.name} className="border border-border bg-background/60 px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm text-foreground">
                        {ch.name}
                        <span className="ml-2 font-mono text-[11px] text-gold-dim">{ch.role}</span>
                      </p>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        第 {ch.firstScene}–{ch.lastScene} 场 · 对白 {ch.dialogueCount}
                      </span>
                    </div>
                    {/* 对白量曲线（按场） */}
                    {ch.dialogueCurve.length > 0 && (
                      <div className="mt-2 flex h-6 items-end gap-1" title="逐场对白量">
                        {ch.dialogueCurve.map((v, i) => (
                          <div
                            key={i}
                            className={`w-3 ${v > 0 ? 'bg-gold/50' : 'bg-border'}`}
                            style={{ height: `${Math.max(15, Math.min(100, v * 30))}%` }}
                          />
                        ))}
                      </div>
                    )}
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {ch.notes.join('；')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {arcReport.issues.length > 0 && (
              <div className="mt-5">
                <IssueList issues={arcReport.issues} empty="" />
              </div>
            )}
          </div>
        )}
      </div>
    </PanelShell>
  )
}
