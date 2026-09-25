[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](37.5,102.3,38.35,103.15);
way[natural=water](37.5,102.3,38.35,103.15);
way[waterway=riverbank](37.5,102.3,38.35,103.15);
relation[type=multipolygon][natural=water](37.5,102.3,38.35,103.15);
relation[type=multipolygon][waterway=riverbank](37.5,102.3,38.35,103.15);
node[natural~"^(peak|saddle)$"](37.5,102.3,38.35,103.15);
);
out meta geom;
