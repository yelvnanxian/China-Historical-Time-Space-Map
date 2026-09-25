#!/usr/bin/env python3
"""Assemble explicitly reviewed county identities; never infer or edit geometry.

The table is a manual reading log, not a name-matching algorithm. Line numbers
refer to the archived editions. Every quote is checked verbatim on each run.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/evidence/tang-county-research'
SNAPSHOTS = OUT / 'bulk-sources'

# point record | model record | book chapter | historical parent / archive section
# | model's original prefecture | county paragraph line | specific reviewed fact
# | fact topic
REVIEWED = '''
95459|434|39|晋州|晉|39|岳阳县在《旧唐书》中记为后魏安泽县，隋代改为岳阳。|chronology
95444|430|39|晋州|晉|32|襄陵原属晋州，元和十四年才改属绛州；不能把后期绛州编排直接用于741年的归属。|administration
95225|431|39|晋州|晉|41|《旧唐书》记赵城为国初分霍邑县设置，晋州总叙记贞观十七年来属。|establishment
95462|435|39|沁州|沁|95|和川县为义宁元年分沁源县设置。|establishment
95512|419|39|沁州|沁|96|绵上县为隋代从介休南界分置。|establishment
95406|438|39|慈州|慈|68|慈州仵城县为后魏设置，以镇戍得名；须与隰州条中已改名或省废的仵城分别考察。|establishment
95505|418|39|潞州|潞|80|铜鞮在武德年间曾属沁州、韩州，韩州废后属潞州；文献还记武德五年、六年的迁治。|administration
95119|422|39|代州|代|127|唐林原为证圣元年分五台、崞县设置的武延县，唐隆元年改名唐林。|chronology
95115|423|39|代州|代|126|《旧唐书》将崞列为代州属县，县条称其为汉县，并记东魏曾置廓州。|chronology
95297|426|39|仪州|儀|103|平城在武德六年改属辽州；州名先天元年改仪州，天宝元年改乐平郡，乾元复仪州，因此晚期辽州标题不应误作另一单位。|administration
95636|345|39|太原府|太原|115|阳曲在武德七年由汾阳县改名，并迁治已省阳直县；贞观年间另有并县记载。|seat
85187|332|39|洺州|洺|244|平恩县条记隋代从斥漳城迁至平恩故城。|seat
44833|412|39|洺州|洺|248|曲周为隋代废县，武德四年复置；会昌三年并入洺水的记载属于后期沿革。|chronology
44837|414|39|洺州|洺|242|洺州总叙明确列清漳为武德初领县，并记会昌年间省县；后期县目省略不等于741年不存在。|chronology
85097|611|39|魏州|魏|212|《旧唐书》记朝城的前身为武阳，贞观十七年并入临黄、莘县，开元七年复置并改称朝城。|chronology
44800|607|39|魏州|魏|205|贵乡在武德八年迁入罗城，开元二十八年迁至罗城西百步，大历四年又迁河南岸；相同县名不代表治所始终不变。|seat
45350|468|39|魏州|魏|208|馆陶曾属武德五年所置毛州；贞观元年毛州废后属魏州。|administration
85193|591|39|贝州|貝|238|历亭为隋代从鄃县分置，贝州总叙列其为属县。|establishment
87956|586|39|贝州|貝|231|清阳旧治甘陵城，永昌元年迁至孔桥，开元二十三年迁就州治。|seat
82203|580|39|相州|相|199|临漳为后周建德六年分邺县设置，列于相州县目。|establishment
44924|573|39|沧州|滄|317|清池为隋代由浮阳改名，唐初先后属景州、东盐州，贞观元年改属沧州。|administration
44929|575|39|沧州|滄|318|盐山为隋代由高城改名，武德四年曾于县置东盐州；沧州总叙明确记贞观元年来属。|administration
45138|494|39|德州|德|338|将陵为隋代从安德分置，文献记其置于将陵故城。|establishment
44741|603|39|莫州|莫|376|清苑为隋县，唐初曾属蒲州、瀛州，景云二年改属莫州。|administration
44870|551|39|莫州|莫|375|莫县在贞观元年改属瀛州，景云二年割属莫州。|administration
85203|593|39|博州|博|226|堂邑在后魏省废，隋代分清阳复置；唐初属毛州，毛州废后属博州。|administration
82492|600|39|怀州|懷|178|武德县的隋代名称为安昌，武德三年改名武德。|chronology
82271|599|39|卫州|衛|187|卫县由朝歌沿革而来，隋大业二年改称卫县；文献另记清淇数次省入卫县。|chronology
82842|291|38|河南府|河南|321|《旧唐书》河南府县目记伊阙为隋县；本条不据简略记载推定具体始置年。|establishment
82432|280|38|河南府|河南|312|河南府总叙记开元二十二年置河阴县；会昌三年割属孟州是晚于741年、755年的沿革。|chronology
82839|292|38|河南府|河南|314|洛阳在神龙二年改称永昌，唐隆元年复名洛阳；县条还保存多次迁治记载。|chronology
44363|247|38|郑州|鄭|348|中牟由隋圃田县于武德元年改名，初属汴州，龙朔二年改属郑州。|administration
44380|246|38|郑州|鄭|344|管城为隋旧县，位于州治郭下；郑州总叙记贞观七年将州治迁至管城。|seat
85056|169|38|曹州|曹|466|《旧唐书》曹州县目记济阴为隋县并位于郭下，州总叙亦列济阴。|seat
43198|215|38|徐州|徐|531|符离在贞观元年迁治竹邑城；元和四年才于符离置宿州，741年的模型州属为徐州。|seat
43213|140|38|徐州|徐|533|蕲县在贞观十七年随谯州废而属徐州，显庆元年迁治，元和四年才割属宿州。|administration
43276|218|38|亳州|亳|440|临涣在贞观十七年由废谯州改属亳州，并从铚城迁至废谯州治；宿州归属属于后期记载。|administration
82079|312|38|宋州|宋|459|谷熟在武德二年曾置南谷州，武德四年州废后属宋州。|administration
82044|317|38|陈州|陳|430|南顿在武德六年并入项城，证圣元年分置为光武县，景云元年恢复南顿旧名。|chronology
82049|201|38|陈州|陳|428|项城在武德四年曾置沈州，贞观元年沈州废后属陈州。|administration
200045|320|38|豫州|豫|403|《旧唐书》蔡州条将汝阳记作隋旧县、治郭下；州总叙说明蔡州之名始于宝应元年，此前为豫州。|administration
82596|322|38|豫州|豫|409|褒信在《旧唐书》蔡州县目记为后汉县；州总叙记其由舒州来属豫州，蔡州为后期州名。|administration
82793|190|38|许州|許|389|舞阳在开元二十六年由仙州隶许州，元和十三年迁治吴城镇；迁治不能直接解释为县界变更。|administration
85106|613|38|濮州|濮|477|范县在武德年间曾置范州，后属济州，贞观八年改属濮州。|administration
85068|275|38|濮州|濮|478|《旧唐书》记雷泽在武德四年分置廪城，并记后来廪城省入雷泽。|chronology
44323|286|38|汴州|汴|395|汴州总叙及浚仪条均记延和元年恢复开封县，浚仪条明确为分十四乡设置。|establishment
45303|167|38|济州|濟|489|东阿原属济州，天宝十三载济州废后改属郓州；741年模型州属与755年显示时点必须区别。|administration
82344|295|38|滑州|滑|417|卫南由隋楚丘改名，仪凤元年迁至滨河新城，永昌元年再迁楚丘城南。|seat
40407|1010|40|苏州|蘇|127|长洲于万岁通天元年从吴县分置，在郭下与吴县分治州界。|establishment
40457|1009|40|常州|常|117|武进于垂拱二年重新从晋陵分置，治于州内。|establishment
40760|890|40|越州|越|150|山阴于垂拱二年从会稽分置，在州治与会稽分理。|establishment
40731|882|40|明州|明|159|慈溪与奉化、翁山均于开元二十六年从鄮县分置。|establishment
40647|1027|40|衢州|衢|177|信安在武德四年曾置衢州，州废后还属婺州；垂拱二年又分信安、龙丘复置衢州。|administration
40649|992|40|衢州|衢|180|盈川于如意元年从龙丘分置；文献解释县名与当地水名沿革有关。|establishment
43459|825|40|鄂州|鄂|314|《旧唐书》江夏条说明其为鄂州治所，并记武德四年改州为鄂州。|seat
43425|926|40|鄂州|鄂|316|《旧唐书》在鄂州县目列武昌，并记其为汉鄂县、吴晋重镇。|chronology
43509|827|40|黄州|黃|84|《旧唐书》记黄冈为黄州治所，州总叙也明确列黄冈为属县。|seat
43463|824|40|沔州|沔|319|汉阳在武德四年置沔州时为州治；后期并入鄂州的记载不应提前套用到741年模型。|administration
42683|793|40|扬州|揚|14|江都在武德年间先后为兖州、邗州、扬州治所。|seat
42710|773|40|扬州|揚|19|扬子于永淳元年从江都县分置。|establishment
43219|774|40|寿州|壽|57|安丰由隋代设置为县，文献记有芍陂即安丰塘；寿州总叙列其为属县。|establishment
43164|795|40|滁州|滁|32|《旧唐书》记永阳在景龙二年从清流分置。|establishment
96077|1111|41|嘉州|嘉|551|犍为原属戎州，文献记上元元年改属嘉州。|administration
96072|1073|41|嘉州|嘉|548|玉津为隋代设置，文献记其地原属汉南安县，并解释县名由来。|establishment
96071|1216|41|嘉州|嘉|549|绥山为隋代置于荣乐城的县，县名取自附近山名。|establishment
96075|1079|41|嘉州|嘉|550|罗目在麟德二年设置，曾省废，仪凤三年复置并属嘉州，如意元年再迁治。|chronology
96324|1195|41|普州|普|505|安居由后周柔刚县沿革而来，隋改名安居，天授二年从柔刚山迁治张栅。|seat
96328|1196|41|普州|普|507|崇龛原名隆龛，久视元年迁治波罗川，先天元年改名崇龛。|chronology
96338|1197|41|普州|普|506|普康由永唐、永康、隆康沿革而来，先天元年改称普康；文献记曾迁治伏强城。|chronology
96299|1191|41|梓州|梓|466|《旧唐书》梓州县目记通泉为隋县，地出汉广汉县。|chronology
96287|1166|41|梓州|梓|469|飞乌在隋代先置镇，后改县，以飞乌山为名。|establishment
96396|1203|41|资州|資|525|丹山于贞观四年设置，六年并入内江，七年复置。|chronology
96397|1204|41|资州|資|522|月山为义宁二年从资中地区设置的县，列于资州县目。|establishment
96398|1202|41|资州|資|524|银山为义宁二年从资中地区设置的县，列于资州县目。|establishment
200218|1214|41|陵州|陵|514|始建在隋开皇十年先置镇，大业五年改县，圣历二年迁治荣祉山。|chronology
96415|1212|41|陵州|陵|514|《新唐书》陵州县目直接列籍县，并记永徽四年从贵平分置；《旧唐书》快照中的籍县文字与始建条相连，不能把前面的始建迁治记载归给籍县。|establishment
44895|410|39|邢州|邢|258|《新唐书》邢州县目明确列青山：武德元年析龙冈、内丘置青山县，开成五年才省入龙冈；旧唐书后期县目缺载不能倒推741年不存在。|establishment
200188|1193|41|普州|普|503|《旧唐书》普州总叙记武德二年分资州之安岳、隆康、安居、普慈四县置普州；《新唐书》安岳郡县目仍列普慈。|administration
'''

# Explicitly reviewed parent paragraphs. Special cases use the relevant earlier
# historical affiliation rather than blindly accepting a later section heading.
STATE_LINES = {
 (39,'晋州'):35,(39,'沁州'):93,(39,'慈州'):63,(39,'潞州'):71,
 (39,'代州'):122,(39,'仪州'):99,(39,'太原府'):106,(39,'洺州'):242,
 (39,'魏州'):204,(39,'贝州'):230,(39,'相州'):192,(39,'沧州'):316,
 (39,'德州'):334,(39,'莫州'):374,(39,'博州'):221,(39,'怀州'):176,(39,'卫州'):184,
 (38,'河南府'):312,(38,'郑州'):343,(38,'曹州'):465,(38,'徐州'):520,
 (38,'亳州'):434,(38,'宋州'):452,(38,'陈州'):425,(38,'豫州'):402,
 (38,'许州'):382,(38,'濮州'):474,(38,'汴州'):393,(38,'济州'):487,(38,'滑州'):416,
 (40,'苏州'):122,(40,'常州'):115,(40,'越州'):148,(40,'明州'):157,
 (40,'衢州'):176,(40,'鄂州'):313,(40,'黄州'):83,(40,'沔州'):319,
 (40,'扬州'):13,(40,'寿州'):55,(40,'滁州'):30,
 (41,'嘉州'):543,(41,'普州'):503,(41,'梓州'):463,(41,'资州'):517,(41,'陵州'):510,
 (39,'邢州'):258,
}

# Additional precise quotations are manual selections made after reading the
# county paragraph in its state context. They are never found by fuzzy name.
SUPPLEMENTS = {
 '95444': [('xintangshu-39','河中府／襄陵','襄陵，〈緊。本隸晉州，元和十四年隸絳州，大和元年來屬。〉', 'administration', '《新唐书》亦记襄陵本隶晋州，元和十四年隶绛州，大和元年改属河中府。')],
 '95462': [('xintangshu-39','沁州／和川','和川，〈中。義寧元年析沁源置。〉','establishment','《新唐书》同样记和川为义宁元年分沁源所置。')],
 '95225': [('xintangshu-39','晉州／趙城','趙城，〈上。義寧元年析霍邑置。〉','establishment','《新唐书》把赵城分置时间具体记为义宁元年。')],
 '85097': [('xintangshu-39','魏州／朝城','朝城，〈緊。本武陽，貞觀十七年省入臨黃、莘。永昌元年復置，曰武聖。開元七年更名。','chronology','《新唐书》进一步记朝城在永昌元年已复置为武圣，开元七年更名；恢复设置和更名时间应分别表述。')],
 '82044': [('xintangshu-38','陳州／南頓','南頓，〈上。武德六年省入項城。證聖元年復置，曰光武，以縣有光武祠名。景雲元年復故名。〉','chronology','《新唐书》亦记南顿省入项城、恢复为光武、再恢复旧名的过程。')],
 '85106': [('xintangshu-38','濮州／范','范，〈上。武德二年以縣置范州。五年州廢，隸濟州。貞觀八年來屬。〉','administration','《新唐书》濮州条也记范县贞观八年来属。')],
 '85068': [('xintangshu-38','濮州／雷澤','雷澤，〈上。武德四年析置廩城縣，八年省。〉','chronology','《新唐书》将廪城省废记为武德八年，与《旧唐书》的贞观八年不同；本条保留年代差异。')],
 '40407': [('xintangshu-41','蘇州／長洲','長洲，〈望。萬歲通天元年析吳置。〉','establishment','《新唐书》同样记长洲为万岁通天元年从吴县分置。')],
 '40457': [('xintangshu-41','常州／武進','武進，〈望。武德三年以故蘭陵縣地置，貞觀八年省入晉陵，垂拱二年復置。','chronology','《新唐书》同样记垂拱二年复置武进；此前省入晋陵的年份与《旧唐书》州总叙不同。')],
 '40760': [('xintangshu-41','越州／山陰','山陰，〈緊。武德七年析會稽置，八年省，垂拱二年復置，大曆二年省，七年復置，元和七年省，十年復置。','chronology','《新唐书》明确山阴曾多次省置；垂拱二年为复置，不能当作该县历史上的首次设置。')],
 '40731': [('xintangshu-41','明州／慈溪','慈溪，〈上。開元二十六年析鄮置。〉','establishment','《新唐书》同样记慈溪于开元二十六年从鄮县分置。')],
 '40647': [('xintangshu-41','衢州／西安（原信安）','西安，〈望。本信安，武德四年析置定陽縣，六年省，咸通中更信安曰西安。','chronology','《新唐书》以晚期西安为县目，并明确原名信安、咸通年间才更名，不能把唐代信安与关中的西安混同。')],
 '40649': [('xintangshu-41','衢州／龍丘（盈川沿革）','如意元年析置盈川縣。證聖二年置武安縣，後省武安。元和七年省盈川入信安。','chronology','《新唐书》记盈川如意元年分置、元和七年并入信安，说明后期县目缺席有省废背景。')],
 '43463': [('xintangshu-41','鄂州／漢陽（原沔州）','漢陽，〈中。本沔州漢陽郡，武德四年以沔陽郡之漢陽、汊州二縣置。寶應二年以安州之孝昌隸之。建中二年州廢，四年復置。元和三年省孝昌。寶曆二年州又廢，二縣來屬。〉','chronology','《新唐书》亦证汉阳原为沔州，但记最后并入鄂州在宝历二年，与《旧唐书》太和七年的叙述存在差别。')],
 '43164': [('xintangshu-41','滁州／永陽','永陽。〈上。景龍三年析清流置。〉','establishment','《新唐书》记永阳分置为景龙三年，与《旧唐书》景龙二年不同，具体年份尚待校勘。')],
 '96338': [('xintangshu-42','普州／普康','普康，〈中下。本隆康，先天元年更名。有鹽。〉','chronology','《新唐书》也记普康本名隆康，先天元年更名。')],
 '96299': [('xintangshu-42','梓州／通泉','通泉，〈緊。大曆二年隸遂州，後復來屬。有鹽，有鐵。〉','administration','《新唐书》记通泉曾在大历二年改隶遂州，后又还属梓州，此为741年之后的归属变化。')],
 '96075': [('xintangshu-42','嘉州／羅目','羅目，〈中。麟德二年開生獠置，以縣置沐州。高宗上元三年州廢，縣亦省，儀鳳三年復置，來屬。有峨眉山。〉','chronology','《新唐书》明确罗目被省是在高宗上元三年，并同样记仪凤三年复置。')],
 '96397': [('xintangshu-42','資州／月山','月山，〈下。義寧二年置。〉','establishment','《新唐书》同样记月山于义宁二年设置。')],
 '96398': [('xintangshu-42','資州／銀山','銀山，〈下。義寧二年置。〉','establishment','《新唐书》同样记银山于义宁二年设置。')],
 '96415': [('xintangshu-42','陵州／籍','籍。〈上。永徽四年析貴平置。東五里有漢陽堰，武德初引漢水溉田二百頃，後廢，文明元年，令陳充復置，後又廢。有鹽。〉','establishment','《新唐书》陵州县目直接列籍县，并记永徽四年从贵平分置；这是对《旧唐书》底本连缀文字的独立校核。')],
 '44895': [('xintangshu-39','邢州／青山（龙冈、内丘分置）','邢州鉅鹿郡，上。本襄國郡，天寶元年更名。土貢：絲布、磁器、刀、文石。戶七萬一百八十九，口三十八萬二千七百九十八。縣八。龍岡，〈上。武德元年析龍岡、內丘置青山縣，開成五年省入焉。〉','establishment','《新唐书》州条把青山列在邢州县目中，并明确其武德元年分置、开成五年才省入龙冈，支持741年模型中的邢州青山身份。')],
 '200188': [('xintangshu-42','普州安岳郡／普慈','普州安岳郡，中。武德二年析資州置。土貢：雙紃、葛布、柑、天門冬煎。戶二萬五千六百九十三，口七萬四千六百九十二。縣六。安岳，〈上。有鹽。〉安居，〈中下。大曆二年隸遂州，後復來屬。有鹽。〉普慈，〈中。〉樂至，〈中。武德三年置。有鹽。〉普康，〈中下。本隆康，先天元年更名。有鹽。〉崇龕。〈中。本隆龕，武德三年置，先天元年更名。〉','administration','《新唐书》安岳郡县目仍列普慈，且把普州记作武德二年从资州析置；与《旧唐书》普州总叙共同支持州县身份。')],
}

ISSUES = {
 '44837': '清漳省县年份在《旧唐书》洺州总叙为会昌元年、肥乡条为会昌三年；本条只确认其在会昌年间省废。',
 '85097': '两唐书对朝城复置过程的详略不同；本条不把开元七年的更名直接等同为首次恢复设置。',
 '85068': '廪城并入雷泽的时间在两唐书中分别为贞观八年、武德八年，尚未据其他版本定夺。',
 '40457': '武进此前省入晋陵的时间，旧唐书州总叙接在武德八年，新唐书记贞观八年，待进一步校勘。',
 '43463': '沔州最后并入鄂州的年代两唐书所述不同，尚未据唐代文书或其他史志定夺；两说均晚于741年及755年。',
 '43164': '永阳始置年份在两唐书间差一年，尚未核定；不以其中一说覆盖另一说。',
 '43276': '《旧唐书》临涣条分别记元和九年、大和元年改隶宿州，属于后期时点差异，尚未校勘。',
 '44323': '《旧唐书》开封县条有“延和元年六年”字样，疑有文本问题；采用同卷州总叙、浚仪条确认延和元年复置，不擅改原文。',
 '45303': '东阿在天宝十三载已经改属郓州；模型保留741年的济州层级，不能当作755年仍隶济州的证据。',
}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    rows = [line.split('|') for line in REVIEWED.strip().splitlines()]
    models = {f['properties']['recordId']: f['properties'] for f in json.loads((ROOT / 'public/data/boundaries/hartwell-741-county.geojson').read_text())['features']}
    points = {f['properties']['sourceRecordId']: f['properties'] for f in json.loads((ROOT / 'public/data/tang-detail/settlements-755.geojson').read_text())['features']}
    diagnostics = json.loads((ROOT / 'public/data/tang-county-diagnostics.json').read_text())['byBoundary']
    sources, texts, primary_lines = {}, {}, {}
    for chapter in (38,39,40,41):
        directory = 'south-east' if chapter == 41 else 'north-west'
        meta = json.loads((ROOT / f'data/evidence/tang-expansion/{directory}/jiutangshu-{chapter}.json').read_text())
        source = {k: meta[k] for k in ('title','url','snapshotPath','snapshotSha256','retrievedAt')}
        source.update(id=f'county-bulk-jiutangshu-{chapter}',kind='official-history')
        sources[source['id']] = source
        texts[source['id']] = (ROOT / source['snapshotPath']).read_text()
        primary_lines[chapter] = texts[source['id']].splitlines()
    for key in {item[0] for values in SUPPLEMENTS.values() for item in values}:
        meta = json.loads((SNAPSHOTS / f'{key}.json').read_text())
        source = {k: meta[k] for k in ('title','url','kind','snapshotPath','snapshotSha256','retrievedAt')}
        source['id'] = f'county-bulk-{key}'
        sources[source['id']] = source
        texts[source['id']] = (ROOT / source['snapshotPath']).read_text()

    # Exact field extracts, with reproducible provenance back to the unchanged
    # imported source records. These are archival extracts, not new observations.
    model_quotes, point_quotes = {}, {}
    for sid,mid,*_ in rows:
        m,p = models[mid],points[sid]
        model_quotes[mid] = json.dumps({k:m[k] for k in ('id','recordId','sourceName','sourceCode','sourceHierarchy')},ensure_ascii=False)
        point_quotes[sid] = json.dumps({k:p[k] for k in ('id','sourceRecordId','name','beginYear','endYear','presentLocation','sourceRecord')},ensure_ascii=False)
    for key,quotes,url,title,origin in [
        ('hartwell-models',model_quotes,'https://doi.org/10.7910/DVN/29302','Hartwell CHGIS 741 年县模型原始身份字段摘录','public/data/boundaries/hartwell-741-county.geojson'),
        ('chgis-points',point_quotes,'https://doi.org/10.7910/DVN/Q9VOF5','CHGIS V6 唐代治所点原始记录摘录','public/data/tang-detail/settlements-755.geojson')]:
        path = SNAPSHOTS / f'{key}.jsonl'
        provenance = {'extractedFrom':origin,'inputSha256':digest(ROOT / origin),'note':'仅摘录原始身份字段；无坐标或县界调整。'}
        path.write_text(json.dumps(provenance,ensure_ascii=False)+'\n'+'\n'.join(quotes.values())+'\n')
        source={'id':f'county-bulk-{key}','title':title,'url':url,'kind':'dataset','snapshotPath':str(path.relative_to(ROOT)),'snapshotSha256':digest(path),'retrievedAt':datetime.now(timezone.utc).isoformat()}
        sources[source['id']]=source
        texts[source['id']]=path.read_text()

    entries=[]
    for sid,mid,ch,state,parent,ln,fact,topic in rows:
        ch,ln=int(ch),int(ln)
        m,p=models[mid],points[sid]
        assert m['sourceHierarchy']['prefecture']==parent,(sid,m['sourceHierarchy'])
        d=diagnostics[m['id']]
        assert d['status']=='outside' and d['minDistanceKm'] <= 100,(sid,d['status'])
        assert p['id'] in [v['id'] for v in d['sourcePoints']],sid
        assert sid not in ('43627','43673','42505'),sid
        old_id=f'county-bulk-jiutangshu-{ch}'
        county_quote=primary_lines[ch][ln-1]
        state_line=STATE_LINES[(ch,state)]
        state_quote=primary_lines[ch][state_line-1]
        name=p['name']
        loc=f'卷{ch}·地理志·{state}沿革及{name}条（快照第{ln}行）'
        def old(quote,locator=loc):
            return {'sourceId':old_id,'quote':quote,'locator':locator}
        identity_evidence=[
            {'sourceId':'county-bulk-hartwell-models','quote':model_quotes[mid],'locator':f'v5_0741_chin_chn_0741_c，原始记录 {mid}，sourceHierarchy.prefecture'},
            {'sourceId':'county-bulk-chgis-points','quote':point_quotes[sid],'locator':f'CHGIS V6 县治所点原始记录 SYS_ID={sid}'},
            old(state_quote,f'卷{ch}·地理志·{state}沿革（快照第{state_line}行）'),
        ]
        if county_quote != state_quote:identity_evidence.append(old(county_quote))
        # A few later compilations retain a county that the Old Tang Book's
        # county list omits. Include the manual cross-check quote in the
        # identity finding itself so the state-and-county match is explicit.
        for key,section,quote,addtopic,statement in SUPPLEMENTS.get(sid,[]):
            identity_evidence.append({'sourceId':f'county-bulk-{key}','quote':quote,'locator':sources[f'county-bulk-{key}']['title']+'·'+section})
        findings=[
            {'topic':'identity','statement':f'按原始县名、州属及县条沿革共同核对，本组模型与治所记录可对应{state}{name}这一历史行政单位；行政身份对应不等于县界或坐标已核实。','evidence':identity_evidence},
            {'topic':topic,'statement':fact,'evidence':[old(county_quote),old(state_quote,f'卷{ch}·地理志·{state}沿革（快照第{state_line}行）')]},
        ]
        if sid=='44323':
            findings[1]['evidence'].append(old(primary_lines[ch][394-1], '卷38·汴州·浚仪条（开封复置）'))
        if sid=='82432':
            findings[1]['evidence'].append(old(primary_lines[ch][332-1], '卷38·河南府·河阳等县改属孟州记载'))
        if sid=='44837':
            findings[1]['evidence'].append(old(primary_lines[ch][247-1], '卷39·洺州·肥乡条（清漳省废）'))
        for key,section,quote,addtopic,statement in SUPPLEMENTS.get(sid,[]):
            findings.append({'topic':addtopic,'statement':statement,'evidence':[{'sourceId':f'county-bulk-{key}','quote':quote,'locator':sources[f'county-bulk-{key}']['title']+'·'+section}]})
        unresolved=['本条古籍证据尚不能独立核实治所经纬度和县域边界，现有点面不相容的成因仍待考。','741年县模型与755年治所点属不同资料时点；身份对应不可直接转为同年县界。']
        if sid in ISSUES:unresolved.insert(0,ISSUES[sid])
        entries.append({'id':f'tang-county-research-bulk-{sid}','settlementIds':[p['id']],'boundaryIds':[m['id']],'title':f'{name}（{state}）身份与沿革','summary':fact+' 县名、州属已作文本核对，坐标及县界仍未独立验证。','findings':findings,'unresolved':unresolved,'correspondence':'same-unit'})
    assert len({e['id'] for e in entries})==len(entries)
    for source in sources.values():
        assert digest(ROOT/source['snapshotPath'])==source['snapshotSha256'],source['id']
    for entry in entries:
        for f in entry['findings']:
            for ev in f['evidence']:
                assert ev['quote'] in texts[ev['sourceId']],(entry['id'],ev)
    bundle={'id':'tang-county-research-bulk','sources':list(sources.values()),'entries':entries}
    (OUT/'bulk.json').write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'entries':len(entries),'sources':len(sources),'findings':sum(len(e['findings']) for e in entries),'citations':sum(len(f['evidence']) for e in entries for f in e['findings']),'validation':'all hashes and literal quotes passed; curated original parent and scope checked'},ensure_ascii=False))

if __name__=='__main__':
    main()
