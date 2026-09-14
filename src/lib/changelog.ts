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
    "version": "0.1.0-alpha.1",
    "date": "2026-09-14",
    "added": [
      "启用 0.1.0-alpha.N 早期测试序列，后续按 beta、rc 和阶段版本推进，1.0.0 保留给稳定版本。",
      "归档独立版本启用前的上游更新历史，保留功能与版本追溯入口。",
      "首页与详情加入海报渐显、缓慢缩放、滚动视差及暂停控制。",
      "增加 PostgreSQL 业务存储、Redis 搜索缓存和迁移、备份与验证流程。"
    ],
    "changed": [
      "项目由 XTV 更名为 OpenTV，统一网页、默认站名、AI 助手、通知和 Android TV 的品牌文案。",
      "OpenTV Logo 采用断开的 O 形环与播放三角负空间，同步浏览器、PWA、Apple 主屏幕、通知和 Android TV 图标。",
      "更新 README 的品牌说明、图标资源、本地部署与 Android TV 使用入口。",
      "将项目仓库、问题反馈、部署源码入口及 Star History 关联到 puremixai/OpenTV。",
      "升级至 Next.js 16、React 19 和 Tailwind CSS 4，并调整前端加载与轮播交互。",
      "README 按公开项目组织，部署、配置及开发说明分别维护；Docker 使用当前源码构建。",
      "Android TV 默认版本名跟随仓库版本，保留显式覆盖和独立递增的安装版本号。"
    ],
    "fixed": [
      "统一 package.json、VERSION.txt、生成的版本文件和更新记录中的 OpenTV 版本号。",
      "修正版本面板与更新检查的仓库来源，避免将上游版本识别为 OpenTV 更新。",
      "版本生成和更新检查支持预发布标识，并正确比较开发序号与阶段版本。"
    ]
  }
];

export default changelog;
