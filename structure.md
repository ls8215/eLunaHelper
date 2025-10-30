# structure

eLunaAsst/
│
├── manifest.json
│
├── background/
│   ├── background.js               ← 统一处理翻译请求与跨域 API 调用
│   └── services/
│       ├── deepseek.js             ← DeepSeek 翻译逻辑
│       ├── deepl.js                ← DeepL 翻译逻辑
│       ├── openai.js               ← OpenAI 翻译逻辑（预留）
│       └── index.js                ← 汇总与路由调用
│
├── content/
│   ├── content.js                  ← 页面逻辑入口：注入按钮、响应点击、写入译文
│   ├── content.css                 ← 按钮/图标/浮窗样式
│   └── ui/
│       ├── serviceSelector.js      ← “选择服务”图标与弹出层逻辑
│       ├── toast.js                ← 页面内提示（翻译中、成功、失败）
│       └── icons/                  ← UI图标（如service选择按钮SVG）
│
├── options/
│   ├── options.html                ← 设置页（用户配置各服务参数）
│   ├── options.js
│   └── options.css
│
├── utils/
│   ├── storage.js                  ← 统一封装 chrome.storage 读写
│   ├── message.js                  ← 消息通信封装（content ↔ background）
│   └── config.js                   ← 全局常量、默认值定义
│
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── service-icons/              ← 各翻译商图标（DeepSeek, DeepL等）
│
│── pupup/
│
└── README.md
