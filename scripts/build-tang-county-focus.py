#!/usr/bin/env python3
"""Build three closely read cases; preserve contradictory dates as findings."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/evidence/tang-county-research'
SOURCES = OUT / 'focus-sources'


def build():
    sources = [json.loads((SOURCES / f'{key}.json').read_text()) for key in
               ('xintangshu-40', 'xintangshu-41', 'xintangshu-43a', 'yuanhe-21', 'yuanhe-27', 'songshi-88', 'songshi-90')]
    title_names = {'新唐書': '新唐书', '元和郡縣圖志': '元和郡县图志'}
    for source in sources:
        for old, new in title_names.items():
            source['title'] = source['title'].replace(old, new)
    original = json.loads((ROOT / 'data/evidence/tang-detail/county-location-historical-references.json').read_text())
    for source in original['sources']:
        if source['id'] in ('tang-nw-jiutangshu-39', 'tang-nw-jiutangshu-40', 'tang-se-jiutangshu-41'):
            sources.append({**source, 'kind': 'official-history', 'title': source['title'].replace('舊唐書', '旧唐书')})
    records = original['sourceRecords']
    record_text = '\n\n'.join('\n'.join(f'{field}={item["record"][field]}' for field in
                                      ('SYS_ID', 'NAME_CH', 'PRES_LOC', 'BEG_YR', 'END_YR', 'BEG_CHG_TY', 'END_CHG_TY', 'X_COOR', 'Y_COOR'))
                              for item in records) + '\n'
    record_path = SOURCES / 'chgis-focus-records.txt'
    record_path.write_text(record_text)
    sources.append({'id': 'county-focus-chgis', 'title': 'CHGIS V6 原始县治记录摘录', 'kind': 'dataset',
                    'url': 'https://doi.org/10.7910/DVN/Q9VOF5', 'snapshotPath': str(record_path.relative_to(ROOT)),
                    'snapshotSha256': hashlib.sha256(record_path.read_bytes()).hexdigest(), 'retrievedAt': '2026-09-25',
                    'derivedFrom': 'data/evidence/tang-detail/county-location-historical-references.json'})
    dictionary_path = ROOT / 'data/evidence/tang-detail/chgis/dictionary-extract.json'
    sources.append({'id': 'county-focus-chgis-dictionary', 'title': 'CHGIS V6 官方数据字典·end_year', 'kind': 'dataset',
                    'url': 'https://doi.org/10.7910/DVN/SNCEAU', 'snapshotPath': str(dictionary_path.relative_to(ROOT)),
                    'snapshotSha256': hashlib.sha256(dictionary_path.read_bytes()).hexdigest(), 'retrievedAt': '2026-09-25'})
    source_by_id = {source['id']: source for source in sources}

    def citation(key, quote, locator):
        source_id = key if key.startswith('tang-') else 'county-focus-' + key
        text = (ROOT / source_by_id[source_id]['snapshotPath']).read_text()
        assert quote in text, (key, quote)
        line = text[:text.index(quote)].count('\n') + 1
        return {'sourceId': source_id, 'quote': quote, 'locator': f'{locator}；归档文本第{line}行'}

    def finding(topic, statement, *evidence):
        return {'topic': topic, 'statement': statement, 'evidence': list(evidence)}

    def area(number):
        return f'hartwell-741-county-v5_0741_chin_chn_0741_c-{number}'

    entries = [
        {'id': 'county-focus-tangcheng', 'settlementIds': ['chgis-county-43627'], 'boundaryIds': [area(695)],
         'title': '唐城县：建置年份有异文，方位记载不能代替县界', 'correspondence': 'same-unit',
         'summary': '随州唐城县的身份和分置背景有史料支持，但《两唐书》记开元二十六年（738）置县，《元和郡县图志》本次所见版本记二十四年（736）奏置，现并列保留。',
         'findings': [
             finding('administration', '《旧唐书》随州条记天宝元年改汉东郡；《新唐书》在同一州郡下列唐城，与模型“山南／随”所属相符。',
                     citation('tang-nw-jiutangshu-39', '天寶元年，改為漢東郡。乾元元年，復為隋州。', '卷39·隋州（随州）'),
                     citation('xintangshu-40', '隋州漢東郡，上。土貢：合羅、綾、葛、覆盆。戶二萬三千九百一十七，口十萬五千七百二十二。縣四。隋，〈上。武德四年省安貴縣入焉。五年省平林、順義縣入焉。〉光化，〈上。〉棗陽，〈上。本隸唐州。武德五年省唐州之清潭縣入焉。貞觀元年又省唐州之舂陵縣入焉。十年以棗陽來屬。有光武山。〉唐城。〈上。開元二十六年以客戶析棗陽地置。〉', '卷40·隋州汉东郡')),
             finding('establishment', '《旧唐书》记738年分枣阳置县，《新唐书》补充“以客户析枣阳地置”；《元和郡县图志》记736年宋鼎奏置。它们可能涉及版本或记事口径差异，本轮不能裁定，不将其中一说覆盖为唯一事实。',
                     citation('tang-nw-jiutangshu-39', '唐城 開元二十六年，分棗陽置。', '卷39·唐城'),
                     citation('xintangshu-40', '唐城。〈上。開元二十六年以客戶析棗陽地置。〉', '卷40·唐城'),
                     citation('yuanhe-21', '唐城縣，上。東南至州一百五里。本漢隨縣地，梁於此置下溠戍。後沒魏，改為下溠鎮。隋開皇三年，改鎮為唐城縣，大業二年廢。開元二十四年，采訪使宋鼎奏置。', '卷21·随州·唐城县')),
             finding('seat', '《元和郡县图志》记县治东南至随州一百零五里，唐城山在县北三十二里。这是方位和相对里程资料，未提供县域边线，也不能直接换算成现代坐标。',
                     citation('yuanhe-21', '唐城縣，上。東南至州一百五里。', '卷21·唐城县'),
                     citation('yuanhe-21', '唐城山，在縣北三十二里。', '卷21·唐城县')),
             finding('seat', '地图点位的“今湖北省随州市西北唐县镇”来自CHGIS原记录；目前是数据集定位，尚未获得独立遗址测绘来核准该点。',
                     citation('chgis', 'SYS_ID=43627\nNAME_CH=唐城县\nPRES_LOC=今湖北省随州市西北唐县镇', 'CHGIS SYS_ID 43627')),
         ],
         'unresolved': ['736年与738年置县记载须进一步做版本校勘及事件区分；现有来源不足以消除异文。',
                        'CHGIS记录末年912及其后的更名时点，本轮取得的古籍段落未直接证实；记录末年不应直接当成更名年。',
                        '县治精确位置及741／755年的县界仍待考证；8.9千米是源点至近似模型的距离，不是迁城距离。']},
        {'id': 'county-focus-jiyang-hubei', 'settlementIds': ['chgis-county-43673'], 'boundaryIds': [area(1029)],
         'title': '湖北吉阳县：606年改名有据，后期曾省复置', 'correspondence': 'same-unit',
         'summary': '已补到隋大业二年（606）改名、元和三年（808）省入应山后复置，以及宋开宝年间废县的记载；原数据的一段连续年限不能代表期间从未撤并。',
         'findings': [
             finding('establishment', '《旧唐书》记梁置平阳、后魏改京池、隋改吉阳；《元和郡县图志》进一步记改名在大业二年（606），因县北吉阳山得名。',
                     citation('tang-nw-jiutangshu-40', '吉陽，梁分安陸置平陽縣，後魏改為京池。隋改為吉陽，取山名。', '卷40·安州·吉阳'),
                     citation('yuanhe-27', '隋大業二年改為吉陽，因縣北吉陽山為名。', '卷27·安州·吉阳县')),
             finding('administration', '《元和郡县图志》安州（安陆）明确领吉阳，与《旧唐书》及模型所列安州身份一致；这不连带核定模型的道级归属，也不能与岭南振州吉阳相混。',
                     citation('yuanhe-27', '貢、賦：開元貢：紵布一十八匹。賦：綿，紵。元和貢：紵布一十匹。管縣六：安陸，應山，雲夢，孝昌，吉陽，應城。', '卷27·安州')),
             finding('chronology', '《新唐书》记元和三年（808）吉阳省入应山，后来恢复，未在该句注明复置年；这补充了CHGIS 606—969单段记录无法表现的撤并过程。',
                     citation('xintangshu-41', '吉陽，〈中。元和三年省入應山，後復置。有白兆山。〉', '卷41·安州安陆郡'),
                     citation('chgis', 'SYS_ID=43673\nNAME_CH=吉阳县\nPRES_LOC=今湖北安陆市东北土桥店西南\nBEG_YR=606\nEND_YR=969', 'CHGIS SYS_ID 43673')),
             finding('chronology', '《宋史》德安府条记“开宝中，废吉阳县”，支持宋初废县的大致时段；CHGIS的969是该记录最后有效年，不能直接标成撤县年。',
                     citation('songshi-88', '德安府，中，安陸郡，安遠軍節度。本安州。天聖元年，隸京西路，慶暦元年還本路。宣和元年，陞爲府。開寶中，廢吉陽縣。', '卷88·德安府'),
                     citation('chgis-dictionary', 'last year for which this record is valid [before being abolished or changed to a new record]', 'v6_data_dictionary.xlsx·main_table/gisinfo_table·end_year')),
             finding('seat', '《元和郡县图志》记吉阳县西至安州一百零三里，可供相对方位复核；原文里程没有被换算成经纬度或县域范围。',
                     citation('yuanhe-27', '吉陽縣，中。西至州一百三里。', '卷27·安州·吉阳县')),
         ],
         'unresolved': ['808年撤并之后的确切复置年，以及最终废县确年，仍需更细史料。',
                        '“土桥店西南”的现代定位仍主要依据CHGIS，县治遗址与模型边线未获独立核准。',
                        '755年存在该县与其741年近似县域是否准确是两个问题，现有史料不能消除2.3千米点面差异。']},
        {'id': 'county-focus-jiyang-hainan', 'settlementIds': ['chgis-county-42505'], 'boundaryIds': [area(1408)],
         'title': '海南吉阳县：与湖北异地同名，1073年废为藤桥镇', 'correspondence': 'same-unit',
         'summary': '两部唐书记海南吉阳于贞观二年（628）析延德设置。《宋史》记1073年废为藤桥镇，与CHGIS最后有效年1072的记录口径相容，并非废县年份冲突。',
         'findings': [
             finding('establishment', '《旧唐书》《新唐书》均把该吉阳列在振州，并记628年分延德置县，与湖北安州吉阳的源流不同。',
                     citation('tang-se-jiutangshu-41', '吉陽 貞觀二年，分延德置', '卷41·振州·吉阳'),
                     citation('xintangshu-43a', '吉陽，〈下。貞觀二年析延德置。〉', '卷43上·振州')),
             finding('administration', '振州郡名存在不同记载：《旧唐书》写天宝元年改临振郡，《新唐书》本段则以延德郡为题并记更名。地图继续注明所用来源，不把两种写法静默合并。',
                     citation('tang-se-jiutangshu-41', '振州 隋臨振郡。武德五年置振州。天寶元年改為臨振郡。乾元元年，復為振州也。', '卷41·振州'),
                     citation('xintangshu-43a', '振州延德郡，下。本臨振郡，又曰寧遠郡，天寶元年更名。', '卷43上·振州')),
             finding('chronology', '《宋史》记熙宁六年（1073）吉阳县废为藤桥镇。CHGIS字典将end_year定义为撤销或变更前的最后有效年，因此1072记录末年与1073废县相容，不能直接把1072显示为撤县事件年。',
                     citation('songshi-90', '吉陽，下。熙寧六年，廢爲藤橋鎭，隸瓊州。紹興六年復。', '卷90·吉阳县'),
                     citation('chgis', 'SYS_ID=42505\nNAME_CH=吉阳县\nPRES_LOC=海南省崖县东北藤桥镇\nBEG_YR=628\nEND_YR=1072', 'CHGIS SYS_ID 42505'),
                     citation('chgis-dictionary', 'last year for which this record is valid [before being abolished or changed to a new record]', 'v6_data_dictionary.xlsx·main_table/gisinfo_table·end_year')),
             finding('identity', '同名的宋代“吉阳军”属于与州同级的行政建置（军），与唐代吉阳县不能视为同一层级；《宋史》军条下另记临川、藤桥两镇。',
                     citation('songshi-90', '吉陽軍，同下州。本朱崖軍，即崖州。熙寧六年，廢爲軍。紹興六年，廢軍爲寧遠縣。十三年復。後改名吉陽軍。', '卷90·吉阳军'),
                     citation('songshi-90', '臨川，藤橋。熙甯六年，省甯遠、吉陽二縣爲臨川、藤橋二鎭。寧遠即臨川。', '卷90·吉阳军')),
         ],
         'unresolved': ['振州天宝郡名异文仍待版本和相关史料校勘；海南吉阳与宋代吉阳军的范围也不能直接继承。',
                        '藤桥镇的名称承接不能独立证明图中经纬度或县界；点落在模型内仍不表示范围已核定。']},
    ]
    bundle = {'id': 'tang-county-focus', 'sources': sources, 'entries': entries}
    (OUT / 'focus.json').write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'entries': len(entries), 'sources': len(sources), 'findings': sum(len(entry['findings']) for entry in entries)}, ensure_ascii=False))


if __name__ == '__main__':
    build()
