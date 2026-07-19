import type { SceneCard } from '../lib/types'
import { uid } from '../lib/store'

const IO_OPTIONS = ['内景', '外景', '内外景']
const TIME_OPTIONS = ['日', '夜', '黎明', '黄昏', '清晨', '深夜', '午后', '雨夜']

/** 阶段② 分场大纲：场景卡片列表，可增删改、上下排序、从剧本导入 */
export default function ScenesStage({
  sceneList,
  onChange,
  onImportFromScript,
}: {
  sceneList: SceneCard[]
  onChange: (next: SceneCard[]) => void
  onImportFromScript: () => void
}) {
  const update = (id: string, patch: Partial<SceneCard>) =>
    onChange(sceneList.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= sceneList.length) return
    const next = [...sceneList]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const add = () =>
    onChange([
      ...sceneList,
      { id: uid('sc'), location: '', io: '内景', time: '日', characters: [], beat: '', purpose: '' },
    ])

  const inputCls =
    'w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground/90 placeholder:text-muted-foreground/40 focus:border-gold focus:outline-none'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl tracking-tight text-foreground">分场大纲</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              每一场戏是一张卡：在哪里、谁在场、发生了什么、为什么存在。
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onImportFromScript}
              className="border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-300 hover:border-gold hover:text-gold active:translate-y-[1px]"
            >
              从剧本导入
            </button>
            <button
              type="button"
              onClick={add}
              className="border border-gold/50 px-3 py-1.5 text-xs text-gold transition-all duration-300 hover:bg-gold hover:text-[hsl(30_9%_6%)] active:translate-y-[1px]"
            >
              ＋加一场
            </button>
          </div>
        </div>

        {sceneList.length === 0 ? (
          <p className="mt-20 text-center text-sm text-muted-foreground">
            还没有分场。点「＋加一场」手工搭建，或点「从剧本导入」解析现有剧本的场景标题。
          </p>
        ) : (
          <div className="mt-8 space-y-4">
            {sceneList.map((scene, i) => (
              <div key={scene.id} className="border border-border bg-card/50 px-5 py-4 transition-colors duration-300 hover:border-gold/30">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-gold">{String(i + 1).padStart(2, '0')}</span>
                  <input
                    value={scene.location}
                    onChange={(e) => update(scene.id, { location: e.target.value })}
                    placeholder="地点（如 旧咖啡馆）"
                    className={`${inputCls} max-w-[14rem] font-serif text-sm`}
                  />
                  <select
                    value={scene.io}
                    onChange={(e) => update(scene.id, { io: e.target.value })}
                    className={`${inputCls} w-auto`}
                  >
                    {IO_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <select
                    value={scene.time}
                    onChange={(e) => update(scene.id, { time: e.target.value })}
                    className={`${inputCls} w-auto`}
                  >
                    {TIME_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <div className="ml-auto flex shrink-0 gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                      className="px-1.5 text-sm text-muted-foreground hover:text-gold disabled:opacity-30" title="上移">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === sceneList.length - 1}
                      className="px-1.5 text-sm text-muted-foreground hover:text-gold disabled:opacity-30" title="下移">↓</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`删除第 ${i + 1} 场「${scene.location || '未命名'}」？`)) {
                          onChange(sceneList.filter((s) => s.id !== scene.id))
                        }
                      }}
                      className="px-1.5 text-sm text-muted-foreground hover:text-red-400" title="删除">×</button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    value={scene.characters.join('，')}
                    onChange={(e) =>
                      update(scene.id, {
                        characters: e.target.value.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="出场人物（逗号分隔）"
                    className={inputCls}
                  />
                  <input
                    value={scene.beat}
                    onChange={(e) => update(scene.id, { beat: e.target.value })}
                    placeholder="本场节拍：发生了什么"
                    className={inputCls}
                  />
                </div>
                <input
                  value={scene.purpose}
                  onChange={(e) => update(scene.id, { purpose: e.target.value })}
                  placeholder="戏剧功能：这场戏为什么存在"
                  className={`${inputCls} mt-3`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
