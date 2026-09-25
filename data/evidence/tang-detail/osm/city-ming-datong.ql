[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](39.88,113.1,40.28,113.5);
way[natural=water](39.88,113.1,40.28,113.5);
way[waterway=riverbank](39.88,113.1,40.28,113.5);
relation[type=multipolygon][natural=water](39.88,113.1,40.28,113.5);
relation[type=multipolygon][waterway=riverbank](39.88,113.1,40.28,113.5);
node[natural~"^(peak|saddle)$"](39.88,113.1,40.28,113.5);
);
out meta geom;
