[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](37.53,112.25,37.93,112.65);
way[natural=water](37.53,112.25,37.93,112.65);
way[waterway=riverbank](37.53,112.25,37.93,112.65);
relation[type=multipolygon][natural=water](37.53,112.25,37.93,112.65);
relation[type=multipolygon][waterway=riverbank](37.53,112.25,37.93,112.65);
node[natural~"^(peak|saddle)$"](37.53,112.25,37.93,112.65);
);
out meta geom;
