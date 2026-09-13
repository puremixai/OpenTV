// 此文件由 scripts/convert-changelog.js 自动生成
// 请勿手动编辑

export interface ChangelogEntry {
  version: string;
  date: string;
  added: string[];
  changed: string[];
  fixed: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2026-09-13",
    added: [
    "启用 XTV 独立版本序列，首个版本为 1.0.0。",
    "归档独立版本启用前的上游更新历史，保留功能与版本追溯入口。"
    ],
    changed: [
    "统一网页、默认站名、AI 助手、通知和 Android TV 的 XTV 品牌文案。",
    "更新 XTV Logo、浏览器图标、PWA、Apple 主屏幕、通知和 Android TV 图标。",
    "更新 README 的品牌说明、图标资源、本地部署与 Android TV 使用入口。",
    "将项目仓库、问题反馈、部署源码入口及 Star History 关联到 puremixai/xtv。"
    ],
    fixed: [
    "统一 package.json、VERSION.txt、生成的版本文件和更新记录中的 XTV 版本号。",
    "修正版本面板与更新检查的仓库来源，避免将上游版本识别为 XTV 更新。"
    ]
  }
];

export default changelog;
