/**
 * dsh-client-ui-skin-saber — 客户端半（browser bundle）。
 *
 * 为什么需要它：
 * 桌面端窗口的文档来自 Electron 的 `dsh-app://app` 自定义协议，其中
 * `/`、`/index.html`、`/assets/*` 是**从磁盘读**的（不经过本地 Web 服务器的
 * index 转换），只有其它路径才被转发给本地 DSH 服务器。所以宿主半的
 * `ctx.webServer.tapIndex()` 在桌面窗口里永远不会被执行；而客户端 bundle 是由
 * 插件图在窗口内加载的（`/plugins/<id>/client.js` 走的正是那条转发通道），
 * 因此由它来挂样式表，两种环境都能覆盖。
 *
 * 行为：
 *   - `dsh web` / 浏览器直连：宿主半已经把 <link data-skin="saber"> 塞进 index，
 *     这里检测到就什么都不做（避免重复加载）；
 *   - 桌面窗口（dsh-app://app）：这里补上 <link>，指向同一个 /skin-saber/theme.css
 *     （`dsh-app://app/skin-saber/...` 会被转发到本地服务器）。
 *
 * 格式是 DSH 客户端的 lazy-CJS 约定（与 tsdown 产出的 bundle 一致）：
 *   window.__ModuleLoader__.load({ id, factory: (require) => module.exports })
 * 这里的 factory 没有任何外部依赖，所以不需要构建工具，也没有 require 调用。
 */
window.__ModuleLoader__.load({
  id: 'dsh-client-ui-skin-saber',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    /** 本 bundle 自己挂的 <link>，用来做幂等。 */
    var LINK_ID = '__dsh-skin-saber-stylesheet__'
    /** 宿主半注入的 <link> 标记（浏览器直连时已存在）。 */
    var HOST_MARKER = 'link[data-skin="saber"]'
    /** 皮肤资源路径：根相对，浏览器与 dsh-app:// 两种来源都能解析。 */
    var STYLESHEET = '/skin-saber/theme.css'

    function mount() {
      if (document.getElementById(LINK_ID) !== null) return
      if (document.querySelector(HOST_MARKER) !== null) return
      var link = document.createElement('link')
      link.id = LINK_ID
      link.rel = 'stylesheet'
      // 带上时间戳，避免桌面端转发层或浏览器缓存住旧样式。
      link.href = STYLESHEET + '?v=' + String(Date.now())
      document.head.appendChild(link)
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true })
    } else {
      mount()
    }

    // 浏览器侧的插件树会把每个 loader 行的 client 模块也当成插件应用，
    // 所以导出一个空的 apply（与内置 client 包的约定一致）。
    exports.apply = function () {}

    return module.exports
  },
})
