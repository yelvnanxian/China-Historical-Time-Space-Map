# 现代自然地理背景

这些文件只用于现代自然地理背景，不是历史河道、湖岸、海岸线或政权疆域复原。

| 文件 | 数据内容 | 本版规模 |
|---|---|---|
| `land.geojson` | 沿用初版 Natural Earth 1:50m 全球陆地 | 1420个要素 |
| `rivers.geojson` | Natural Earth 1:10m 河流及湖内中心线 | 277个要素，约419KB |
| `lakes.geojson` | Natural Earth 1:10m 湖泊与部分现代水库 | 234个要素，约250KB |
| `physical-labels.geojson` | 真实来源几何派生的自然地理标签点 | 86个点，约39KB |

新增和升级的三份文件裁剪到东经70–142度、北纬10–56度。河流按0.012度、湖泊按0.006度容差作保拓扑简化，展示坐标保留6位小数；这种数值位数不代表米级精度。山峰标签直接保留来源点坐标。

标签分为32个河流、20个湖泊、26个山脉/山峰、8个海域名称。每个点含 `name`、`nameEn`、`kind`、`minZoom`，并记录 `sourceDataset`、`sourceFeatureIndices` 和 `coordinateMethod`。

## 名称与标签位置

- 湖泊、山脉和海域优先采用NE的中文属性；无中文时保留来源名。上游一个明显不相干的水库中文译名未采用，例外记录在来源清单中。
- NE河流数据没有中文属性。长江、黄河、淮河、汉江、渭河等32个常见河名使用本项目人工展示译名，明确标记 `nameOrigin: editorial-translation`。原英文与源名称均保留，译名不冒充NE属性；岷江/闽江等同名拼写按具体要素分别处理。
- 河流点由指定真实河段合并后的最长连续线按坐标空间长度取中点；湖泊、山脉及海域点用来源面内代表点；山峰使用NE原始高程点。没有手填地理坐标。
- `minZoom` 是项目的标签显示阈值，不表示数据精度。山脉、海域的来源面属于制图命名范围，不是测量边界。

## 来源与许可

本次固定使用 [Natural Earth vector 仓库提交 ca96624](https://github.com/nvkelso/natural-earth-vector/tree/ca96624a56bd078437bca8184e78163e5039ad19)。以下版本号实际读取自同一提交的 `.VERSION.txt`，下载时间为UTC。

| 原始数据链接 | 数据版本 | 下载时间 |
|---|---|---|
| [ne_10m_rivers_lake_centerlines](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_rivers_lake_centerlines.geojson) | 5.0.0 | 2026-09-24T10:31:51.649831+00:00 |
| [ne_10m_lakes](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_lakes.geojson) | 5.0.0 | 2026-09-24T10:31:52.654413+00:00 |
| [ne_10m_geography_regions_polys](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_geography_regions_polys.geojson) | 5.0.0 | 2026-09-24T10:31:53.773264+00:00 |
| [ne_10m_geography_marine_polys](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_geography_marine_polys.geojson) | 5.1.0 | 2026-09-24T10:31:54.589131+00:00 |
| [ne_10m_geography_regions_elevation_points](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_geography_regions_elevation_points.geojson) | 5.0.0 | 2026-09-24T10:31:55.244030+00:00 |

完整URL、版本文件URL、输入与输出SHA256、派生方法、译名列表及例外见 `natural-geography-sources.json`。许可为 [Natural Earth public domain](https://www.naturalearthdata.com/about/terms-of-use/)，本次已读取许可页并保存摘录。沿用的陆地来源为 [NE 1:50m land](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_land.geojson)，初版下载于2026-09-24，不属于此次10m采集批次。

## 复现与检查

`prepare-natural-layers.py` 可从固定提交重新生成三个新增/升级图层，需要Python与Shapely 2.x。默认源文件缓存目录为系统临时目录中的 `map-naturalearth-inputs`，也可用 `--cache-dir` 指定。

`natural-geography-validation.json` 记录本次检查：几何有效、范围正确、标签不超过100个、字段符合约定，全部标签位于其真实来源几何上或内部（只容许坐标取舍带来的极小误差）。所有山峰点与原坐标完全一致，输出文件哈希与来源清单相符。

此次没有提供或推断森林、草地的历史分布。湖泊文件可能包含现代水库，历史时期切换不会使现代自然背景变成古代实况。
