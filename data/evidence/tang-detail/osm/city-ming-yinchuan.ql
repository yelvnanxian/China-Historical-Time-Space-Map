[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](38.29,106.03,38.69,106.65);
way[natural=water](38.29,106.03,38.69,106.65);
way[waterway=riverbank](38.29,106.03,38.69,106.65);
relation[type=multipolygon][natural=water](38.29,106.03,38.69,106.65);
relation[type=multipolygon][waterway=riverbank](38.29,106.03,38.69,106.65);
node[natural~"^(peak|saddle)$"](38.29,106.03,38.69,106.65);
);
out meta geom;
