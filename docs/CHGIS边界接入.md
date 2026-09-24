# CHGIS 清代实际边界数据接入

本次从 CHGIS 官方指向的 Harvard Dataverse 下载原始 Shapefile，生成了两个独立资料年份的 5 个 GeoJSON 面图层。所有区域来自下载文件；没有手绘省界、用城市点推县界、把现代行政区拼成历史疆域，或从这些图层溶解出所谓国家疆界。

| 官方资料年份 | 源层级 | 面记录数 | 原始顶点数 | 输出顶点数 | 输出大小 | 原始无效几何修复数 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1820 | 省及大区域 | 32 | 154,129 | 154,218 | 3.51 MB | 4 |
| 1820 | 府 / 州等 | 320 | 288,783 | 288,698 | 6.87 MB | 2 |
| 1911 | 省及大区域 | 27 | 184,778 | 184,741 | 4.19 MB | 5 |
| 1911 | 府 / 州等 | 381 | 464,323 | 464,228 | 10.91 MB | 18 |
| 1911 | 县级区域 | 1,986 | 781,331 | 780,810 | 19.89 MB | 58 |

这里的“省 / 府 / 县”是源图层的组织层级，不能理解为所有记录都具有相同建制。1820 省层包括边疆大区域、特殊区域及岛礁；1911 县层包括县、旗、州、厅、司等。保留 `TYPE_CH`、`LEV_RANK` 和上级区域字段供核查，不根据现代区划重新归类。

## 可用文件

- 转换脚本：`scripts/import-chgis-boundaries.py`
- 合并用清单：`public/data/boundaries/chgis-manifest.json`，与应用 `BoundaryDataset` 合同兼容，每层另含可选 `warning`。
- 地图数据：`public/data/boundaries/chgis-{1820,1911}-{province,prefecture,county}.geojson`。1820 没有 county 文件。
- 原始 ZIP、下载元数据、README、EULA 与逐层转换报告：`data/evidence/boundaries/chgis-1820/` 和 `chgis-1911/`。
- 图层比较记录：`data/evidence/boundaries/chgis-1820/prefecture-year-comparison.json`。
- 独立核查结果：`data/evidence/boundaries/chgis-validation.json`。

## 官方来源与记录保留

入口：[CHGIS V6 下载页](https://chgis.fas.harvard.edu/data/chgis/v6/)。

| 数据 | 官方 DOI | 数据文件 ID | 原文件 |
| --- | --- | ---: | --- |
| 1820 省面 | [10.7910/DVN/ST5KKM](https://doi.org/10.7910/DVN/ST5KKM) | 2966720 | v6_1820_prov_pgn_utf.zip |
| 1820 府面 | [10.7910/DVN/2K4FHX](https://doi.org/10.7910/DVN/2K4FHX) | 2966700 | v6_1820_pref_pgn_gbk.zip |
| 1911 省面 | [10.7910/DVN/0P89R9](https://doi.org/10.7910/DVN/0P89R9) | 2966679 | v6_1911_prov_pgn_gbk.zip |
| 1911 府面 | 同上 | 2966676 | v6_1911_pref_pgn_gbk.zip |
| 1911 县面 | 同上 | 2966678 | v6_1911_cnty_pgn_gbk.zip |

下载使用官方 `https://dataverse.harvard.edu/api/access/datafile/{ID}`，每个 ZIP 均校验元数据中的 MD5。省面1820采用 UTF-8，其余采用官方 GBK 包并按 GBK 解码。原文件不修改。

所有 DBF 字段逐值保留在 GeoJSON `properties`，包括 `SYS_ID`、`NAME_CH`、`GEO_SRC`、原始年份和编制者字段。附加字段包括 `id`、`name`、`level`、`recordId`、`sourceRowIndex`、`sourceFileId`、`sourceUrl`、`year`、`yearBasis`、`yearConflict`、`geometryRepaired`、`labelCoordinates`。`GEO_SRC` 的 `FROM_TAN` / `FROM_FD` 原码保留，未自行推断其对应书目。

1820 府层有重复源 ID：1927、1834。源 `SYS_ID` 与 `recordId` 保持不变；只有应用 `id` 在重复记录后添加原始行号保证唯一。2105、2106 两个源记录名称为空，显示名采用“非政区辖地（原图未命名） · 原记录ID”；未编造地名，原始空名称仍保留。

## 已确认的年份与覆盖问题

**1820 府层存在整层年份冲突。** 官方 collection、文件名标 1820，但全部 320 条 DBF 记录的 `BEG_YR`、`END_YR` 均为 1911。保留该文件的官方归档年份用于目录组织，不把它当成经过史学核定的1820行政区。图层名称、`warning`、资料说明及每条记录的 `yearConflict` 同时标记冲突。

与官方1911府层比较：后者381条，二者同为 EPSG:2333；原始坐标序列没有完全相同的面。265对可唯一匹配的同名区域在同一源投影下进行拓扑比较，完全相等为0对。因此不能简单断言1820包只是1911包的副本，也不能据此消除年份冲突。完整方法和逐名交并面积比保存在比较记录中。

**1911 有4条局部年份异常。** 省层乌里雅苏台、府层阿尔泰地区、县层乐清县的起止年是3822；县层玉环厅为1146。其他记录的日期字段为1911。所有异常值原样保留，不擅自“纠错”；清单的各层 `warning` 显示受影响条数和异常值。

**1820 没有本次可取得的县级面。** V6 1820 的两个官方数据集及 V5 数据集 [10.7910/DVN/M7WEFY](https://doi.org/10.7910/DVN/M7WEFY) 的文件清单只找到1820县级点。README虽然列有 `v6_1820_cnty_pgn`，实际清单未提供。V5元数据快照已保留。本次用独立1911资料展示真实县级面，不将其放入1820。

省面集合本身不是经过核定的国家边界。岛礁记录与特殊区域是否应按某一政治疆域解释，不由本次格式转换决定。

## 几何转换与精度

1. 从 ZIP 的 `.prj` 读取源坐标系，5层均识别为 `Xian_1980_GK_Zone_19 / EPSG:2333`。
2. 用 pyproj `always_xy=True` 转到 WGS84经纬度。当前运行时只提供 Gauss–Krüger 反投影加 Xian1980→WGS84 的 **ballpark geographic offset**，`accuracy=-1`。这是未知转换精度，不能解释为米级准确度。
3. 对无效源几何运行 Shapely `make_valid`，保留面部分；无面积的退化线不用于填色。原始 ZIP、修复前原因、修复前后计算面积及结果类型写入报告。
4. 坐标按 `0.000001°` 网格保存，使用 `set_precision(..., mode="valid_output")` 保证输出拓扑有效。网格量级约0.1米，不代表历史资料具有这一精度。它会清除重复点或退化微小环，顶点变化已记录。外环按 GeoJSON 右手规则统一。
5. **没有做 Douglas–Peucker 等边界简化，没有平滑。** 1911县层约19.89MB，保留细节供本地初版使用。地图宜按需加载各层；以后如需瓦片或简化，应另保存阈值、原始文件和误差报告。
6. 标签由输出面的 `representative_point()` 计算并检查处于面内，不是人工目测放置，也没有使用可能落在面外的形心。

1820“千里石塘”的源几何存在自交，且 pyshp报告孤立内环并将其读为外环；省、府层均涉及该区域。拓扑修复后计算面积约变动 **2.63%**。这属于存在解释不确定性的源几何修复，不能宣称修复结果确立了历史边界。原始数据和变化量完整保留；其余已检查区域的面积修复变化很小。

## 来源许可元数据

保留两种互相不一致的原始声明：Dataverse 元数据登记 CC0；下载包配套 README/EULA 声明非商业学术研究及教育用途，并限制商业使用、重新打包及整层网络再分发。本次按用户已说明的个人非商业用途在本地接入，未对外发布文件，也未把源数据标为由本项目自行授权。

源方要求的引用：

> “CHGIS Version 6.” (c) Fairbank Center for Chinese Studies and the Institute for Chinese Historical Geography at Fudan University, Dec 2016.

实际 README、EULA 和 Dataverse JSON 均随证据留存，不用本说明代替原文。

## 复现

测试运行时使用 Python3.14、pyshp3.1.6、pyproj3.8.0、Shapely2.1.2。用独立虚拟环境，不依赖应用 Node 后端：

```sh
python3 -m venv /tmp/map-chgis-runtime
/tmp/map-chgis-runtime/bin/pip install pyshp==3.1.6 pyproj==3.8.0 shapely==2.1.2
/tmp/map-chgis-runtime/bin/python scripts/import-chgis-boundaries.py
```

已有缓存时以校验后的原始文件重建：

```sh
/tmp/map-chgis-runtime/bin/python scripts/import-chgis-boundaries.py --offline
```

仅重建一个年份可传 `--years 1820` 或 `--years 1911`，sidecar清单会保留已生成的其他年份。下载先写`.part`并可续传，哈希校验完成才提升为正式缓存文件。生成时验证经纬度范围、几何有效性、唯一应用ID、标签点在面内；独立核查再逐行比较所有源属性与输出。
