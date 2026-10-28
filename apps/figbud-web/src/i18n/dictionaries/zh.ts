import type { DeepPartial } from "@figbud/i18n";

import type { Dictionary } from "./en";

/** DRAFT — pending native-speaker review before this locale is indexed. */
const zh: DeepPartial<Dictionary> = {
  meta: {
    title: "FigBud Global — 为复杂业务打造的企业软件",
    description:
      "FigBud Global 构建可配置的企业平台，覆盖人力、信贷与支出管理：ZiraHR、Jasiri LMS、Expense Now 与 Ziwa LMS。",
  },
  common: {
    skipToContent: "跳到主要内容",
    breadcrumb: "面包屑导航",
    nav: {
      label: "主导航",
      home: "首页",
      products: "产品",
      about: "关于我们",
      blog: "博客",
      contact: "联系我们",
    },
    productsMenu: { title: "我们的平台", viewAll: "查看全部产品" },
    cta: {
      letsTalk: "联系我们",
      exploreProducts: "探索我们的产品",
      talkToTeam: "与我们的团队沟通",
      visitSite: "访问 {product}",
      joinWaitlist: "加入候补名单",
      requestDemo: "预约演示",
    },
    status: { active: "已上线", coming_soon: "即将推出", planned: "规划中" },
    theme: { label: "主题", light: "浅色", dark: "深色", system: "跟随系统" },
    language: { label: "语言", inReview: "审校中" },
    menu: { open: "打开菜单", close: "关闭菜单" },
    opensInNewTab: "在新标签页中打开",
    draftNotice: "此译文正在审校中，部分内容以英文显示。",
  },
  home: {
    hero: {
      eyebrow: "从愿景到价值，我们交付",
      titleLead: "为复杂而生。",
      titleAccent: "为进步而设计。",
      lead: "推动业务前进的企业技术。可配置、可靠、随时扩展。",
      pillars: ["肯尼亚研发", "原生支持多语言与多币种", "架构级安全"],
    },
    platforms: { eyebrow: "我们的平台", title: "多元平台，一个互联的生态系统。" },
    philosophy: { eyebrow: "我们的理念" },
    africa: { eyebrow: "为非洲打造，面向全球。", title: "肯尼亚是我们的起点，而非终点。" },
    engineer: { eyebrow: "我们的工程能力", title: "难题，我们来解决。" },
    company: { eyebrow: "关于 FigBud", title: "技术应当适应您的业务，而不是反过来。" },
    finalCta: { titleLead: "业务复杂？", titleAccent: "试试更简单的技术。" },
  },
  footer: {
    productsTitle: "产品",
    companyTitle: "公司",
    legalTitle: "法律信息",
    rights: "保留所有权利。",
  },
};

export default zh;
