import { simplifiedChinese } from "./boundary-search";
import type { TangDetailCollection, TangDetailProperties } from "./tang-detail";

function usableChineseName(value: string | undefined): value is string {
  return !!value && /\p{Script=Han}/u.test(value) && !/^未命名|^未定名/.test(value.trim());
}

/** Recover an existing Chinese source name without changing valid name choices. */
export function tangDetailDisplayName(properties: TangDetailProperties): string {
  const current = simplifiedChinese(properties.name.trim());
  if (!properties.modernReferenceOnly || usableChineseName(current)) return current;
  const tags = properties.tags ?? {};
  const source = [tags["name:zh-Hans"], tags["name:zh"], tags["name:zh-Hant"], tags.name]
    .find(usableChineseName);
  // Foreign-only names remain available as recorded; never invent a translation.
  return source ? simplifiedChinese(source.trim()) : current;
}

/** Display-only correction: geometry and original source tags remain untouched. */
export function localizeTangDetailFeature<T extends TangDetailCollection["features"][number]>(feature: T): T {
  const name = tangDetailDisplayName(feature.properties);
  return name === feature.properties.name ? feature : { ...feature, properties: { ...feature.properties, name } };
}
