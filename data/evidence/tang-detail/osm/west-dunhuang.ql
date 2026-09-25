[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](39.55,94.25,40.5,95.1);
way[natural=water](39.55,94.25,40.5,95.1);
way[waterway=riverbank](39.55,94.25,40.5,95.1);
relation[type=multipolygon][natural=water](39.55,94.25,40.5,95.1);
relation[type=multipolygon][waterway=riverbank](39.55,94.25,40.5,95.1);
node[natural~"^(peak|saddle)$"](39.55,94.25,40.5,95.1);
);
out meta geom;
