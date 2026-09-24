CHGIS V5

Hartwell GIS Datasets

Encoding:  BIG5 (Traditional Chinese)

China Historical Geographic Information System Version 5.0
(c) Harvard Yenching Institute 2010
------------------

Citation: "CHGIS, Version: 5." (c) Fairbank Center for Chinese Studies and the Institute for Chinese Historical Geography at Fudan University, Dec 2010."

------------------
For non-commercial academic purposes only.
Use of this data implies agreement with the End User License Agreement:
http://www.fas.harvard.edu/~chgis/data/chgis/downloads/v5/EULA.html

-----------------

Robert Hartwell and Marianne Colson Hartwell created under the auspices of the company, Chinese Historical Software, Ltd. the first nation-wide historical GIS of China.   When Hartwell passed away in 1996, he willed the draft datasets of Chinese Historical Software to the Harvard Yenching Institute. 

These materials included a functioning set of GIS datasets for the Chinese Dynasties, from Tang to Ming, which were based on the concept of "co-location," or the use of GIS representations of modern county-level administrative units as building blocks to depict the approximate shapes of historical areas. Making use of boundary data for 1990 counties to represent historical units that occupied roughly the same areas, Hartwell drew in approximate line boundaries to divide the contemporary units to fit the historical situations and therefore provide an approximation of the historical unit's area. Although the resulting boundaries are, in many cases, problematic representations, the Hartwell GIS remains an interesting heuristic GIS tool for sorting, querying, and creating digital maps for the years 742, 1080, 1200, 1280, 1391.

The Hartwell datasets are derived from completely different sources and methods than the CHGIS time series and time slices.  They are provided as is, without additional documentation or known sources for the geographies shown.


Filenames:

chn1391c -> renamed to ->  v5_1391_chin_chn_1391_c
chn1391p -> renamed to ->  v5_1391_chin_chn_1391_p
chn1391s -> renamed to ->  v5_1391_chin_chn_1391_s

The files were renamed in an automated process to reproject them to the CHGIS standard CRS: Xian_1980_GK_Zone_19.    Because there are three levels of files  (the national level - chn1391c;  the prefecture level - dd_1391p;  and the county level -  hn_1391c) the new file names are explicit for each level.   So for example, the county level file, hn_1391c is renamed ->  v5_1391_cnty_hn_1391_c.  Basically, this allows for all the Hartwell files to be placed in a single folder and sorted by name, resulting in groupings year-type-[unit name abbreviation]-year-typecode.  

The automated conversion of these files was done by Wendy Guan (at Harvard CGA).

See further notes in Hartwell_Reprojection_Info.pdf 

------------------
NOTE on this draft:  

Version 5 contains updated and new contents, but has not been finalized.  When the final versions are available, the current dataset descriptions for Version 4 will be retired, and a notice will be posted on this webpage:  http://www.fas.harvard.edu/~chgis/data/chgis/downloads/v4/


Variables:  See esp. the field CODE (which is Hartwells hierarchical code for each admin unit) and the fields beginning with H_ which are, essentially, the Historical administrative hierarchy relationships.

-----------------
Further China related data that complements CHGIS can be found at:

(1)  http://worldmap.harvard.edu/chinamap
(2)  http://skinner.hmdc.harvard.edu/

-----------------
Questions about CHGIS datasets may be sent to:

chgis -AT-  fas.harvard.edu


