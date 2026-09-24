import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEventDetail, getTopicDetail, searchCatalog, validateCatalog } from './catalog';
import { exampleCatalog } from './fixtures';

test('专题按编辑顺序返回事件、地点和去重来源', () => {
  const data = exampleCatalog();
  validateCatalog(data);
  const detail = getTopicDetail(data, 'anshi')!;
  assert.deepEqual(detail.events.map(event => event.id), ['first', 'second']);
  assert.deepEqual(detail.places.map(place => place.id), ['fanyang', 'changan']);
  assert.deepEqual(detail.sources.map(source => source.id), ['book']);
  assert.equal(getTopicDetail(data, 'missing'), undefined);
});

test('专题拒绝不可见地点、遗漏地点、事件外键和时间冲突', () => {
  const missing = exampleCatalog();
  missing.topics![0].eventIds.push('missing');
  assert.throws(() => validateCatalog(missing), /专题事件不存在/);
  const foreign = exampleCatalog();
  foreign.topics![0].placeIds.push('qin-city');
  assert.throws(() => validateCatalog(foreign), /时期不可见/);
  const uncovered = exampleCatalog();
  uncovered.topics![0].placeIds = ['changan'];
  assert.throws(() => validateCatalog(uncovered), /未覆盖/);
  const dates = exampleCatalog();
  dates.topics![0].startYear = 756;
  assert.throws(() => validateCatalog(dates), /超出专题时间/);
  const order = exampleCatalog();
  order.topics![0].eventIds.reverse();
  assert.throws(() => validateCatalog(order), /未按年份排序/);
});

test('确证必须有实际原文、有效核验日期与已关联来源，详情携带证据', () => {
  const data = exampleCatalog();
  data.events[0].evidence = [{ id: 'evidence-1', sourceId: 'book', locator: '测试卷一', supports: '测试事实',
    quote: '此句仅为合成测试引文。', status: 'checked', checkedAt: '2026-09-24' }];
  validateCatalog(data);
  assert.equal(getEventDetail(data, 'second')!.event.evidence![0].status, 'checked');
  for (const patch of [{ quote: '' }, { checkedAt: undefined }, { checkedAt: '2026-02-31' },
    { sourceId: 'missing' }, { status: 'verified' }]) {
    const invalid = structuredClone(data);
    Object.assign(invalid.events[0].evidence![0], patch);
    assert.throws(() => validateCatalog(invalid), /证据/);
  }
  const unrelated = structuredClone(data);
  unrelated.sources.push({ ...unrelated.sources[0], id: 'other' });
  unrelated.events[0].evidence![0].sourceId = 'other';
  assert.throws(() => validateCatalog(unrelated), /未关联到实体/);
  const pending = structuredClone(data);
  pending.events[0].evidence![0] = { id: 'pending', sourceId: 'book', locator: '待核章节', supports: '待核事实', status: 'pending' };
  assert.doesNotThrow(() => validateCatalog(pending));
});

test('传统月日精度保持原文，拒绝无效月份、虚构精度与标签矛盾', () => {
  const data = exampleCatalog();
  const event = data.events.find(event => event.id === 'first')!;
  event.time = { year: 755, precision: 'day', calendar: 'traditional-chinese', original: '某载十一月甲子', month: 11, dayLabel: '甲子', certainty: 'recorded' };
  validateCatalog(data);
  for (const patch of [{ year: 756 }, { month: 13 }, { month: 12 }, { precision: 'year' },
    { precision: 'month' }, { dayLabel: '' }, { dayLabel: '乙丑' }, { calendar: 'common-era-year' }]) {
    const invalid = structuredClone(data);
    Object.assign(invalid.events.find(event => event.id === 'first')!.time!, patch);
    assert.throws(() => validateCatalog(invalid), /时间|年份|月份|精度|历法/);
  }
  event.time = { year: 755, precision: 'month', calendar: 'traditional-chinese', original: '某载十一月', month: 11, certainty: 'recorded' };
  assert.doesNotThrow(() => validateCatalog(data));
  event.time = { year: 755, precision: 'year', calendar: 'common-era-year', original: '公元755年', certainty: 'approximate' };
  assert.doesNotThrow(() => validateCatalog(data));
});

test('位置精度不得虚报，细分事件搜索和公元前输入兼容', () => {
  const data = exampleCatalog();
  Object.assign(data.places[0].location!, { accuracy: 'gps' });
  assert.throws(() => validateCatalog(data), /位置精度/);
  Object.assign(data.places[0].location!, { accuracy: 'precise', sourceIds: [] });
  assert.throws(() => validateCatalog(data), /精确位置必须提供来源/);
  assert.ok(searchCatalog(data, 'second').some(result => result.type === 'event' && result.id === 'second'));
  assert.ok(searchCatalog(data, '公元前221年').some(result => result.type === 'event' && result.id === 'qin-event'));
});
