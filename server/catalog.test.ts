import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { getEventDetail, getPlaceDetail, loadCatalog, parseHistoricalYear, searchCatalog, validateCatalog } from './catalog';
import { parseExploration, serializeExploration } from '../shared/exploration';

const catalog = await loadCatalog(fileURLToPath(new URL('../data/catalog.json', import.meta.url)));

test('发布版移除专题入口，旧专题链接归普通地图且具体历史事件仍可读取', () => {
  assert.deepEqual(catalog.topics, []);
  const landing = parseExploration('', catalog);
  assert.equal(landing.topicId, null);
  assert.equal(landing.eventId, null);
  const legacy = parseExploration('?topic=anshi&event=anshi-755-fanyang', catalog);
  assert.equal(legacy.topicId, null);
  assert.equal(legacy.eventId, 'anshi-755-fanyang');
  assert.doesNotMatch(serializeExploration(legacy), /topic=/);
  assert.ok(getEventDetail(catalog, legacy.eventId!));
});

test('发布数据的地点、事件、疆域和来源引用完整', () => {
  validateCatalog(catalog);
  assert.ok(catalog.periods.length > 1, '初版应该支持跨时期切换');
  assert.ok(catalog.places.length > 0);
  assert.ok(catalog.events.length > 0);
  assert.ok(catalog.sources.length > 0);
});

test('常见公元前、公元年份输入可查询，没有公元零年', () => {
  for (const input of ['公元前221年', '前 221', '-221', '221 BCE', 'BC221']) assert.equal(parseHistoricalYear(input), -221);
  for (const input of ['755', '公元755年', 'AD755', '755 CE']) assert.equal(parseHistoricalYear(input), 755);
  for (const input of ['0', '前0年', '755年发生了什么', '唐']) assert.equal(parseHistoricalYear(input), undefined);
  const period = catalog.periods[0];
  assert.ok(searchCatalog(catalog, String(period.year)).some(result => result.type === 'period' && result.id === period.id));
});

test('搜索能从现代地名、历史别名和事件进入详情', () => {
  const place = catalog.places.find(item => item.aliases.length > 0)!;
  assert.ok(place, '应存在有别名的历史地点');
  for (const input of [place.name, place.modernName, place.aliases[0]]) {
    assert.ok(searchCatalog(catalog, input).some(result => result.type === 'place' && result.id === place.id), input);
  }
  const event = catalog.events[0];
  assert.ok(searchCatalog(catalog, event.title).some(result => result.type === 'event' && result.id === event.id));
  assert.deepEqual(searchCatalog(catalog, '  '), []);
  assert.deepEqual(searchCatalog(catalog, '不存在的历史地名XYZ'), []);
});

test('搜索分期旧名进入正确时代，普通古今地名允许保留当前时代', () => {
  for (const [query, id, periodId] of [['大都', 'beijing', 'yuan'], ['奉元', 'changan', 'yuan'], ['临安', 'hangzhou', 'song']]) {
    const result = searchCatalog(catalog, query).find(item => item.type === 'place' && item.id === id);
    assert.ok(result, `应能查到 ${query}`);
    assert.equal(result.periodId, periodId, `${query} 不应跳到地点首次出现的朝代`);
    assert.equal(result.matchedHistoricalName, query);
  }
  for (const [query, id] of [['北京', 'beijing'], ['西安', 'changan'], ['长安', 'changan']]) {
    const result = searchCatalog(catalog, query).find(item => item.type === 'place' && item.id === id);
    assert.ok(result);
    assert.equal(result.matchedHistoricalName, undefined, `${query} 不应强制跳转时代`);
  }
});

test('详情关联事件、地点和去重史料，并处理不存在的实体', () => {
  const event = catalog.events.find(item => item.placeIds.length > 0)!;
  const detail = getEventDetail(catalog, event.id)!;
  assert.equal(detail.event.id, event.id);
  assert.ok(detail.places.some(place => place.id === event.placeIds[0]));
  assert.equal(new Set(detail.sources.map(source => source.id)).size, detail.sources.length);
  const placeDetail = getPlaceDetail(catalog, event.placeIds[0])!;
  assert.ok(placeDetail.events.some(item => item.id === event.id));
  assert.ok(event.sourceIds.every(id => placeDetail.sources.some(source => source.id === id)));
  assert.equal(getEventDetail(catalog, 'missing'), undefined);
  assert.equal(getPlaceDetail(catalog, 'missing'), undefined);
});

test('阻止重复标识、悬空引用、错误经纬度和倒置时间进入服务', () => {
  const duplicate = structuredClone(catalog);
  duplicate.places.push(duplicate.places[0]);
  assert.throws(() => validateCatalog(duplicate), /重复 id/);
  const dangling = structuredClone(catalog);
  dangling.events[0].sourceIds.push('nonexistent-source');
  assert.throws(() => validateCatalog(dangling), /不存在的 sources/);
  const badCoordinates = structuredClone(catalog);
  badCoordinates.places[0].coordinates = [190, 35];
  assert.throws(() => validateCatalog(badCoordinates), /无效经纬度/);
  const badDates = structuredClone(catalog);
  badDates.events[0].endYear = badDates.events[0].year - 1;
  assert.throws(() => validateCatalog(badDates), /结束年份/);
  const badTypePeriod = structuredClone(catalog);
  badTypePeriod.places[0].typeByPeriod = { 'missing-period': 'capital' };
  assert.throws(() => validateCatalog(badTypePeriod), /不存在的 periods/);
  const badType = structuredClone(catalog);
  Object.assign(badType.places[0], { typeByPeriod: { [catalog.periods[0].id]: 'unknown' } });
  assert.throws(() => validateCatalog(badType), /无效地点类型/);
});
