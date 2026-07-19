import { useEffect, useRef, useState } from 'react'

/** 一键复制按钮（短暂反馈「已复制」） */
export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`shrink-0 border px-2.5 py-1 text-[11px] tracking-wide transition-colors duration-300 active:translate-y-[1px] ${
        copied
          ? 'border-gold bg-gold text-[hsl(30_9%_6%)]'
          : 'border-border text-muted-foreground hover:border-gold hover:text-gold'
      }`}
    >
      {copied ? '已复制' : '复制'}
    </button>
  )
}
