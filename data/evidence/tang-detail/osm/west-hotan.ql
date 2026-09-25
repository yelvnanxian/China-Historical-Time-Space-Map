[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](36.7,79.55,37.55,80.4);
way[natural=water](36.7,79.55,37.55,80.4);
way[waterway=riverbank](36.7,79.55,37.55,80.4);
relation[type=multipolygon][natural=water](36.7,79.55,37.55,80.4);
relation[type=multipolygon][waterway=riverbank](36.7,79.55,37.55,80.4);
node[natural~"^(peak|saddle)$"](36.7,79.55,37.55,80.4);
);
out meta geom;
