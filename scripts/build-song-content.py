#!/usr/bin/env python3
"""Build Song-period profiles from pinned, reviewed texts; never generate coordinates.

The 1200 reading layer includes Southern Song, Jin, Western Xia and Dali. Geography
chapters combine different reigns. Exact dated entries use explicit dated text;
contradictions are preserved and explained instead of silently harmonized.
"""
import hashlib
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'data/evidence/song-research'
SNAP = BASE / 'sources'

def read(path): return json.loads(path.read_text())
def dump(path, value): path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

# id, map name at the 1200 reading date, administrative name, region, source
# paragraph selectors, reviewed summary, identity/date caveat. A leading '='
# selector quotes an exact substring rather than the full source paragraph.
SPECS = [
('changan','京兆府','京兆府','金·京兆府路', [('songshi-87','京兆府，'),('jinshi-26','京兆府，上。'),('jinshi-26','長安倚。'),('jinshi-26','咸寧倚。')],
 '北宋京兆府曾使用永兴军军额，宣和二年诏守臣衔称京兆府。1200年阅读截面属金，金代皇统二年置总管府；长安、咸宁为附郭县，长安条并载终南山、沣水和渭水。府、附郭县和唐代长安都城应分开阅读。',
 '1200年显示金代京兆府，不沿用唐长安的首都地位。现有点仅为西安地区参考；府域、长安县域与各代城址不同。'),
('luoyang','河南府','河南府','金·南京路', [('songshi-85','西京。唐'),('jinshi-25','河南府，'),('jinshi-25','洛陽倚。')],
 '北宋洛阳为西京河南府，文献记宫城沿用隋唐旧名。金代仍为河南府，洛阳为附郭县，条文列北邙山和伊、洛等水。兴定元年才升为中京、府名金昌；1200年不能提前使用这一后来的名称。',
 '北宋西京是洛阳，金代西京则是大同；1200年的洛阳入口使用河南府，1217年中京金昌府仅在沿革中记录。'),
('beijing','中都','大兴府','金·中都路', [('jinshi-24','=中都路，遼會同元年為南京，開泰元年號燕京。海陵貞元元年定都，以燕乃列國之名，不當為京師號，遂改為中都。'),('jinshi-24','大興府，上。')],
 '此地经历辽南京、燕京和金中都的名称变化。金海陵王贞元元年定都并改称中都，府名大兴；1200年这里是金朝都城。大兴府所辖县与中都城及宫城分属不同范围，不能将北京地区参考点视作金代宫城实测位置。',
 '宋代诸政权页面的中都是金都，不是宋朝都城；辽南京、金中都、元大都与明清北京并非相同城界。'),
('kaifeng','南京开封府','开封府','金·南京路', [('songshi-85','開封府。'),('jinshi-25','=南京路，國初曰汴京，貞元元年更號南京。'),('jinshi-25','開封府，上。'),('jinshi-25','開封東附郭。')],
 '开封是北宋京师所在地区，入金后初称汴京，贞元元年改号南京。1200年属金的南京开封府，不能标作南宋都城；《金史》另记开封县东附郭及汴河、关津。府、附郭县和都城范围需分别理解。',
 '这里的南京指金朝南京开封府，今河南开封；与今江苏南京的南宋建康府、北宋南京应天府均不是同一地点。'),
('nanjing','建康府','建康府','南宋·江南东路', [('songshi-88','江寧府，上，'),('songshi-88','=上元，次赤。\n江寧，次赤。')],
 '北宋江宁府在建炎三年恢复建康府名，当年五月高宗在府治建行宫。绍兴八年置主管行宫留守司公事，三十一年改为行宫留守。上元、江宁是府下不同县，建康府与城内行宫不能共用一个范围。',
 '1200年地图显示建康府，现代对应南京地区；不要与金朝位于开封的南京或北宋位于商丘的南京混同。'),
('hangzhou','临安府','临安府','南宋·两浙西路', [('songshi-88','臨安府，大都督府'),('songshi-88','=錢塘，望。有鹽監。\n仁和，望。梁錢江縣。太平興國四年改。紹興中，與錢塘並陞赤。'),('songshi-36','紹熙元年春正月')],
 '临安府本杭州，建炎三年升府，绍兴五年兼浙西安抚使。钱塘、仁和两县在绍兴年间升赤县；光宗本纪还记绍熙元年蠲临安府民身丁钱三年。府、府城和同名临安县是不同对象。',
 '南宋临安府治在今杭州地区；府下另有临安县，不能据“临安”同名把府治移到今临安区。'),
('chengdu','成都府','成都府','南宋·成都府路', [('songshi-89','成都府，次府'),('songshi-89','=成都，次赤。\n華陽，次赤。')],
 '成都在北宋多次于益州、成都府之间更改，嘉祐五年复为府，六年复节度。南宋绍兴元年领成都路安抚使，后又多次调整四川宣抚、制置机构。成都、华阳为同城不同县，府与成都府路也不是同一级行政范围。',
 '1200年以成都府为当前建置；府、路、成都县与华阳县分别呈现，不把唐代成都政治事件用作本朝概览。'),
('guangzhou','广州','广州','南宋·广南东路', [('songshi-90','廣州，中，'),('songshi-90','番禺，上。'),('songshi-90','香山，紹興二十二年')],
 '广州在宋代为广南东路重要治所，领经略、安抚使，地理志列海舶香料等贡物。番禺曾并入南海，皇祐三年复置；绍兴二十二年又以东莞香山镇置香山县。城、州与附属县及海舶活动应分别阅读。',
 '宋代广州、南海县和番禺县层级不同；香山县是1152年新增建置，不能倒用于更早的北宋截面。'),
('yangzhou','扬州','扬州','南宋·淮南东路', [('songshi-88','揚州，大都督府'),('songshi-88','江都。緊。')],
 '扬州建炎元年升帅府，二年高宗驻跸；江都为所属县，熙宁五年曾省广陵县入江都。地理志同时记述南渡后县属变化，体现扬州在江淮政务中的地位，不能把整条沿革当作1200年单一清单。',
 '扬州为州级单位，江都为县；古扬州刺史部、宋扬州和现代扬州市的范围不能互换。'),
('xiangyang','襄阳府','襄阳府','南宋·京西南路', [('songshi-85','襄陽府，望，'),('songshi-85','中盧，中下。')],
 '襄阳原为襄州，宣和元年升为府，地理志列襄阳、邓城、谷城等县。中庐县在绍兴五年省入南漳，说明北宋和南宋县属并不完全相同；1200年应按南宋襄阳府理解，不能沿用唐襄州的全部属县。',
 '襄阳府、襄阳县和对岸樊城不同；南渡后的省县记录用于沿革说明，不由文字自动生成府界。'),
('jingzhou','江陵府','江陵府','南宋·荆湖北路', [('songshi-88','江陵府，次府'),('songshi-88','=江陵，次赤。')],
 '江陵府在建炎二年升帅府，随后镇抚、安抚与制置机构多次调整。淳熙元年曾还称荆南府，不久又见江陵府制置使；江陵县另为府下单位。府域、江陵县域和江陵城不能因同名混为一体。',
 '1200年使用江陵府；荆南为相关阶段称谓。景定元年“移治于鄂”所记机构迁置，不能据此把江陵地点移动到鄂州。'),
('jinyang','平晋县','平晋县','金·河东北路·太原府', [('songshi-86','太原府，太原郡'),('songshi-86','平晉。中。'),('jinshi-26','陽曲倚。'),('jinshi-26','平晉貞祐')],
 '宋太平兴国四年毁晋阳旧城，州治先迁榆次，七年迁唐明监。旧城地区关联的平晋县在熙宁三年省入阳曲、政和五年复置；金代地理志仍列平晋县，而太原府附郭县为阳曲。因此本点不代表宋金太原府治。',
 '本入口保留晋阳旧城地区参考坐标，1200年关联平晋县；平晋县治的精确位置尚待专门核定，不能把阳曲的太原府治或府界当作本点县治。'),
('datong','西京大同府','大同府','金·西京路', [('jinshi-24','大同府，中，'),('jinshi-24','大同倚。')],
 '大同在辽重熙十三年升为西京，府名大同，金沿用。金天德二年改置本路都总管府，后来置留守司；大同县为附郭县。1200年应显示金西京大同府，不能误作宋西京洛阳或普通州级单位。',
 '金西京在大同，北宋西京在洛阳；源边界若记“大同府州”且类型为州，应保留来源冲突，不据近似同名静默匹配。'),
('linzi','临淄县','临淄县','金·山东东路·益都府', [('jinshi-25','益都府，上，'),('jinshi-25','臨淄有南郊山')],
 '1200年临淄是金代益都府属县，地理志记南郊山、牛山、天齐渊和康浪水。它不再是先秦齐国都城的行政层级，也不能把上级益都府的完整辖区当成临淄县范围。',
 '临淄县与益都府分属不同级别；古齐都遗址、宋金县城与现代临淄区的边界需分别核查。'),
('handan','邯郸县','邯郸县','金·河北西路·磁州', [('jinshi-25','磁州，中，'),('jinshi-25','邯鄲有邯山')],
 '金代邯郸列在磁州属县，地理志记邯山、灵山、漳水及镇名；条文另指出镇名在不同资料间有出入。1200年应按县级入口阅读，不能直接套用明代转隶广平府后的行政关系。',
 '本期上级为磁州，明代才转入广平府；若模型把上级写成“磁府”，仅作为源数据异名提示，不能把州升格为府。'),
('tongguan','潼关','潼关','金·京兆府路·华州华阴县', [('jinshi-26','華州，中。'),('jinshi-26','華陰有太華山')],
 '《金史》华阴县条在太华山、黄河、渭水之后列潼关，支持1200年关隘入口与华州华阴县的关系。潼关是关隘，不是普通县，也不是明代潼关卫；古今关址变化仍须另行核查。',
 '关隘与县、军卫分属不同类型；本点只联系潼关地区，不会为“潼关”名称补造一个宋金县界。'),
('yinchuan','兴庆府','兴庆府','西夏', [('songshi-485','元昊既悉有夏'),('songshi-486','紹熙四年九月'),('songshi-486','純佑，仁宗長子'),('songshi-486','開禧二年正月二十日')],
 '《宋史》西夏传记兴州兴庆府依黄河、贺兰山而设官驻兵。绍熙四年仁孝去世，纯佑继位，次年改天庆，至开禧二年被废；1200年落在西夏纯佑在位期间，不能按宋朝府县体系呈现。',
 '兴庆府属西夏都城地区；“宋代”页面是同时代诸政权总览，不表示宋朝辖有此地。西夏城墙与具体府域尚未由本轮文字核定。'),
('quanzhou','泉州','泉州','南宋·福建路', [('songshi-89','泉州，望，'),('songshi-89','晉江，望。'),('songshi-89','惠安，望。'),('songshi-85','=太宗太平興國三年，陳洪進獻地，得州二（漳、泉），縣十四，戸十五萬一千九百七十八；')],
 '太平兴国三年陈洪进献漳泉二州，泉州纳入宋朝；太平兴国六年又析晋江置惠安。地理志记晋江、惠安盐亭和同安盐场，泉州的州域、县域及港口经济空间需要分开理解。',
 '泉州属州级，晋江为所属县；港口和海岸线不能由海贸名声推定为整个州域，更不能按现代港区形状复原宋代岸线。'),
('dali','大理','大理国都城地区','大理国', [('songshi-488','大理國，即唐南詔也。'),('songshi-488','紹興三年十月，'),('dali-reference','唐天复二年'),('dali-reference','大理国历经了316年后')],
 '《宋史》记大理与宋使节、贡马及互市往来；这些外交记述不等于宋朝在此设置府县。固定版本地方概述记段氏937年在羊苴咩城建大理国，1253年亡，1200年应作为同时代大理国都城地区阅读。',
 '大理国与宋为不同政权；太和城、羊苴咩城和明代大理府城不是跨朝代完全重合的城址。本条具体1200年政区与都城范围仍待同期材料互证。'),
('dunhuang','沙州','沙州','西夏·河西', [('songshi-485','元昊既悉有夏'),('dunhuang-reference','北宋景祐三年（1036年）')],
 '《宋史》西夏传记元昊所据地区包括瓜、沙诸州；固定版本地方概述记敦煌自1036年为西夏占据并统治191年。1200年本入口按西夏沙州地区阅读，不能因页面名称“宋”而归入南宋。',
 '敦煌是现代地区对应名，沙州为本期历史入口名；1036年的具体攻取纪年目前据二手概述，仍待敦煌文书及西夏研究互证。'),
('suzhou','平江府','平江府','南宋·两浙西路', [('songshi-88','平江府，望，'),('songshi-88','=呉，望。\n長洲，望。'),('songshi-88','嘉定。上。')],
 '苏州在政和三年升平江府，地理志列吴、长洲等县。嘉定县到嘉定十五年才从昆山析置；文献所列六县是跨阶段汇记，不能全部放入1200年截面。府与吴、长洲等附属县也不共用一个范围。',
 '1200年显示平江府，现代对应苏州地区；1222年嘉定置县属于后来的沿革，不作为本期既有县显示。'),
('qizhou-jinan','济南府','济南府','金·山东东路', [('songshi-85','濟南府，上，'),('jinshi-25','濟南府，散，上。'),('jinshi-25','曆城鎮六')],
 '北宋齐州于政和六年升济南府，金代沿用济南府，设置尹与山东东西路提刑司。地理志列历城及其盘水、中宫、遥墙等镇；1200年应使用金代当期建置，不能沿用唐齐州层级或北宋全部县属。',
 '齐州是较早名称，1200年为金代济南府；历城县与府、现代济南市不是相同范围。'),
('yanzhou','兖州','兖州','金·山东西路', [('jinshi-25','兗州，中，'),('jinshi-25','嵫陽本瑕丘。'),('jinshi-25','曲阜宋名仙源。')],
 '《金史》将兖州记为宋袭庆府鲁郡的后继单位，大定十九年调整军号，属下列嵫阳、曲阜等县。嵫阳本瑕丘，曲阜在宋曾称仙源；州、县以及时代不同的名称不能当作并列城邑。',
 '1200年为金代兖州；北宋袭庆府、唐鲁郡和明兖州府属于不同阶段，不应统一套作府级。'),
('ezhou-jiangxia','鄂州','鄂州','南宋·荆湖北路', [('songshi-88','鄂州，緊，'),('songshi-88','=江夏，緊。\n崇陽，望。唐縣。開寶八年，又改今名。')],
 '鄂州以江夏为所属县，建炎二年兼鄂、岳制置使，绍兴二年改兼荆湖北路安抚。嘉定十一年又置沿江制置副使，但这是1200年之后的机构变化。鄂州军政机构、州县范围与城址需分别理解。',
 '宋鄂州治江夏，现地在武汉武昌地区，不能因同名跳到现代鄂州市；武昌军是军额，不是此时的明代武昌府。'),
('fuzhou-fujian','福州','福州','南宋·福建路', [('songshi-89','福州，大都督府'),('songshi-89','=閩，望。\n侯官，望。')],
 '宋代福州为长乐郡、威武军节度所在地，建炎三年升帅府，旧领福建路钤辖。文献在所属县中并列闽、侯官，并列荔枝、紫菜、红花蕉布等贡物；州、附属县与物产区应分别阅读。',
 '宋代显示福州，不提前称明代福州府；闽县与侯官县为不同县，沿海物产记述不证明海岸位置。'),
('yuzhou-chongqing','重庆府','重庆府','南宋·夔州路', [('songshi-89','重慶府，下，'),('songshi-36','=八月甲午，升恭州爲重慶府。')],
 '渝州在崇宁元年改恭州；《宋史》光宗本纪淳熙十六年八月明确记升恭州为重庆府，因此1200年应显示重庆府。地理志所写“高宗潜藩”与本纪存在差异，本条据本纪核定1189年升府，不沿用错误帝号。',
 '渝州、恭州、重庆府分别属不同阶段；1200年源模型若仍写渝州，应提示名称与层级冲突，不能把州级面无说明当作已核重庆府界。'),
('guizhou-guilin','静江府','静江府','南宋·广南西路', [('songshi-90','靜江府。本桂州，'),('songshi-90','臨桂，')],
 '静江府本桂州，绍兴三年以高宗潜邸升府，原领广南西路兵马钤辖并兼经略、安抚。临桂为所属县；宝祐六年改制置大使是后来的机构变动，不应提前带入1200年。',
 '宋代当前名为静江府，现代对应桂林地区；唐桂州、明桂林府与城内靖江王府不属于同一年代或层级。'),
('mingzhou','庆元府','庆元府','南宋·两浙东路', [('songshi-88','=慶元府，本明州，奉化郡，建隆元年，陞奉國軍節度。本上州，大觀元年，陞爲望。紹興初，置沿海制置使。八年，以浙東安撫使兼制司；十一年，罷；隆興元年，復置。淳熙元年，魏惠憲王自宣州移鎭，置長史、司馬。紹熙五年，以甯宗潛邸，陞爲府。'),('songshi-88','=鄞，望。\n奉化，望。'),('songshi-88','昌國。下。')],
 '明州在绍熙五年以宁宗潜邸升庆元府，1200年应采用升府后的名称。绍兴间沿海制置机构多次置罢；昌国县在熙宁六年由鄞县析置，说明府域还包含海岛县，不能只以府城范围理解。',
 '庆元府位于今宁波地区，不是处州庆元县；唐明州、南宋庆元府和明代宁波府按时代区分。'),
('hongzhou','隆兴府','隆兴府','南宋·江南西路', [('songshi-88','隆興府，本洪州，'),('songshi-33','=辛巳，升洪州爲隆興府。'),('songshi-88','新建，望。')],
 '洪州在孝宗隆兴元年十月升隆兴府，本纪有明确纪日。地理志另作“隆兴三年”，与本纪及年号年数不合，本条采用本纪1163年纪年并保留差异。南昌、新建为不同县，新建在太平兴国六年置。',
 '1200年显示隆兴府，不用唐洪州或明南昌府作为当前名称；“隆兴三年”原文作为存疑记载展示，不能生成1165年升府节点。'),
]

# Only assign Gregorian years where a source gives an unambiguous reign/year.
# quote indices refer to the reviewed source passages above.
EVENTS = {
 'changan':[(1120,'北宋·宣和二年','守臣衔称京兆府','诏永兴军守臣衔不用军额、称京兆府。',0),(1142,'金·皇统二年','京兆府置总管府','金代京兆府置总管府；本条属于同期金朝建置。',1)],
 'luoyang':[(1217,'金·兴定元年八月','河南府升中京金昌府','河南府升为中京，府名金昌；此变化晚于地图1200年截面。',1)],
 'beijing':[(1153,'金·贞元元年','燕京改中都并定都','海陵王定都燕京并改为中都，属于同期金朝都城沿革。',0)],
 'kaifeng':[(1153,'金·贞元元年','汴京更号南京','金朝将汴京更号南京；此南京指开封。',1)],
 'nanjing':[(1129,'南宋·建炎三年','恢复建康府并建行宫','恢复建康府名，五月高宗在府治建行宫。',0),(1138,'南宋·绍兴八年','置行宫留守司公事','建康置主管行宫留守司公事，体现行宫相关政务。',0)],
 'hangzhou':[(1129,'南宋·建炎三年','杭州升临安府','杭州升为临安府，并带兵马钤辖。',0),(1135,'南宋·绍兴五年','兼浙西安抚使','临安府兼浙西安抚使。',0),(1190,'南宋·绍熙元年正月','蠲临安身丁钱','光宗本纪记再蠲临安府民身丁钱三年。',2)],
 'chengdu':[(988,'北宋·端拱元年','恢复成都府','恢复剑南西川成都府，后又有州府变化。',0),(1060,'北宋·嘉祐五年','益州复为成都府','此前淳化五年降为益州，至嘉祐五年复为府。',0),(1131,'南宋·绍兴元年','领成都路安抚使','成都府领成都路安抚使。',0)],
 'guangzhou':[(1051,'北宋·皇祐三年','恢复番禺县','番禺曾废入南海，皇祐三年复置。',1),(1152,'南宋·绍兴二十二年','置香山县','以东莞香山镇置县；这是广州辖县变化，不是广州城迁移。',2)],
 'yangzhou':[(1072,'北宋·熙宁五年','广陵县并入江都','省广陵县入江都。',1),(1128,'南宋·建炎二年','高宗驻跸扬州','地理志明确记建炎二年高宗驻跸。',0)],
 'xiangyang':[(1119,'北宋·宣和元年','襄州升襄阳府','襄州升为襄阳府。',0),(1135,'南宋·绍兴五年','中庐县省入南漳','中庐省入南漳，属府下县级建置变化。',1)],
 'jingzhou':[(1128,'南宋·建炎二年','江陵升帅府','江陵府升帅府。',0),(1174,'南宋·淳熙元年','江陵还称荆南府','地理志记还为荆南府，不久又见江陵府制置使。',0)],
 'jinyang':[(979,'北宋·太平兴国四年','毁晋阳城并迁治榆次','平北汉后毁旧城、迁治榆次；本点不再代表后来的太原府治。',0),(982,'北宋·太平兴国七年','州治迁唐明监','太原州治由榆次再迁唐明监；这是与晋阳旧城不同的地点。',0),(1115,'北宋·政和五年','复置平晋县','平晋此前在熙宁三年省入阳曲，政和五年复置。',1),(1216,'金·贞祐四年七月','平晋县废','金代平晋县废，兴定元年又复置。',3),(1217,'金·兴定元年','金复置平晋县','金代恢复平晋县；不能理解为太原府迁回晋阳。',3)],
 'datong':[(1044,'辽·重熙十三年','大同升西京','辽升西京，府名大同，金沿用。',0),(1150,'金·天德二年','改本路都总管府','大同原兵马都部署司改本路都总管府。',0)],
 'yinchuan':[(1193,'宋绍熙四年／西夏仁宗末年','仁孝去世，纯佑继位','西夏仁孝于九月去世，纯佑嗣位；宋纪年用于对应，不表示宋统治。',1),(1194,'西夏·天庆元年','纯佑改元天庆','纯佑继位次年改元天庆，1200年在其在位期间。',2),(1206,'宋开禧二年／西夏末期纪年','纯佑被废','西夏纯佑在正月被废；这是地图截面之后的沿革。',3)],
 'quanzhou':[(978,'北宋·太平兴国三年','陈洪进献漳泉','陈洪进献漳、泉二州，宋取得所属十四县。',3),(981,'北宋·太平兴国六年','析晋江置惠安','从晋江县析置惠安县。',2),(1107,'北宋·大观元年','泉州升望郡','泉州由上郡升望郡。',0)],
 'dali':[(1133,'南宋·绍兴三年十月','宋讨论大理贡马与售马','《宋史》记大理请求入贡售马，宋廷讨论贸易安排；本条是宋与大理交往。',1),(1136,'南宋·绍兴六年七月','大理遣使贡象马','大理再遣使贡象马，宋命广西经略司护送行在。',1)],
 'dunhuang':[(1036,'北宋景祐三年／西夏扩张时期','敦煌进入西夏统治','固定版本二手概述记敦煌此年为西夏占领；具体攻取纪年仍待一手文书互证。',1)],
 'suzhou':[(1113,'北宋·政和三年','苏州升平江府','苏州升为平江府。',0),(1222,'南宋·嘉定十五年','析昆山置嘉定县','从昆山县析置嘉定县，以年号为名，晚于1200年截面。',2)],
 'qizhou-jinan':[(1116,'北宋·政和六年','齐州升济南府','齐州升为济南府。',0)],
 'yanzhou':[(1179,'金·大定十九年','兖州改军号','《金史》记旧名泰宁军在大定十九年更号；本条不是兖州升府。',0)],
 'ezhou-jiangxia':[(1128,'南宋·建炎二年','兼鄂岳制置使','鄂州兼鄂、岳制置使。',0),(1132,'南宋·绍兴二年','兼荆湖北路安抚','鄂州改兼荆湖北路安抚。',0),(1218,'南宋·嘉定十一年','置沿江制置副使','鄂州置沿江制置副使，晚于1200年。',0)],
 'fuzhou-fujian':[(1129,'南宋·建炎三年','福州升帅府','地理志记建炎三年福州升帅府。',0)],
 'yuzhou-chongqing':[(1102,'北宋·崇宁元年','渝州改恭州','渝州改名恭州。',0),(1189,'南宋·淳熙十六年八月','恭州升重庆府','据光宗本纪升恭州为重庆府；不采用地理志“高宗潜藩”的帝号。',1)],
 'guizhou-guilin':[(1133,'南宋·绍兴三年','桂州升静江府','桂州以高宗潜邸升为静江府。',0)],
 'mingzhou':[(1073,'北宋·熙宁六年','析鄞置昌国县','从鄞县析置昌国县。',2),(1194,'南宋·绍熙五年','明州升庆元府','以宁宗潜邸升为庆元府。',0)],
 'hongzhou':[(981,'北宋·太平兴国六年','置新建县','新建县始置，与南昌县分别存在。',2),(1163,'南宋·隆兴元年十月','洪州升隆兴府','采用孝宗本纪所载隆兴元年十月辛巳，地理志“隆兴三年”保留为存疑异文。',1)],
}


def main():
    BASE.mkdir(parents=True, exist_ok=True)
    sources = {}; texts = {}
    used = sorted({key for spec in SPECS for key, _ in spec[4]})
    for key in used:
        if key.endswith('-reference'):
            city = key.removesuffix('-reference'); m = read(ROOT/f'data/evidence/historical-context/{city}.json')
            s = {k:m[k] for k in ['title','retrievedAt','snapshotPath','snapshotSha256']}
            s.update({'id':f'song-research-{key}', 'url':f'https://zh.wikipedia.org/w/index.php?oldid={m["revision"]["revid"]}', 'kind':'secondary-reference', 'note':'固定版本二手百科概述，仅用于同时代政权与地区沿革参照；详细年代、城址及辖区仍需一手资料互证。', 'revisionId':str(m['revision']['revid'])})
        else:
            m=read(SNAP/f'{key}.json');s=dict(m)
            s.update({'kind':'historical-text','note':'元代编纂正史的固定修订电子文本，原始API、文本和SHA256均归档；各卷会合并不同年代，原文异文保留并在条目说明，不能据文字证明古址坐标、精确边界或历史河岸。'})
        sources[key]=s; p=ROOT/s['snapshotPath'];assert sha(p)==s['snapshotSha256'];texts[key]=p.read_text()
    entries=[]; names={}
    for pid,mapname,name,region,selectors,summary,naming in SPECS:
        citations=[]
        for key,prefix in selectors:
            q=prefix[1:] if prefix.startswith('=') else next((line.strip() for line in texts[key].splitlines() if line.strip().startswith(prefix)),None)
            assert q and q in texts[key], (pid,key,prefix)
            assert '{{' not in q
            s=sources[key]
            citations.append({'sourceId':s['id'],'sourceTitle':s['title'],'sourceKind':s['kind'],'sourceUrl':s['url'],'quote':q,'locator':f'{s["title"]}·{q[:24]}'+('…' if len(q)>24 else '')})
        unresolved=['史料能支持建置与名称沿革，不能单独核定当时治所坐标、城墙范围、府县精确边界或山河形态。','地理志兼记北宋、南宋或金代多个阶段；县数、机构与后期名称不直接等同1200年政区快照。']
        if pid=='hongzhou':unresolved.append('卷88作“隆兴三年”，卷33本纪明确在隆兴元年十月；本轮据本纪采用1163年，保留两处原文供复核。')
        if pid=='yuzhou-chongqing':unresolved.append('卷89“高宗潜藩”与光宗本纪升府记载不合；采用卷36淳熙十六年(1189)的明确纪年，不据旧渝州模型宣称重庆府界已核定。')
        if pid in ('dali','dunhuang'):unresolved.append('1200年具体地区政权及前后连续统治目前部分依赖二手固定版本概述，仍需同期文书、考古与专门研究互证。')
        if pid=='jinyang':unresolved.append('保留晋阳旧城地区参考点；本轮文字未证明平晋县治精确坐标，太原府治阳曲必须与此点分开。')
        entry={'id':f'song-geography-{pid}','periodId':'song','catalogPlaceId':pid,'name':name,'region':region,'summary':summary,'namingNote':naming,'searchNames':[mapname,name,region],'confidence':'documented-administrative-description','facts':[{'topic':'administration','statement':summary,'evidence':citations}],'unresolved':unresolved}
        entries.append(entry);names[pid]=mapname
    pack={'id':'song-geography-research-2026-09-27','schemaVersion':2,'periodId':'song','title':'宋代诸政权建置与城镇史料核查包','generatedAt':'2026-09-27','method':'逐字核对固定修订宋史、金史本纪与地理志；同时代西夏、大理另列政权，少量二手对应明确标记。仅生成文字，未移动任何坐标或修改任何边界。','sources':list(sources.values()),'entries':entries,'statistics':{'entryCount':len(entries),'cityProfileCount':len(entries),'boundaryOnlyCount':0,'sourceCount':len(sources),'quoteCount':sum(len(e['facts'][0]['evidence']) for e in entries),'boundaryClaims':0},'notes':['1200年为阅读截面，北宋沿革及1200年以后事件各自标注年代，不将全宋范围视作南宋疆域。','正文与名称为简体，史料引文保留原字形。','重庆升府与隆兴升府以本纪校正地理志疑文，并保留原文差异。']}
    dump(BASE/'geography.json',pack)
    public_sources={s['id']:{k:s[k] for k in ['id','title','url','retrievedAt','note','snapshotPath','snapshotSha256']} for s in sources.values()}
    profiles=[]
    for e in entries:
        evidence=[{'sourceId':q['sourceId'],'quote':q['quote'],'supports':f'{e["name"]}条所述建置、名称、纪年或明确标注的二手地区对应。'} for f in e['facts'] for q in f['evidence']]
        profiles.append({'id':'song-'+e['catalogPlaceId'],'placeId':e['catalogPlaceId'],'periodId':'song','summary':e['summary'],'region':e['region'],'namingNote':e['namingNote'],'politicalContext':'1200年为当前阅读截面；北宋史事、南宋建置与同期金、西夏、大理分别标注。正史地理志汇记不同时段，不能将列出地名、总县数或1200年后变化全部当作此年的现状。','sourceIds':sorted({q['sourceId'] for q in evidence}),'evidence':evidence,'historicalResearch':[{'id':e['id'],'title':e['name']+' · 建置与史料','summary':e['summary'],'correspondence':'documented-description','findings':e['facts'],'unresolved':e['unresolved']}]})
    path=ROOT/'public/data/city-period-profiles.json';out=read(path)
    out['profiles']=[p for p in out['profiles'] if p['periodId']!='song']+profiles
    sm={s['id']:s for s in out['sources']};sm.update(public_sources);out['sources']=list(sm.values());dump(path,out)
    path=ROOT/'public/data/historical-context.json';out=read(path);tm={t['placeId']:t for t in out['cityTimelines']}
    for t in tm.values():t['entries']=[e for e in t['entries'] if not e['id'].startswith('song-timeline-')]
    bypid={e['catalogPlaceId']:e for e in entries};count=0;skipped=0
    duplicate_ids={('beijing',1153):'beijing-jin-1153',('jinyang',979):'jinyang-context-1-979',('jinyang',982):'jinyang-context-2-982',('datong',1044):'datong-context-1-1044'}
    for pid,rows in EVENTS.items():
        target=tm.setdefault(pid,{'placeId':pid,'entries':[]})
        for idx,(year,date,title,summary,qi) in enumerate(rows):
            q=bypid[pid]['facts'][0]['evidence'][qi]
            if any(old['id']==duplicate_ids.get((pid,year)) for old in target['entries']):
                skipped+=1;continue
            target['entries'].append({'id':f'song-timeline-{pid}-{year}-{idx}','year':year,'dateLabel':date,'title':title,'summary':summary,'sourceIds':[q['sourceId']],'evidence':[{'sourceId':q['sourceId'],'quote':q['quote'],'supports':'本条所述建置或事件；纪年按所引卷对应年号段落换算，二手纪年明确保留待核说明。'}]});count+=1
    for t in tm.values():t['entries'].sort(key=lambda e:(e['year'],e['id']))
    out['cityTimelines']=list(tm.values());sm={s['id']:s for s in out['sources']};sm.update(public_sources);out['sources']=list(sm.values())
    note='宋代诸政权29个入口补充固定版本建置档案与明确纪年；1200年以后事件单列，晋阳旧城不冒充太原府治，重庆及隆兴升府据本纪校正地理志疑文。'
    if note not in out['notes']:out['notes'].append(note)
    dump(path,out)
    path=ROOT/'data/catalog.json';catalog=read(path);byplace={p['id']:p for p in catalog['places']};bycat={s['id']:s for s in catalog['sources']}
    for e in entries:
        p=byplace[e['catalogPlaceId']]
        if 'song' not in p['periodIds']:p['periodIds'].append('song')
        p.setdefault('nameByPeriod',{})['song']=names[p['id']]
        for sid in sorted({q['sourceId'] for q in e['facts'][0]['evidence']}):
            if sid not in p['sourceIds']:p['sourceIds'].append(sid)
            if sid not in bycat:
                s=public_sources[sid];full=next(v for v in sources.values() if v['id']==sid)
                cs={**s,'author':'维基百科编者' if full['kind']=='secondary-reference' else '脱脱等','locator':s['title'],'verification':'verified','revisionId':full['revisionId'],'edition':'固定修订电子文本及本地快照','license':'原著公版；电子整理文本条款见来源页'}
                catalog['sources'].append(cs);bycat[sid]=cs
    period=next(p for p in catalog['periods'] if p['id']=='song')
    period['description']='以1200年为代表截面，区分南宋、金、西夏与大理；建置档案另列北宋沿革和后续事件，不能把全宋史事当作当年辖境。'
    dump(path,catalog)
    audit={'profileCount':len(profiles),'datedEntryCount':count,'datedPlaceCount':len(EVENTS),'existingSameEventPreserved':skipped,'noExactDatedEntry':sorted(set(bypid)-set(EVENTS)),'cityIds':sorted(bypid),'sourceCount':len(sources),'primarySourceCount':sum(s['kind']=='historical-text' for s in sources.values()),'secondarySourceCount':sum(s['kind']=='secondary-reference' for s in sources.values()),'quoteCount':pack['statistics']['quoteCount'],'identityCorrections':['晋阳旧城地区关联平晋县，太原府治阳曲另置','金南京开封府与南宋建康府分离','1200洛阳仍河南府，1217中京金昌府不提前','重庆1189升府据光宗本纪','隆兴府1163升府据孝宗本纪'],'note':'所有既有地点坐标、唐明名称及档案、旧大事记内容保持原值。仅替换宋本朝档案、增宋名称/可见性及带独立前缀的大事记；无史载确年的临淄、邯郸、潼关不凑纪年。'}
    dump(BASE/'content-audit.json',audit);print(audit)
if __name__=='__main__':main()
