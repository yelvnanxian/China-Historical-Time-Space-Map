#!/usr/bin/env python3
"""Build the independent north/west Tang content bundle; never edit catalog or public outputs."""
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import quote
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
EV=ROOT/'data/evidence/tang-expansion/north-west'
CAT=json.loads((ROOT/'data/catalog.json').read_text())
known={p['id']:p for p in CAT['places']}
sources={};texts={};profiles=[];new_places=[]

def src(key):
 path=EV/(key+'.json');m=json.loads(path.read_text());sid=m['id'];snap=ROOT/m['snapshotPath']
 assert hashlib.sha256(snap.read_bytes()).hexdigest()==m['snapshotSha256']
 sources[sid]={k:m[k] for k in ['id','title','url','retrievedAt','note','snapshotPath','snapshotSha256']};texts[sid]=snap.read_text();return sid

def old(key):
 path=EV/(key+'.json')
 if not path.exists():
  oldmeta=json.loads((ROOT/'data/evidence'/f'{key}.json').read_text());original=next(s for s in CAT['sources'] if s['id']==key)
  snapshot=EV/(key+'.txt');shutil.copyfile(ROOT/oldmeta['snapshotPath'],snapshot)
  rev=oldmeta['revisionId'];title=oldmeta['page'];m={'id':'tang-nw-'+key,'title':original['title'],'url':'https://zh.wikisource.org/w/index.php?title='+quote(title)+'&oldid='+rev,'retrievedAt':oldmeta['retrievedAt'],'note':'复用本项目实际取得的固定修订古籍全文，另存本批证据目录；摘录支持事件叙事，不核定地图坐标。','snapshotPath':str(snapshot.relative_to(ROOT)),'snapshotSha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'revisionId':rev,'apiUrl':oldmeta['apiUrl']}
  path.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
 return key

def e(key,q,support):
 sid=src(key)
 assert q in texts[sid], f'Quote missing: {key}: {q}'
 return {'sourceId':sid,'quote':q,'supports':support}

def p(pid,summary,*evidence):
 assert len(evidence)>=2
 profiles.append({'id':'tang-'+pid,'placeId':pid,'periodId':'tang','summary':summary,'sourceIds':list(dict.fromkeys(x['sourceId'] for x in evidence)),'evidence':list(evidence)})

def j(v,q,support):return e('jiutangshu-'+str(v),q,support)

def o(k,q,support):return e(old(k),q,support)

# Existing catalog entrances: Tang-specific context, not generic dynastic summaries.
p('changan','唐长安是京兆府治下的帝国都城。开元元年（713）雍州改为京兆府，城内分属长安、万年两县；这些县名与府名反映唐都的行政组织，不能套用汉长安城址。',
 j(38,'開元元年，改雍州為京兆府','713年京兆府建置。'),
 j(38,'萬年 隋大興縣。武德元年，改為萬年。','城内万年县的唐初命名。'),
 j(38,'長安 隋縣。乾封元年，分為乾封縣，治懷直坊。長安三年廢，復並長安','长安县曾分置新县，后又合并；结合万年县条理解唐都城内分县。'))
p('luoyang','洛阳在唐代承担东都职能：显庆二年（657）设置东都，武周改称神都，神龙元年（705）恢复东都之名。河南府的行政变化与两京政治联系是本城的唐代阅读线索。',
 j(38,'顯慶二年，置東都，官員准雍州。','657年设置东都及官制。'),
 j(38,'光宅元年，改東都為神都。','武周前期神都名称。'),
 j(38,'神龍元年，改神都復為東都','705年恢复东都名称。'))
p('beijing','唐幽州治所在蓟县，天宝时称范阳郡，是范阳节度使驻地。这里的幽州、范阳郡与郡下范阳县层级不同；本入口按北京地区理解军政中心，不把现代北京城垣当作唐蓟城。',
 j(39,'天寶元年，改范陽郡。','幽州在天宝年间改称范阳郡，见幽州条。'),
 j(39,'薊州 所治。古之燕國都。漢為薊縣，屬廣陽國。','蓟县为幽州治所。引文保留原始断句，不把条目解释为另一个蓟州。'),
 j(38,'范陽節度使，理幽州','范阳节度使驻地在幽州。'))
p('fanyang','天宝十四载（755）安禄山从范阳起兵，叙事紧接蓟城南阅兵；这一范阳入口关联幽州地区的节度使驻地。它与地图上的幽州入口属于同一城市地区的不同叙事，不是另一座可另计的独立城市，也不是涿州范阳县。',
 j(38,'范陽節度使，理幽州','范阳军事辖区与幽州驻地关系。'),
 o('zizhitongjian-217','詰朝，祿山出薊城南，大閱誓眾，以討楊國忠為名，榜軍中曰：','755年安禄山起兵叙事中的蓟城南。'))
p('jinyang','唐晋阳所在的太原府兼具都城与北方军镇角色。开元十一年（723）改并州为太原府、置北都，天宝元年（742）称北京，河东节度使也驻此；这个“北京”不是今天的北京。',
 j(39,'開元十一年，又置北都，改并州為太原府。天寶元年，改北都為北京。','太原府、北都和北京名称沿革。'),
 j(38,'河東節度使，治太原府','河东军镇驻地。'))
p('datong','唐云州位于旧平城地区，贞观十四年（640）州治迁到这里。682年战乱后撤废，开元二十年（732）复置，天宝时称云中郡；城市沿革经历中断，不能理解为北魏都城原状一直延续。',
 j(39,'貞觀十四年，自朔州北定襄城，移雲州及定襄縣置於此。','640年云州迁置。'),
 j(39,'永淳元年，為賊所破，因廢，乃移百姓于朔州。開元二十年，復為雲州。天寶元年，改為雲中郡。','682年废州、732年恢复及天宝郡名。'))
p('linzi','唐临淄是青州辖县，地理志仍以古齐国城说明县治。武德四年（621）的青州建置列有临淄；它不是唐青州州治，也不要与齐州在天宝初短暂使用的“临淄郡”混同。',
 j(38,'青州領益都、臨朐、臨淄、般陽、樂安、時水、安平等七縣。','青州辖临淄县。'),
 j(38,'臨淄 漢縣，治古齊國城。久廢，隋復置。','临淄县的历史城址叙述，未据此核定经纬度。'),
 j(38,'天寶元年，改為臨淄郡。五載，為濟南郡。','齐州条的郡名变化，区别临淄县。'))
p('handan','唐邯郸是县级城邑，曾在洺州、磁州之间调整隶属。贞观初磁州撤废后归洺州，永泰年间磁州恢复后再归磁州；这说明战国名都在唐代的行政角色已改变。',
 j(39,'貞觀元年，又以廢磁州之邯鄲來屬。','贞观初邯郸归洺州。'),
 j(39,'邯鄲 漢縣，屬廣平郡。隋屬磁州。州廢，屬洺州。永泰初，復置磁州，來屬。','唐代邯郸县的隶属转换。'))
p('tongguan','潼关是唐朝守卫关中东面的关隘。756年哥舒翰主张据险守关，朝廷催促出兵后官军失败，叛军攻克潼关；关城、河道和今天的道路位置不能直接等同。',
 o('zizhitongjian-218','官軍據險以扼之，利在堅守。','哥舒翰论守关的军事理由，原段主语已核。'),
 o('zizhitongjian-218','辛卯，乾祐進攻潼關，克之。','756年潼关失陷。'))
p('dunhuang','敦煌在唐代先后使用瓜州、西沙州、沙州和敦煌郡等名称，不能与东面的晋昌瓜州合并。沙州城内有豆卢军，体现河西走廊军镇与城邑的联系。',
 j(40,'沙州，下，隋燉煌郡。武德二年，置瓜州。五年，改為西沙州。貞觀七年，去「西」字。天寶元年，改為燉煌郡。','沙州名称序列及唐代纪年。'),
 j(38,'豆盧軍，在沙州城內','城内军镇角色。'))
p('mawei','马嵬是唐代驿站，也是756年玄宗离京西行途中政治危机的发生地。军士在此杀杨国忠，随后杨贵妃被缢杀；本入口联系驿站叙事，不把今天景点认作已经核定的唐驿遗址。',
 o('zizhitongjian-218','丙申，至馬嵬驛，將士饑疲，皆憤怒。','756年六月停驻马嵬驿。'),
 o('zizhitongjian-218','上乃命力士引貴妃於佛堂，縊殺之。','马嵬事件后续。'))
p('lingwu','这里的灵武联系唐灵州及天宝灵武郡，既是朔方军镇，又是756年肃宗即位的地点。州、郡与同名县应分层理解；本点沿用吴忠一带的地区参考，不自动对应现代灵武市中心。',
 j(38,'朔方節度使，治靈州','朔方节度使驻地。'),
 j(38,'天寶元年，改靈州為靈武郡。至德元年七月，肅宗即位于靈武，升為大都督府。','天宝郡名与756年即位。'))
p('suiyang','唐宋州的城下县为宋城，治古睢阳城，天宝时改睢阳郡。757年张巡、许远等守睢阳，长期围城与江淮联系成为安史战局中的重要线索；宋州不是宋朝地名专属。',
 j(38,'宋城 郭下。治古睢陽城。漢睢陽縣，隋改為宋城','宋州、宋城与睢阳城关系。'),
 o('zizhitongjian-220','尹子奇久圍睢陽，城中食盡，議棄城東走','757年睢阳围城叙事。'))
p('xiangzhou','唐相州治安阳，天宝时称邺郡。759年九节度联军在相州作战失利，使这里成为安史战局转折的入口；唐代邺郡名称不等于三国邺城遗址就在当前标记处。',
 j(39,'隋又改為安陽縣，州所治。','相州治所在安阳县。'),
 o('jiutangshu-10','壬申，相州行營郭子儀等與賊史思明戰，王師不利，九節度兵潰，子儀斷河陽橋，以餘眾保東京。','乾元二年相州战事。'))
p('heyang','河阳因临黄河、长桥跨水而具有险要位置。乾元年间李光弼在此守御史思明，三城军政财政体系逐渐形成；843年又升为孟州，不能把所有唐代阶段都写成同一建置。',
 j(38,'以城臨大河，長橋架水，古稱設險。乾元中，史思明再陷洛陽，太尉李光弼以重兵守河陽。','河阳位置与守御作用。'),
 j(38,'其河陽望昇為孟州','会昌三年升州奏文，结合原段明确纪年。'))
p('shanzhou','唐陕州位于两京之间，天宝时称陕郡。广德元年（763）吐蕃进犯长安，代宗避驻陕州，州升大都督府；它同时是两京通道上的城邑与危机时的皇帝驻地。',
 j(38,'天寶元年，改為陝郡','天宝陕郡名称。'),
 j(38,'廣德元年十月，吐蕃犯京師，車駕幸陝州，仍以陝為大都督府。','763年的驻跸与建置。'))
p('zhengzhou','唐郑州治所起初设在武牢，贞观七年（633）迁到管城。此后管城成为州治；759年史思明向西进攻郑州，说明河南中部州城与两京战局的联系。',
 j(38,'七年，自武牢移鄭州理所于管城。','承接贞观纪年的633年州治迁移。'),
 o('zizhitongjian-221','思明乘勝西攻鄭州。','759年郑州战事。'))
p('huazhou-hua','唐滑州因古滑台得名，天宝时称灵昌郡，州治联系白马地区；后期也是义成军节度使驻地。这是河南滑州，与陕西华州、华阴郡不是同一地点。',
 j(38,'武德元年，改為滑州，以城有古滑臺也。','618年滑州命名。'),
 j(38,'義成軍節度使 治滑州，管滑、鄭、濮三州。','唐后期义成军驻地及辖区。'))
p('huaizhou','唐怀州在武德四年（621）迁治野王城，是河内地区的行政中心。657年河阳等四县划向洛州，说明近两京地区的州县配置会随东都建设调整，不应固定成一张全唐地图。',
 j(39,'四年，移懷州於今治野王城。','武德四年迁治野王。'),
 j(39,'顯慶二年，割河陽、溫、濟源、王屋四縣屬洛州。','657年隶属调整。'))
p('hengzhou','唐恒州在武德四年（621）迁治真定，天宝时称常山郡。它后来成为成德军驻地，元和十五年（820）改称镇州；看唐代河北时，需把城名与后期军镇体系联系起来。',
 j(39,'武德四年，自石邑移恆州於縣為治所。','621年恒州迁入真定县。'),
 j(38,'成德軍節度使 治恆州，領恆、趙、冀、深四州。','成德军驻地。'),
 j(39,'元和十五年，改為鎮州。','820年更名。'))
p('beizhou','唐贝州天宝时称清河郡，初唐曾迁治历亭后再还旧治。762年史朝义北走至贝州与部将会合，反映河北东部州城在安史末期退守路线中的作用。',
 j(39,'六年，移治所於曆亭。八年，還於舊治。','贝州武德年间治所迁移。'),
 o('zizhitongjian-222','史朝義走至貝州，與其大將薛忠義等兩節度合，僕固瑒追之至臨清。','762年贝州战事联系。'))
p('pingyuan','唐德州天宝时改称平原郡，治所安德，并非现代平原县城的直接同义词。755年颜真卿任平原太守时修城浚壕、募集壮丁、充实仓廪，为抵抗安禄山作准备。',
 j(39,'天寶元年，改為平原郡。乾元元年，復為德州。','德州和平原郡名称变化。'),
 j(39,'安德 漢縣，屬平原郡。今州治，至隋不改','州治安德关系。'),
 o('zizhitongjian-217','初，平原太守顏真卿知祿山且反，因霖雨，完城浚壕，料丁壯，實倉廩。','755年城防和储粮。'))
p('fuzhou-fu','唐鄜州领洛交等县，天宝时称洛交郡。乾元年间鄜州刺史领鄜坊节度副使，显示其在关中北部军政部署中的作用；鄜州与福建福州不可按读音混同。',
 j(38,'天寶元年，改為洛交郡。乾元元年，復為鄜州。','鄜州郡名沿革。'),
 o('zizhitongjian-221','以邠州刺史桑如珪領邠寧，鄜州刺史杜冕領鄜坊節度副使，分道招討。','759年前后的鄜坊军务部署。'))
p('luzhou','唐潞州位于上党地区，玄宗曾在这里任职，开元十七年（729）因此置大都督府。后期昭义军也驻潞州，是观察山西东南与河北联系的军政入口。',
 j(39,'開元十七年，以玄宗曆職此州，置大都督府','729年建置与玄宗经历。'),
 j(38,'昭義軍節度使 治潞州，領潞、澤、邢、洺、磁五州。','昭义军驻地和跨太行行政联系。'))
p('dengzhou','唐邓州取汉邓县之名，州治在穰，天宝时称南阳郡。759年邓州刺史鲁炅领陈、郑、亳军务；邓州城、南阳县与广义南阳地区不宜混为一个固定古城点。',
 j(39,'隋改為南陽郡，尋改為鄧州，取漢鄧縣為名','邓州名称来源与南阳郡关系。'),
 o('zizhitongjian-221','甲辰，置陳、鄭、亳節度使，以鄧州刺史魯炅為之；','759年邓州刺史的军职。'))
p('xuzhou-xuchang','唐许州的郭下县为长社，天宝时称颍川郡。762年李光弼攻取许州并在城下击败援军，显示颍川地区与河南战场的联系；许州与东面的徐州是两座不同城邑。',
 j(38,'長社 郭下。隋潁川縣。武德四年，改為長社，取舊名','许州城下县名与621年更名。'),
 o('zizhitongjian-222','李光弼拔許州，擒史朝義所署穎川太守李春；朝義將史參救之，丙午，戰於城下，又破之。','762年许州攻防。'))
p('xuzhou-pengcheng','唐徐州以彭城为中心，天宝时称彭城郡，连接河南东部与淮北军务。762年李光弼赴徐州并调兖郓节度使攻击史朝义，体现州城之间的军事联系。',
 j(38,'天寶元年，改徐州為彭城郡。乾元元年，復為徐州。','徐州和彭城郡名称关系。'),
 o('zizhitongjian-222','遂徑趣徐州，使兗鄆節度使田神功進擊朝義，大破之。','762年李光弼赴徐州；主语承接原段。'))

# New city entrances; modern-reference coordinates supplied below, separate from historical claims.
p('fengxiang','唐初岐州天宝时称扶风郡。757年肃宗驻此，随后设置凤翔府并一度号西京；凤翔是安史战乱期间关中西部的政治军事中心，不能把这一后出的府名当作整个唐代始终不变。',
 j(38,'天寶元年，改為扶風郡。至德二年，肅宗自順化郡幸扶風郡','天宝郡名与757年驻跸。'),
 j(38,'十二月，置鳳翔府，號為西京，與成都、京兆、河南、太原為五京。','757年凤翔府和西京建置。'))
p('tongzhou-dali','唐同州以冯翊为核心，属京畿辅州，天宝时称冯翊郡。乾元三年（760）朝邑县划入新置河中府，表现出黄河两岸行政联系的调整；本点是陕西大荔地区，不是北京通州。',
 j(38,'同州 上輔，隋馮翊郡。武德元年，改為同州','同州作为辅州的建置。'),
 j(38,'乾元三年，以蒲州為河中府；割朝邑縣入河中府','760年跨河地区的隶属调整。'))
p('huazhou-shaanxi','陕西唐华州以郑县为中心，管及华阴，天宝时称华阴郡。武周垂拱年间一度改太州，705年复名；它是关中东部辅州，须与河南滑州、灵昌郡严格区别。',
 j(38,'華州 上輔，隋京兆郡之鄭縣。','辅州与郑县治所背景。'),
 j(38,'二年，改為太州。神龍元年，復舊名。天寶元年，改為華陰郡。','垂拱二年、705年及742年的名称变化。'))
p('puzhou','唐蒲州起初治桑泉，武德三年（620）迁治河东。开元八年（720）短暂升河中府、号中都，后又恢复蒲州；这一城邑处在关中与河东联系的重要行政层级中。',
 j(39,'三年，移蒲治河東縣，依舊總管府。','620年迁治河东。'),
 j(39,'開元八年，置中都，改蒲州為河中府。其年，罷中都，依舊為蒲州','720年中都和河中府建置。'))
p('jiangzhou','唐初绛州设总管府，领正平、太平、曲沃等县，是河东南部的行政中心。武德三年（620）总管府撤废，此后所属县继续调整；绛州不是同一地区内的绛县或晋州。',
 j(39,'武德元年，置絳州總管府，管絳、潞、蓋、建、澤、沁、韓、晉、呂、舉、泰、蒲、虞、芮、邵十五州。','618年河东南部总管府。'),
 j(39,'絳州領正平、太平、曲沃、聞喜、稷山五縣。三年，廢總管府。','属县与620年撤总管府。'))
p('weizhou-daming','唐魏州是河北重州，武德四年（621）平窦建德后恢复州名，天宝时称魏郡。州下贵乡县治在唐代仍有移动，740年及大历年间曾迁址；本点关联大名地区，不把后来府城等同唐魏州原址。',
 j(39,'武德四年，平竇建德，復為魏州。','621年恢复魏州。'),
 j(39,'開元二十八年，刺史盧暉移于羅城西百步。大曆四年，又移于河南岸置','贵乡县治的唐代迁移。'))
p('bozhou-liaocheng','唐博州治聊城，武德四年（621）建立，统辖聊城、堂邑等县；天宝时称博平郡。它是河北道东部的州级城邑，不能与淮北亳州因近似读音而混并。',
 j(39,'博州 上，隋武陽郡之聊城縣。武德四年，平竇建德，置博州','621年博州建置。'),
 j(39,'聊城 漢縣。治郭下。武德四年，分置茌平縣。貞觀元年，省入聊城','聊城为郭下县及县界调整。'))
p('qizhou-jinan','唐齐州治历城，贞观年间设都督府统齐、青等州。天宝初曾短称临淄郡，746年改济南郡；这里的临淄郡不是青州辖下的临淄县，读古地名须同时看所属州与年代。',
 j(38,'七年，又置都督府，管齊、青、淄、萊、密五州。','贞观七年齐州都督范围。'),
 j(38,'天寶元年，改為臨淄郡。五載，為濟南郡。乾元元年，復為齊州。','742、746及758年的州郡名称变化。'))
p('yanzhou','唐兖州以瑕丘为郭下县，连接鲁地城邑，辖及曲阜等县。贞观十四年（640）置都督府统兖、泰、沂三州，天宝时称鲁郡；州府和曲阜文化城邑是相关而不同的地点。',
 j(38,'瑕丘 郭下。宋置兗州于魯瑕邑故治，隋因置瑕丘縣','兖州郭下县及旧治关系。'),
 j(38,'十四年，置都督府，管兗、泰、沂三州。','640年的区域行政职能。'),
 j(38,'天寶元年，改兗州為魯郡。','天宝鲁郡名称。'))
p('qingzhou','唐青州以益都为中心，武德四年（621）设总管府，管理山东东部多州。其州下包括临淄县，天宝时改北海郡；青州州治与齐国旧都临淄是两个不同城市入口。',
 j(38,'武德四年，置青州總管府，管青、濰、登、牟、莒、密、萊、乘八州。','621年青州总管府。'),
 j(38,'青州領益都、臨朐、臨淄、般陽、樂安、時水、安平等七縣。','益都、临淄同属青州但不是同一县城。'),
 j(38,'天寶元年，改青州為北海郡。','青州在天宝年间使用北海郡名。'))
p('dengzhou-penglai','唐登州在如意元年（692）设置，最初治牟平，707年迁至蓬莱。天宝时称东牟郡，属于山东半岛州城；它与河南邓州读音接近，但地望和沿革完全不同。',
 j(38,'如意元年，分置登州，領文登、牟平、黃三縣，以牟平為治所。','692年初设登州及治所。'),
 j(38,'神龍三年，改黃縣為蓬萊縣，移州治于蓬萊。天寶元年，以登州為東牟郡。','707年迁治及天宝名称。'))
p('liangzhou-wuwei','唐凉州以姑臧为核心，武德二年（619）平李轨后置总管府。后来成为河西节度使驻地，赤水军也在城内，是河西走廊东部的军政中心；现代武威参考点不界定唐城范围。',
 j(40,'武德二年，平李軌，置涼州總管府，管涼、甘、瓜、肅四州。','619年凉州总管府。'),
 j(38,'河西節度使治，在涼州','河西节度使驻地。'),
 j(38,'赤水軍，在涼州城內','凉州城内驻军。'))
p('ganzhou-zhangye','唐甘州承接张掖地区，619年平李轨后设州，天宝时改张掖郡。附近建康军属于河西军镇体系，使这座州城与走廊军事交通联系起来；古军驻地不能由现代张掖点推算。',
 j(40,'甘州，下，隋張掖郡。武德二年，平李軌，置甘州。天寶元年，改為張掖郡。','甘州建置与天宝郡名。'),
 j(38,'建康軍，在甘州西二百里','河西军镇与甘州的文献方位联系，距离不转换为精确路线。'))
p('suzhou-jiuquan','唐肃州619年分置，州治酒泉地区，天宝时称酒泉郡。625年曾设都督府统肃、瓜、沙三州，627年撤废；玉门军另在州西，说明州城与驻军地点并不总重合。',
 j(40,'肅州，下，武德二年，分隋張掖郡置肅州。八年，置都督府，督肅、瓜、沙三州。貞觀元年，罷都督府。','肃州与都督府沿革。'),
 j(38,'玉門軍，在肅州西二百里','军镇位于州城以西，不视为城内同点。'))
p('guazhou-jinchang','唐瓜州622年置于常乐地区，天宝时称晋昌郡，属于河西走廊西段的州镇系统。州下晋昌县承接旧冥安县；它不同于敦煌在唐初短暂使用的瓜州之名，古州城与现代瓜州县城也不直接重合。',
 j(40,'瓜州，下，都督府，隋燉煌郡之常樂縣。武德五年，置瓜州','622年瓜州建置。'),
 j(40,'天寶元年，為晉昌郡。乾元元年，復為瓜州。','瓜州在天宝年间使用晋昌郡名，758年恢复州名。'),
 j(40,'武德七年，復為晉昌','晋昌县条的名称沿革。'))
p('xizhou-gaochang','唐平高昌后设置西州，州下有高昌县，天宝时称交河郡。西州城内驻天山军，是北庭节度体系的据点；现代吐鲁番点只作地区参考，不能把高昌故城、交河故城和现代城区合并。',
 j(40,'貞觀十四年，討平之，以其地為西州。','高昌县条记640年平高昌置西州，避免采用州条内部十三年异文。'),
 j(38,'天山軍，在西州城內','天山军驻城，原段为北庭节度体系。'),
 j(40,'天寶元年，改為交河郡。乾元元年，復為西州。','西州与交河郡名称。'))
p('yizhou-hami','唐伊州在630年设西伊州，632年去“西”字，天宝时称伊吾郡。它是进入西域的州城入口；伊吾军另设在州西北，不能将州治与军营或现代伊吾县城直接等同。',
 j(40,'貞觀四年，歸化，置西伊州。六年，去「西」字。天寶元年，為伊吾郡。','630、632年及天宝建置。'),
 j(38,'伊吾軍，在伊州西北三百里甘露川','军镇与州城分离的文献叙述。'))
p('tingzhou-beiting','庭州在702年改设北庭都护府，成为管理天山北部军政联系的重要据点，府城内有瀚海军。北庭与龟兹的安西都护府不是同一治所；本点采用吉木萨尔地区参考，不宣称精确落在北庭故城城墙内。',
 j(40,'長安二年，改為北庭都護府。','702年北庭都护府建置。'),
 j(38,'瀚海軍，在北庭府城內','瀚海军驻城。'))
p('qiuci','龟兹是安西四镇之一，也是安西都护府的重要治所。旧唐书记载648年征龟兹及其后移府入龟兹国城，显示当地王国与唐军政机构叠加；本点只是库车地区参考，未核定具体王城或军府遗址。',
 j(40,'貞觀二十二年，阿史那社{人小}破之，虜龜茲王而還，乃於其地置都督府','648年龟兹征讨及置府，原数字文本异体残字照录。'),
 j(38,'安西都護府治所，在龜茲國城內','安西府治与龟兹国城关系。'))
p('yutian-hotan','于阗是塔里木盆地南缘王国，也是唐安西四镇之一。648年国王入朝，后设置毗沙都督府，保留王国、都督府与镇守并存的复杂关系；现代和田点仅作地区入口，不等于约特干古城定位。',
 j(38,'統龜茲、焉耆、於闐、疏勒四國。','于阗在安西四镇体系中的位置。'),
 j(40,'其王伏闍信，貞觀二十二年入朝。上元二年正月，置毗沙都督府','于阗国王入朝及毗沙府记载。'))
p('shule-kashgar','疏勒是安西四镇之一，联系塔里木盆地西缘地区。635年遣使朝贡，上元年间设疏勒都督府；四镇关系不意味着所有年代具有不变边界，现代喀什参考点也不是唐镇守城的测绘坐标。',
 j(38,'統龜茲、焉耆、於闐、疏勒四國。','安西体系中的疏勒。'),
 j(40,'貞觀九年，遣使朝貢，自是不絕。上元中，置疏勒都督府','635年朝贡及后续置府。'))
p('yanqi','焉耆是安西四镇之一，文献记当地有鱼鳖之利，显示绿洲水域资源与生计。644年郭孝恪征焉耆，其后置都督府；本点仅作焉耆地区入口，不能直接认定为唐国都或镇城遗址。',
 j(40,'俗有魚鱉之利。貞觀十八年，郭孝恪平之，由是臣屬。','水域生计及644年事件。'),
 j(40,'上元中，置都督府處其部落，無蕃州。在安西都護府東八百里。','焉耆都督府的组织与相对方位。'))

# Continued below with independently sourced modern reference coordinates.
p('kaifeng','唐汴州以浚仪地区为中心，天宝时称陈留郡。建中二年（781）修筑罗城，后为宣武军节度使驻地；汴州、陈留郡与宋代东京虽然有沿革联系，却不是同一时期的称谓。',
 j(38,'天寶元年，改汴州為陳留郡。乾元元年，復為汴州。建中二年，築其羅城。','742/758年名称与781年筑城。'),
 j(38,'宣武軍節度使 治汴州，管汴、宋、亳、潁四州。','宣武军驻地。'))
# Add explicit evidence for every new 755 name rather than inferring from a Sui name.
naming_quotes={
 'tongzhou-dali':j(38,'天寶元年，改同州為馮翊郡。','755年使用冯翊郡名的建置依据。'),
 'puzhou':j(39,'天寶元年，改為河東郡。乾元元年，復為蒲州','蒲州的天宝郡名。'),
 'jiangzhou':e('jiangzhou','唐朝武德元年（618年）复为绛州。天宝元年（742年）改为绛郡，乾元元年（758年）又改为绛州。属河东道。','绛州天宝郡名；对地理志数字文本缺段的补充二手出处。'),
 'weizhou-daming':j(39,'天寶元年，改為魏郡。乾元元年，復為魏州。','魏州天宝郡名。'),
 'bozhou-liaocheng':j(39,'天寶元年，改為博平郡。乾元元年，復為博州。','博州天宝郡名。'),
 'liangzhou-wuwei':j(40,'天寶元年，改為武威郡，督涼、甘、肅三州。','凉州天宝郡名。'),
 'suzhou-jiuquan':j(40,'天寶元年，改為酒泉郡。乾元元年，復為肅州。','肃州天宝郡名。'),
}
by_id={x['placeId']:x for x in profiles}
for pid,evidence in naming_quotes.items():
 by_id[pid]['evidence'].append(evidence)
 by_id[pid]['sourceIds']=list(dict.fromkeys(x['sourceId'] for x in by_id[pid]['evidence']))

coordinate_source=src('geonames')
inputs=json.loads((ROOT/'data/tang-expansion/north-west-places.json').read_text())
coords=json.loads((EV/'geonames-selection.json').read_text())
coordinate_records={x['placeId']:x for x in coords['selectedRecords']}
for item in inputs:
 pid=item['id'];profile=by_id[pid]
 assert item['coordinates']==coordinate_records[pid]['displayCoordinates']
 note=(f"取GeoNames现代居民点记录{item['geonameId']}，四舍五入到0.01度，仅作{item['modernName']}的近似阅读入口。"
       '此处没有核定唐代州城、国都、镇城或遗址位置，古今城址不保证重合；坐标只说明现代参考地区。')
 place={'id':pid,'name':item['name'],'modernName':item['modernName'],'coordinates':item['coordinates'],'type':'city','summary':profile['summary'],
        'aliases':list(dict.fromkeys([*item['aliases'],item['tangName']])),'periodIds':['tang'],'nameByPeriod':{'tang':item['tangName']},
        'sourceIds':list(dict.fromkeys([*profile['sourceIds'],coordinate_source])),
        'location':{'accuracy':'approximate','note':note,'sourceIds':[coordinate_source]},
        'evidence':[{'id':pid+'-tang-'+str(i),'sourceId':evidence['sourceId'],'locator':'固定修订全文；对应地理或纪年条目见摘录','supports':evidence['supports'],'quote':evidence['quote'],'status':'pending','note':'已比对保存文本；异文、古今迁址和坐标仍须专门考证。'} for i,evidence in enumerate(profile['evidence'])]}
 new_places.append(place)
 profile['region']=item['region']
 profile['namingNote']=(f"常用入口名为{item['name']}，755年显示为{item['tangName']}；正文概览整个唐代，明确记年的迁治或更名发生在对应时段，不能全部套入755年。")

regions={
 '关中与两京':['changan','luoyang','tongguan','mawei','shanzhou','fuzhou-fu'],
 '河北与河东':['beijing','fanyang','jinyang','datong','handan','xiangzhou','huaizhou','hengzhou','beizhou','pingyuan','luzhou'],
 '中原与山东':['linzi','suiyang','heyang','zhengzhou','huazhou-hua','dengzhou','xuzhou-xuchang','xuzhou-pengcheng','kaifeng'],
 '河西与西域':['dunhuang','lingwu'],
}
for region,pids in regions.items():
 for pid in pids:
  by_id[pid]['region']=region
  by_id[pid]['namingNote']='既有地图入口保留唐代常用城名；本档案覆盖唐代前后阶段，州、天宝郡、县、驿与后期军镇名称按正文年代区分，不把755年当作整个唐代。'
for pid in ('changan','luoyang','linzi','handan','tongguan','mawei'):
 by_id[pid]['namingNote']='本入口指都城、县城、关隘或驿站；与其上级州府或天宝郡不是同一层级。正文时间节点覆盖整个唐代，不仅是地图代表年755年。'
by_id['fanyang']['namingNote']='该入口与幽州入口关联同一城市地区，不应额外计作新独立城市；范阳郡、范阳节度使与郡下范阳县须区分。'
by_id['beijing']['namingNote']='幽州在755年称范阳郡；现有入口保留幽州常用名，勿与范阳县混同。与范阳入口为同城不同叙事入口。'

existing=[x['placeId'] for x in profiles if x['placeId'] not in {p['id'] for p in new_places}]
expected='changan luoyang beijing fanyang jinyang datong linzi handan tongguan dunhuang mawei lingwu suiyang xiangzhou heyang shanzhou zhengzhou huazhou-hua huaizhou hengzhou beizhou pingyuan fuzhou-fu luzhou dengzhou xuzhou-xuchang xuzhou-pengcheng kaifeng'.split()
assert set(existing)==set(expected)
assert len(profiles)==50 and len(new_places)==22
assert len({p['id'] for p in profiles})==len(profiles)
for profile in profiles:
 assert len(profile['evidence'])>=2 and profile.get('region') and profile.get('namingNote')
 assert all(x['sourceId'] in sources for x in profile['evidence'])
for place in new_places:
 assert all(x in sources or any(s['id']==x for s in CAT['sources']) for x in place['sourceIds'])
result={'version':'1.0','region':'north-west','sources':list(sources.values()),'newPlaces':new_places,'profiles':profiles,
 'coverage':{'existingPlaceIds':existing,'newPlaceIds':[p['id'] for p in new_places],'notes':[
  '50份唐代档案覆盖28个既有入口、22个新地区入口；幽州与范阳关联同一城市地区，未新增重复点。',
  '每篇至少两条实际原文摘录。古籍记载、二手补注与现代参考点各自支持有限事项，逐字比对不等于完成古址考证。',
  '新入口只挂唐时期，755年郡名与常用州名分开保存，地区坐标不表示疆界或唐代城垣。',
  '西州贞观十三/十四年、庭州置州年及安西陷落年代的源文存在内部异文，本批避开用单一争议句确定事件；必要处只叙建置和关系。',
  '本批没有新增精确路线、疆界或城址几何；没有据人口数字作未经审校的规模排名。']}}
output=ROOT/'data/tang-expansion/north-west.json';output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
validation={'profiles':len(profiles),'existingEntrances':len(existing),'newPlaces':len(new_places),'sources':len(sources),'quotesMatched':sum(len(p['evidence']) for p in profiles),'allSnapshotHashesMatch':True,'coordinatePrecision':'rounded to 0.01 degree modern reference only','outputSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'regions':{r:sum(p['region']==r for p in profiles) for r in regions}}
(EV/'validation.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2)+'\n');print(json.dumps(validation,ensure_ascii=False,indent=2))
