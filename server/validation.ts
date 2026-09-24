import type { Catalog, Evidence, HistoricalEvent, HistoricalTime } from '../shared/types';

const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const validYear = (value: unknown): value is number => Number.isInteger(value) && value !== 0 && Math.abs(value as number) <= 10000;

function validDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  const localDate = new Date(value.slice(0, 10));
  return Number.isFinite(Date.parse(value)) && Number.isFinite(localDate.getTime())
    && localDate.toISOString().slice(0, 10) === value.slice(0, 10);
}

function validateTime(time: HistoricalTime, event: HistoricalEvent) {
  if (!time || !validYear(time.year) || time.year !== event.year) throw new Error(`${event.id} 的时间年份与事件不一致`);
  if (!['year', 'month', 'day'].includes(time.precision) || !['recorded', 'approximate'].includes(time.certainty)
    || !['traditional-chinese', 'common-era-year'].includes(time.calendar)) throw new Error(`${event.id} 的时间精度、历法或确定性无效`);
  if (!nonempty(time.original) || !nonempty(event.dateLabel)) throw new Error(`${event.id} 缺少原始时间或日期标签`);
  if (time.precision === 'year') {
    if (time.month !== undefined || time.dayLabel !== undefined) throw new Error(`${event.id} 的年精度不能附带月份或日期`);
    return;
  }
  if (time.calendar === 'common-era-year') throw new Error(`${event.id} 的公元年份历法不能表示月日精度`);
  if (!Number.isInteger(time.month) || time.month! < 1 || time.month! > 12) throw new Error(`${event.id} 的月份必须在 1 至 12 之间`);
  if (time.precision === 'month' && time.dayLabel !== undefined) throw new Error(`${event.id} 的月精度不能附带日期`);
  if (time.precision === 'day' && (!nonempty(time.dayLabel) || !time.original.includes(time.dayLabel))) {
    throw new Error(`${event.id} 的日精度需要与原始时间一致的日期标签`);
  }
  const monthLabel = time.original.match(/(十一|十二|十|[一二三四五六七八九正元腊臘]|1[0-2]|[1-9])月/);
  if (monthLabel) {
    const monthNames: Record<string, number> = { 正: 1, 元: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12, 腊: 12, 臘: 12 };
    if ((monthNames[monthLabel[1]] ?? Number(monthLabel[1])) !== time.month) throw new Error(`${event.id} 的月份与原始时间标签不一致`);
  }
}

export function validateEnrichment(data: Catalog) {
  const sources = new Set(data.sources.map(source => source.id));
  const periods = new Map(data.periods.map(period => [period.id, period]));
  const places = new Map(data.places.map(place => [place.id, place]));
  const events = new Map(data.events.map(event => [event.id, event]));
  function validateEvidence(records: Evidence[] | undefined, sourceIds: string[], owner: string) {
    if (records === undefined) return;
    if (!Array.isArray(records)) throw new Error(`${owner} 的证据必须是列表`);
    const ids = new Set<string>();
    for (const record of records) {
      if (!record || !nonempty(record.id) || ids.has(record.id)) throw new Error(`${owner} 的证据 id 无效或重复`);
      ids.add(record.id);
      if (!sources.has(record.sourceId) || !sourceIds.includes(record.sourceId)) throw new Error(`${owner} 的证据来源不存在或未关联到实体`);
      if (!nonempty(record.locator) || !nonempty(record.supports)) throw new Error(`${owner} 的证据缺少引用位置或支持事项`);
      if (!['checked', 'pending'].includes(record.status)) throw new Error(`${owner} 的证据核验状态无效`);
      if (record.status === 'checked' && (!nonempty(record.quote) || !validDate(record.checkedAt))) {
        throw new Error(`${owner} 的已核对证据必须包含原文与有效核验日期`);
      }
      if (record.checkedAt !== undefined && !validDate(record.checkedAt)) throw new Error(`${owner} 的证据核验日期无效`);
    }
  }
  for (const source of data.sources) {
    if (!['reference', 'verified'].includes(source.verification)) throw new Error(`${source.id} 的来源核验状态无效`);
    if (source.retrievedAt !== undefined && !validDate(source.retrievedAt)) throw new Error(`${source.id} 的来源获取日期无效`);
  }
  for (const place of data.places) {
    validateEvidence(place.evidence, place.sourceIds, place.id);
    if (place.location !== undefined) {
      const location = place.location;
      if (!location || !['approximate', 'uncertain', 'precise'].includes(location.accuracy) || !nonempty(location.note)) {
        throw new Error(`${place.id} 的位置精度或说明无效`);
      }
      if (!Array.isArray(location.sourceIds) || location.sourceIds.some(id => !sources.has(id))) throw new Error(`${place.id} 的位置来源引用不存在`);
      if (location.accuracy === 'precise' && location.sourceIds.length === 0) throw new Error(`${place.id} 的精确位置必须提供来源`);
    }
  }
  for (const event of data.events) {
    validateEvidence(event.evidence, event.sourceIds, event.id);
    if (event.time !== undefined) validateTime(event.time, event);
    for (const periodId of event.periodIds) {
      const period = periods.get(periodId)!;
      if (event.year < period.startYear || (event.endYear ?? event.year) > period.endYear) throw new Error(`${event.id} 的时间超出关联时期`);
      if (event.placeIds.some(id => !places.get(id)!.periodIds.includes(periodId))) throw new Error(`${event.id} 的地点在关联时期不可见`);
    }
  }
  if (data.topics === undefined) return;
  if (!Array.isArray(data.topics)) throw new Error('专题必须是列表');
  const topicIds = new Set<string>();
  for (const topic of data.topics) {
    if (!topic || !nonempty(topic.id) || topicIds.has(topic.id)) throw new Error('专题 id 无效或重复');
    topicIds.add(topic.id);
    const period = periods.get(topic.periodId);
    if (!period) throw new Error(`${topic.id} 的专题时期不存在`);
    if (!validYear(topic.startYear) || !validYear(topic.endYear) || topic.startYear > topic.endYear
      || topic.startYear < period.startYear || topic.endYear > period.endYear) throw new Error(`${topic.id} 的专题时间范围无效`);
    if (!Array.isArray(topic.placeIds) || !topic.placeIds.length || new Set(topic.placeIds).size !== topic.placeIds.length
      || topic.placeIds.some(id => !places.get(id)?.periodIds.includes(topic.periodId))) throw new Error(`${topic.id} 的专题地点不存在、重复或时期不可见`);
    if (!Array.isArray(topic.eventIds) || !topic.eventIds.length || new Set(topic.eventIds).size !== topic.eventIds.length) {
      throw new Error(`${topic.id} 的专题事件列表缺失或重复`);
    }
    let previousYear = topic.startYear;
    for (const eventId of topic.eventIds) {
      const event = events.get(eventId);
      if (!event || !event.periodIds.includes(topic.periodId)) throw new Error(`${topic.id} 的专题事件不存在或时期不符`);
      if (event.year < topic.startYear || (event.endYear ?? event.year) > topic.endYear) throw new Error(`${topic.id} 的事件超出专题时间范围`);
      if (event.year < previousYear) throw new Error(`${topic.id} 的专题事件未按年份排序`);
      previousYear = event.year;
      if (event.placeIds.some(id => !topic.placeIds.includes(id))) throw new Error(`${topic.id} 未覆盖专题事件关联的地点`);
    }
  }
}
