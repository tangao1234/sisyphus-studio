import { useState } from 'react'
import type { ParsedScript } from '../lib/fountain'
import type { Entities } from '../lib/entities'
import type { StyleProfile } from '../lib/style'
import type { AutoAnchors, AnchorValues, EntityKind } from '../lib/anchors'
import type { EntityOverride } from '../lib/types'
import PreviewPane from './PreviewPane'
import EntitiesPane from './EntitiesPane'
import { studio } from '../data/site'

type RightTab = 'preview' | 'entities'

/** 阶段③ 正式剧本：Fountain 编辑器 + 右侧 排版/元素 双标签面板 */
export default function ScriptStage({
  script,
  onScriptChange,
  parsed,
  entities,
  profile,
  styleLocked,
  onLockStyle,
  autoAnchors,
  overrides,
  onSetAnchor,
  onToggleAnchorLock,
}: {
  script: string
  onScriptChange: (text: string) => void
  parsed: ParsedScript
  entities: Entities
  profile: StyleProfile
  styleLocked: boolean
  onLockStyle: (profile: StyleProfile | null) => void
  autoAnchors: AutoAnchors
  overrides: Record<string, EntityOverride>
  onSetAnchor: (kind: EntityKind, name: string, values: AnchorValues) => void
  onToggleAnchorLock: (kind: EntityKind, name: string, locked: boolean) => void
}) {
  const [tab, setTab] = useState<RightTab>('preview')

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 语法提示 */}
      <p className="shrink-0 border-b border-border px-4 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground md:px-6">
        {studio.hint}
      </p>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex min-h-0 flex-1 flex-col border-b border-border md:border-b-0 md:border-r">
          <textarea
            id="script-editor"
            value={script}
            onChange={(e) => onScriptChange(e.target.value)}
            spellCheck={false}
            placeholder="在这里用 Fountain 语法写作……"
            className="min-h-0 flex-1 resize-none bg-transparent px-6 py-6 text-[15px] leading-[1.9] text-foreground/90 placeholder:text-muted-foreground/50 focus:outline-none"
            style={{
              fontFamily:
                '"Cascadia Mono", Consolas, "Courier New", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace',
            }}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-stretch border-b border-border" role="tablist">
            {(
              [
                { key: 'preview', label: '排版' },
                { key: 'entities', label: '元素' },
              ] as Array<{ key: RightTab; label: string }>
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`relative px-6 text-sm tracking-wide transition-colors duration-300 ${
                  tab === t.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
                {tab === t.key && <span className="absolute inset-x-0 bottom-0 h-px bg-gold" />}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {tab === 'preview' ? (
              <PreviewPane parsed={parsed} />
            ) : (
              <EntitiesPane
                entities={entities}
                profile={profile}
                styleLocked={styleLocked}
                onLockStyle={onLockStyle}
                autoAnchors={autoAnchors}
                overrides={overrides}
                onSetAnchor={onSetAnchor}
                onToggleAnchorLock={onToggleAnchorLock}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
