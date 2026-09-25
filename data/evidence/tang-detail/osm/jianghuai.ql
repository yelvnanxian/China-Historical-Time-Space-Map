[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](30.7,117,33.5,120.5);
way[natural=water](30.7,117,33.5,120.5);
way[waterway=riverbank](30.7,117,33.5,120.5);
relation[type=multipolygon][natural=water](30.7,117,33.5,120.5);
relation[type=multipolygon][waterway=riverbank](30.7,117,33.5,120.5);
node[natural~"^(peak|saddle)$"](30.7,117,33.5,120.5);
);
out meta geom;
