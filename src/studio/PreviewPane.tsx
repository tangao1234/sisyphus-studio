import type { ParsedScript, ScriptElement } from '../lib/fountain'

/** 行内强调渲染：**粗体** *斜体* _下划线_ */
function renderInline(text: string) {
  const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g)
  return parts.map((part, i) => {
    if (part.startsWith('***') && part.endsWith('***')) {
      return (
        <strong key={i} className="font-bold italic">
          {part.slice(3, -3)}
        </strong>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return (
        <span key={i} className="underline underline-offset-2">
          {part.slice(1, -1)}
        </span>
      )
    }
    return part
  })
}

/** 单个剧本元素的排版（标准剧本缩进：角色偏右、对白窄栏、转场右对齐） */
function ElementView({ el, index }: { el: ScriptElement; index: number }) {
  switch (el.type) {
    case 'scene':
      return (
        <p key={index} className="mt-8 text-[15px] font-bold uppercase tracking-wide first:mt-0">
          {renderInline(el.text)}
        </p>
      )
    case 'character':
      return (
        <p key={index} className="ml-[30%] mt-5 text-[15px] uppercase">
          {renderInline(el.text)}
        </p>
      )
    case 'parenthetical':
      return (
        <p key={index} className="ml-[22%] w-[60%] text-[15px]">
          {renderInline(el.text)}
        </p>
      )
    case 'dialogue':
      return (
        <p key={index} className="ml-[14%] w-[66%] text-[15px]">
          {renderInline(el.text)}
        </p>
      )
    case 'transition':
      return (
        <p key={index} className="mt-4 text-right text-[15px] uppercase">
          {renderInline(el.text)}
        </p>
      )
    case 'centered':
      return (
        <p key={index} className="my-6 text-center text-[15px] tracking-[0.3em]">
          {renderInline(el.text)}
        </p>
      )
    case 'pageBreak':
      return (
        <div
          key={index}
          aria-hidden
          className="my-8 break-after-page border-t border-dashed border-[hsl(var(--ink)/0.25)]"
        />
      )
    default:
      return (
        <p key={index} className="mt-4 text-[15px] leading-[1.9]">
          {renderInline(el.text)}
        </p>
      )
  }
}

/** 排版后的「稿纸」预览（打印时只输出这一块，见 index.css @media print） */
export default function PreviewPane({ parsed }: { parsed: ParsedScript }) {
  return (
    <div className="h-full overflow-y-auto bg-[hsl(var(--paper))] text-[hsl(var(--ink))]">
      <div
        id="screenplay-paper"
        className="mx-auto min-h-full max-w-[46rem] px-10 py-12 md:px-14"
        style={{ fontFamily: '"Courier New", "Songti SC", "Noto Serif SC", SimSun, monospace' }}
      >
        {parsed.title.length > 0 && (
          <div className="break-after-page mb-16 flex min-h-[60vh] flex-col justify-center text-center">
            {parsed.title.map((field, i) => {
              const isTitle = field.key.toLowerCase() === 'title' || field.key === '标题'
              return isTitle ? (
                <h2 key={i} className="font-serif text-4xl tracking-wide">
                  {field.value}
                </h2>
              ) : (
                <p key={i} className="mt-4 text-[15px]">
                  {field.value}
                </p>
              )
            })}
          </div>
        )}
        {parsed.elements.map((el, i) => (
          <ElementView key={i} el={el} index={i} />
        ))}
        {parsed.elements.length === 0 && (
          <p className="text-center text-sm italic opacity-50">
            在左侧开始写作，这里会实时呈现标准剧本排版。
          </p>
        )}
      </div>
    </div>
  )
}
