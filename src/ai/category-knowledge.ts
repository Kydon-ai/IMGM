export type CategoryKnowledge = {
  aliases: string[];
  visualTags: string[];
};

export const CATEGORY_KNOWLEDGE: Record<string, CategoryKnowledge> = {
  "APP图标": {
    aliases: ["应用图标", "app icon", "软件图标", "logo"],
    visualTags: ["图标", "头像", "方形", "应用", "社交软件"],
  },
  capoos: {
    aliases: ["咖波", "capoo", "猫猫虫", "猫猫虫咖波"],
    visualTags: ["卡通", "猫", "圆润", "可爱", "表情包", "贴纸"],
  },
  chacha: {
    aliases: ["叉叉", "chacha猫", "灰白猫"],
    visualTags: ["卡通", "猫", "手势", "表情包", "灰白色", "可爱"],
  },
  geshinImpact: {
    aliases: ["genshin impact", "原神", "纳西妲"],
    visualTags: ["游戏", "二次元", "角色", "动漫", "表情包"],
  },
  GGB: {
    aliases: ["猪猪侠", "gg bond", "小菲菲"],
    visualTags: ["动画", "卡通", "猪", "儿童", "角色"],
  },
  七龙珠: {
    aliases: ["龙珠", "dragon ball", "悟空"],
    visualTags: ["动漫", "热血", "角色", "头像"],
  },
  乌萨奇: {
    aliases: ["usagi", "兔兔", "吉伊卡哇兔子"],
    visualTags: ["吉伊卡哇", "兔子", "黄色", "可爱", "表情包", "动图"],
  },
  前途一片xx: {
    aliases: ["前途一片焦绿", "前途梗图", "焦绿"],
    visualTags: ["文字梗", "猫", "绿色", "可爱", "表情包"],
  },
  原神: {
    aliases: ["genshin", "genshin impact", "提瓦特"],
    visualTags: ["游戏", "二次元", "角色", "表情包", "动漫"],
  },
  吉伊卡哇1: {
    aliases: ["吉伊卡哇", "chiikawa", "ちいかわ"],
    visualTags: ["卡通", "可爱", "表情包", "小动物", "动图"],
  },
  吉伊卡哇2: {
    aliases: ["吉伊卡哇", "chiikawa", "ちいかわ"],
    visualTags: ["卡通", "可爱", "表情包", "小动物", "动图"],
  },
  吉伊卡哇3: {
    aliases: ["吉伊卡哇", "chiikawa", "ちいかわ"],
    visualTags: ["卡通", "可爱", "表情包", "小动物", "动图"],
  },
  熊出没: {
    aliases: ["boonie bears", "光头强", "熊大", "熊二"],
    visualTags: ["动画", "卡通", "儿童", "角色", "头像"],
  },
  猫和老鼠: {
    aliases: ["tom and jerry", "汤姆和杰瑞", "汤姆猫", "杰瑞"],
    visualTags: ["动画", "猫", "老鼠", "经典", "表情包"],
  },
  科比: {
    aliases: ["kobe", "kobe bryant", "科比布莱恩特"],
    visualTags: ["篮球", "球星", "湖人", "人物", "头像"],
  },
  纳西妲: {
    aliases: ["nahida", "小草神", "草神"],
    visualTags: ["原神", "游戏", "二次元", "角色", "绿色", "可爱"],
  },
  自建: {
    aliases: ["自制", "自建素材", "自定义"],
    visualTags: ["自定义", "头像", "个人素材"],
  },
  贴吧表情: {
    aliases: ["百度贴吧", "贴吧emoji", "贴吧表情包"],
    visualTags: ["小表情", "emoji", "论坛", "表情包"],
  },
  透明底: {
    aliases: ["透明背景", "透明png", "免抠", "贴纸"],
    visualTags: ["透明", "贴纸", "卡通", "表情包", "免抠素材"],
  },
  部落冲突: {
    aliases: ["clash of clans", "coc", "哥布林"],
    visualTags: ["游戏", "角色", "哥布林", "卡通", "头像"],
  },
  高雅人士企鹅原图合集: {
    aliases: ["高雅人士", "职业企鹅", "3d企鹅", "企鹅素材"],
    visualTags: ["企鹅", "3D", "职业", "商务", "场景", "举牌", "白底素材"],
  },
};

/** 返回目录类别对应的人工核验语义标签。 */
export function getCategoryTags(category: string): string[] {
  const knowledge = CATEGORY_KNOWLEDGE[category];
  return knowledge ? [...knowledge.aliases, ...knowledge.visualTags] : [category];
}

/** 根据用户文本识别已知图片类别。 */
export function detectCategory(input: string): string | undefined {
  const normalizedInput = input.normalize("NFKC").toLowerCase();
  return Object.entries(CATEGORY_KNOWLEDGE).find(([category, knowledge]) => {
    const candidates = [category, ...knowledge.aliases].map((item) => item.normalize("NFKC").toLowerCase());
    return candidates.some((candidate) => normalizedInput.includes(candidate));
  })?.[0];
}

/** 将文本中的类别别名补充为统一的检索特征。 */
export function getCategoryFeatures(input: string): string[] {
  const normalizedInput = input.normalize("NFKC").toLowerCase();
  const features: string[] = [];

  for (const [category, knowledge] of Object.entries(CATEGORY_KNOWLEDGE)) {
    const candidates = [category, ...knowledge.aliases].map((item) => item.normalize("NFKC").toLowerCase());
    if (candidates.some((candidate) => normalizedInput.includes(candidate))) {
      features.push(`类别:${category}`, ...knowledge.aliases, ...knowledge.visualTags);
    }
  }

  return features;
}
