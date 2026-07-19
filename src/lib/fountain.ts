/**
 * Fountain 剧本标记语法解析器（核心子集 + 中文场景习惯）
 *
 * 支持元素：
 * - 标题页键值对（Title / Author 等标准键 + 中文键：标题/作者/署名 等）
 * - 场景标题：INT./EXT./EST./INT./EXT./I/E 开头，或「内景/外景/内外」开头
 *   （如「内景·咖啡馆·夜」「12 外景·山坡·黎明」），`.xxx` 强制场景
 * - 角色：全大写拉丁行（SARAH）、@强制、中文短人名行（2-6 字，可带（画外音）类扩展）
 * - 对白：角色行之后直到空行的文本；表演提示（圆括号/中文括号行）
 * - 转场：大写 TO: 结尾、>强制，或中文转场词（切至/淡入/淡出/渐隐/叠化 等）
 * - 居中文本：>文本<
 * - 分页：===（三个以上等号）
 * - 备注 [[...]] 与 boneyard 区块在解析时剔除，不出现在排版结果中
 *
 * 页数/片长估算遵循 page-estimation 规范：
 * 标准剧本 55-60 行/页，对白栏更窄约 40 行/页，1 页 ≈ 1 分钟（剧情片基准）。
 */

export type ScriptElementType =
  | 'scene'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered'
  | 'pageBreak'

export interface ScriptElement {
  type: ScriptElementType
  text: string
}

export interface TitleField {
  key: string
  value: string
}

export interface ParsedScript {
  title: TitleField[]
  elements: ScriptElement[]
}

export interface ScriptStats {
  /** 非空白字符数 */
  chars: number
  /** 场景数 */
  scenes: number
  /** 估算页数（含标题页） */
  pages: number
  /** 估算片长（分钟，1 页 ≈ 1 分钟） */
  minutes: number
}

const TITLE_KEYS = new Set([
  'title',
  'credit',
  'author',
  'source',
  'draft date',
  'contact',
  'copyright',
  'notes',
  '标题',
  '署名',
  '作者',
  '来源',
  '日期',
  '联系方式',
  '版权',
  '备注',
])

/** 英文场景前缀：INT. / EXT. / EST. / INT./EXT. / I/E 等 */
const SCENE_EN = /^(INT\.\/EXT\.|INT\/EXT|INT\.|EXT\.|EST\.|I\/E)/i
/** 中文场景前缀：内景 / 外景 / 内外景 / 内外 */
const SCENE_ZH = /^(内外景|内景|外景|内外)/
/** 可选的中文场号前缀：「12 」「第12场 」等 */
const SCENE_NO = /^第?\d+场?[、.．\s]+/
/** 场景编号后缀 #1# */
const SCENE_HASH = /\s*#[^#]+#\s*$/
/** 英文转场：全大写且以 TO: 结尾 */
const TRANSITION_EN = /^[A-Z0-9 .'\-()]+TO:$/
/** 中文转场词 */
const TRANSITION_ZH = /^(切至|淡入|淡出|渐隐|叠化|化入|化出|闪回|黑场|渐显)[：:。]?$/
/** 中文角色名：2-6 个汉字（可含间隔号），可带（画外音）/（V.O.）类扩展 */
const CHARACTER_ZH = /^[一-龥·]{2,6}([(（][^)）]*[)）])?$/
/** 拉丁角色名：全大写（允许数字、空格与常见扩展符号） */
const CHARACTER_EN = /^[A-Z][A-Z0-9 .'\-()&·^]*$/
/** 括号行（表演提示） */
const PAREN_LINE = /^[(（][\s\S]*[)）]$/

/** 剔除 boneyard 区块与行内备注 */
function cleanSource(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
}

function stripInlineNotes(text: string): string {
  return text.replace(/\[\[[^\]]*\]\]/g, '').trim()
}

function isSceneHeading(line: string): { match: boolean; text: string } {
  if (line.startsWith('.')) {
    return { match: true, text: line.slice(1).trim() }
  }
  let candidate = line
  const noMatch = candidate.match(SCENE_NO)
  if (noMatch) candidate = candidate.slice(noMatch[0].length)
  if (SCENE_ZH.test(candidate) || SCENE_EN.test(candidate)) {
    return { match: true, text: candidate.replace(SCENE_HASH, '').trim() }
  }
  return { match: false, text: line }
}

function isCharacterLine(line: string, hasFollowing: boolean): { match: boolean; text: string } {
  if (!hasFollowing) return { match: false, text: line }
  if (line.startsWith('@')) {
    return { match: true, text: line.slice(1).trim() }
  }
  if (CHARACTER_ZH.test(line)) {
    return { match: true, text: line }
  }
  // 拉丁角色名：全大写、含字母、长度受限；结尾 ^ 为双人同时对白标记，保留显示
  if (line.length <= 40 && CHARACTER_EN.test(line) && /[A-Z]/.test(line) && line === line.toUpperCase()) {
    return { match: true, text: line }
  }
  return { match: false, text: line }
}

/** 解析标题页：文档开头连续的「键: 值」行（缩进行为上一键的续行） */
function parseTitlePage(lines: string[]): { title: TitleField[]; rest: string[] } {
  const title: TitleField[] = []
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const m = raw.match(/^([A-Za-z][A-Za-z ]*|【?[一-龥]+】?)\s*[:：]\s*(.*)$/)
    if (m && TITLE_KEYS.has(m[1].replace(/[【】]/g, '').trim().toLowerCase())) {
      title.push({ key: m[1].replace(/[【】]/g, '').trim(), value: m[2].trim() })
      i += 1
      continue
    }
    if (title.length > 0 && /^\s+\S/.test(raw)) {
      title[title.length - 1].value += `\n${raw.trim()}`
      i += 1
      continue
    }
    break
  }
  return { title, rest: lines.slice(i) }
}

export function parseFountain(src: string): ParsedScript {
  const cleaned = cleanSource(src)
  const lines = cleaned.replace(/\r\n?/g, '\n').split('\n')
  const { title, rest } = parseTitlePage(lines)

  const elements: ScriptElement[] = []
  let inDialogue = false
  let prevBlank = true

  for (let i = 0; i < rest.length; i++) {
    const line = stripInlineNotes(rest[i].trim())

    if (line === '') {
      // 原始行本就是空行，或整行是一条备注
      inDialogue = false
      prevBlank = true
      continue
    }

    if (/^={3,}$/.test(line)) {
      elements.push({ type: 'pageBreak', text: '' })
      inDialogue = false
      prevBlank = true
      continue
    }

    // 居中文本 >文本<
    const centered = line.match(/^>(.+)<$/)
    if (centered) {
      elements.push({ type: 'centered', text: centered[1].trim() })
      inDialogue = false
      prevBlank = false
      continue
    }

    // 转场：>强制、英文 TO:、中文转场词
    if (line.startsWith('>')) {
      elements.push({ type: 'transition', text: line.slice(1).trim() })
      inDialogue = false
      prevBlank = false
      continue
    }
    if (TRANSITION_EN.test(line) || TRANSITION_ZH.test(line)) {
      elements.push({ type: 'transition', text: line })
      inDialogue = false
      prevBlank = false
      continue
    }

    // 场景标题
    const scene = isSceneHeading(line)
    if (scene.match) {
      elements.push({ type: 'scene', text: scene.text })
      inDialogue = false
      prevBlank = false
      continue
    }

    // 角色（前有空行，且后面紧跟内容行）
    if (prevBlank && !inDialogue) {
      const nextLine = rest[i + 1]?.trim() ?? ''
      const hasFollowing =
        nextLine !== '' &&
        !isSceneHeading(nextLine).match &&
        !/^={3,}$/.test(nextLine)
      const character = isCharacterLine(line, hasFollowing)
      if (character.match) {
        elements.push({ type: 'character', text: character.text })
        inDialogue = true
        prevBlank = false
        continue
      }
    }

    // 表演提示 / 对白
    if (inDialogue && PAREN_LINE.test(line)) {
      elements.push({ type: 'parenthetical', text: line })
      prevBlank = false
      continue
    }
    if (inDialogue) {
      elements.push({ type: 'dialogue', text: line })
      prevBlank = false
      continue
    }

    // 动作段落（! 前缀强制动作）
    elements.push({ type: 'action', text: line.startsWith('!') ? line.slice(1).trim() : line })
    prevBlank = false
  }

  return { title, elements }
}

/**
 * 页数与片长估算（page-estimation 规范）
 * 动作行按全宽 55 行/页计，对白/角色/提示行按窄栏 40 行/页折算，
 * 场景标题与转场计入额外空行开销，=== 强制向上取整到新页。
 */
export function estimateScript(parsed: ParsedScript, source: string): ScriptStats {
  const chars = cleanSource(source).replace(/\s/g, '').length

  const LINES_PER_PAGE = 55
  const DIALOGUE_WEIGHT = LINES_PER_PAGE / 40

  let lines = 0
  let scenes = 0
  let forcedPages = 0
  let linesOnCurrentPage = 0

  for (const el of parsed.elements) {
    let cost = 0
    switch (el.type) {
      case 'scene':
        cost = 3 // 标题两行 + 前后空行开销
        scenes += 1
        break
      case 'character':
        cost = 1 * DIALOGUE_WEIGHT
        break
      case 'dialogue':
        cost = 1 * DIALOGUE_WEIGHT
        break
      case 'parenthetical':
        cost = 1 * DIALOGUE_WEIGHT
        break
      case 'transition':
        cost = 2
        break
      case 'centered':
        cost = 2
        break
      case 'pageBreak':
        forcedPages += Math.floor(linesOnCurrentPage / LINES_PER_PAGE) + 1
        linesOnCurrentPage = 0
        continue
      default:
        cost = 1
    }
    lines += cost
    linesOnCurrentPage += cost
  }

  const naturalPages = forcedPages + Math.ceil(linesOnCurrentPage / LINES_PER_PAGE)
  const titlePages = parsed.title.length > 0 ? 1 : 0
  const pages = Math.max(1, naturalPages + titlePages)

  return {
    chars,
    scenes,
    pages,
    minutes: pages, // 剧情片基准：1 页 ≈ 1 分钟
  }
}
