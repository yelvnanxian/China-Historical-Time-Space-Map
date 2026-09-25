[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](22.93,113.07,23.33,113.47);
way[natural=water](22.93,113.07,23.33,113.47);
way[waterway=riverbank](22.93,113.07,23.33,113.47);
relation[type=multipolygon][natural=water](22.93,113.07,23.33,113.47);
relation[type=multipolygon][waterway=riverbank](22.93,113.07,23.33,113.47);
node[natural~"^(peak|saddle)$"](22.93,113.07,23.33,113.47);
);
out meta geom;
