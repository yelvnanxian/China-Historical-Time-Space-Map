# 历史 GIS 数据来源可行性核查

> V0.4更新：用户已明确个人非商业用途，本轮已实际下载并接入CHGIS与Hartwell图层，同时提供历史地图原图阅读器。本文中的“尚未导入”和等待接入安排为旧版本记录，当前结果以[V0.4验收记录](./V0.4验收记录.md)为准。

核查日期：2026-09-24。仅记录本次实际读取的官方网页、仓库元数据及随附说明，不把“可以下载”视为“可以任意再发布”，也不把近似行政区等同于某一天的实际控制疆域。

## 结论

V0.2 先使用有逐条原文依据的事件与地点关系。现有政权轮廓继续明确标为交互示意，地点坐标继续标为地区近似入口。本次没有发现可直接替换为经过核验的 755—763 年逐年实际控制范围的数据。

| 候选 | 本次核实的覆盖与精度 | 本次读取的使用条件 | 接入判断 |
| --- | --- | --- | --- |
| CHGIS V6 | 官方介绍覆盖前 221—1911 年的地名、历史行政单位；有时间序列及 1820、1911 等时间切片，时间序列并不覆盖所有地区 | V6 官方页明确写“free for academic research, no commercial use, resale, or redistribution permitted” | 可作为研究与后续数据洽询的起点；在面向公众再发布前，需要厘清具体数据的授权与适用范围 |
| Hartwell GIS | 覆盖唐至明；README 明确代表年为 742、1080、1200、1280、1391。基于现代县界拼合/划分的近似历史行政区，并非 755—763 年实际控制边界 | Dataverse 当前元数据写 CC0，但同包 README 写“For non-commercial academic purposes only”及 EULA。两者存在需要澄清的差异 | 不直接导入本项目作为考据疆域；即便使用条件明确，也必须保留近似模型和代表年说明 |
| TGAZ | 历史地名数据库及 MySQL 备份；README 说明包含 CHGIS V3 与其他来源的导入 | Dataverse 当前元数据写 CC0；README 说明上游来源，未在本次核查中逐条查看记录来源和原始适用范围 | 适合下一轮按具体地名匹配、查时间与来源；不等于已经核验本项目 10 个地区入口的古城坐标 |
| Natural Earth | 已有现代陆地和河流自然背景 | Public domain | 继续用作现代自然地理背景，不标为古河道或历史海岸线复原 |

## 实际读取的来源

- CHGIS 简介：https://chgis.fas.harvard.edu/pages/intro/
- CHGIS V6：https://chgis.fas.harvard.edu/data/chgis/v6/
- V6 数据目录 API：https://dataverse.harvard.edu/api/dataverses/chgis_v6/contents
- Hartwell 官方简介：https://chgis.fas.harvard.edu/data/hartwell/
- Hartwell 数据集：https://doi.org/10.7910/DVN/29302
- Hartwell 元数据 API：https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/29302
- Hartwell 随附 README：https://dataverse.harvard.edu/api/access/datafile/2867263
- TGAZ 数据集：https://doi.org/10.7910/DVN/H3OB28
- TGAZ 元数据 API：https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/H3OB28
- TGAZ 随附 README：https://dataverse.harvard.edu/api/access/datafile/3370560
- Natural Earth 使用条款：https://www.naturalearthdata.com/about/terms-of-use/

## 下一步数据接入门槛

1. 每个拟采用的记录明确数据集版本、原始 ID、适用时间、地理对象含义和来源。
2. 区分治所点、现代对应地区、行政范围与实际控制区，保留无法确定的部分。
3. 使用条件足以覆盖计划中的展示与再发布方式；将条件和引用方式存入来源记录。
4. 以一个地区样本完成坐标系核查、古今实体匹配与人工复核，再估算批量接入工作。

本次未联系数据提供方，未导入 CHGIS/Hartwell/TGAZ 的几何数据或地名库。公开元数据和说明的本地核查记录位于 `docs/research/`，用于复查上述判断。
