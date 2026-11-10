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
 * 它做三件事：
 *   1. 挂样式表（见上）；
 *   2. 应用用户保存的「不透明度」设置（写 --skin-solid 等 CSS 变量）；
 *   3. 提供调参面板：⌥⌘K 打开/关闭，预设 + 两个滑块，实时生效，localStorage 持久化。
 *
 * 格式是 DSH 客户端的 lazy-CJS 约定（与 tsdown 产出的 bundle 一致）：
 *   window.__ModuleLoader__.load({ id, factory: (require) => module.exports })
 * 这里的 factory 没有任何外部依赖（纯 DOM），所以不需要构建工具，也没有 require 调用。
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
    /** 面板根节点 id。 */
    var PANEL_ID = '__dsh-skin-saber-panel__'
    /** 设置持久化 key。 */
    var STORE_KEY = 'dsh.skin.saber.settings'

    /* ------------------------------------------------------------------ */
    /* 设置存储                                                            */
    /* ------------------------------------------------------------------ */

    /** 默认值：默认完全不透明（实色），可用面板调回半透明。 */
    var DEFAULTS = { solid: 1, board: null }

    function loadSettings() {
      var out = { solid: DEFAULTS.solid, board: DEFAULTS.board }
      try {
        var raw = window.localStorage.getItem(STORE_KEY)
        if (raw === null) return out
        var parsed = JSON.parse(raw)
        if (typeof parsed.solid === 'number' && parsed.solid >= 0 && parsed.solid <= 1) out.solid = parsed.solid
        if (typeof parsed.board === 'number' && parsed.board >= 0 && parsed.board <= 1) out.board = parsed.board
        return out
      } catch (error) {
        // 隐私模式 / 存储被禁用：退回默认值，不影响使用。
        return out
      }
    }

    function saveSettings(settings) {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(settings))
      } catch (error) {
        /* 存不了就只在本次会话生效 */
      }
    }

    /* ------------------------------------------------------------------ */
    /* 应用设置：只改 CSS 变量，不动结构                                     */
    /* ------------------------------------------------------------------ */

    /**
     * 把设置应用到 <html> 的行内样式。
     * 行内样式的优先级高于样式表里的 `:root`，所以能覆盖 CSS 里的默认值；
     * 各表面读的是 `calc(base + (1-base) * --skin-solid)`，改一个值全部跟着变。
     * @param settings - { solid, board }
     */
    function applySettings(settings) {
      var root = document.documentElement
      root.style.setProperty('--skin-solid', String(settings.solid))
      // 正文底板单独覆盖（面板拖过才生效），否则交回 CSS 的插值结果。
      if (settings.board === null) {
        root.style.removeProperty('--skin-light-board')
        root.style.removeProperty('--skin-dark-board')
      } else {
        root.style.setProperty('--skin-light-board', String(settings.board))
        root.style.setProperty('--skin-dark-board', String(settings.board))
      }
    }

    /* ------------------------------------------------------------------ */
    /* 样式表                                                              */
    /* ------------------------------------------------------------------ */

    function mountSheet() {
      if (document.getElementById(LINK_ID) !== null) return
      if (document.querySelector(HOST_MARKER) !== null) return
      var link = document.createElement('link')
      link.id = LINK_ID
      link.rel = 'stylesheet'
      // 带上时间戳，避免桌面端转发层或浏览器缓存住旧样式。
      link.href = STYLESHEET + '?v=' + String(Date.now())
      document.head.appendChild(link)
    }

    /* ------------------------------------------------------------------ */
    /* 调参面板                                                            */
    /* ------------------------------------------------------------------ */

    var PANEL_CSS = [
      '#' + PANEL_ID + '{position:fixed;right:18px;bottom:18px;z-index:99999;width:268px;',
      'box-sizing:border-box;padding:14px 14px 12px;border-radius:14px;',
      'background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#111);',
      'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));',
      'box-shadow:0 12px 32px rgba(0,0,0,.18);',
      'font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif);',
      'font-size:12px;line-height:1.5;-webkit-font-smoothing:antialiased}',
      '#' + PANEL_ID + '[hidden]{display:none}',
      '#' + PANEL_ID + ' .sk-head{display:flex;align-items:center;gap:6px;margin-bottom:10px}',
      '#' + PANEL_ID + ' .sk-title{flex:1;font-size:12.5px;font-weight:600;letter-spacing:.01em}',
      '#' + PANEL_ID + ' .sk-x{width:20px;height:20px;border:0;border-radius:6px;cursor:pointer;',
      'background:transparent;color:var(--dsw-alias-label-tertiary,#888);font-size:14px;line-height:1;padding:0}',
      '#' + PANEL_ID + ' .sk-x:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '#' + PANEL_ID + ' .sk-presets{display:flex;gap:6px;margin-bottom:12px}',
      '#' + PANEL_ID + ' .sk-preset{flex:1;padding:6px 0;border-radius:8px;cursor:pointer;text-align:center;',
      'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));background:transparent;color:inherit;',
      'font-family:inherit;font-size:11.5px}',
      '#' + PANEL_ID + ' .sk-preset:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '#' + PANEL_ID + ' .sk-preset[data-active="true"]{background:var(--dsw-alias-brand-primary,#1b2542);',
      'border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff)}',
      '#' + PANEL_ID + ' .sk-row{margin-bottom:10px}',
      '#' + PANEL_ID + ' .sk-label{display:flex;justify-content:space-between;margin-bottom:4px;',
      'color:var(--dsw-alias-label-secondary,#555)}',
      '#' + PANEL_ID + ' .sk-val{font-variant-numeric:tabular-nums;',
      'color:var(--dsw-alias-label-primary,#111);font-weight:600}',
      '#' + PANEL_ID + ' input[type=range]{width:100%;margin:0;accent-color:var(--dsw-alias-brand-primary,#1b2542)}',
      '#' + PANEL_ID + ' .sk-foot{display:flex;align-items:center;gap:8px;margin-top:12px;',
      'padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}',
      '#' + PANEL_ID + ' .sk-reset{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));',
      'background:transparent;color:inherit;border-radius:7px;padding:4px 9px;cursor:pointer;',
      'font-family:inherit;font-size:11.5px}',
      '#' + PANEL_ID + ' .sk-reset:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '#' + PANEL_ID + ' .sk-hint{flex:1;text-align:right;color:var(--dsw-alias-label-tertiary,#888);font-size:11px}',
    ].join('')

    var settings = loadSettings()
    var panel = null

    /** 当前「正文底板」的有效百分比（未单独覆盖时按总控插值算）。 */
    function effectiveBoardPercent() {
      if (settings.board !== null) return Math.round(settings.board * 100)
      // CSS 里 board 的 base 是 0.55，插值后 = 0.55 + 0.45 * solid
      return Math.round((0.55 + 0.45 * settings.solid) * 100)
    }

    function syncPanel() {
      if (panel === null) return
      var solid = panel.querySelector('[data-role="solid"]')
      var solidVal = panel.querySelector('[data-role="solid-val"]')
      var board = panel.querySelector('[data-role="board"]')
      var boardVal = panel.querySelector('[data-role="board-val"]')
      if (solid !== null) solid.value = String(Math.round(settings.solid * 100))
      if (solidVal !== null) solidVal.textContent = Math.round(settings.solid * 100) + '%'
      if (board !== null) board.value = String(effectiveBoardPercent())
      if (boardVal !== null) boardVal.textContent = effectiveBoardPercent() + '%'
      var presets = panel.querySelectorAll('.sk-preset')
      for (var i = 0; i < presets.length; i++) {
        var want = Number(presets[i].getAttribute('data-solid'))
        presets[i].setAttribute('data-active', String(Math.abs(want - settings.solid) < 0.005))
      }
    }

    function update(mutate) {
      mutate(settings)
      applySettings(settings)
      saveSettings(settings)
      syncPanel()
    }

    function buildPanel() {
      if (document.getElementById(PANEL_ID) !== null) return
      var style = document.createElement('style')
      style.id = PANEL_ID + '-style'
      style.textContent = PANEL_CSS
      document.head.appendChild(style)

      var root = document.createElement('div')
      root.id = PANEL_ID
      root.setAttribute('role', 'dialog')
      root.setAttribute('aria-label', '皮肤不透明度')
      root.innerHTML = [
        '<div class="sk-head"><span class="sk-title">皮肤 · 不透明度</span>',
        '<button class="sk-x" type="button" title="关闭（⌥⌘K）">✕</button></div>',
        '<div class="sk-presets">',
        '<button class="sk-preset" type="button" data-solid="0">壁纸</button>',
        '<button class="sk-preset" type="button" data-solid="0.5">均衡</button>',
        '<button class="sk-preset" type="button" data-solid="1">不透明</button>',
        '</div>',
        '<div class="sk-row"><div class="sk-label"><span>总不透明度</span>',
        '<span class="sk-val" data-role="solid-val">100%</span></div>',
        '<input type="range" min="0" max="100" step="1" data-role="solid" aria-label="总不透明度"></div>',
        '<div class="sk-row"><div class="sk-label"><span>正文底板</span>',
        '<span class="sk-val" data-role="board-val">100%</span></div>',
        '<input type="range" min="0" max="100" step="1" data-role="board" aria-label="正文底板不透明度"></div>',
        '<div class="sk-foot"><button class="sk-reset" type="button">重置</button>',
        '<span class="sk-hint">⌥⌘K 开关</span></div>',
      ].join('')

      root.querySelector('.sk-x').addEventListener('click', function () { togglePanel(false) })
      var presets = root.querySelectorAll('.sk-preset')
      for (var i = 0; i < presets.length; i++) {
        presets[i].addEventListener('click', function (event) {
          var solid = Number(event.currentTarget.getAttribute('data-solid'))
          update(function (s) { s.solid = solid })
        })
      }
      root.querySelector('[data-role="solid"]').addEventListener('input', function (event) {
        var value = Number(event.target.value) / 100
        update(function (s) { s.solid = value })
      })
      root.querySelector('[data-role="board"]').addEventListener('input', function (event) {
        var value = Number(event.target.value) / 100
        update(function (s) { s.board = value })
      })
      root.querySelector('.sk-reset').addEventListener('click', function () {
        update(function (s) { s.solid = DEFAULTS.solid; s.board = DEFAULTS.board })
      })

      document.body.appendChild(root)
      // 初始状态是收起的：togglePanel 以「有 hidden 才展开」判断，这里必须自带 hidden，
      // 否则第一次按快捷键会把它反过来（建好即显示 → 第一下反而隐藏）。
      root.setAttribute('hidden', '')
      panel = root
      syncPanel()
    }

    function togglePanel(force) {
      if (panel === null) buildPanel()
      var show = typeof force === 'boolean' ? force : panel.hasAttribute('hidden')
      if (show) panel.removeAttribute('hidden')
      else panel.setAttribute('hidden', '')
      if (show) syncPanel()
    }

    /* ------------------------------------------------------------------ */
    /* 启动                                                                */
    /* ------------------------------------------------------------------ */

    function boot() {
      mountSheet()
      applySettings(settings)
      document.addEventListener('keydown', function (event) {
        // ⌥⌘K / Alt+Ctrl+K：避开 DSH 已有快捷键（⌘B 侧栏、⌥⌘N、⌘P、⌘T、⌥⌘,）
        if (event.key !== 'k' && event.key !== 'K') return
        if (!event.altKey) return
        if (!(event.metaKey || event.ctrlKey)) return
        event.preventDefault()
        togglePanel()
      })
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true })
    } else {
      boot()
    }

    // 浏览器侧的插件树会把每个 loader 行的 client 模块也当成插件应用，
    // 所以导出一个空的 apply（与内置 client 包的约定一致）。
    exports.apply = function () {}

    return module.exports
  },
})
