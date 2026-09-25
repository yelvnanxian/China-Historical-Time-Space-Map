[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](39.7,116.2,40.1,116.6);
way[natural=water](39.7,116.2,40.1,116.6);
way[waterway=riverbank](39.7,116.2,40.1,116.6);
relation[type=multipolygon][natural=water](39.7,116.2,40.1,116.6);
relation[type=multipolygon][waterway=riverbank](39.7,116.2,40.1,116.6);
node[natural~"^(peak|saddle)$"](39.7,116.2,40.1,116.6);
);
out meta geom;
