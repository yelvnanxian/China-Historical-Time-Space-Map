#!/usr/bin/env python3
"""Merge reviewed Ming city profiles and dated entries without touching other periods."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PACK=ROOT/'data/evidence/ming-research/geography.json'

def read(p):return json.loads(p.read_text())
def dump(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def main():
 p=read(PACK); sources={s['id']:s for s in p['sources']}; entries={x['catalogPlaceId']:x for x in p['entries'] if x.get('catalogPlaceId')}
 def ev(e):return [{'sourceId':q['sourceId'],'quote':q['quote'],'supports':f"{e['name']}的建置、隶属、附郭县及摘要所述地理沿革。"} for f in e['facts'] for q in f['evidence']]
 def src(s):return {k:s[k] for k in ['id','title','url','retrievedAt','note','snapshotPath','snapshotSha256']}
 profiles=[]
 for pid,e in entries.items():
  research={'id':e['id'],'title':e['name']+' · 建置与史料','summary':e['summary'],'correspondence':'documented-description','findings':e['facts'],'unresolved':e['unresolved']}
  profiles.append({'id':'ming-'+pid,'placeId':pid,'periodId':'ming','summary':e['summary'],'region':e['region'],'namingNote':e['namingNote'],'politicalContext':'本档案概览明代及建国前相关沿革；1582年为地图阅读截面，1391年为近似边界模型年份。《明史》系清代编纂正史，本轮核对仅来自这一文献链，仍需同期方志与实测遗址资料互证。','sourceIds':sorted({q['sourceId'] for f in e['facts'] for q in f['evidence']}),'evidence':ev(e),'historicalResearch':[research]})
 outpath=ROOT/'public/data/city-period-profiles.json'; out=read(outpath)
 out['profiles']=[x for x in out['profiles'] if x['periodId']!='ming']+profiles
 sm={s['id']:s for s in out['sources']};sm.update({i:src(s) for i,s in sources.items()});out['sources']=list(sm.values());out['version']='2.1';dump(outpath,out)
 # A date is provided only where the quoted source actually has a dated event.
 # Entries before 1368 are explicitly labelled as the establishment's late-Yuan prehistory.
 EVENTS={
 'changan':[(1369,'洪武二年三月','奉元路改为西安府','洪武二年三月，奉元路改称西安府。',0),(1370,'洪武三年四月','建立秦王府','洪武三年四月，在长安县所在府城建立秦王府。',1)],
 'luoyang':[(1368,'洪武元年','河南府路改府','洪武元年，河南府路改为河南府。',0),(1391,'洪武二十四年','建立伊王府','洪武二十四年在洛阳建伊王府，嘉靖四十三年废。',1),(1601,'万历二十九年十月','建立福王府','万历二十九年十月在洛阳建立福王府。',1)],
 'beijing':[(1368,'洪武元年八月','大都路改北平府','洪武元年八月，大都路改为北平府。',0),(1403,'永乐元年正月','升北京，改顺天府','永乐元年正月，升为北京，府改称顺天府。',0),(1421,'永乐十九年正月','北京宫殿告成','永乐四年下诏营建的宫殿，到永乐十九年正月告成。',0),(1553,'嘉靖三十二年','营建南部外城','嘉靖三十二年筑重城，包围京城南部并转抱东西角楼。',0)],
 'kaifeng':[(1368,'洪武元年五月、八月','改开封府并建北京','洪武元年五月改称开封府，八月建北京；洪武十一年罢。',0),(1378,'洪武十一年正月','建立周王府','洪武十一年正月在祥符所在府城建立周王府。',1),(1448,'正统十三年','黄河从城西南流过','黄河决荥阳后，向东从城西南流过，史书记城遂位于河的北侧；这是河城相对位置变化。',1)],
 'nanjing':[(1368,'洪武元年八月','建都称南京','洪武元年八月建都，称南京。',0),(1369,'洪武二年九月','开始营建新城','洪武二年九月开始营建新城，六年八月完成。',0),(1390,'洪武二十三年四月','营建外郭','洪武二十三年四月营建外郭，史书另列其十六门，与京城不同。',0),(1403,'永乐元年','恢复南京称号','洪武十一年曾称京师，永乐元年仍称南京。',0)],
 'hangzhou':[(1366,'太祖丙午年十一月（建国前）','杭州路改府','太祖丙午年十一月，杭州路改置杭州府，为明朝建国前的沿革。',0),(1370,'洪武三年四月','建立吴王府','洪武三年四月建吴王府；洪武十一年改封周王并迁开封府。',1)],
 'chengdu':[(1371,'洪武四年','成都路改府','洪武四年，成都路改为成都府。',0),(1378,'洪武十一年','建立蜀王府','《明史》成都县条记洪武十一年建立蜀王府。',1)],
 'guangzhou':[(1368,'洪武元年','广州路改府','洪武元年，广州路改为广州府。',0)],
 'yangzhou':[(1357,'太祖丁酉年十月（建国前）','改称淮海府','太祖丁酉年十月改称淮海府，属于明朝建国前沿革。',0),(1361,'太祖辛丑年十二月（建国前）','改称维扬府','太祖辛丑年十二月改称维扬府，属于明朝建国前沿革。',0),(1366,'太祖丙午年正月（建国前）','定名扬州府','太祖丙午年正月改称扬州府，属于明朝建国前沿革。',0)],
 'xiangyang':[(1391,'洪武二十四年六月','短暂改属河南','襄阳府在洪武二十四年六月改属河南，不久又还属湖广。',0),(1436,'正统元年','襄王府由长沙迁入','正统元年，襄王府由长沙迁至襄阳。',1)],
 'jingzhou':[(1378,'洪武十一年正月','建立湘王府','洪武十一年正月建湘王府，建文元年四月除。',1),(1403,'永乐元年','辽王府迁江陵','永乐元年，辽王府从辽东广宁迁至江陵。',1),(1601,'万历二十九年十月','建立惠王府','万历二十九年十月在江陵建立惠王府。',1)],
 'jinyang':[(1371,'洪武四年','平晋县迁治汾水西','洪武四年，原平晋县迁至汾水西、故晋阳城南关；本条是县治迁移，不是太原府迁治。',2),(1375,'洪武八年','平晋更名太原县','洪武八年，平晋县更名太原县，仍须与府治阳曲区别。',2)],
 'datong':[(1369,'洪武二年','设置大同府','洪武二年设大同府。',0),(1392,'洪武二十五年三月','建立代王府','洪武二十五年三月在大同建立代王府。',1),(1392,'洪武二十五年八月','行都司迁治大同','山西行都指挥使司在洪武二十五年八月迁治大同府。',2)],
 'linzi':[(1367,'太祖吴元年（建国前）','上级益都路改青州府','临淄所属地区的元益都路在吴元年改青州府；这是上级政区变更，不是临淄县城新建。',0)],
 'handan':[(1368,'洪武元年','邯郸转属广平府','邯郸由元代磁州所属转入广平府。',1)],
 'tongguan':[(1374,'洪武七年','置潼关千户所','洪武七年设置潼关守御千户所。',0),(1376,'洪武九年十一月','潼关升卫','潼关守御千户所升卫，属河南都司。',0),(1408,'永乐六年','直隶中军都督府','永乐六年，潼关卫直隶中军都督府。',0)],
 'yinchuan':[(1370,'洪武三年','设置宁夏府','洪武三年设置宁夏府，五年废府。',0),(1393,'洪武二十六年七月','设置宁夏卫','洪武二十六年七月置宁夏卫，二十八年四月罢。',0),(1403,'永乐元年正月','恢复宁夏卫','永乐元年正月复置宁夏卫。',0)],
 'quanzhou':[(1368,'洪武元年','泉州路改府','洪武元年泉州路改为泉州府。',0),(1388,'洪武二十一年二月','增设永宁卫与福泉所','晋江县条记洪武二十一年二月置永宁卫及守御福泉千户所；地点分列在县东南和南部，不表示两者都在府城。',1)],
 'dali':[(1382,'洪武十五年三月','大理路改府','洪武十五年三月，大理路改为大理府。',0)],
 'suzhou':[(1367,'太祖吴元年九月（建国前）','平江路改苏州府','吴元年九月，平江路改苏州府，为明朝建国前沿革。',0)],
 'qizhou-jinan':[(1367,'太祖吴元年（建国前）','济南路改府','太祖吴元年，济南路改为济南府。',0),(1368,'洪武元年四月','设置山东行中书省','洪武元年四月设山东行中书省，治济南府。',2),(1376,'洪武九年六月','改山东布政司','洪武九年六月将山东行中书省改为承宣布政使司。',2)],
 'yanzhou':[(1370,'洪武三年四月','建立鲁王府','洪武三年四月建立鲁王府。',1),(1385,'洪武十八年','兖州升府、恢复附郭县','洪武十八年兖州升府，原先省入州的嵫阳县随之复置，成化年间再改称滋阳。',0)],
 'ezhou-jiangxia':[(1364,'太祖甲辰年二月（建国前）','武昌路改府','太祖甲辰年二月武昌路改为武昌府，为明朝建国前沿革。',0),(1370,'洪武三年四月','黄龙山建立楚王府','洪武三年四月，在城内黄龙山建立楚王府。',1)],
 'fuzhou-fujian':[(1367,'太祖吴元年（建国前）','福州路改府','太祖吴元年，福州路改为福州府。',0),(1369,'洪武二年五月','设置福建行中书省','洪武二年五月仍置福建行中书省；地理志在福州地区记述其治所。',3),(1376,'洪武九年六月','改福建布政司','洪武九年六月，福建行中书省改为承宣布政使司。',3)],
 # No invented exact date for Chongqing: the text only says 洪武中.
 'guizhou-guilin':[(1370,'洪武三年七月','独秀峰前建靖江王府','洪武三年七月在独秀峰前建立靖江王府。',1),(1372,'洪武五年六月','改称桂林府','洪武五年六月，府名改为桂林。',0)],
 'mingzhou':[(1367,'太祖吴元年十二月（建国前）','庆元路改明州府','吴元年十二月改庆元路为明州府，属于明朝建国前沿革。',0),(1381,'洪武十四年二月','明州府改宁波府','洪武十四年二月，明州府改名宁波府。',0),(1386,'洪武十九年十一月','置龙山千户所','鄞县条记洪武十九年十一月置龙山守御千户所。',1)],
 'hongzhou':[(1362,'太祖壬寅年正月（建国前）','龙兴路改洪都府','太祖壬寅年正月改龙兴路为洪都府。',0),(1363,'太祖癸卯年八月（建国前）','洪都府改南昌府','太祖癸卯年八月改称南昌府。',0),(1378,'洪武十一年','建立豫王府','洪武十一年建立豫王府，二十五年改封代王并迁大同。',1),(1519,'正德十四年','宁王府除','地理志记永乐初宁王府由大宁迁来，至正德十四年除；本条不扩写战役过程。',1)],
 }
 timelines=[]
 for pid,rows in EVENTS.items():
  e=entries[pid];quotes=[q for f in e['facts'] for q in f['evidence']]
  for idx,(year,date,title,summary,qi) in enumerate(rows):
   used=[quotes[qi]]
   if pid=='yanzhou' and year==1385:used=quotes[:2]
   timelines.append((pid,{'id':f'ming-timeline-{pid}-{year}-{idx}','year':year,'dateLabel':date,'title':title,'summary':summary,'sourceIds':sorted({q['sourceId'] for q in used}),'evidence':[{'sourceId':q['sourceId'],'quote':q['quote'],'supports':'本条所述纪年、建置变化及限定范围。'} for q in used]}))
 outpath=ROOT/'public/data/historical-context.json';out=read(outpath)
 for t in out['cityTimelines']:t['entries']=[e for e in t['entries'] if not e['id'].startswith('ming-timeline-')]
 tm={t['placeId']:t for t in out['cityTimelines']}
 merge_ids={'ming-timeline-nanjing-1368-0':'nanjing-ming-1368','ming-timeline-dali-1382-0':'dali-context-2-1382'}
 merged=0
 for pid,e in timelines:
  target=tm.setdefault(pid,{'placeId':pid,'entries':[]})
  old=next((item for item in target['entries'] if item['id']==merge_ids.get(e['id'])),None)
  if old:
   old['sourceIds']=sorted(set(old['sourceIds']+e['sourceIds']))
   keys={(q['sourceId'],q['quote']) for q in old['evidence']}
   old['evidence'] += [q for q in e['evidence'] if (q['sourceId'],q['quote']) not in keys]
   if pid=='nanjing':
    old['title']='明朝建都应天'
    old['summary']='1368年朱元璋建立明朝，以应天为京师；《明史》记洪武元年八月建都，称南京。'
   merged+=1
  else:target['entries'].append(e)
 secondary=next(item for item in tm['nanjing']['entries'] if item['id']=='nanjing-secondary-1421')
 secondary['title']='迁都北京后的南京陪都'
 secondary['summary']='明成祖迁都北京后，应天府作为南京陪都，设南京六部等机构。南京称号在永乐元年（1403年）已恢复，本条记录1421年迁都后的地位，不表示此年首次改名。'
 primary=entries['nanjing']['facts'][0]['evidence'][0]
 secondary['sourceIds']=sorted(set(secondary['sourceIds']+[primary['sourceId']]))
 if not any(q['sourceId']==primary['sourceId'] and q['quote']==primary['quote'] for q in secondary['evidence']):
  secondary['evidence'].append({'sourceId':primary['sourceId'],'quote':primary['quote'],'supports':'永乐元年（1403年）已恢复南京称号；1421年节点不可被理解为首次命名南京。'})
 capital=next(item for item in tm['beijing']['entries'] if item['id']=='beijing-ming-1421')
 capital['summary']='朱棣在永乐十九年正月（1421年）正式迁都北京，以顺天府北京为京师。本条记录都城职能的迁移；《明史》记应天府在永乐元年（1403年）已恢复南京称号，不能理解为1421年才首次称南京。'
 capital['sourceIds']=sorted(set(capital['sourceIds']+[primary['sourceId']]))
 for citation in capital['evidence']:
  if citation['sourceId']=='context-beijing-history':
   citation['supports']='本百科概述支持1421年正月迁都北京、以北京为京师；其改称南京的简述需结合《明史》所记1403年恢复称号阅读。'
 if not any(q['sourceId']==primary['sourceId'] and q['quote']==primary['quote'] for q in capital['evidence']):
  capital['evidence'].append({'sourceId':primary['sourceId'],'quote':primary['quote'],'supports':'永乐元年（1403年）已恢复南京称号；北京1421年迁都节点不表示应天府此年才首次称南京。'})
 for t in tm.values():t['entries'].sort(key=lambda e:(e['year'],e['id']))
 out['cityTimelines']=list(tm.values());sm={s['id']:s for s in out['sources']};sm.update({i:src(s) for i,s in sources.items()});out['sources']=list(sm.values());out['version']='1.3'
 note='明代28个城市入口增加地理志档案与纪年；重庆仅有“洪武中”，未编造确年节点。太原入口为太原县，府治阳曲另作区别。'
 if note not in out['notes']:out['notes'].append(note)
 dump(outpath,out)
 audit={'profileCount':len(profiles),'datedEntryCount':len(timelines),'newDatedEntryCount':len(timelines)-merged,'mergedExistingEntryCount':merged,'clarifiedExistingEntryCount':2,'datedPlaceCount':len(EVENTS),'noExactDatedEntry':['yuzhou-chongqing'],'cityIds':sorted(entries),'sources':len(sources),'note':'未改写其他朝代档案、大事记，也未改动坐标或几何；同事件旧节点ID保留并合并证据，北京迁都与南京陪都两个1421年旧节点均区分1403年恢复南京名称；其他新增节点使用独立ming-timeline前缀。'}
 dump(ROOT/'data/evidence/ming-research/content-audit.json',audit);print(audit)
if __name__=='__main__':main()
