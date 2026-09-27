[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](30.3333,105.3923,30.7333,105.7923);
way[natural=water](30.3333,105.3923,30.7333,105.7923);
way[waterway=riverbank](30.3333,105.3923,30.7333,105.7923);
relation[type=multipolygon][natural=water](30.3333,105.3923,30.7333,105.7923);
relation[type=multipolygon][waterway=riverbank](30.3333,105.3923,30.7333,105.7923);
node[natural~"^(peak|saddle)$"](30.3333,105.3923,30.7333,105.7923);
);
out meta geom;
