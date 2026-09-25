[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](39.15,75.55,39.95,76.6);
way[natural=water](39.15,75.55,39.95,76.6);
way[waterway=riverbank](39.15,75.55,39.95,76.6);
relation[type=multipolygon][natural=water](39.15,75.55,39.95,76.6);
relation[type=multipolygon][waterway=riverbank](39.15,75.55,39.95,76.6);
node[natural~"^(peak|saddle)$"](39.15,75.55,39.95,76.6);
);
out meta geom;
