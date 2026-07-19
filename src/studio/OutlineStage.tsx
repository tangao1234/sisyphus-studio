import type { Outline } from '../lib/types'

/** 阶段① 故事大纲：结构化文本区 */
export default function OutlineStage({
  outline,
  onChange,
}: {
  outline: Outline
  onChange: (next: Outline) => void
}) {
  const field = (
    key: keyof Outline,
    label: string,
    placeholder: string,
    rows: number,
    hint?: string,
  ) => (
    <div className="mt-8 first:mt-0">
      <label className="flex items-baseline gap-3">
        <span className="font-serif text-base text-foreground">{label}</span>
        {hint && <span className="font-mono text-[11px] text-muted-foreground/70">{hint}</span>}
      </label>
      <textarea
        value={outline[key]}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => onChange({ ...outline, [key]: e.target.value })}
        className="mt-2 w-full resize-y border border-border bg-background px-4 py-3 text-sm leading-[1.9] text-foreground/90 placeholder:text-muted-foreground/40 focus:border-gold focus:outline-none"
      />
    </div>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h2 className="font-serif text-2xl tracking-tight text-foreground">故事大纲</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          先把故事说给自己听：一句话、一个主题、三幕、一群人。
        </p>
        <div className="mt-8">
          {field('logline', '一句话梗概', '什么人，想要什么，代价是什么。', 2)}
          {field('theme', '主题', '这部戏真正在说什么。', 2)}
          {field('act1', '第一幕 · 建置', '世界、人物、激励事件。', 4)}
          {field('act2', '第二幕 · 对抗', '阻碍升级，中点，至暗时刻。', 4)}
          {field('act3', '第三幕 · 结局', '高潮与落点，人物完成了什么改变。', 4)}
          {field('characters', '人物小传', '主要人物：姓名、年龄、欲望、秘密。', 6)}
        </div>
      </div>
    </div>
  )
}
