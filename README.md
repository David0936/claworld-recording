# ClawCast Studio

**爪播**，Claworld 品牌下的 Mac 悬浮助手。

它不内置录屏，不接管系统录制权限，只专注两个悬浮窗口：

- 个人名片窗口会一直置顶，可显示摄像头、头像、昵称、定位、简介和关注引导，适合放进录屏画面。
- 口播提词器窗口会一直置顶，并启用 Electron/macOS 的内容保护，尽量避免被录屏软件录进去。
- 控制面板支持改个人信息、头像、摄像头来源（本机/手机/手动）、名片大小、色彩、镜像、提词稿、滚动速度和字体大小。

录屏本身交给 QuickTime、OBS、FocuSee、Recordly、飞书或其它录屏软件。爪播只负责让你的 AI 博主 IP 在画面里更稳定、更好看。

## 适用场景

- AI 博主录制项目开发过程、产品拆解、工作流演示。
- 转行内容创作者展示个人介绍、账号定位和关注引导。
- 录播课老师在屏幕右下角放置个人信息，同时用悬浮提词器稳定口播节奏。

## 默认 IP 方向

当前默认文案围绕 “从土木转行 AI 产品经理” 和 “分享真实项目开发过程” 设计，适合继续迭代成你的 AI 博主 IP 录播工具。视觉系统已接入 Claworld 的红色爪标和横版 logo。

## 品牌资产

项目内已固化一份轻量品牌规范：[brand-spec.md](brand-spec.md)。

实际使用的素材：

- `src/assets/branding/claw-icon-v2.png`
- `src/assets/branding/claw-icon.png`
- `src/assets/branding/app-logo.png`
- `src/assets/branding/app-logo.icns`
- `src/assets/branding/logo-dark.png`
- `src/assets/branding/logo-light.png`

## 运行

```bash
npm install
npm start
```

生成并打开本地 Mac App：

```bash
npm run app:local
npm run app:open
```

如果 Electron 下载很慢或报 `Electron failed to install correctly`，可以用镜像重装：

```bash
rm -rf node_modules/electron
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install electron@37.10.3 --save-dev
```

## 打包

```bash
npm run dist:mac
```

打包后产物会在 `dist/` 里。第一次打开摄像头时，macOS 可能会要求授予摄像头权限。

## 使用建议

控制台和名片窗口不会启用内容保护，所以会正常出现在截图和录屏里。只有提词器启用了内容保护，在 QuickTime、OBS、Zoom 等常见采集链路里通常不会被录进去；正式录制前建议先录 10 秒测试一下你的具体软件组合。

如果你用录屏软件的“只录某个窗口”模式，外部悬浮名片可能不会出现在画面里。这时改用“录整个屏幕”或“框选区域”，把名片所在区域一起框进去。

控制台顶部空白区域可以直接拖动窗口。名片窗口关闭“鼠标穿透（锁定位置）”后可以拖动；打开后会把鼠标事件让给后面的应用，适合录屏时避免误点。
