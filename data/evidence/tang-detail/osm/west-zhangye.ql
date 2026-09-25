[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](38.4,100.05,39.15,100.95);
way[natural=water](38.4,100.05,39.15,100.95);
way[waterway=riverbank](38.4,100.05,39.15,100.95);
relation[type=multipolygon][natural=water](38.4,100.05,39.15,100.95);
relation[type=multipolygon][waterway=riverbank](38.4,100.05,39.15,100.95);
node[natural~"^(peak|saddle)$"](38.4,100.05,39.15,100.95);
);
out meta geom;
