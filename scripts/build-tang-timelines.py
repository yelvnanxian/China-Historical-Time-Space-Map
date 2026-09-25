#!/usr/bin/env python3
"""Build reviewed, dated Tang city events from cached, hashed source snapshots.

The dated selections are editorial choices, not an automatic year extractor.
Every selection names its own source section and exact date. Undated comments,
initial/middle-era labels and suspicious source chronology are not assigned years.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
from urllib.parse import quote as urlquote
from tang_content import load_bundles, ROOT, SOURCE_KEYS

_, all_sources, profiles, _ = load_bundles()
texts = {sid: (ROOT / s['snapshotPath']).read_text() for sid, s in all_sources.items()}
places = {p['id']: p for p in json.loads((ROOT / 'data/catalog.json').read_text())['places']}
timelines, used_sources, selections = {}, {}, []
issues = []
ERA_START = {'武德':618,'貞觀':627,'永徽':650,'顯慶':656,'龍朔':661,'麟德':664,'乾封':666,'咸亨':670,
             '儀鳳':676,'永淳':682,'光宅':684,'垂拱':685,'天授':690,'如意':692,'長壽':692,'聖曆':698,
             '久視':700,'大足':701,'長安':701,'神龍':705,'景龍':707,'景雲':710,'先天':712,'開元':713,
             '天寶':742,'至德':756,'乾元':758,'寶應':762,'廣德':763,'永泰':765,'大曆':766,'建中':780,
             '興元':784,'貞元':785,'元和':806,'長慶':821,'寶曆':825,'大和':827,'開成':836,'會昌':841,
             '大中':847,'咸通':860,'乾符':874,'廣明':880,'中和':881,'光啟':885,'文德':888,'龍紀':889,
             '大順':890,'景福':892,'乾寧':894,'光化':898,'天復':901,'天祐':904,'調露':679}

def number(text):
    if text == '元': return 1
    digits = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
    if '十' in text:
        a,b = text.split('十'); return (digits[a] if a else 1)*10+(digits[b] if b else 0)
    return digits[text]

def source_id(volume):
    return f'tang-{"se" if volume == 41 else "nw"}-jiutangshu-{volume}'

def section(volume, heading):
    sid = source_id(volume)
    # Exact heading + long first paragraph avoids homonymous counties and the
    # frequently repeated state-to-commandery wording in unrelated sections.
    rows = [line for line in texts[sid].splitlines() if line.startswith(heading) and len(line) > 60 and line[len(heading):len(heading)+1] in ' ，' and (heading != '成都' or line.startswith('成都 府，'))]
    if len(rows) != 1:
        issues.append(('section',volume,heading,len(rows)))
        return sid, ''
    return sid, rows[0]

def record(place, year, label, title, summary, sid, quote, note=None):
    assert 618 <= year <= 907 and quote in texts[sid], (place, year, quote)
    entry = {'id': f'tang-timeline-{place}-{year}-{len(timelines.get(place, []))+1}', 'year':year,
             'dateLabel': label, 'title': title, 'summary': summary, 'sourceIds':[sid],
             'evidence':[{'sourceId':sid,'quote':quote,'supports':note or '该城市或所附州府在所标年份的建置、名称及叙述事实。'}]}
    timelines.setdefault(place, []).append(entry)
    used_sources[sid] = {key:all_sources[sid][key] for key in SOURCE_KEYS}
    return entry

def state(place, volume, heading, dates):
    sid, paragraph = section(volume, heading)
    for spec in dates:
        # (date, title[, override year[, exact end]])
        date, title, *extra = spec
        match = re.fullmatch(r'(.+?)(元|[一二三四五六七八九十]+)(?:年|載)(?:.*)', date)
        assert match, date
        era, n = match.groups()
        year = extra[0] if extra else ERA_START[era] + number(n) - 1
        if date not in paragraph:
            issues.append(('date',place,volume,heading,date)); continue
        start = paragraph.index(date)
        end = paragraph.find('。', start)
        assert end != -1
        quote = paragraph[start:end+1]
        if len(extra) > 1:
            end = paragraph.index(extra[1], start) + len(extra[1]); quote = paragraph[start:end]
        if place == 'yingzhou-hejian' and date == '武德四年':
            quote = quote.split('，五年')[0] + '，'
        action = quote[len(date):].lstrip('，、 ')
        if '改用郡名' in title:
            renamed = re.search(r'(?:改.*?為|為)([^，。]+郡)', action)
            if renamed: title = f'{heading}改称{renamed.group(1)}'
        # The summary retains the attested concrete changes, including place
        # lists. It does not add a modern date precision or inferred consequence.
        summary = f'{date}，{action}'
        record(place,year,f'{date}（{year}年）',title,summary,sid,quote)
        selections.append({'placeId':place,'sourceId':sid,'sourceHeading':heading,'dateText':date,'year':year,'quote':quote})

# Two capitals, northern cities and the western corridor. County/fort/story
# entries get their own selections below rather than inheriting a parent title.
state('changan',38,'京兆府',[('開元元年','雍州升为京兆府'),('天寶元年','京师改称西京')])
state('luoyang',38,'河南府',[('武德四年','设洛州总管府'),('顯慶二年','设置东都'),('光宅元年','东都改称神都'),('神龍元年','恢复东都名称'),('開元元年','洛州升为河南府'),('天寶元年','东都改称东京')])
for pid in ['beijing','fanyang']:
    state(pid,39,'幽州',[('武德元年','设幽州总管府'),('開元十三年','幽州升大都督府'),('天寶元年','幽州改称范阳郡'),('乾元元年','恢复幽州名称')])
state('jinyang',39,'北京',[('龍朔二年','并州升大都督府'),('天授元年','设置北都'),('開元十一年','并州升太原府并置北都'),('天寶元年','北都改称北京')])
state('datong',39,'雲州',[('貞觀十四年','云州及定襄县迁入旧恒安镇'),('永淳元年','云州废撤，居民迁往朔州'),('開元二十年','重新设置云州'),('天寶元年','改称云中郡'),('乾元元年','恢复云州名称')])
state('dunhuang',40,'沙州',[('武德二年','敦煌地区置瓜州'),('貞觀七年','西沙州去西字，称沙州'),('天寶元年','改称敦煌郡'),('乾元元年','恢复沙州名称')])
state('lingwu',38,'靈州',[('武德元年','恢复灵州建制'),('天寶元年','改称灵武郡')])
state('suiyang',38,'宋州',[('武德四年','设宋州'),('天寶元年','宋州改称睢阳郡'),('乾元元年','恢复宋州名称')])
state('xiangzhou',39,'相州',[('武德元年','魏郡改为相州'),('天寶元年','改称邺郡'),('乾元元年','恢复相州名称')])
state('heyang',38,'孟州',[('顯慶二年','河阳县划归河南府'),('會昌三年九月','河阳升为孟州',843,'其河陽望昇為孟州，仍為望，河陽等五縣改為望縣。'),('會昌四年','河阳节度使迁治孟州')])
state('shanzhou',38,'陝州',[('武德元年','设陕州总管府'),('天寶元年','陕州改称陕郡'),('乾元元年','恢复陕州并调整领县'),('廣德元年十月','代宗避驻陕州，州升大都督府')])
state('zhengzhou',38,'鄭州',[('武德四年','郑州初置武牢'),('貞觀元年','管州撤并，管城等县划入郑州')])
state('huazhou-hua',38,'滑州',[('武德元年','以古滑台得名，改置滑州'),('天寶元年','滑州改称灵昌郡'),('乾元元年','恢复滑州名称')])
state('huaizhou',39,'懷州',[('武德二年','河内地区设怀州'),('顯慶二年','河阳等四县划归洛州'),('乾元元年','恢复怀州名称')])
state('hengzhou',39,'鎮州',[('天寶元年','恒州改称常山郡'),('乾元元年','恢复恒州名称'),('興元元年','恒州升都督府'),('元和十五年','恒州改称镇州')])
state('beizhou',39,'貝州',[('武德四年','清河郡改为贝州'),('天寶元年','改称清河郡'),('乾元元年','恢复贝州名称')])
state('pingyuan',39,'德州',[('武德四年','平原郡改为德州'),('天寶元年','德州改称平原郡'),('乾元元年','恢复德州名称')])
state('fuzhou-fu',38,'鄜州',[('武德元年','上郡改为鄜州'),('貞觀二年','鄜州设置都督府'),('天寶元年','改称洛交郡'),('乾元元年','恢复鄜州名称')])
state('luzhou',39,'潞州',[('武德元年','上党地区改置潞州'),('開元十七年','因玄宗曾任职，置大都督府'),('天寶元年','改称上党郡'),('乾元元年','恢复潞州名称')])
state('dengzhou',39,'鄧州',[('武德二年','南阳郡改为邓州'),('天寶元年','邓州改称南阳郡'),('乾元元年','恢复邓州名称')])
state('xuzhou-xuchang',38,'許州',[('武德四年','颍川郡改为许州'),('天寶元年','许州改称颍川郡'),('乾元元年','恢复许州名称')])
state('xuzhou-pengcheng',38,'徐州',[('武德四年','彭城郡改为徐州'),('天寶元年','徐州改称彭城郡'),('乾元元年','恢复徐州名称')])
state('fengxiang',38,'鳳翔府',[('武德元年','扶风地区改置岐州'),('天寶元年','岐州改称扶风郡'),('至德二年','肃宗进驻扶风郡')])
state('tongzhou-dali',38,'同州',[('武德元年','冯翊郡改为同州'),('天寶元年','同州改称冯翊郡'),('乾元元年','恢复同州名称'),('乾元三年','朝邑等县划入河中府')])
state('huazhou-shaanxi',38,'華州',[('武德元年','设置华州'),('神龍元年','太州恢复华州旧名'),('天寶元年','华州改称华阴郡'),('乾元元年','恢复华州名称'),('寶應元年','太州再次恢复华州名称')])
state('puzhou',39,'河中',[('武德元年','蒲州初置桑泉'),('開元八年','蒲州升河中府，一度号中都'),('天寶元年','改称河东郡'),('乾元元年','恢复蒲州名称')])
state('jiangzhou',39,'絳州',[('武德元年','设绛州总管府')])
state('weizhou-daming',39,'魏州',[('武德四年','恢复魏州建制'),('天寶元年','魏州改称魏郡'),('乾元元年','恢复魏州名称')])
state('bozhou-liaocheng',39,'博州',[('武德四年','聊城地区设置博州'),('天寶元年','改称博平郡'),('乾元元年','恢复博州名称')])
state('qizhou-jinan',38,'齊州',[('天寶元年','齐州短暂改称临淄郡'),('乾元元年','恢复齐州名称')])
state('yanzhou',38,'兗州',[('武德五年','设置兖州'),('天寶元年','兖州改称鲁郡'),('乾元元年','恢复兖州名称')])
state('qingzhou',38,'青州',[('武德四年','设青州总管府'),('天寶元年','青州改称北海郡'),('乾元元年','恢复青州名称')])
state('dengzhou-penglai',38,'登州',[('如意元年','分置登州，初治牟平'),('神龍三年','登州迁治蓬莱'),('天寶元年','改称东牟郡'),('乾元元年','恢复登州名称')])
state('liangzhou-wuwei',40,'涼州',[('武德二年','设凉州总管府'),('天寶元年','改称武威郡'),('乾元元年','恢复凉州名称')])
state('ganzhou-zhangye',40,'甘州',[('武德二年','张掖地区设置甘州'),('天寶元年','改称张掖郡'),('乾元元年','恢复甘州名称')])
state('suzhou-jiuquan',40,'肅州',[('武德二年','分置肃州'),('貞觀元年','撤销肃州都督府'),('天寶元年','改称酒泉郡'),('乾元元年','恢复肃州名称')])
state('guazhou-jinchang',40,'瓜州',[('武德五年','在常乐地区设置瓜州'),('天寶元年','改称晋昌郡'),('乾元元年','恢复瓜州名称')])
state('xizhou-gaochang',40,'西州',[('天寶元年','西州改称交河郡'),('乾元元年','恢复西州名称')])
state('yizhou-hami',40,'伊州',[('貞觀四年','设置西伊州'),('天寶元年','伊州改称伊吾郡'),('乾元元年','恢复伊州名称')])
state('kaifeng',38,'汴州',[('武德四年','汴州设置总管府'),('天寶元年','汴州改称陈留郡'),('乾元元年','恢复汴州名称'),('建中二年','修筑汴州罗城')])

# Lower Yangtze, Jiangnan, Sichuan and Lingnan.
state('chengdu',41,'成都',[('龍朔二年','益州升大都督府'),('天寶元年','益州改称蜀郡'),('至德二年十月','蜀郡升为成都府'),('廣德元年','严武再任成都尹，东西川节度合并')])
state('guangzhou',41,'廣州',[('武德四年','设广州总管府'),('天寶元年','广州改称南海郡'),('乾元元年','恢复广州名称')])
state('yangzhou',40,'揚州',[('貞觀十年','扬州大都督改为都督'),('龍朔二年','扬州升大都督府'),('天寶元年','改称广陵郡'),('乾元元年','恢复扬州名称')])
state('xiangyang',39,'襄州',[('武德四年','襄阳郡改为襄州'),('天寶元年','襄州改称襄阳郡'),('乾元元年','恢复襄州名称'),('上元二年','设置襄州节度使',761)])
state('jingzhou',39,'荊州',[('天寶元年','荆州改称江陵郡'),('乾元元年三月','恢复荆州大都督府'),('上元元年九月','置南都，荆州升江陵府',760)])
for pid,heading,start,title in [
    ('hangzhou','杭州','武德四年','设置杭州'),('suzhou','蘇州','武德四年','设置苏州'),
    ('runzhou','潤州','武德三年','丹徒县设置润州'),('yuezhou','越州','武德四年','设越州总管府'),
    ('mingzhou','明州','開元二十六年','由越州鄮县分置明州'),('huzhou','湖州','武德四年','设置湖州'),
    ('wuzhou-jinhua','婺州','武德四年','设置婺州'),('hongzhou','洪州','武德五年','设洪州总管府'),
    ('jiangzhou-jiujiang','江州','武德四年','设置江州'),('tanzhou','潭州','武德四年','设潭州总管府'),
    ('hengzhou-hunan','衡州','武德四年','设置衡州'),('ezhou-jiangxia','鄂州','武德四年','江夏郡改为鄂州'),
    ('shezhou','歙州','武德四年','设歙州总管府'),('shouzhou','壽州','武德三年','淮南郡改为寿州'),
    ('luzhou-hefei','廬州','武德三年','庐江郡改为庐州'),('changzhou','常州','武德三年','设置常州'),
]:
    state(pid,40,heading,[(start,title),('天寶元年',f'{heading}改用郡名'),('乾元元年',f'恢复{heading}名称')])
state('quanzhou',40,'泉州',[('景雲二年','武荣州改称泉州'),('開元二十九年','龙溪县划归漳州'),('天寶元年','泉州改称清源郡'),('乾元元年','恢复泉州名称')])
state('fuzhou-fujian',40,'福州',[('景雲二年','改称闽州，设置都督府'),('開元十三年','闽州改为福州并置经略使'),('乾元元年','恢复福州都督府')])
state('wenzhou',40,'溫州',[('武德五年','永嘉地区置东嘉州'),('貞觀元年','废东嘉州，诸县归括州'),('上元二年','分永嘉、安固二县置温州',675),('天寶元年','温州改称永嘉郡'),('乾元元年','恢复温州名称')])
state('xuanzhou',40,'宣州',[('武德三年','设置宣州总管府',620,'置宣州總管府。'),('貞觀元年','撤销宣州都督府'),('天寶元年','宣州改称宣城郡'),('永泰元年','分秋浦等三县设置池州')])
for pid,heading,start,title in [
    ('zizhou','梓州','武德元年','改置梓州'),('hanzhou','漢州','垂拱二年','由益州分置汉州'),
    ('jianzhou','劍州','先天二年','始州改称剑州'),('suizhou-suining','遂州','武德元年','设置遂州'),
    ('guizhou-guilin','桂州','武德四年','设桂州总管府'),('liuzhou','柳州','武德四年','马平地区设置昆州'),
    ('yongzhou-nanning','邕州','武德五年','宣化地区设置南晋州'),
]:
    state(pid,41,heading,[(start,title),('聖曆二年','州境设置剑门县') if pid=='jianzhou' else ('天寶元年',f'{heading}改用郡名'),('乾元元年',f'恢复{heading}名称')])
state('hanzhong',39,'梁州',[('武德元年','设梁州总管府'),('開元十三年','梁州改称褒州'),('天寶元年','改称汉中郡'),('乾元元年','恢复梁州名称'),('興元元年六月','梁州升为兴元府')])
state('kuizhou',39,'夔州',[('武德元年','巴东郡改置信州'),('貞觀十四年','夔州设置都督府'),('天寶元年','夔州改称云安郡'),('乾元元年','恢复夔州名称')])
state('yuzhou-chongqing',39,'渝州',[('武德元年','巴郡改为渝州'),('貞觀十三年','南平县划归渝州'),('天寶元年','渝州改称南平郡')])
state('langzhou',41,'閬州',[('武德元年','巴西郡改为隆州'),('天寶元年','阆州改称阆中郡'),('乾元元年','恢复阆州名称')])

# Cities joining the main regional groups.
for pid,vol,heading,start,title in [
 ('cangzhou',39,'滄州','武德元年','渤海郡改为沧州'),('yingzhou-hejian',39,'瀛州','武德四年','河间郡改为瀛州'),
 ('dingzhou',39,'定州','武德四年','博陵地区置定州'),('yizhou-hebei',39,'易州','開元二十三年','分置五回、楼亭、板城三县'),
 ('chenzhou-huaiyang',38,'陳州','武德元年','淮阳郡改为陈州'),('bozhou-qiao',38,'亳州','貞觀元年','撤销都督府，保留亳州'),
 ('yuezhou-baling',40,'岳州','武德四年','巴陵郡改为巴州'),('jizhou-luling',40,'吉州','武德五年','设置吉州'),
 ('qianzhou-gan',40,'虔州','武德五年','设置虔州'),('shaozhou',41,'韶州','貞觀元年','改置韶州'),
 ('qianzhou-wuling',40,'黔州','武德元年','黔安郡改为黔州'),
]:
    state(pid,vol,heading,[(start,title),('天寶元年',f'{heading}改用郡名'),('乾元元年',f'恢复{heading}名称')])
state('caizhou-runan',38,'蔡州',[('天寶元年','豫州改称汝南郡'),('乾元元年','恢复豫州名称'),('寶應元年','豫州改称蔡州')])
state('yingzhou-liaoxi',39,'營州',[('開元四年','营州还治柳城'),('天寶元年','营州改称柳城郡'),('乾元元年','恢复营州名称')])

if issues:
    print(json.dumps(issues,ensure_ascii=False,indent=2))
    raise SystemExit(1)

# Additional exact quotations are loaded separately for county events, culture,
# inherited era dates and cases whose source layout is not a state paragraph.
manual = ROOT / 'data/tang-timeline-selections.json'
if manual.exists():
    for item in json.loads(manual.read_text()):
        record(item['placeId'],item['year'],item['dateLabel'],item['title'],item['summary'],item['sourceId'],item['quote'],item.get('supports'))

# Reuse actual checked catalog events without recertifying unrelated excerpts.
catalog = json.loads((ROOT / 'data/catalog.json').read_text())
target_ids = {p['placeId'] for p in profiles}
for event in catalog['events']:
    if 'tang' not in event.get('periodIds', []) or not event['id'].startswith('anshi-'): continue
    evidence = [item for item in event.get('evidence',[]) if item.get('status') == 'checked']
    if not evidence: continue
    for pid in event['placeIds']:
        if pid not in target_ids: continue
        local_evidence = []
        for ev in evidence:
            sid = ev['sourceId']
            metadata = json.loads((ROOT / 'data/evidence' / (sid+'.json')).read_text())
            snapshot = ROOT / metadata['snapshotPath']
            assert ev['quote'] in snapshot.read_text()
            snapshot_hash = hashlib.sha256(snapshot.read_bytes()).hexdigest()
            if 'snapshotSha256' in metadata: assert snapshot_hash == metadata['snapshotSha256']
            original = next(s for s in catalog['sources'] if s['id']==sid)
            used_sources[sid] = {'id':sid,'title':original['title'],'url':('https://zh.wikisource.org/w/index.php?title='+urlquote(metadata['page'])+'&oldid='+str(metadata['revisionId'])),'retrievedAt':metadata['retrievedAt'],
                'note':'复用已核对的古籍原文；排序年份不等于农历月日的逐日公历换算。','snapshotPath':metadata['snapshotPath'],'snapshotSha256':snapshot_hash}
            local_evidence.append({k:ev[k] for k in ['sourceId','quote','supports']})
        timelines.setdefault(pid,[]).append({'id':'chronicle-'+event['id'], 'year':event['year'],'dateLabel':event['dateLabel'],
             'title':event['title'],'summary':event['summary'],'sourceIds':list(dict.fromkeys(e['sourceId'] for e in local_evidence)),
             'relatedEventId':event['id'],'evidence':local_evidence})

result = {'version':'1.0','sources':list(used_sources.values()), 'cityTimelines':[{'placeId':pid,'entries':sorted(entries,key=lambda e:(e['year'],e['id']))} for pid,entries in timelines.items()]}
# Convert only rendered labels and summaries; literal evidence remains original.
convert_js = """import fs from 'node:fs'; import {Converter} from 'opencc-js/t2cn';
const c=Converter({from:'t',to:'cn'});const d=JSON.parse(fs.readFileSync(0,'utf8'));
for(const t of d.cityTimelines) for(const e of t.entries) for(const k of ['dateLabel','title','summary']) e[k]=c(c(e[k]));
process.stdout.write(JSON.stringify(d,null,2)+'\\n');"""
converted = subprocess.run(['node','--input-type=module','-e',convert_js],input=json.dumps(result,ensure_ascii=False),capture_output=True,text=True,cwd=ROOT,check=True).stdout
(ROOT/'data/tang-city-timelines.json').write_text(converted)
out = ROOT / 'data/evidence/tang-timelines'; out.mkdir(exist_ok=True)
coverage = [{'placeId':p['placeId'],'name':places[p['placeId']]['name'],'entryCount':len(timelines.get(p['placeId'],[])),
             'datedYears':sorted({e['year'] for e in timelines.get(p['placeId'],[])})} for p in profiles]
report = {'targetCount':len(coverage),'coveredCount':sum(r['entryCount']>0 for r in coverage),'threeOrMoreCount':sum(len(r['datedYears'])>=3 for r in coverage),
          'entryCount':sum(r['entryCount'] for r in coverage),'coverage':coverage,
          'note':'只收录有直接纪年依据的事件；古籍初、中等概略年号不自动转换成元年。已存在的跨朝大事记在集成时完整保留。'}
(out/'coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
(out/'dated-selections.json').write_text(json.dumps(selections,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='coverage'},ensure_ascii=False))
print('Fewer than 3 distinct years:',[(r['placeId'],r['entryCount'],r['datedYears']) for r in coverage if len(r['datedYears'])<3])
