import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeExploration, parseExploration, serializeExploration } from '../shared/exploration';
import { exampleCatalog } from './fixtures';

const catalog = exampleCatalog();

test('空链接打开专题首事件，地点链接与显式关闭事件不会重开首事件', () => {
  const initial = parseExploration('', catalog);
  assert.deepEqual(initial, { periodId: 'tang', year: 755, topicId: 'anshi', placeId: 'fanyang', eventId: 'first', detailsView: 'events', modernNames: false, routeVisible: true });
  assert.equal(parseExploration('?topic=anshi', catalog).eventId, 'first');
  assert.equal(parseExploration('?topic=anshi&place=changan', catalog).eventId, null);
  assert.equal(normalizeExploration({ ...initial, eventId: null }, catalog).eventId, null);
  assert.equal(parseExploration('?period=qin', catalog).topicId, null);
});

test('专题与事件冲突时保留事件、退出专题并修正时期和地图定位', () => {
  const foreign = parseExploration('?period=tang&topic=anshi&place=changan&event=qin-event', catalog);
  assert.equal(foreign.topicId, null);
  assert.equal(foreign.periodId, 'qin');
  assert.equal(foreign.placeId, 'qin-city');
  assert.equal(foreign.eventId, 'qin-event');
  const samePeriod = parseExploration('?topic=anshi&event=outside-topic', catalog);
  assert.equal(samePeriod.periodId, 'tang');
  assert.equal(samePeriod.topicId, null);
  assert.equal(samePeriod.eventId, 'outside-topic');
});

test('恶意、未知、重复和过长 URL 参数不会产生悬空探索状态', () => {
  const links = [
    '?period=%3Cscript%3E&topic=__proto__&place=../../etc&event=%E0%A4%A',
    '?period=missing&topic=missing&place=missing&event=missing',
    '?event=first&event=qin-event&modern=1&modern=0&route=0&route=1',
    `?event=${'x'.repeat(10000)}`,
  ];
  for (const link of links) {
    const result = parseExploration(link, catalog);
    assert.ok(catalog.periods.some(item => item.id === result.periodId));
    assert.ok(!result.topicId || catalog.topics!.some(item => item.id === result.topicId));
    assert.ok(!result.eventId || catalog.events.some(item => item.id === result.eventId));
    assert.ok(!result.placeId || catalog.places.some(item => item.id === result.placeId && item.periodIds.includes(result.periodId)));
    assert.equal(result.modernNames, false);
    assert.equal(result.routeVisible, true);
  }
});

test('分享链接完整保留事件、地点、专题退出与两个地图开关', () => {
  const states = [
    parseExploration('', catalog),
    parseExploration('?topic=anshi&place=changan&modern=1&route=0', catalog),
    parseExploration('?period=tang&place=changan', catalog),
    parseExploration('?period=qin&event=qin-event&route=0', catalog),
    normalizeExploration({ periodId: 'tang', topicId: 'anshi', eventId: null, placeId: null }, catalog),
  ];
  for (const state of states) {
    const link = serializeExploration(state);
    assert.ok(link.startsWith('?period='));
    assert.deepEqual(parseExploration(link, catalog), state);
    assert.equal(serializeExploration(parseExploration(link, catalog)), link);
  }
});

test('没有专题的旧数据仍可打开，地点不能留在不可见时期', () => {
  const legacy = exampleCatalog();
  delete legacy.topics;
  assert.equal(parseExploration('', legacy).topicId, null);
  assert.equal(parseExploration('', legacy).eventId, null);
  assert.equal(parseExploration('?period=qin&place=changan', legacy).periodId, 'tang');
});

test('事件返回列表后的分享、刷新和历史恢复保持列表而非地点档案', () => {
  const initial = parseExploration('', catalog);
  const list = normalizeExploration({ ...initial, eventId: null, detailsView: 'events' }, catalog);
  const listUrl = serializeExploration(list);
  assert.match(listUrl, /[?&]view=events(?:&|$)/);
  assert.equal(list.eventId, null);
  assert.equal(list.detailsView, 'events');
  const next = normalizeExploration({ ...list, eventId: 'second', placeId: 'changan' }, catalog);
  assert.equal(next.detailsView, 'events');
  assert.equal(next.eventId, 'second');
  assert.deepEqual(parseExploration(listUrl, catalog), list, '浏览器后退或刷新应恢复专题列表');
  assert.deepEqual(parseExploration(serializeExploration(next), catalog), next, '前进应恢复随后打开的事件');
  const place = normalizeExploration({ ...list, detailsView: 'place' }, catalog);
  assert.doesNotMatch(serializeExploration(place), /view=/);
  assert.equal(parseExploration(serializeExploration(place), catalog).detailsView, 'place');
});

test('URL 中事件优先显示详情，无事件时非法或重复 view 回到地点档案', () => {
  assert.equal(parseExploration('?period=tang&event=first&view=place', catalog).detailsView, 'events');
  assert.equal(parseExploration('?period=tang&place=changan&view=events', catalog).detailsView, 'events');
  assert.equal(parseExploration('?period=tang&place=changan&view=unknown', catalog).detailsView, 'place');
  assert.equal(parseExploration('?period=tang&place=changan&view=events&view=place', catalog).detailsView, 'place');
});

test('手写专题列表链接不指定地点时，显式列表优先于默认首事件', () => {
  const list = parseExploration('?topic=anshi&view=events', catalog);
  assert.equal(list.topicId, 'anshi');
  assert.equal(list.eventId, null);
  assert.equal(list.detailsView, 'events');
  assert.deepEqual(parseExploration(serializeExploration(list), catalog), list);
  assert.equal(parseExploration('?topic=anshi', catalog).eventId, 'first', '纯专题入口仍打开首事件');
  const invalidView = parseExploration('?topic=anshi&view=unknown', catalog);
  assert.equal(invalidView.eventId, null);
  assert.equal(invalidView.detailsView, 'place');
});

test('分享和浏览器前后退保留精确年份及跨期同城入口，旧链接保持原有默认行为', () => {
  const legacy = parseExploration('?period=tang&place=changan', catalog);
  assert.equal(legacy.year, undefined);
  const history = [legacy, normalizeExploration({ ...legacy, year: 1127 }, catalog), normalizeExploration({ ...legacy, year: 618 }, catalog)];
  assert.equal(history[1].periodId, 'song');
  assert.equal(history[1].placeId, 'changan', '同城跨期入口即使该期档案未收录也不应被替换');
  for (const state of [...history, ...[...history].reverse()]) assert.deepEqual(parseExploration(serializeExploration(state), catalog), state);
  assert.equal(normalizeExploration({ periodId: 'tang', year: 762 }, catalog).year, 762, '显式年份不被默认专题首事件覆盖');
});

test('所选事件使用自己发生年而不是朝代代表年或冲突URL年份', () => {
  const exact = parseExploration('?period=tang&year=1200&event=second', catalog);
  assert.equal(exact.year, 756);
  assert.equal(exact.periodId, 'tang');
  assert.equal(exact.eventId, 'second');
  assert.equal(parseExploration('?period=tang&event=qin-event', catalog).year, -221);
  assert.equal(parseExploration(serializeExploration(exact), catalog).year, 756);
});

test('非法年份、零年、重复、超范围与非十进制写法被忽略，未覆盖年代保留供UI明确说明', () => {
  for (const value of ['0', '-0', '0755', '755.5', 'NaN', 'Infinity', '1e3', '0x300', '10000', '-10000', '755&year=756', '%20%20', '+755']) {
    assert.equal(parseExploration(`?period=tang&place=changan&year=${value}`, catalog).year, undefined, value);
  }
  for (const year of [-1046, 920, 1932]) {
    const state = parseExploration(`?period=tang&place=changan&year=${year}`, catalog);
    assert.equal(state.year, year);
    assert.equal(state.placeId, 'changan');
    assert.deepEqual(parseExploration(serializeExploration(state), catalog), state);
  }
  assert.equal(parseExploration('?period=qin&year=-221&place=qin-city', catalog).year, -221);
});
