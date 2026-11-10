/**
 * dsh-client-ui-skin-saber — 客户端半（browser bundle）。
 *
 * 它做四件事：
 *   1. 挂样式表；
 *   2. 应用保存的「不透明度」设置（写 --skin-solid 等 CSS 变量）；
 *   3. 在 **设置页** 注册一个「皮肤」分区（`settings.section` 插槽）—— 主要配置入口；
 *   4. 保留一个 ⌥⌘K 快捷浮层，方便临时试效果。
 *
 * 为什么需要客户端半：桌面端窗口的文档来自 Electron 的 `dsh-app://app` 自定义协议，
 * 其中 `/`、`/index.html`、`/assets/*` 是从磁盘读的（不经过本地 Web 服务器的 index 转换），
 * 只有其它路径才被转发给本地 DSH 服务器。所以宿主半的 `ctx.webServer.tapIndex()`
 * 在桌面窗口里永远不会执行；而客户端 bundle 由插件图在窗口内加载，两种环境都能覆盖。
 *
 * 格式是 DSH 客户端的 lazy-CJS 约定（与 tsdown 产出的 bundle 一致）：
 *   window.__ModuleLoader__.load({ id, factory: (require) => module.exports })
 * React / react-jsx-runtime 都从模块表 require（平台模块），不需要构建工具。
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
    /** 浮层面板根节点 id。 */
    var PANEL_ID = '__dsh-skin-saber-panel__'
    /** 设置持久化 key。 */
    var STORE_KEY = 'dsh.skin.saber.settings'
    /** 设置页分区 id。 */
    var SECTION_ID = 'skin-saber'

    /* ------------------------------------------------------------------ */
    /* 设置存储                                                            */
    /* ------------------------------------------------------------------ */

    /** 默认值：默认完全不透明（实色）；board 为 null 表示跟随 --skin-solid 插值。 */
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
     * 把设置应用到 <html> 的行内样式（优先级高于样式表里的 `:root`）。
     * 各表面读的是 `calc(base + (1-base) * --skin-solid)`，改一个值全部跟着变。
     * @param settings - { solid, board }
     */
    function applySettings(settings) {
      var root = document.documentElement
      root.style.setProperty('--skin-solid', String(settings.solid))
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
    /* 共享 UI 样式（浮层 + 设置分区共用一套类名）                            */
    /* ------------------------------------------------------------------ */

    var UI_CSS_ID = '__dsh-skin-saber-ui__'

    function injectUiCss() {
      if (document.getElementById(UI_CSS_ID) !== null) return
      var style = document.createElement('style')
      style.id = UI_CSS_ID
      style.textContent = [
        /* —— 设置分区 —— */
        '.sk-sect{max-width:560px;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-primary,#111)}',
        '.sk-sect .sk-desc{color:var(--dsw-alias-label-secondary,#555);margin:0 0 14px;font-size:12.5px}',
        '.sk-sect .sk-group{margin-bottom:18px}',
        '.sk-sect .sk-group-title{font-size:12.5px;font-weight:600;margin:0 0 8px}',
        '.sk-sect .sk-hint{color:var(--dsw-alias-label-tertiary,#888);font-size:11.5px;margin-top:6px}',
        '.sk-btn{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));',
        'background:transparent;color:inherit;border-radius:8px;cursor:pointer;font-family:inherit;',
        'font-size:12px;padding:6px 14px;line-height:1.4}',
        '.sk-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
        '.sk-btn[data-active="true"]{background:var(--dsw-alias-brand-primary,#1b2542);',
        'border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff)}',
        '.sk-presets{display:flex;gap:8px}',
        '.sk-row{display:flex;align-items:center;gap:12px;margin-bottom:10px}',
        '.sk-row .sk-name{width:96px;flex:none;color:var(--dsw-alias-label-secondary,#555);font-size:12.5px}',
        '.sk-row input[type=range]{flex:1;margin:0;accent-color:var(--dsw-alias-brand-primary,#1b2542)}',
        '.sk-row .sk-val{width:44px;flex:none;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:12.5px}',
        /* —— 浮层 —— */
        '#' + PANEL_ID + '{position:fixed;right:18px;bottom:18px;z-index:99998;width:268px;box-sizing:border-box;',
        'padding:14px 14px 12px;border-radius:14px;background:var(--dsw-alias-bg-layer-2,#fff);',
        'color:var(--dsw-alias-label-primary,#111);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));',
        'box-shadow:0 12px 32px rgba(0,0,0,.18);font-size:12px;line-height:1.5;',
        'font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif)}',
        '#' + PANEL_ID + '[hidden]{display:none}',
        '#' + PANEL_ID + ' .sk-head{display:flex;align-items:center;gap:6px;margin-bottom:10px}',
        '#' + PANEL_ID + ' .sk-title{flex:1;font-size:12.5px;font-weight:600}',
        '#' + PANEL_ID + ' .sk-x{width:20px;height:20px;border:0;border-radius:6px;cursor:pointer;background:transparent;',
        'color:var(--dsw-alias-label-tertiary,#888);font-size:14px;line-height:1;padding:0}',
        '#' + PANEL_ID + ' .sk-x:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
        '#' + PANEL_ID + ' .sk-foot{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:10px;',
        'border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}',
        '#' + PANEL_ID + ' .sk-hint{flex:1;text-align:right;color:var(--dsw-alias-label-tertiary,#888);font-size:11px}',
      ].join('')
      document.head.appendChild(style)
    }

    /* ------------------------------------------------------------------ */
    /* React：设置页分区                                                    */
    /* ------------------------------------------------------------------ */

    var react = null
    var jsx = null
    try {
      react = require('react')
      jsx = require('react/jsx-runtime').jsx
    } catch (error) {
      // 拿不到 React 时不致命：样式表和 ⌥⌘K 浮层仍然可用。
      react = null
      jsx = null
    }

    /** 手写 createElement：jsx-runtime 的签名是 jsx(type, props, key)，children 走 props。 */
    function el(type, props) {
      var children = Array.prototype.slice.call(arguments, 2)
      var merged = {}
      var key
      if (props !== null && props !== undefined) {
        for (var name in props) {
          if (!Object.prototype.hasOwnProperty.call(props, name)) continue
          // key 必须作为 jsx 的第三参数，放进 props 会触发 React 警告且不被识别。
          if (name === 'key') { key = props[name]; continue }
          merged[name] = props[name]
        }
      }
      if (children.length === 1) merged.children = children[0]
      else if (children.length > 1) merged.children = children
      return key === undefined ? jsx(type, merged) : jsx(type, merged, key)
    }

    /** 当前「正文底板」的有效百分比（未单独覆盖时按总控插值算，base=0.55）。 */
    function effectiveBoardPercent(settings) {
      if (settings.board !== null) return Math.round(settings.board * 100)
      return Math.round((0.55 + 0.45 * settings.solid) * 100)
    }

    var PRESETS = [
      { solid: 0, label: '壁纸' },
      { solid: 0.5, label: '均衡' },
      { solid: 1, label: '不透明' },
    ]

    /**
     * 设置页的「皮肤」分区：预设 + 两个滑块 + 重置。
     * 直接读写 CSS 变量并持久化到 localStorage，改完即时生效。
     */
    function SkinSection() {
      var state = react.useState(loadSettings())
      var settings = state[0]
      var setSettings = state[1]

      react.useEffect(function () {
        applySettings(settings)
      }, [settings])

      function commit(mutate) {
        var next = { solid: settings.solid, board: settings.board }
        mutate(next)
        applySettings(next)
        saveSettings(next)
        setSettings(next)
      }

      var presetNodes = PRESETS.map(function (preset) {
        return el('button', {
          key: 'p' + preset.solid,
          type: 'button',
          className: 'sk-btn',
          'data-active': String(Math.abs(settings.solid - preset.solid) < 0.005),
          onClick: function () { commit(function (s) { s.solid = preset.solid }) },
        }, preset.label)
      })

      return el('div', { className: 'sk-sect' },
        el('p', { className: 'sk-desc' },
          '壁纸会透过所有面板。这里控制透出多少：100% 完全不透明（实色），0% 完全透出壁纸。设置保存在本机。'),
        el('div', { className: 'sk-group' },
          el('div', { className: 'sk-group-title' }, '预设'),
          el('div', { className: 'sk-presets' }, presetNodes)),
        el('div', { className: 'sk-group' },
          el('div', { className: 'sk-row' },
            el('span', { className: 'sk-name' }, '总不透明度'),
            el('input', {
              type: 'range', min: 0, max: 100, step: 1,
              value: String(Math.round(settings.solid * 100)),
              'aria-label': '总不透明度',
              onChange: function (event) { commit(function (s) { s.solid = Number(event.target.value) / 100 }) },
            }),
            el('span', { className: 'sk-val' }, Math.round(settings.solid * 100) + '%')),
          el('div', { className: 'sk-row' },
            el('span', { className: 'sk-name' }, '正文底板'),
            el('input', {
              type: 'range', min: 0, max: 100, step: 1,
              value: String(effectiveBoardPercent(settings)),
              'aria-label': '正文底板不透明度',
              onChange: function (event) { commit(function (s) { s.board = Number(event.target.value) / 100 }) },
            }),
            el('span', { className: 'sk-val' }, effectiveBoardPercent(settings) + '%')),
          el('p', { className: 'sk-hint' },
            '正文底板：长对话里正文底下那块半透明板。单独调它可以让正文更实，其余区域仍保留壁纸。')),
        el('div', { className: 'sk-row' },
          el('button', {
            type: 'button', className: 'sk-btn',
            onClick: function () { commit(function (s) { s.solid = DEFAULTS.solid; s.board = DEFAULTS.board }) },
          }, '恢复默认'),
          el('span', { className: 'sk-hint' }, '默认：不透明 100%'),
        ))
    }

    /**
     * 把「皮肤」分区注册进设置页导航。
     * @param ctx - 浏览器插件上下文。
     */
    function registerSettingsSection(ctx) {
      if (react === null || jsx === null) return
      if (ctx === undefined || ctx.slots === undefined) return
      try {
        ctx.slots.inject('settings.section', function* () {
          yield ctx.slots.register({
            name: 'settings.section',
            id: SECTION_ID,
            order: 35,
            label: function () { return '皮肤' },
          }, SkinSection)
        })
      } catch (error) {
        // 注册失败不影响皮肤本身。
        console.warn('[skin-saber] 注册设置分区失败：', error)
      }
    }

    /* ------------------------------------------------------------------ */
    /* ⌥⌘K 快捷浮层（临时试效果用，与设置分区共享同一份设置）                 */
    /* ------------------------------------------------------------------ */

    var panel = null

    function syncPanel() {
      if (panel === null) return
      var settings = loadSettings()
      var solid = panel.querySelector('[data-role="solid"]')
      var solidVal = panel.querySelector('[data-role="solid-val"]')
      var board = panel.querySelector('[data-role="board"]')
      var boardVal = panel.querySelector('[data-role="board-val"]')
      if (solid !== null) solid.value = String(Math.round(settings.solid * 100))
      if (solidVal !== null) solidVal.textContent = Math.round(settings.solid * 100) + '%'
      if (board !== null) board.value = String(effectiveBoardPercent(settings))
      if (boardVal !== null) boardVal.textContent = effectiveBoardPercent(settings) + '%'
      var presets = panel.querySelectorAll('.sk-btn[data-solid]')
      for (var i = 0; i < presets.length; i++) {
        var want = Number(presets[i].getAttribute('data-solid'))
        presets[i].setAttribute('data-active', String(Math.abs(want - settings.solid) < 0.005))
      }
    }

    function commitPanel(mutate) {
      var next = loadSettings()
      mutate(next)
      applySettings(next)
      saveSettings(next)
      syncPanel()
    }

    function buildPanel() {
      if (document.getElementById(PANEL_ID) !== null) return
      injectUiCss()
      var root = document.createElement('div')
      root.id = PANEL_ID
      root.setAttribute('role', 'dialog')
      root.setAttribute('aria-label', '皮肤不透明度')
      root.innerHTML = [
        '<div class="sk-head"><span class="sk-title">皮肤 · 不透明度</span>',
        '<button class="sk-x" type="button" title="关闭（⌥⌘K）">✕</button></div>',
        '<div class="sk-presets">',
        '<button class="sk-btn" type="button" data-solid="0">壁纸</button>',
        '<button class="sk-btn" type="button" data-solid="0.5">均衡</button>',
        '<button class="sk-btn" type="button" data-solid="1">不透明</button>',
        '</div>',
        '<div class="sk-row" style="margin-top:12px"><span class="sk-name">总不透明度</span>',
        '<input type="range" min="0" max="100" step="1" data-role="solid" aria-label="总不透明度">',
        '<span class="sk-val" data-role="solid-val">100%</span></div>',
        '<div class="sk-row"><span class="sk-name">正文底板</span>',
        '<input type="range" min="0" max="100" step="1" data-role="board" aria-label="正文底板不透明度">',
        '<span class="sk-val" data-role="board-val">100%</span></div>',
        '<div class="sk-foot"><button class="sk-btn" type="button" data-role="reset">重置</button>',
        '<span class="sk-hint">更多选项在「设置 › 皮肤」</span></div>',
      ].join('')

      root.querySelector('.sk-x').addEventListener('click', function () { togglePanel(false) })
      var presets = root.querySelectorAll('.sk-btn[data-solid]')
      for (var i = 0; i < presets.length; i++) {
        presets[i].addEventListener('click', function (event) {
          var solid = Number(event.currentTarget.getAttribute('data-solid'))
          commitPanel(function (s) { s.solid = solid })
        })
      }
      root.querySelector('[data-role="solid"]').addEventListener('input', function (event) {
        var value = Number(event.target.value) / 100
        commitPanel(function (s) { s.solid = value })
      })
      root.querySelector('[data-role="board"]').addEventListener('input', function (event) {
        var value = Number(event.target.value) / 100
        commitPanel(function (s) { s.board = value })
      })
      root.querySelector('[data-role="reset"]').addEventListener('click', function () {
        commitPanel(function (s) { s.solid = DEFAULTS.solid; s.board = DEFAULTS.board })
      })

      document.body.appendChild(root)
      // 初始收起：togglePanel 以「有 hidden 才展开」判断。
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
    /* 插件生命周期                                                        */
    /* ------------------------------------------------------------------ */

    /** 需要 slots 服务才能注册设置分区；缺了也不致命（try/catch 兜底）。 */
    exports.inject = ['slots']

    var shortcutBound = false

    /** 绑定 ⌥⌘K（幂等：立即启动与 apply 都可能走到这里）。 */
    function bindShortcut() {
      if (shortcutBound) return
      shortcutBound = true
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'k' && event.key !== 'K') return
        if (!event.altKey) return
        if (!(event.metaKey || event.ctrlKey)) return
        event.preventDefault()
        togglePanel()
      })
    }

    /**
     * 客户端插件入口（cordis 调用）。
     * 样式与设置已经在 factory 里立即应用过了 —— 这样即使 apply 没被调用，
     * 皮肤也一定生效；这里只补需要 ctx 的部分（设置页分区）。
     * @param ctx - 浏览器插件上下文。
     */
    exports.apply = function (ctx) {
      bindShortcut()
      registerSettingsSection(ctx)
    }

    // —— 立即启动：样式表 + 已保存的设置 + 快捷键 ——
    // （不依赖 apply：bundle 一旦被 materialize 就应该生效）
    mountSheet()
    injectUiCss()
    applySettings(loadSettings())
    try {
      bindShortcut()
    } catch (error) {
      /* document 尚未就绪时忽略，apply 里还会再试 */
    }

    return module.exports
  },
})
