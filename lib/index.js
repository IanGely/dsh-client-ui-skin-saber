/**
 * dsh-client-ui-skin-saber — 宿主半（host half）。
 *
 * 宿主半做两件事：
 *
 *  1. `ctx.webServer.register(...)`：把 `/skin-saber/*` 前缀映射到本包的
 *     `assets/` 目录。CSS 与两张壁纸都直接读盘 —— 不打包 base64、不占 bundle 体积，
 *     图片走浏览器缓存，CSS 走 no-store 便于实时改样式。
 *     这个路由同时服务两类来源：浏览器直连 `http://127.0.0.1:<port>/skin-saber/...`，
 *     以及桌面端窗口的 `dsh-app://app/skin-saber/...`（Electron 主进程会把非静态路径
 *     转发到本服务器）。
 *
 *  2. `ctx.webServer.tapIndex(...)`：在每次 **HTTP index 响应**的 `</head>` 前塞一张
 *     `<link rel="stylesheet" href="/skin-saber/theme.css?v=<mtime>">`，样式表随首屏
 *     HTML 一起加载（不闪原生主题）。这条只对「从本地 Web 服务器取 index」的场景有效
 *     （`dsh web` + 浏览器直连）。桌面端窗口的 index 由 Electron 从磁盘读取
 *     （`dsh-app://app`），不经过 index 转换，那里由客户端半 `lib/client.js` 挂同一张
 *     样式表；两边用 `data-skin="saber"` / `#__dsh-skin-saber-stylesheet__` 互相去重，
 *     任何环境都只会加载一次。
 *
 * 皮肤本身（昼夜配色、壁纸、磨砂）全部写在 `assets/theme.css` 里：它覆盖 ui-theme
 * 暴露的 `--dsw-alias-*` / `--dsw-specific-*` 别名 token，并把壁纸画在 `body` 这个
 * 画布上。详见 README.md。
 */
import { createReadStream, statSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件名（cordis `name`；loader 行 id 见 cordis.patch.yml）。 */
export const name = 'dsh-client-ui-skin-saber'

/** 只依赖 Web 服务器服务：注册静态路由 + index 转换。 */
export const inject = ['webServer']

/** 皮肤资源对外挂载的路径前缀。 */
const PREFIX = '/skin-saber'

/** 入口样式表（相对 PREFIX）。 */
const STYLESHEET = 'theme.css'

const ASSETS = fileURLToPath(new URL('../assets/', import.meta.url))
const ROOT = ASSETS.endsWith(sep) ? ASSETS.slice(0, -sep.length) : ASSETS

/** 目录里允许对外暴露的扩展名 → content-type。不在表里的扩展名一律 404。 */
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

/** 注入标记：带上就不会重复注入（tap 每次 index 渲染都会跑）。 */
const MARKER = 'data-skin="saber"'

/** theme.css 的版本号 = mtime（毫秒）── 用来给 `<link>` 做缓存击穿。 */
function stylesheetVersion() {
  try {
    return String(Math.floor(statSync(join(ROOT, STYLESHEET)).mtimeMs))
  } catch {
    return '0'
  }
}

/**
 * index.html 转换：在 `</head>` 前注入皮肤样式表。
 * @param html - 原始 index 响应体。
 * @returns 注入后的 HTML（已经注入过则原样返回）。
 */
export function injectSkinStylesheet(html) {
  if (html.includes(MARKER)) return html
  const tag = `<link rel="stylesheet" href="${PREFIX}/${STYLESHEET}?v=${stylesheetVersion()}" ${MARKER}>`
  const head = html.indexOf('</head>')
  // 没有 <head> 的 fixture 页面：放最前面，保证仍先于外壳脚本。
  return head === -1 ? `${tag}${html}` : `${html.slice(0, head)}${tag}${html.slice(head)}`
}

/**
 * 静态资源路由处理器。只服务 GET/HEAD，只读取 assets 目录内的白名单扩展名，
 * 任何越出目录的解析结果一律 403。
 * @param req - node 请求。
 * @param res - node 响应（自行持有整个响应生命周期）。
 */
export async function serveAsset(req, res) {
  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }

  let pathname
  try {
    pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  } catch {
    res.writeHead(400)
    res.end()
    return
  }

  // URL 解析会把 /skin-saber/../x 归一成 /x，这里显式挡住前缀之外的一切；
  // 裸前缀 /skin-saber（无斜杠）不提供目录列举，直接 404。
  if (!pathname.startsWith(`${PREFIX}/`)) {
    notFound(res)
    return
  }

  let relative
  try {
    relative = decodeURIComponent(pathname.slice(PREFIX.length)).replace(/^\/+/, '')
  } catch {
    res.writeHead(400)
    res.end()
    return
  }
  // /skin-saber/ 视为目录默认入口（方便直接在浏览器里看 CSS）。
  if (relative === '') relative = STYLESHEET

  const target = resolve(ROOT, relative)
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('forbidden')
    return
  }

  const type = MIME[extname(target).toLowerCase()]
  if (type === undefined) {
    notFound(res)
    return
  }

  let info
  try {
    info = await stat(target)
  } catch {
    notFound(res)
    return
  }
  if (!info.isFile()) {
    notFound(res)
    return
  }

  res.writeHead(200, {
    'content-type': type,
    'content-length': String(info.size),
    // CSS 要每次刷新都拿最新的（配合 <link> 的 ?v=mtime）；图片可以放心缓存。
    'cache-control': type.startsWith('text/css') ? 'no-store' : 'public, max-age=86400',
  })
  if (method === 'HEAD') {
    res.end()
    return
  }
  await new Promise(done => {
    let settled = false
    const finish = () => { if (!settled) { settled = true; done() } }
    res.on('finish', finish)
    const stream = createReadStream(target)
    stream.on('error', () => { finish(); res.destroy() })
    stream.pipe(res)
  })
}

/** 统一 404（不泄露目录内容）。 */
function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
}

/**
 * 插件入口：注册资源路由 + index 样式注入。
 * @param ctx - 携带 webServer 服务的宿主 cordis 上下文。
 */
export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler: serveAsset }),
    'skin-saber: /skin-saber asset route',
  )
  ctx.effect(
    () => ctx.webServer.tapIndex(injectSkinStylesheet),
    'skin-saber: index stylesheet link',
  )
}

const plugin = { name, inject, apply }

export default plugin
