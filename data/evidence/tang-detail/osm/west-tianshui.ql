[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](34.05,105.05,34.85,106.35);
way[natural=water](34.05,105.05,34.85,106.35);
way[waterway=riverbank](34.05,105.05,34.85,106.35);
relation[type=multipolygon][natural=water](34.05,105.05,34.85,106.35);
relation[type=multipolygon][waterway=riverbank](34.05,105.05,34.85,106.35);
node[natural~"^(peak|saddle)$"](34.05,105.05,34.85,106.35);
);
out meta geom;
