# ClawCast Studio

**爪播**，Claworld 品牌下的 Mac 录播控制台。

面向 AI 博主和录播课创作者的 Mac 悬浮录屏助手。它把“能进入录屏画面的个人 IP 名片”和“尽量不会被录进去的口播提词器”拆成两个独立悬浮窗口，让录项目开发、转行经验、AI 产品经理成长记录时更像一个轻量录播工作台。

一个给 Mac 录播使用的悬浮助手：

- 个人名片窗口会一直置顶，可显示摄像头、头像、昵称、定位、简介和关注引导，适合进入录屏画面。
- 口播提词器窗口会一直置顶，并启用 Electron/macOS 的内容保护，尽量避免进入屏幕录制画面。
- 控制面板支持改个人信息、头像、摄像头来源（本机/手机/手动）、名片大小、色彩、镜像、提词稿、滚动速度和字体大小。
- 内置录屏页支持选择整个屏幕、应用窗口或拖拽框选屏幕区域，并可同时录制麦克风。
- 右上角提供 GitHub 一键更新：检查 `origin/main`，安全拉取最新代码，并在依赖变化时自动安装依赖。

## 适用场景

- AI 博主录制项目开发过程、产品拆解、工作流演示。
- 转行内容创作者展示个人介绍、账号定位和关注引导。
- 录播课老师在屏幕右下角放置个人信息，同时用悬浮提词器稳定口播节奏。

## 默认 IP 方向

当前默认文案围绕 “从土木转行 AI 产品经理” 和 “分享真实项目开发过程” 设计，适合继续迭代成你的 AI 博主 IP 录播工具。视觉系统已接入 Claworld 的红色爪标和横版 logo。

## 品牌资产

项目内已固化一份轻量品牌规范：[brand-spec.md](brand-spec.md)。

实际使用的素材：

- `src/assets/branding/app-logo.png`
- `src/assets/branding/app-logo.icns`
- `src/assets/branding/logo-light.png`
- `src/assets/branding/logo-dark.png`
- `src/assets/branding/claw-icon-v2.png`
- `src/assets/branding/claw-icon.png`

## 运行

```bash
npm install
npm start
```

如果 Electron 下载很慢或报 `Electron failed to install correctly`，可以用镜像重装：

```bash
rm -rf node_modules/electron
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install electron@37.10.3 --save-dev
```

## 打包 Mac App

```bash
npm run dist:mac
```

打包后产物会在 `dist/` 里。第一次打开摄像头时，macOS 可能会要求授予摄像头权限。

## 录制建议

控制台和名片窗口不会启用内容保护，所以会正常出现在截图和录屏里。只有提词器启用了内容保护，在 QuickTime、OBS、Zoom 等常见采集链路里通常不会被录进去；正式录制前建议先录 10 秒测试一下你的具体软件组合。

控制台顶部空白区域可以直接拖动窗口。名片窗口关闭“鼠标穿透（锁定位置）”后可以拖动；打开后会把鼠标事件让给后面的应用，适合录屏时避免误点。

开始录屏：打开控制台里的“开始录屏”页，选择“整个屏幕 / 应用窗口 / 框选区域”，点“开始录屏”。停止后 `.webm` 文件会自动保存到 `影片/ClawCast Studio/`，可以点“打开最近文件”定位。

如果来源列表显示权限错误，点“打开录屏权限设置”，在 macOS 的“屏幕录制与系统音频录制”里允许 Electron/ClawCast Studio，然后重启应用或点“刷新可录窗口”。

## 一键更新

控制台右上角点“检查更新”会读取 GitHub 远端状态；点“一键更新”会执行 `git fetch` 和 `git pull --ff-only origin main`。如果本地有未提交改动，工具会停止更新，避免覆盖你的工作。更新完成后点“重启应用”加载新代码。
