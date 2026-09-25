[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](31.84,111.94,32.24,112.34);
way[natural=water](31.84,111.94,32.24,112.34);
way[waterway=riverbank](31.84,111.94,32.24,112.34);
relation[type=multipolygon][natural=water](31.84,111.94,32.24,112.34);
relation[type=multipolygon][waterway=riverbank](31.84,111.94,32.24,112.34);
node[natural~"^(peak|saddle)$"](31.84,111.94,32.24,112.34);
);
out meta geom;
