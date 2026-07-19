/**
 * Seedance 2.0（即梦）视频提示词组装（确定性模板，纯函数）。
 *
 * 依据 seedance-prompt / seedance-20 规范：
 * - 核心公式：主体动作/剧情描述 + 镜头语言 + 氛围/音效指令
 * - 镜头语言用标准中文镜头词汇（远景/全景/中景/近景/特写 + 固定/前推/拉远/跟随…），
 *   每个短镜头只保留一个主运镜
 * - 动作要具体可视、有落点；单镜头 4-15s，建议 5s/10s 起步测试
 * - 音效直接写进提示词（环境声/雨声等）
 * - 避免「电影感」类空泛词，拆成 材质/光线/色彩/空气 等可拍元素
 * 空槽自动省略，与 anchors.ts 的 assemblePrompt（概念图）并列使用。
 */

import type { StyleProfile } from './style'
import type { AnchorValues } from './anchors'

export const DURATION_LABEL: Record<string, string> = {
  '5s': '5秒',
  '10s': '10秒',
  '15s': '15秒',
}

/** 景别 → 标准镜头词汇 */
const SIZE_ZH: Record<string, string> = {
  远: '远景',
  全: '全景',
  中: '中景',
  近: '近景',
  特: '特写镜头',
}

/** 运镜 → 标准镜头语言（每镜头一个主运镜） */
const MOVE_ZH: Record<string, string> = {
  固定: '固定镜头',
  推: '镜头缓慢前推',
  拉: '镜头小幅度拉远',
  摇: '镜头缓慢摇摄',
  跟: '镜头跟随主体',
  移: '镜头横向平移',
  升降: '镜头缓缓升起',
}

export interface VideoPromptContext {
  /** 涉及人物的锚点摘要（如「林晚（三十出头，素色衬衫）」） */
  cast?: string[]
  /** 场景视觉锚点（light / palette / set / mood） */
  sceneAnchors?: AnchorValues
  /** 场景时段（日/夜/黎明…） */
  time?: string
  /** 场景地点（用于音效推断） */
  location?: string
  profile: StyleProfile
}

function join(parts: Array<string | undefined | false>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join('，')
}

/** 氛围音效推断：规则化，按场景线索给出环境声 */
function inferSound(description: string, ctx: VideoPromptContext): string | undefined {
  const text = `${description} ${ctx.sceneAnchors?.palette ?? ''} ${ctx.sceneAnchors?.mood ?? ''} ${ctx.location ?? ''}`
  const sounds: string[] = []
  if (/雨|潮湿|水汽/.test(text)) sounds.push('雨声')
  if (/咖啡馆|酒吧|茶馆|餐厅/.test(text)) sounds.push('杯盏轻响')
  if (/河|渡|船|海/.test(text)) sounds.push('水声')
  if (/夜/.test(ctx.time ?? '') && sounds.length === 0) sounds.push('远处虫鸣')
  if (sounds.length === 0) return '背景音为安静环境声'
  return `背景音为${sounds.join('与')}，安静环境声`
}

/**
 * 组装 Seedance 视频提示词：
 * 景别 + 运镜 + 主体动作（画面描述） + 涉及人物 + 场景氛围（光线/色调/时段/空气）
 * + 全剧风格（年代/地域/影调/胶片质感） + 氛围音效 + 时长建议
 */
export function assembleVideoPrompt(
  shot: { size: string; movement: string; description: string; duration?: string },
  ctx: VideoPromptContext,
): string {
  const { profile } = ctx
  const sceneMood = join([
    ctx.sceneAnchors?.light ? `${ctx.sceneAnchors.light}照明` : undefined,
    ctx.sceneAnchors?.palette ? `${ctx.sceneAnchors.palette}色调` : undefined,
    ctx.time ? `${ctx.time}时分` : undefined,
    /阴雨|雨/.test(ctx.sceneAnchors?.palette ?? '') ? '空气潮湿' : undefined,
  ])
  const stylePart = join([
    `${profile.era}中国${profile.region}`,
    // 「电影剧照」是静态图词汇，视频提示词只保留胶片质感类标签
    ...profile.textures.filter((t) => t !== '电影剧照'),
    '写实电影风格',
  ])
  return join([
    join([SIZE_ZH[shot.size] ?? (shot.size ? `${shot.size}景` : undefined), MOVE_ZH[shot.movement] ?? shot.movement]),
    shot.description,
    ...(ctx.cast ?? []),
    sceneMood,
    stylePart,
    inferSound(shot.description, ctx),
    `建议生成时长${DURATION_LABEL[shot.duration ?? '10s'] ?? '10秒'}`,
  ])
}
