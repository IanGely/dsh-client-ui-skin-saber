/**
 * 无依赖自检：不装进 profile 也能验证宿主半的行为。
 *
 *   node test/self-check.mjs
 *
 * 覆盖：路由注册、index 注入（含幂等、无 <head> 的兜底）、CSS/图片的
 * content-type 与缓存头、HEAD、405、目录穿越（编码与未编码）、未知扩展名。
 * 用一个 mock 的 ServerResponse（Writable）接流，不监听任何端口。
 */
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import {
  apply, injectSkinStylesheet, name, serveAsset,
} from '../lib/index.js'

const ASSETS = fileURLToPath(new URL('../assets/', import.meta.url))

/** 最小的 ServerResponse 替身：收集状态、头与响应体。 */
class MockResponse extends Writable {
  constructor() {
    super()
    this.statusCode = 0
    this.headers = {}
    this.chunks = []
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode
    Object.assign(this.headers, headers)
    return this
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk))
    callback()
  }

  get body() {
    return Buffer.concat(this.chunks)
  }
}

/** 走一遍真实处理器（路由不必经过 HTTP）。 */
async function request(url, method = 'GET') {
  const res = new MockResponse()
  const finished = new Promise(resolve => res.on('finish', resolve))
  await serveAsset({ method, url }, res)
  await finished
  return res
}

const results = []
function check(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => results.push(`  ok  ${label}`))
    .catch((error) => {
      results.push(`FAIL  ${label}\n      ${error.message}`)
      process.exitCode = 1
    })
}

/* --- 插件装配 ------------------------------------------------------------ */

const routes = []
const taps = []
const effects = []
apply({
  effect: (setup, label) => {
    effects.push(label)
    return setup()
  },
  webServer: {
    register: route => {
      routes.push(route)
      return () => {}
    },
    tapIndex: tap => {
      taps.push(tap)
      return () => {}
    },
  },
})

await check('apply 注册 1 条路由 + 1 个 index tap', () => {
  assert.equal(name, 'dsh-client-ui-skin-saber')
  assert.equal(routes.length, 1)
  assert.equal(taps.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, '/skin-saber')
  assert.deepEqual(effects, ['skin-saber: /skin-saber asset route', 'skin-saber: index stylesheet link'])
})

/* --- 客户端半：桌面端窗口（dsh-app://app）靠它挂样式表 ------------------- */

let importSeq = 0

/**
 * 用最小 DOM 替身执行 lib/client.js 的 lazy-CJS 注册与 factory，返回结果。
 * DOM 替身只在 factory 执行期间存在，因此 factory 必须在 try 内调用。
 * @param options - 模拟「已存在」的去重来源，以及预置的 localStorage 内容。
 */
async function runClientBundle({ existingById = false, existingTap = false, stored = null } = {}) {
  const appended = []
  /** <html> 行内样式：记录 setProperty / removeProperty，用于断言 CSS 变量写入。 */
  const style = {
    values: new Map(),
    setProperty(name, value) { this.values.set(name, value) },
    removeProperty(name) { this.values.delete(name) },
  }
  const store = new Map()
  if (stored !== null) store.set('dsh.skin.saber.settings', stored)
  let registration
  globalThis.window = {
    __ModuleLoader__: { load: reg => { registration = reg } },
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { store.set(key, value) },
    },
  }
  globalThis.document = {
    readyState: 'complete',
    documentElement: { style },
    body: { appendChild: () => {} },
    getElementById: () => (existingById ? { id: '__dsh-skin-saber-stylesheet__' } : null),
    querySelector: () => (existingTap ? { tagName: 'LINK' } : null),
    createElement: tag => ({ tagName: tag.toUpperCase(), id: '', rel: '', href: '', setAttribute() {}, addEventListener() {} }),
    head: { appendChild: element => appended.push(element) },
    addEventListener: () => {},
  }
  let surface
  try {
    await import(`../lib/client.js?case=${++importSeq}`)
    surface = registration.factory(() => { throw new Error('客户端 bundle 不应 require 任何外部模块') })
  } finally {
    delete globalThis.window
    delete globalThis.document
  }
  return { registration, surface, appended, style, store }
}

await check('client bundle 以 lazy-CJS 约定注册，id 与包名一致', async () => {
  const { registration, surface } = await runClientBundle()
  assert.equal(registration.id, 'dsh-client-ui-skin-saber')
  assert.equal(typeof registration.factory, 'function')
  assert.equal(typeof surface.apply, 'function')
})

await check('client bundle 自己挂上 /skin-saber/theme.css（带 ?v= 击穿缓存）', async () => {
  const { appended } = await runClientBundle()
  assert.equal(appended.length, 1, '必须且只挂一张样式表')
  assert.equal(appended[0].id, '__dsh-skin-saber-stylesheet__')
  assert.equal(appended[0].rel, 'stylesheet')
  assert.match(appended[0].href, /^\/skin-saber\/theme\.css\?v=\d+$/)
})

await check('client bundle 与宿主 tap 互相去重', async () => {
  const tapped = await runClientBundle({ existingTap: true })
  assert.equal(tapped.appended.length, 0, '宿主已注入过 <link data-skin> 就不该重复注入')

  const already = await runClientBundle({ existingById: true })
  assert.equal(already.appended.length, 0, '自己挂过就不该重复注入')
})

/* --- 不透明度设置（默认值 / 持久化读取）--------------------------------- */

await check('默认写入 --skin-solid: 1（完全不透明）', async () => {
  const { style } = await runClientBundle()
  assert.equal(style.values.get('--skin-solid'), '1')
  assert.equal(style.values.has('--skin-light-board'), false, '未单独覆盖底板时应交给 CSS 插值')
})

await check('读取已保存的设置并应用到 CSS 变量', async () => {
  const { style } = await runClientBundle({
    stored: JSON.stringify({ solid: 0.3, board: 0.8 }),
  })
  assert.equal(style.values.get('--skin-solid'), '0.3')
  assert.equal(style.values.get('--skin-light-board'), '0.8')
  assert.equal(style.values.get('--skin-dark-board'), '0.8')
})

await check('设置非法时回退默认值，不让皮肤崩掉', async () => {
  const { style } = await runClientBundle({ stored: '{"solid": 42, "board": "x"}' })
  assert.equal(style.values.get('--skin-solid'), '1')
  assert.equal(style.values.has('--skin-light-board'), false)
})

/* --- index 注入（走 tap，即真实路径） ------------------------------------ */

await check('tap 把样式表注入到 </head> 之前，并带 ?v=mtime', () => {
  const html = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="./assets/index-x.css"></head><body><div id="root"></div></body></html>'
  const out = taps[0](html)
  assert.ok(out.includes('data-skin="saber"'), '缺少注入标记')
  assert.ok(out.indexOf('data-skin="saber"') < out.indexOf('</head>'), '必须在 </head> 之前')
  assert.ok(out.indexOf('./assets/index-x.css') < out.indexOf('/skin-saber/theme.css'), '必须排在外壳样式表之后')
  const mtime = Math.floor(statSync(`${ASSETS}theme.css`).mtimeMs)
  assert.ok(out.includes(`/skin-saber/theme.css?v=${mtime}`), '缺少 mtime 版本号')
  assert.ok(out.includes('</head><body>'), '不能破坏原有结构')
})

await check('tap 幂等：重复注入不会出现两张样式表', () => {
  const once = taps[0]('<html><head></head><body></body></html>')
  const twice = taps[0](once)
  assert.equal(twice, once)
  assert.equal(twice.match(/data-skin="saber"/g).length, 1)
})

await check('tap 对没有 <head> 的页面兜底前置', () => {
  const out = taps[0]('<div id="root"></div>')
  assert.ok(out.startsWith('<link rel="stylesheet" href="/skin-saber/theme.css'), out.slice(0, 60))
  assert.ok(out.endsWith('<div id="root"></div>'))
})

await check('injectSkinStylesheet 与 tap 行为一致', () => {
  assert.equal(injectSkinStylesheet('<head></head>'), taps[0]('<head></head>'))
})

/* --- 静态资源 ------------------------------------------------------------ */

await check('GET /skin-saber/theme.css → 200 text/css, no-store', async () => {
  const res = await request('/skin-saber/theme.css')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'text/css; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'no-store')
  const disk = readFileSync(`${ASSETS}theme.css`)
  assert.equal(res.body.length, disk.length)
  assert.ok(res.body.equals(disk), '响应体必须与磁盘内容一致')
  assert.ok(res.body.toString('utf8').includes('--skin-light-frame'), '缺少调参旋钮')
})

await check('GET /skin-saber/ → theme.css（目录默认入口）', async () => {
  const res = await request('/skin-saber/')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'text/css; charset=utf-8')
})

await check('GET 两张壁纸 → 200 image/png 且字节数一致', async () => {
  for (const file of ['light.png', 'dark.png']) {
    const res = await request(`/skin-saber/${file}`)
    assert.equal(res.statusCode, 200, file)
    assert.equal(res.headers['content-type'], 'image/png', file)
    assert.equal(res.headers['cache-control'], 'public, max-age=86400', file)
    assert.equal(res.body.length, statSync(`${ASSETS}${file}`).size, file)
  }
})

await check('HEAD 只回头和长度，不写 body', async () => {
  const res = await request('/skin-saber/dark.png', 'HEAD')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-length'], String(statSync(`${ASSETS}dark.png`).size))
  assert.equal(res.body.length, 0)
})

await check('非 GET/HEAD → 405 + allow', async () => {
  const res = await request('/skin-saber/theme.css', 'POST')
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'GET, HEAD')
})

await check('不存在的文件 → 404', async () => {
  const res = await request('/skin-saber/nope.css')
  assert.equal(res.statusCode, 404)
  assert.ok(!res.body.toString('utf8').includes(ASSETS), '404 不能泄露目录路径')
})

await check('未知扩展名 → 404（白名单）', async () => {
  const res = await request('/skin-saber/../package.json')
  assert.equal(res.statusCode, 404)
})

await check('编码过的目录穿越 → 拒绝且不泄露内容', async () => {
  // WHATWG URL 会先把 %2e%2e 归一化掉（→ 404），%2f 不会被当成分隔符，
  // 于是解码后落到 assets 之外的路径由 ROOT 前缀检查拦成 403。
  for (const attack of [
    '/skin-saber/%2e%2e%2fpackage.json',
    '/skin-saber/%2e%2e/%2e%2e/etc/passwd',
    '/skin-saber/..%2f..%2fpackage.json',
  ]) {
    const res = await request(attack)
    assert.ok(res.statusCode === 403 || res.statusCode === 404, `${attack} → ${res.statusCode}`)
    assert.ok(!res.body.toString('utf8').includes('dsh-client-ui-skin-saber'), `${attack} 泄露了文件内容`)
  }
})

await check('前缀之外的路径 → 404', async () => {
  for (const path of ['/', '/plugins/x/client.js', '/skin-saber', '/skin-saberX/theme.css']) {
    const res = await request(path)
    assert.equal(res.statusCode, 404, path)
  }
})

/* --- 报告 --------------------------------------------------------------- */

console.log('\ndsh-client-ui-skin-saber · self-check\n')
console.log(results.join('\n'))
const failed = results.filter(line => line.startsWith('FAIL')).length
console.log(`\n${results.length - failed}/${results.length} passed`)
if (failed > 0) process.exitCode = 1
