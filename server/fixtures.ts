import type { Catalog, HistoricalEvent, Period, Place } from '../shared/types';

/** Small synthetic records keep behavior tests independent of editorial updates. */
export function exampleCatalog(): Catalog {
  const period = (id: string, startYear: number, endYear: number, year: number): Period => ({
    id, name: id, label: id, startYear, endYear, year, color: '#809070',
    subtitle: '测试时期', description: '用于行为测试', regimeIds: [],
  });
  const place = (id: string, periodId: string): Place => ({
    id, name: id, modernName: `今${id}`, coordinates: [110, 35], type: 'city',
    summary: '测试地点', aliases: [], periodIds: [periodId], sourceIds: ['book'],
    location: { accuracy: 'approximate', note: '测试地区入口', sourceIds: ['book'] },
  });
  const event = (id: string, year: number, periodId: string, placeId: string): HistoricalEvent => ({
    id, title: id, year, dateLabel: `${year}年`, summary: '测试事件', category: '测试',
    placeIds: [placeId], periodIds: [periodId], personNames: [], sourceIds: ['book'],
  });
  return {
    periods: [period('qin', -221, -207, -221), period('tang', 618, 907, 755), period('song', 960, 1279, 1200)],
    regimes: [],
    places: [place('changan', 'tang'), place('fanyang', 'tang'), place('qin-city', 'qin'), place('song-city', 'song')],
    events: [event('second', 756, 'tang', 'changan'), event('first', 755, 'tang', 'fanyang'),
      event('outside-topic', 700, 'tang', 'changan'), event('qin-event', -221, 'qin', 'qin-city')],
    sources: [{ id: 'book', title: '测试参考', author: '测试', locator: '测试章节', note: '此记录不是历史资料',
      url: 'https://example.com/test-source', verification: 'reference' }],
    topics: [{ id: 'anshi', title: '测试专题', subtitle: '测试', description: '用于状态测试', periodId: 'tang',
      startYear: 755, endYear: 763, placeIds: ['fanyang', 'changan'], eventIds: ['first', 'second'] }],
    metadata: { title: '测试', version: 'test', dataNotice: '合成测试数据', geographicNotice: '合成测试坐标' },
  };
}
