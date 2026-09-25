[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](30.15,103.45,31.25,104.9);
way[natural=water](30.15,103.45,31.25,104.9);
way[waterway=riverbank](30.15,103.45,31.25,104.9);
relation[type=multipolygon][natural=water](30.15,103.45,31.25,104.9);
relation[type=multipolygon][waterway=riverbank](30.15,103.45,31.25,104.9);
node[natural~"^(peak|saddle)$"](30.15,103.45,31.25,104.9);
);
out meta geom;
