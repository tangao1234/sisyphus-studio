import type { Entities } from '../lib/entities'
import type { StyleProfile } from '../lib/style'
import {
  ANCHOR_SLOTS,
  assemblePrompt,
  overrideKey,
  type AnchorValues,
  type AutoAnchors,
  type EntityKind,
} from '../lib/anchors'
import type { EntityOverride } from '../lib/types'
import CopyButton from './CopyButton'

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

export interface EntitiesPaneProps {
  entities: Entities
  /** 生效风格画像（锁定后 = styleLock，否则 = 自动推断） */
  profile: StyleProfile
  styleLocked: boolean
  onLockStyle: (profile: StyleProfile | null) => void
  autoAnchors: AutoAnchors
  overrides: Record<string, EntityOverride>
  onSetAnchor: (kind: EntityKind, name: string, values: AnchorValues) => void
  onToggleAnchorLock: (kind: EntityKind, name: string, locked: boolean) => void
}

/** 元素识别面板：场景 / 人物 / 道具 + 视觉锚点编辑 + 风格锁定 */
export default function EntitiesPane({
  entities,
  profile,
  styleLocked,
  onLockStyle,
  autoAnchors,
  overrides,
  onSetAnchor,
  onToggleAnchorLock,
}: EntitiesPaneProps) {
  const isEmpty =
    entities.scenes.length === 0 && entities.characters.length === 0 && entities.props.length === 0

  const effectiveAnchors = (kind: EntityKind, name: string): AnchorValues => {
    const auto =
      kind === 'character'
        ? autoAnchors.characters[name]
        : kind === 'scene'
          ? autoAnchors.scenes[name]
          : autoAnchors.props[name]
    const override = overrides[overrideKey(kind, name)]
    return { ...(auto ?? {}), ...(override?.values ?? {}) }
  }

  const promptFor = (kind: EntityKind, name: string, opts: { io?: string; time?: string } = {}) =>
    assemblePrompt(kind, name, effectiveAnchors(kind, name), profile, opts)

  const handleExportAll = () => {
    const payload = {
      styleProfile: profile,
      scenes: entities.scenes.map((s) => ({
        ...s,
        anchors: effectiveAnchors('scene', s.location),
        prompt: promptFor('scene', s.location, { io: s.io, time: s.times[0] }),
      })),
      characters: entities.characters.map((c) => ({
        ...c,
        anchors: effectiveAnchors('character', c.name),
        prompt: promptFor('character', c.name),
      })),
      props: entities.props.map((p) => ({
        ...p,
        anchors: effectiveAnchors('prop', p.name),
        prompt: promptFor('prop', p.name),
      })),
    }
    download(`Sisyphus_prompts_${todayStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8')
  }

  const handleExportBible = () => {
    const lines: string[] = [
      `# 角色设定集 · ${todayStamp()}`,
      '',
      `风格画像：${profile.tags.join(' / ')}`,
      '',
    ]
    for (const c of entities.characters) {
      const anchors = effectiveAnchors('character', c.name)
      lines.push(`## ${c.name}（${c.role}）`)
      lines.push('')
      lines.push(`首次登场：第 ${c.firstSceneIndex} 场 · 对白 ${c.dialogueCount} 次 · 出场 ${c.sceneCount} 场`)
      lines.push('')
      lines.push('标准像提示词：')
      lines.push('')
      lines.push(promptFor('character', c.name))
      lines.push('')
      lines.push('视觉锚点：')
      lines.push('')
      for (const slot of ANCHOR_SLOTS.character) {
        lines.push(`- ${slot.label}：${anchors[slot.key] || '（未设定）'}`)
      }
      lines.push('')
    }
    download(`Sisyphus_character_bible_${todayStamp()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8')
  }

  const entityCard = (
    kind: EntityKind,
    name: string,
    title: string,
    meta: string,
    opts: { io?: string; time?: string } = {},
  ) => {
    const anchors = effectiveAnchors(kind, name)
    const locked = overrides[overrideKey(kind, name)]?.locked ?? false
    const prompt = assemblePrompt(kind, name, anchors, profile, opts)
    return (
      <div key={`${kind}:${name}`} className="border border-border bg-background/60 px-4 py-3 transition-colors duration-300 hover:border-gold/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-serif text-base text-foreground">{title}</p>
            <p className="mt-0.5 font-mono text-[11px] tracking-wide text-muted-foreground">{meta}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              title={locked ? '已锁定：自动推断不会覆盖你的锚点' : '未锁定：锚点可能随自动推断更新'}
              onClick={() => onToggleAnchorLock(kind, name, !locked)}
              className={`border px-2 py-1 text-[11px] transition-colors duration-300 ${
                locked
                  ? 'border-gold/60 text-gold'
                  : 'border-border text-muted-foreground hover:border-gold hover:text-gold'
              }`}
            >
              {locked ? '已锁定' : '锁定'}
            </button>
            <CopyButton text={prompt} />
          </div>
        </div>

        {/* 视觉锚点（可编辑；编辑即保存到覆盖层） */}
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-3">
          {ANCHOR_SLOTS[kind].map((slot) => (
            <label key={slot.key} className="block">
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground/70">
                {slot.label}
              </span>
              <input
                value={anchors[slot.key] ?? ''}
                placeholder="—"
                onChange={(e) => onSetAnchor(kind, name, { ...anchors, [slot.key]: e.target.value })}
                className="mt-0.5 w-full border border-border/70 bg-background px-2 py-1 text-[11px] text-foreground/90 placeholder:text-muted-foreground/30 focus:border-gold focus:outline-none"
              />
            </label>
          ))}
        </div>

        <p className="mt-2.5 border-t border-border/60 pt-2.5 text-xs leading-relaxed text-muted-foreground">
          {prompt}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      {/* 风格画像 */}
      <div className="flex flex-wrap items-center gap-2">
        {profile.tags.map((tag) => (
          <span key={tag} className="border border-gold/25 px-2.5 py-1 font-mono text-[11px] tracking-wide text-gold-dim">
            {tag}
          </span>
        ))}
        <button
          type="button"
          onClick={() => onLockStyle(styleLocked ? null : profile)}
          className={`border px-2.5 py-1 text-[11px] transition-colors duration-300 ${
            styleLocked
              ? 'border-gold/60 text-gold'
              : 'border-border text-muted-foreground hover:border-gold hover:text-gold'
          }`}
        >
          {styleLocked ? '风格已锁定' : '锁定风格'}
        </button>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={handleExportBible}
            disabled={entities.characters.length === 0}
            className="border border-border px-3 py-1 text-[11px] tracking-wide text-muted-foreground transition-colors duration-300 hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40 active:translate-y-[1px]"
          >
            导出角色设定集
          </button>
          <button
            type="button"
            onClick={handleExportAll}
            disabled={isEmpty}
            className="border border-border px-3 py-1 text-[11px] tracking-wide text-muted-foreground transition-colors duration-300 hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40 active:translate-y-[1px]"
          >
            导出全部提示词
          </button>
        </div>
      </div>

      {styleLocked ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ['era', '年代'],
              ['region', '地域'],
              ['genre', '类型'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-muted-foreground/70">{label}</span>
              <input
                value={profile[key]}
                onChange={(e) => onLockStyle({ ...profile, [key]: e.target.value, tags: rebuildTags({ ...profile, [key]: e.target.value }) })}
                className="w-24 border border-border/70 bg-background px-2 py-1 text-[11px] text-foreground/90 focus:border-gold focus:outline-none"
              />
            </label>
          ))}
          <label className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground/70">影调</span>
            <input
              value={profile.tones.join('，')}
              onChange={(e) => {
                const tones = e.target.value.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
                onLockStyle({ ...profile, tones, tags: rebuildTags({ ...profile, tones }) })
              }}
              className="w-36 border border-border/70 bg-background px-2 py-1 text-[11px] text-foreground/90 focus:border-gold focus:outline-none"
            />
          </label>
        </div>
      ) : (
        profile.fallback && (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">
            未识别到明显年代/地域线索，已回退到默认画像。可点「锁定风格」改为手动设定。
          </p>
        )
      )}

      {isEmpty ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          开始写作后，这里会自动识别剧本中的场景、人物与道具。
        </p>
      ) : (
        <div className="mt-6 space-y-8 pb-6">
          {entities.scenes.length > 0 && (
            <section>
              <GroupTitle label="场景" count={entities.scenes.length} />
              <div className="mt-3 space-y-2.5">
                {entities.scenes.map((s) =>
                  entityCard(
                    'scene',
                    s.location,
                    s.location,
                    `${s.io}${s.times.length > 0 ? ` · ${s.times.join(' / ')}` : ''} · 首现第 ${s.firstIndex} 场${s.count > 1 ? ` · 共 ${s.count} 次` : ''}`,
                    { io: s.io, time: s.times[0] },
                  ),
                )}
              </div>
            </section>
          )}
          {entities.characters.length > 0 && (
            <section>
              <GroupTitle label="人物" count={entities.characters.length} />
              <div className="mt-3 space-y-2.5">
                {entities.characters.map((c) =>
                  entityCard(
                    'character',
                    c.name,
                    `${c.name} · ${c.role}`,
                    `对白 ${c.dialogueCount} 次 · 出场 ${c.sceneCount} 场 · 首现第 ${c.firstSceneIndex} 场`,
                  ),
                )}
              </div>
            </section>
          )}
          {entities.props.length > 0 && (
            <section>
              <GroupTitle label="道具" count={entities.props.length} />
              <div className="mt-3 space-y-2.5">
                {entities.props.map((p) =>
                  entityCard('prop', p.name, p.name, `出现 ${p.count} 次 · 首现第 ${p.firstSceneIndex} 场`),
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function GroupTitle({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3">
      <h3 className="font-serif text-lg text-foreground">{label}</h3>
      <span className="font-mono text-[11px] tracking-[0.2em] text-gold-dim">{count}</span>
    </div>
  )
}

function rebuildTags(p: StyleProfile): string[] {
  return [p.era, p.region, p.genre, ...p.tones, p.textures[1] ?? p.textures[0]].filter(Boolean).slice(0, 6)
}
