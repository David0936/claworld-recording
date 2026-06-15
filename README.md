# ClawCast Studio

**爪播**，Claworld 品牌下的 Mac 录播控制台。

面向 AI 博主和录播课创作者的 Mac 悬浮录屏助手。它把“能进入录屏画面的个人 IP 名片”和“尽量不会被录进去的口播提词器”拆成两个独立悬浮窗口，让录项目开发、转行经验、AI 产品经理成长记录时更像一个轻量录播工作台。

一个给 Mac 录播使用的悬浮助手：

- 个人名片窗口会一直置顶，可显示摄像头、头像、昵称、定位、简介和关注引导；也可打开“名片隐身”让它尽量不进入录屏。
- 口播提词器窗口会一直置顶，并启用 Electron/macOS 的内容保护，尽量避免进入屏幕录制画面。
- 控制面板支持改个人信息、头像、摄像头来源（本机/手机/手动）、名片大小、色彩、镜像、提词稿、滚动速度和字体大小。
- 内置录屏页支持一键录当前屏幕、快速选择窗口、缩略图选择录制来源、拖拽框选屏幕区域、鼠标局部放大，并可同时录制麦克风。
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

本地开发使用推荐先生成可双击的 `.app`：

```bash
npm run app:local
open "dist/ClawCast Studio.app"
```

这个命令会复制 Electron 运行时、嵌入当前 `src/` 代码、写入爪播图标和权限说明，并生成 `dist/ClawCast Studio.app`。如果你从 GitHub 拉了新代码，重新运行一次 `npm run app:local` 即可把 App 内部代码同步到最新版。

正式分发包仍然可以使用：

```bash
npm run dist:mac
```

打包后产物会在 `dist/` 里。第一次打开摄像头、麦克风或录屏时，macOS 会要求授予对应权限。

## 录制建议

名片窗口默认会进入录屏，适合做 AI 博主 IP 角标；在“悬浮样式”里打开“名片隐身（不进录屏）”后，它会启用 Electron/macOS 的内容保护，和提词器一样尽量从 QuickTime、OBS、Zoom 等常见采集链路中排除。正式录制前建议先录 10 秒测试一下你的具体软件组合。

控制台顶部空白区域可以直接拖动窗口。名片窗口关闭“鼠标穿透（锁定位置）”后可以拖动；打开后会把鼠标事件让给后面的应用，适合录屏时避免误点。

开始录屏：顶部可直接点“快速录屏”录当前屏幕，或点“快速选窗口”进入窗口录制。也可以打开控制台里的“开始录屏”页，选择“整个屏幕 / 应用窗口 / 框选区域”，在缩略图卡片中点选来源，再点“开始录屏”。停止后 `.webm` 文件会自动保存到 `影片/ClawCast Studio/`，可以点“打开最近文件”定位。

屏幕录制和区域录制会走一层 canvas 合成管线：原始桌面流先进入隐藏画布，区域裁切、鼠标局部放大等效果在画布中合成，再交给 MediaRecorder 保存。窗口录制暂时直接保存原始窗口流，因为 Electron 的窗口源没有稳定的全局边界供鼠标坐标映射。

如果来源列表显示权限错误，先看 macOS 的“屏幕与系统音频录制”里是否已经允许“爪播”和 Electron。开关已经打开但仍读取不到时，优先点控制台里的“授权后重启 App”；macOS 经常需要应用重启后才把录屏权限刷新给进程。控制台里的权限状态卡片会显示屏幕录制、摄像头、麦克风的系统状态，但屏幕录制以实际能否读取来源为准。

## 一键更新

控制台右上角点“检查更新”会读取 GitHub 远端状态；点“一键更新”会执行 `git fetch` 和 `git pull --ff-only origin main`。如果本地有未提交改动，工具会停止更新，避免覆盖你的工作。更新完成后点“重启应用”加载新代码。
