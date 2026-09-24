import { readFile } from 'node:fs/promises';
import type { Catalog, Coordinates, SearchResult } from '../shared/types';
import { validateEnrichment } from './validation';

/** Fail at startup when imported history data has broken references or geometry. */
export function validateCatalog(value: unknown): asserts value is Catalog {
  if (!value || typeof value !== 'object') throw new Error('历史数据必须是对象');
  const data = value as Catalog;
  const collections = ['periods', 'regimes', 'places', 'events', 'sources'] as const;
  const ids = new Map<string, Set<string>>();
  for (const name of collections) {
    if (!Array.isArray(data[name])) throw new Error(`缺少数据集合：${name}`);
    const collectionIds = new Set<string>();
    for (const item of data[name]) {
      if (!item || typeof item.id !== 'string' || !item.id.trim()) throw new Error(`${name} 存在无效 id`);
      if (collectionIds.has(item.id)) throw new Error(`${name} 存在重复 id：${item.id}`);
      collectionIds.add(item.id);
    }
    ids.set(name, collectionIds);
  }
  function refs(values: string[], collection: typeof collections[number], owner: string) {
    if (!Array.isArray(values)) throw new Error(`${owner} 缺少 ${collection} 引用`);
    for (const id of values) {
      if (!ids.get(collection)!.has(id)) throw new Error(`${owner} 引用了不存在的 ${collection}：${id}`);
    }
  }
  function year(value: number, owner: string) {
    if (!Number.isInteger(value) || value === 0 || value < -10000 || value > 10000) {
      throw new Error(`${owner} 存在无效历史年份：${value}`);
    }
  }
  function coordinates(value: Coordinates, owner: string) {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)
      || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) {
      throw new Error(`${owner} 存在无效经纬度`);
    }
  }
  for (const period of data.periods) {
    year(period.year, period.id);
    year(period.startYear, period.id);
    year(period.endYear, period.id);
    if (period.startYear > period.endYear || period.year < period.startYear || period.year > period.endYear) {
      throw new Error(`${period.id} 的代表年份或起止时间无效`);
    }
    refs(period.regimeIds, 'regimes', period.id);
  }
  for (const regime of data.regimes) {
    refs([regime.periodId], 'periods', regime.id);
    refs(regime.sourceIds, 'sources', regime.id);
    coordinates(regime.labelPosition, regime.id);
    if (regime.geometry?.type !== 'Polygon' || !Array.isArray(regime.geometry.coordinates)
      || !regime.geometry.coordinates.length) throw new Error(`${regime.id} 缺少 Polygon 几何数据`);
    for (const ring of regime.geometry.coordinates) {
      if (!Array.isArray(ring) || ring.length < 4) throw new Error(`${regime.id} 的边界至少需要四个闭合坐标`);
      ring.forEach(point => coordinates(point, regime.id));
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) throw new Error(`${regime.id} 的边界未闭合`);
    }
    if (!data.periods.find(period => period.id === regime.periodId)!.regimeIds.includes(regime.id)) {
      throw new Error(`${regime.id} 未列入所属时期的政权列表`);
    }
  }
  for (const period of data.periods) {
    for (const id of period.regimeIds) {
      if (data.regimes.find(regime => regime.id === id)!.periodId !== period.id) {
        throw new Error(`${period.id} 的政权引用 ${id} 属于其他时期`);
      }
    }
  }
  for (const place of data.places) {
    coordinates(place.coordinates, place.id);
    refs(place.periodIds, 'periods', place.id);
    refs(place.sourceIds, 'sources', place.id);
    refs(Object.keys(place.nameByPeriod ?? {}), 'periods', place.id);
    refs(Object.keys(place.typeByPeriod ?? {}), 'periods', place.id);
    for (const type of [place.type, ...Object.values(place.typeByPeriod ?? {})]) {
      if (!['capital', 'city', 'pass'].includes(type)) throw new Error(`${place.id} 存在无效地点类型：${type}`);
    }
    if (!Array.isArray(place.aliases)) throw new Error(`${place.id} 缺少地名别名列表`);
  }
  for (const event of data.events) {
    year(event.year, event.id);
    if (event.endYear !== undefined) {
      year(event.endYear, event.id);
      if (event.endYear < event.year) throw new Error(`${event.id} 的结束年份早于开始年份`);
    }
    refs(event.placeIds, 'places', event.id);
    refs(event.sourceIds, 'sources', event.id);
    refs(event.periodIds, 'periods', event.id);
    if (event.route) {
      if (!Array.isArray(event.route) || event.route.length < 2) throw new Error(`${event.id} 的路线至少需要两个坐标`);
      event.route.forEach(point => coordinates(point, event.id));
    }
  }
  if (!data.metadata || !data.metadata.dataNotice || !data.metadata.geographicNotice) {
    throw new Error('历史数据必须包含数据与地理精度说明');
  }
  validateEnrichment(data);
}

export async function loadCatalog(path: string): Promise<Catalog> {
  const data: unknown = JSON.parse(await readFile(path, 'utf8'));
  validateCatalog(data);
  return data;
}

const normalized = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
export function formatYear(year: number): string {
  return year < 0 ? `公元前 ${Math.abs(year)} 年` : `${year} 年`;
}

/** Accept common date input without interpreting an arbitrary text suffix as a year. */
export function parseHistoricalYear(input: string): number | undefined {
  const query = normalized(input);
  let result: number;
  const bce = query.match(/^(?:公元前|前|bce?|bc)(\d{1,4})年?$/)
    ?? query.match(/^(\d{1,4})(?:年)?(?:bce?|bc)$/);
  if (bce) result = -Number(bce[1]);
  else {
    const ce = query.match(/^(?:公元|ce|ad)?(-?\d{1,4})年?$/)
      ?? query.match(/^(\d{1,4})(?:年)?(?:ce|ad)$/);
    if (!ce) return undefined;
    result = Number(ce[1]);
  }
  return result === 0 ? undefined : result;
}

export function searchCatalog(data: Catalog, input: string): SearchResult[] {
  const query = normalized(input);
  if (!query) return [];
  const historicalYear = parseHistoricalYear(query);
  const results: Array<{ score: number; value: SearchResult }> = [];
  const match = (text: string, weight: number) => {
    const target = normalized(text);
    return target === query ? weight + 20 : target.startsWith(query) ? weight + 10 : target.includes(query) ? weight : 0;
  };
  for (const place of data.places) {
    const nameScore = match(place.name, 100);
    const modernNameScore = match(place.modernName, 85);
    const score = Math.max(nameScore, modernNameScore,
      ...[...place.aliases, ...Object.values(place.nameByPeriod ?? {})].map(name => match(name, 90)));
    // “大都” points to Yuan Beijing, while “北京” should let the client keep its
    // active era. Do not turn modern-city searches such as “西安” into Ming jumps.
    const historicalMatch = nameScore === 0 && modernNameScore === 0
      ? Object.entries(place.nameByPeriod ?? {})
        .map(([periodId, name]) => ({ periodId, name, score: match(name, 90) }))
        .filter(candidate => candidate.score > 0)
        .sort((a, b) => b.score - a.score)[0]
      : undefined;
    if (score) results.push({ score, value: {
      type: 'place', id: place.id, title: place.name, subtitle: `今 ${place.modernName}`,
      periodId: historicalMatch?.periodId ?? place.periodIds[0],
      ...(historicalMatch ? { matchedHistoricalName: historicalMatch.name } : {}),
    } });
  }
  for (const event of data.events) {
    const atYear = historicalYear !== undefined && historicalYear >= event.year && historicalYear <= (event.endYear ?? event.year);
    const score = Math.max(match(event.title, 95), ...event.personNames.map(name => match(name, 60)), atYear ? 100 : 0);
    if (score) results.push({ score, value: {
      type: 'event', id: event.id, title: event.title, subtitle: event.dateLabel, periodId: event.periodIds[0],
    } });
  }
  for (const period of data.periods) {
    const atYear = historicalYear !== undefined && historicalYear >= period.startYear && historicalYear <= period.endYear;
    // People commonly type “唐朝” even when the catalog calls the period “唐”.
    const dynastyQuery = query.replace(/朝$/, '');
    const dynastyMatch = query.endsWith('朝') && dynastyQuery.length > 0
      && [period.name, period.label].some(name => normalized(name).replace(/朝$/, '') === dynastyQuery);
    const score = Math.max(match(period.name, 90), match(period.label, 90), dynastyMatch ? 110 : 0, atYear ? 90 : 0);
    if (score) results.push({ score, value: {
      type: 'period', id: period.id, title: period.name,
      subtitle: `${formatYear(period.startYear)} — ${formatYear(period.endYear)}`, periodId: period.id,
    } });
  }
  return results.sort((a, b) => b.score - a.score || a.value.title.localeCompare(b.value.title, 'zh-CN'))
    .slice(0, 40).map(result => result.value);
}

export function getPlaceDetail(data: Catalog, id: string) {
  const place = data.places.find(item => item.id === id);
  if (!place) return undefined;
  const events = data.events.filter(event => event.placeIds.includes(id));
  const sourceIds = new Set([...place.sourceIds, ...(place.location?.sourceIds ?? []), ...events.flatMap(event => event.sourceIds)]);
  return { place, events, sources: data.sources.filter(source => sourceIds.has(source.id)) };
}

export function getEventDetail(data: Catalog, id: string) {
  const event = data.events.find(item => item.id === id);
  if (!event) return undefined;
  const places = data.places.filter(place => event.placeIds.includes(place.id));
  const sourceIds = new Set([...event.sourceIds, ...places.flatMap(place => [...place.sourceIds, ...(place.location?.sourceIds ?? [])])]);
  return { event, places, sources: data.sources.filter(source => sourceIds.has(source.id)) };
}

export function getTopicDetail(data: Catalog, id: string) {
  const topic = data.topics?.find(item => item.id === id);
  if (!topic) return undefined;
  // Preserve the editorial sequence instead of the catalog's insertion order.
  const events = topic.eventIds.map(eventId => data.events.find(event => event.id === eventId)!);
  const places = topic.placeIds.map(placeId => data.places.find(place => place.id === placeId)!);
  const sourceIds = new Set([
    ...events.flatMap(event => event.sourceIds),
    ...places.flatMap(place => [...place.sourceIds, ...(place.location?.sourceIds ?? [])]),
  ]);
  return { topic, events, places, sources: data.sources.filter(source => sourceIds.has(source.id)) };
}
