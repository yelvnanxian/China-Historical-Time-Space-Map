import document from "./place-name-localizations.json";
import { simplifiedChinese } from "./boundary-search";
import { physicalKindNames, type PhysicalGroup } from "./physical-geography";

export interface PlaceNameTranslation {
  expectedName: string;
  displayName: string;
  method: string;
  note: string;
  sourceUrl?: string;
  evidencePath?: string;
  expectedSourceId?: string;
  expectedSourceCode?: string;
  expectedYear?: number;
}

export const naturalNameTranslations: Readonly<Record<string, PlaceNameTranslation>> = document.natural;
export const historicalNameTranslations: Readonly<Record<string, PlaceNameTranslation>> = document.historical;

/** Latin, Cyrillic, Thai and other alphabetic scripts are not Chinese labels. */
export function isChineseDisplayName(value: string): boolean {
  return /\p{Script=Han}/u.test(value) && ![...value].some(character => /\p{Letter}/u.test(character) && !/\p{Script=Han}/u.test(character));
}

export function chinesePlaceName(value: string, fallback: string): string {
  const name = simplifiedChinese(value.trim());
  return isChineseDisplayName(name) ? name : fallback;
}

export function localizedPolity(value?: string): string | undefined {
  if (!value) return undefined;
  // A single source transcription has a stray Latin prefix. No regrouping.
  return chinesePlaceName(value === "l遼代" ? "遼代" : value, "来源分组名称待核定");
}

const adminTypes: Record<string, string> = {
  Anfusi: "安抚司", Bao: "堡", Bu: "部", Changguansi: "长官司", Cheng: "城", Chengfangxiang: "城坊厢", Chu: "处",
  Daduhufu: "大都护府", Dao: "道", "Dependent Kingdom": "附属王国", "Dependent State": "附属政权", Dong: "洞", Dongchu: "洞处",
  Dudufu: "都督府", "Duhu fu": "都护府", Duhufu: "都护府", Dusi: "都司", Fu: "府", "Hanguo (Khanate)": "汗国",
  "Independent State": "独立政权", "Independent state": "独立政权", "Independent Tribe": "独立部落", "Independent Tribes": "独立诸部",
  Jian: "监", Jiedushisi: "节度使司", "Jimi zhou": "羁縻州", Jimizhou: "羁縻州", Jun: "军", "Junmin`anfusi": "军民安抚司",
  Junminfu: "军民府", Junminqianhusuo: "军民千户所", Junminxuanweishisi: "军民宣慰使司", Junminzhihuishishisi: "军民指挥使司", Junminzhihuishisi: "军民指挥使司",
  Lu: "路", Lushisi: "录事司", Manyichangguansi: "蛮夷长官司", Qianhusuo: "千户所", Sheng: "省", Shouyujunminsuo: "守御军民所", Shouyuqianhusuo: "守御千户所",
  Si: "司", Suo: "所", "Tributary State": "朝贡政权", Tunwei: "屯卫", Wangbu: "王部", Wangfu: "王府", Wei: "卫", Xian: "县", Xingdusi: "行都司", Xingsheng: "行省",
  Xuanfusi: "宣抚司", Xuanweishisi: "宣慰使司", Xuanweisi: "宣慰司", Yuan: "院", Yuyizhou: "御夷州", Zhai: "寨", Zhaotaoshisi: "招讨使司", Zhen: "镇", Zhilizhou: "直隶州", Zhongzhai: "中寨", Zhou: "州",
};

export function localizedAdminType(value?: string): string | undefined {
  if (!value) return undefined;
  return adminTypes[value] ?? chinesePlaceName(value, "来源类型待核定");
}

export interface LocalizedPhysicalGroup extends PhysicalGroup {
  originalName: string;
  nameStatus: "source" | "translated" | "unresolved" | "unnamed";
  nameCorrectionNote?: string;
  nameSourceUrl?: string;
}

/** Labels, hover, search results and detail titles share this exact object. */
export function localizePhysicalGroup(group: PhysicalGroup): LocalizedPhysicalGroup {
  const translation = naturalNameTranslations[group.groupId];
  const matched = translation?.expectedName === group.name ? translation : undefined;
  const sourceName = simplifiedChinese(group.name);
  const unnamed = sourceName.startsWith("未命名");
  const unresolved = matched?.method === "unresolved" || !matched && !isChineseDisplayName(sourceName);
  const numericId = group.groupId.match(/\d+$/)?.[0];
  const name = matched ? simplifiedChinese(matched.displayName) : chinesePlaceName(sourceName, `未定名${physicalKindNames[group.kind]}${numericId ? `（源编号${numericId}）` : ""}`);
  return { ...group, name, originalName: group.name,
    aliases: [...new Set([...(group.aliases ?? []), group.name, group.nameEn].filter(Boolean))],
    nameStatus: unnamed ? "unnamed" : unresolved ? "unresolved" : matched ? "translated" : "source",
    nameCorrectionNote: matched?.note ?? (unresolved ? "尚未核定中文名称，原始名称保留供核查。" : undefined),
    nameSourceUrl: matched?.sourceUrl,
  };
}
