# Hartwell 历史行政边界接入

本次实际取得并转换 Harvard Dataverse DOI [10.7910/DVN/29302](https://doi.org/10.7910/DVN/29302) 的 Hartwell China Historical GIS V5 原始 Shapefile 面。数据集在线版本为 2.0，选用 `v5_Hartwell_2010.zip`，文件 ID `2542563`，原包 80,979,494 字节。不是手绘轮廓，也没有使用现代行政区接口冒充历史边界。

## 年份与边界含义

以实际文件名作为显示年份：**741、1080、1200、1290、1391**。原 README 写的是 742、1080、1200、1280、1391；其中唐、元与实际文件及记录字段名不一致。这里不擅自改年，唐代菜单展示 741 年模型，并在来源说明中同时给出 README 的 742 年。它不能称为 755—763 年实际控制范围，也不能跟随事件年份自动变成该年的边界。

Hartwell 使用“co-location”：以现代县级行政区为构件，合并或分割成近似历史行政区域。README 与重投影说明称基础是 1990 年县界；Dataverse 描述则写 1992 年 ACASIAN 县界。两种表述均保存在来源记录中。官方说明承认若干边界存在问题，并没有逐个历史面对应的完整文献来源，因此这些图层统一标为 `approximate-model`。

`chin_chn` 表示全国汇总**数据集**，不是单一国家外轮廓。例如唐文件包含道、府州、县及独立诸部；1080 年汇总同时包含宋、辽与周边政权。没有把所有行政区 dissolve 后称为唐、宋或元明的完整国界。

显示分组采用 `province / prefecture / county`，分别对应原文件的道、路、省层，府、州及同层单位，县及同层单位。它们不是跨朝代完全等价的行政等级；源文件本身也混有军、监、都护府、卫、土司等对象。每个面保留 `sourceAdminType`、`sourceContainerLevel` 与 `sourceHierarchy`，可查看原始具体类型。

源记录 `H_ADMIN_TY` 明确为 `Independent State / Tribe / Tribes` 的面，从同年最高层原文件提取一次，放在 `country` 显示分组，标签是“独立政权 / 诸部（源分类）”。此分组不是当代国家判定，也不等于该年所有政权的完整国界。例如唐代该层只有劍南諸部、吐蕃諸部、流求；没有唐的单独国家外轮廓。源文件内自相矛盾的上级字段仍保留为来源属性，不据此追加从属结论。

## 坐标和原始几何

全部读取的 `.prj` 均为 `Xian_1980_GK_Zone_19`，识别为 **EPSG:2333**：中央经线 111°，假东距 19,500,000 米。脚本使用 `pyproj` 转换为 **EPSG:4326**，经度在前、纬度在后。

2010 年重投影 PDF 明确指出，最初文件的坐标系未定义，转换人员**假定**原经纬度为 WGS84。当前 PROJ 转回 WGS84 使用 ballpark datum offset，精度返回 `-1`（未知），因此不声称具有测绘级位置精度。

转换不进行 dissolve、平滑、简化、几何修复或人工顶点修改；全部原始顶点经过投影转换后输出。原数据中已有少量自交等无效拓扑；重投影后也可能因数值精度出现极小拓扑问题，逐条记录在 `import-validation.json`。保留这些原始形状，不悄悄用 `buffer(0)` 修补。所有导出几何均是非空 Polygon/MultiPolygon，经纬度经过范围检查。

`labelCoordinates` 来自 WGS84 几何的 Shapely `representative_point()`，逐条验证位于面内。它是标签位置，不是古代治所坐标。

## 可追溯文件

- `public/data/boundaries/hartwell-manifest.json`：应用使用的数据集清单，遵循 `shared/boundaries.ts`。
- `public/data/boundaries/hartwell-{year}-{level}.geojson`：实际边界。
- `data/evidence/hartwell/source-layers.zip`：本轮使用的原始 `.shp/.shx/.dbf/.prj` 组件，逐字节保留。
- `data/evidence/hartwell/archive-inventory.json`：官方完整 ZIP 的条目、压缩大小、偏移与 CRC。
- `data/evidence/hartwell/dataverse-metadata.json`：实际读取的在线元数据，包含原包校验信息与许可证。
- `data/evidence/hartwell/README_CHGIS_V5_HARTWELL.txt`、`Hartwell_Reprojection_Info_28sep10.pdf`、`reprojection-notes.txt`：实际取得的官方说明。
- `data/evidence/hartwell/import-validation.json`：每个原始组件 SHA256/CRC、坐标转换、年份、数量、原始拓扑异常、名称回退和工具版本。

每个导出面含统一 `id/name/level/sourceId/year/approximate/color`，另保留原始 `recordId`、`sourceRecordIndex`、`sourceCode`、`sourceLayer`、`sourceName`。中文按官方说明解码 BIG5；中文字段缺失或有非法字节时显示同条源记录的拼音，不自行臆造汉字。原始 DBF 保留可复核字节，回退记录列在验证文件中。

## 实际导出与核查

| 文件年份 | 独立政权 / 诸部 | 省 / 路 / 道组 | 府 / 州组 | 县组 |
| --- | ---: | ---: | ---: | ---: |
| 741 | 3 | 10 | 336 | 1495 |
| 1080 | 8 | 30 | 402 | 1479 |
| 1200 | 8 | 36 | 390 | 1450 |
| 1290 | 1 | 16 | 280 | 1475 |
| 1391 | 5 | 21 | 300 | 1620 |

共 5 个数据集、20 个图层、9,365 个面。未压缩 GeoJSON 共约 120.8 MB；保存的 96 个原始组件压缩包约 32.9 MB。脚本默认不降低边界细节，可按需只加载所选年份与层级。

独立核查记录见 `data/evidence/hartwell/geometry-roundtrip-validation.json`：所有记录 ID、源名称、源代码一致，显示 ID 全局唯一，标签点均在对应面内。共输出 2,917,516 个坐标位置；源文件 1200 年有 4 个退化内环，GEOS 各重复一个已有端点以满足环编码要求，没有新增不同位置，也没有丢失原始顶点。坐标抽样往返的最大数值误差约 `3.84e-9` 米；这只检验转换的数值可逆性，不代表历史边界或坐标基准的实际精度。

各年原始/转换后无效拓扑数量为：741 年 15/17、1080 年 19/21、1200 年 12/13、1290 年 4/5、1391 年 1/2。异常清单完整保留，未冒称全部几何经过拓扑修复。

## 复现

```sh
python3 -m venv /tmp/hartwell-tools
/tmp/hartwell-tools/bin/pip install pyshp pyproj shapely
/tmp/hartwell-tools/bin/python scripts/import-hartwell-boundaries.py
```

默认读取仓库保存的原始组件；追加 `--download` 可从官方归档重新取得选中组件。下载使用 ZIP Range 并验证每个成员的 CRC，避免为本次未采用的重复区域文件下载整个包；不需要账户、API key 或浏览器。`--years 741 1080` 可只生成部分年份，但会将 Hartwell manifest 写成所选年份清单。

## 引用与使用条件

引用：*Hartwell China Historical GIS*, Robert Hartwell, Cambridge: CHGIS V5 (2010), Harvard Fairbank Center for Chinese Studies；稳定标识 DOI 10.7910/DVN/29302。

Dataverse 在线元数据写 CC0；同包 README 写非商业学术用途与旧 EULA 链接。这两份原始表述均保留。本次按用户明确的个人非商业使用要求完成取得与本地展示，没有把两种条款解释成已确认的统一授权。
