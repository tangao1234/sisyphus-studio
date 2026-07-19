import type { Shot } from '../lib/types'
import { uid, SHOT_DURATIONS } from '../lib/store'
import CopyButton from './CopyButton'

const SIZE_OPTIONS = ['远', '全', '中', '近', '特']
const MOVE_OPTIONS = ['固定', '推', '拉', '摇', '跟', '移', '升降']

function todayStamp() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
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

export interface SceneGroup {
  index: number
  label: string
}

export interface ShotPromptMakers {
  /** 概念图提示词：画面描述 + 元素锚点 + 风格画像 */
  makeImagePrompt: (shot: Pick<Shot, 'sceneIndex' | 'size' | 'movement' | 'description'>) => string
  /** Seedance 视频提示词：镜头语言 + 动作 + 场景氛围 + 风格 + 音效 + 时长 */
  makeVideoPrompt: (shot: Pick<Shot, 'sceneIndex' | 'size' | 'movement' | 'description' | 'duration'>) => string
}

/** 阶段④ 镜头提示词 · 图/视频双输出：按场景分组的镜头卡片 */
export default function ShotsStage({
  scenes,
  shots,
  onChange,
  makers,
  projectTitle,
}: {
  scenes: SceneGroup[]
  shots: Shot[]
  onChange: (next: Shot[]) => void
  makers: ShotPromptMakers
  projectTitle: string
}) {
  const update = (id: string, patch: Partial<Shot>) =>
    onChange(shots.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= shots.length) return
    const next = [...shots]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const addShot = (sceneIndex: number) =>
    onChange([
      ...shots,
      {
        id: uid('shot'),
        sceneIndex,
        size: '全',
        movement: '固定',
        description: '',
        prompt: '',
        videoPrompt: '',
        duration: '10s',
      },
    ])

  const resolved = (s: Shot) => ({
    image: s.prompt.trim() || makers.makeImagePrompt(s),
    video: s.videoPrompt.trim() || makers.makeVideoPrompt(s),
  })

  const exportJson = () => {
    const payload = {
      project: projectTitle,
      scenes: scenes.map((g) => ({
        scene: g.index,
        label: g.label,
        shots: shots
          .filter((s) => s.sceneIndex === g.index)
          .map((s) => ({
            size: s.size,
            movement: s.movement,
            duration: s.duration,
            description: s.description,
            imagePrompt: resolved(s).image,
            videoPrompt: resolved(s).video,
          })),
      })),
    }
    download(`Sisyphus_shots_${todayStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8')
  }

  const exportTxt = () => {
    const lines: string[] = [`# ${projectTitle} · 镜头提示词（概念图 / Seedance 视频）`, '']
    for (const g of scenes) {
      const groupShots = shots.filter((s) => s.sceneIndex === g.index)
      if (groupShots.length === 0) continue
      lines.push(`## 第 ${g.index} 场 · ${g.label}`)
      lines.push('')
      groupShots.forEach((s, i) => {
        const r = resolved(s)
        lines.push(`### 镜头 ${i + 1}（${s.size}景 / ${s.movement} / ${s.duration}）`)
        lines.push(`概念图：${r.image}`)
        lines.push(`视频：${r.video}`)
        lines.push('')
      })
    }
    download(`Sisyphus_shots_${todayStamp()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8')
  }

  const inputCls =
    'w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground/90 placeholder:text-muted-foreground/40 focus:border-gold focus:outline-none'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl tracking-tight text-foreground">
              镜头提示词 · 图/视频双输出
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              每场戏拆成镜头：景别、运镜、画面。每个镜头同时产出概念图提示词与 Seedance 视频提示词，均可手动改。
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={exportTxt} disabled={shots.length === 0}
              className="border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-300 hover:border-gold hover:text-gold disabled:opacity-40 active:translate-y-[1px]">
              导出 .md
            </button>
            <button type="button" onClick={exportJson} disabled={shots.length === 0}
              className="border border-gold/50 px-3 py-1.5 text-xs text-gold transition-all duration-300 hover:bg-gold hover:text-[hsl(30_9%_6%)] disabled:opacity-40 active:translate-y-[1px]">
              导出全部提示词
            </button>
          </div>
        </div>

        {scenes.length === 0 ? (
          <p className="mt-20 text-center text-sm text-muted-foreground">
            还没有可用场景。先去「分场大纲」建场，或在剧本里写场景标题。
          </p>
        ) : (
          <div className="mt-8 space-y-10">
            {scenes.map((group) => {
              const groupShots = shots.filter((s) => s.sceneIndex === group.index)
              return (
                <section key={group.index}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-sm text-gold">{String(group.index).padStart(2, '0')}</span>
                      <h3 className="font-serif text-lg text-foreground">{group.label}</h3>
                    </div>
                    <button type="button" onClick={() => addShot(group.index)}
                      className="text-xs text-muted-foreground transition-colors duration-300 hover:text-gold">
                      ＋加镜头
                    </button>
                  </div>

                  {groupShots.length === 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground/60">本场还没有镜头。</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {groupShots.map((shot, i) => {
                        const globalIndex = shots.findIndex((s) => s.id === shot.id)
                        return (
                          <div key={shot.id} className="border border-border bg-card/50 px-5 py-4 transition-colors duration-300 hover:border-gold/30">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs text-muted-foreground">镜头 {i + 1}</span>
                              <select value={shot.size} onChange={(e) => update(shot.id, { size: e.target.value })}
                                className={`${inputCls} w-auto`}>
                                {SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}景</option>)}
                              </select>
                              <select value={shot.movement} onChange={(e) => update(shot.id, { movement: e.target.value })}
                                className={`${inputCls} w-auto`}>
                                {MOVE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                              <select value={shot.duration} onChange={(e) => update(shot.id, { duration: e.target.value })}
                                className={`${inputCls} w-auto`} title="建议生成时长（即梦单镜头 4-15s）">
                                {SHOT_DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                              </select>
                              <div className="ml-auto flex shrink-0 gap-1">
                                <button type="button" onClick={() => move(globalIndex, -1)} disabled={globalIndex === 0}
                                  className="px-1.5 text-sm text-muted-foreground hover:text-gold disabled:opacity-30" title="上移">↑</button>
                                <button type="button" onClick={() => move(globalIndex, 1)} disabled={globalIndex === shots.length - 1}
                                  className="px-1.5 text-sm text-muted-foreground hover:text-gold disabled:opacity-30" title="下移">↓</button>
                                <button type="button"
                                  onClick={() => onChange(shots.filter((s) => s.id !== shot.id))}
                                  className="px-1.5 text-sm text-muted-foreground hover:text-red-400" title="删除">×</button>
                              </div>
                            </div>

                            <textarea
                              value={shot.description}
                              rows={2}
                              spellCheck={false}
                              onChange={(e) => update(shot.id, { description: e.target.value })}
                              placeholder="画面描述：这个镜头里看到什么、发生什么动作"
                              className={`${inputCls} mt-3 resize-y leading-relaxed`}
                            />

                            {/* 概念图提示词 */}
                            <div className="mt-3">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] tracking-wide text-muted-foreground/70">
                                  概念图提示词
                                </span>
                                <div className="flex items-center gap-2">
                                  <button type="button"
                                    onClick={() => update(shot.id, { prompt: makers.makeImagePrompt(shot) })}
                                    className="text-[11px] text-muted-foreground transition-colors duration-300 hover:text-gold">
                                    重新生成
                                  </button>
                                  <CopyButton text={resolved(shot).image} />
                                </div>
                              </div>
                              <textarea
                                value={shot.prompt}
                                rows={2}
                                spellCheck={false}
                                onChange={(e) => update(shot.id, { prompt: e.target.value })}
                                placeholder="留空时导出将自动组装"
                                className={`${inputCls} mt-1 resize-y leading-relaxed text-muted-foreground`}
                              />
                            </div>

                            {/* Seedance 视频提示词 */}
                            <div className="mt-3">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] tracking-wide text-gold-dim">
                                  Seedance 视频提示词
                                </span>
                                <div className="flex items-center gap-2">
                                  <button type="button"
                                    onClick={() => update(shot.id, { videoPrompt: makers.makeVideoPrompt(shot) })}
                                    className="text-[11px] text-muted-foreground transition-colors duration-300 hover:text-gold">
                                    重新生成
                                  </button>
                                  <CopyButton text={resolved(shot).video} />
                                </div>
                              </div>
                              <textarea
                                value={shot.videoPrompt}
                                rows={3}
                                spellCheck={false}
                                onChange={(e) => update(shot.id, { videoPrompt: e.target.value })}
                                placeholder="留空时导出将自动组装"
                                className={`${inputCls} mt-1 resize-y leading-relaxed text-muted-foreground`}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
