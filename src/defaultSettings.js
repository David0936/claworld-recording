const defaultSettings = {
  profile: {
    name: "David",
    headline: "土木转 AI 产品经理",
    handle: "ClawCast Studio / AI 项目开发记录",
    bio: "从土木转行 AI 产品经理\n记录真实项目开发、AI 工作流和踩坑复盘\n把想法一步步做成可用产品",
    cta: "关注我，一起把想法做成作品",
    avatarDataUrl: "",
    useCamera: true,
    cameraSource: "local",
    cameraDeviceId: "",
    mirrorCamera: true
  },
  overlay: {
    visible: true,
    protectedFromCapture: false,
    alwaysOnTop: true,
    locked: false,
    size: "medium",
    style: "record",
    accentColor: "#f51d2a",
    textColor: "#fff8ef",
    showCta: true,
    bounds: {
      width: 360,
      height: 250
    }
  },
  prompter: {
    visible: true,
    protectedFromCapture: true,
    clickThrough: false,
    running: false,
    speed: 36,
    fontSize: 34,
    opacity: 0.84,
    script: "开场：大家好，我是 David，一个从土木转行到 AI 产品经理的人。\n\n今天这条视频，我想分享一个真实项目开发过程：从一个模糊想法，到拆需求、搭原型、写代码、测试，再到最终发布。\n\n我会尽量讲人话，不堆术语。你会看到我怎么用 AI 当协作伙伴，而不是只把它当搜索框。\n\n如果你也想转 AI 产品、做自己的项目，或者打造个人 IP，可以先关注我。我们一起把想法做成作品。"
  },
  recording: {
    mode: "screen",
    sourceId: "",
    sourceName: "",
    includeMic: true,
    frameRate: 30,
    magnifierEnabled: true,
    magnifierZoom: 2,
    magnifierSize: 190,
    region: null
  },
  windows: {
    control: {
      width: 1120,
      height: 720
    },
    overlay: {
      x: null,
      y: null
    },
    prompter: {
      width: 840,
      height: 260,
      x: null,
      y: null
    }
  }
};

module.exports = { defaultSettings };
