import type { BoundaryLevel, BoundarySelection } from "./boundaries";
import { simplifiedChinese } from "./boundary-search";

export interface BoundaryHierarchyRelations {
  /** Each target has a unique, complete identity in this source snapshot. */
  parents: BoundarySelection[];
  children: BoundarySelection[];
  ambiguousParents: { level: BoundaryLevel; candidates: BoundarySelection[] }[];
  sourcePath: string[];
  missingReason?: string;
}

const value = (text: string | undefined) => simplifiedChinese(text ?? "").trim();
function sameScope(a: BoundarySelection, b: BoundarySelection): boolean {
  const left = a.sourceHierarchy, right = b.sourceHierarchy;
  return a.year === b.year && a.sourceId === b.sourceId
    && !!value(left?.polity) && value(left?.polity) === value(right?.polity)
    && !!value(left?.province) && value(left?.province) === value(right?.province);
}
function samePrefecturePath(a: BoundarySelection, b: BoundarySelection): boolean {
  const left = a.sourceHierarchy, right = b.sourceHierarchy;
  return (!!value(left?.prefecture) || !!value(left?.dependentPrefecture))
    && value(left?.prefecture) === value(right?.prefecture)
    && value(left?.dependentPrefecture) === value(right?.dependentPrefecture);
}
function explicitPrefectureAncestor(child: BoundarySelection, parent: BoundarySelection): boolean {
  // A county can name both a prefecture and a dependent prefecture. The first
  // is an explicit ancestor, but the second must never be collapsed into it.
  return !!value(child.sourceHierarchy?.prefecture)
    && value(child.sourceHierarchy?.prefecture) === value(parent.sourceHierarchy?.prefecture)
    && !!value(child.sourceHierarchy?.dependentPrefecture)
    && !value(parent.sourceHierarchy?.dependentPrefecture);
}
function sameIdentity(a: BoundarySelection, b: BoundarySelection): boolean {
  return a.level === b.level && sameScope(a, b)
    && (a.level === "province" || samePrefecturePath(a, b));
}

/**
 * Match explicit identity paths, never stripped names, geometry, nearest areas,
 * or missing-field wildcards. The two prefecture fields remain distinct: a
 * dependent prefecture is not silently promoted into the regular one.
 */
export function boundaryHierarchyRelations(selected: BoundarySelection, regions: BoundarySelection[]): BoundaryHierarchyRelations {
  const hierarchy = selected.sourceHierarchy;
  const sourcePath = [hierarchy?.polity, hierarchy?.province, hierarchy?.prefecture, hierarchy?.dependentPrefecture].map(value).filter(Boolean);
  const result: BoundaryHierarchyRelations = { parents: [], children: [], ambiguousParents: [], sourcePath };
  if (!hierarchy || !value(hierarchy.polity) || !value(hierarchy.province)) {
    return { ...result, missingReason: "来源缺少完整政权或省路道字段，暂不能确认上下级关系；不按位置和同名猜测。" };
  }
  const scope = regions.filter(region => region.id !== selected.id && sameScope(selected, region));
  const parentLevels: BoundaryLevel[] = selected.level === "county" ? ["province", "prefecture"] : selected.level === "prefecture" ? ["province"] : [];
  for (const level of parentLevels) {
    const candidates = scope.filter(region => region.level === level && (level === "province" || samePrefecturePath(selected, region)));
    if (candidates.length === 1) result.parents.push(candidates[0]);
    else if (candidates.length > 1) result.ambiguousParents.push({ level, candidates });
    if (level === "prefecture") {
      const ancestors = scope.filter(region => region.level === "prefecture" && explicitPrefectureAncestor(selected, region));
      if (ancestors.length === 1) result.parents.push(ancestors[0]);
      else if (ancestors.length > 1) result.ambiguousParents.push({ level, candidates: ancestors });
    }
  }
  const childLevel = selected.level === "province" ? "prefecture" : selected.level === "prefecture" ? "county" : undefined;
  // Repeated parent identities cannot be disambiguated by the child fields.
  const duplicateIdentity = regions.some(region => region.id !== selected.id && sameIdentity(selected, region));
  if (childLevel && !duplicateIdentity) {
    result.children = scope.filter(region => region.level === childLevel && (selected.level === "province" || samePrefecturePath(selected, region) || explicitPrefectureAncestor(region, selected)));
  }
  if (duplicateIdentity && childLevel) result.missingReason = "此来源存在多个同路径上级记录，不能确定子记录属于哪一面；下辖列表暂不归并。";
  else if (!result.parents.length && !result.children.length && !result.ambiguousParents.length) result.missingReason = "来源有层级字段，但当前资料没有完整路径一致的可跳转记录。";
  return result;
}

export function boundaryHierarchyLabel(level: BoundaryLevel): string {
  return level === "county" ? "县" : level === "prefecture" ? "府 / 州 / 郡" : level === "province" ? "道 / 路 / 省" : "政权";
}
