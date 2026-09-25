[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](36.5,118.11,37.02,118.68);
way[natural=water](36.5,118.11,37.02,118.68);
way[waterway=riverbank](36.5,118.11,37.02,118.68);
relation[type=multipolygon][natural=water](36.5,118.11,37.02,118.68);
relation[type=multipolygon][waterway=riverbank](36.5,118.11,37.02,118.68);
node[natural~"^(peak|saddle)$"](36.5,118.11,37.02,118.68);
);
out meta geom;
