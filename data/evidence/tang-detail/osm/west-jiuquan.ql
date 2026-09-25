[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](39.25,98.05,40.05,99);
way[natural=water](39.25,98.05,40.05,99);
way[waterway=riverbank](39.25,98.05,40.05,99);
relation[type=multipolygon][natural=water](39.25,98.05,40.05,99);
relation[type=multipolygon][waterway=riverbank](39.25,98.05,40.05,99);
node[natural~"^(peak|saddle)$"](39.25,98.05,40.05,99);
);
out meta geom;
