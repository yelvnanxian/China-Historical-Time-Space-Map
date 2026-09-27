[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](31.358,105.805,31.758,106.205);
way[natural=water](31.358,105.805,31.758,106.205);
way[waterway=riverbank](31.358,105.805,31.758,106.205);
relation[type=multipolygon][natural=water](31.358,105.805,31.758,106.205);
relation[type=multipolygon][waterway=riverbank](31.358,105.805,31.758,106.205);
node[natural~"^(peak|saddle)$"](31.358,105.805,31.758,106.205);
);
out meta geom;
