[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](30.14,112.04,30.54,112.44);
way[natural=water](30.14,112.04,30.54,112.44);
way[waterway=riverbank](30.14,112.04,30.54,112.44);
relation[type=multipolygon][natural=water](30.14,112.04,30.54,112.44);
relation[type=multipolygon][waterway=riverbank](30.14,112.04,30.54,112.44);
node[natural~"^(peak|saddle)$"](30.14,112.04,30.54,112.44);
);
out meta geom;
