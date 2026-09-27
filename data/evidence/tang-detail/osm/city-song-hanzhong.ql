[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](32.8675,106.8233,33.2675,107.2233);
way[natural=water](32.8675,106.8233,33.2675,107.2233);
way[waterway=riverbank](32.8675,106.8233,33.2675,107.2233);
relation[type=multipolygon][natural=water](32.8675,106.8233,33.2675,107.2233);
relation[type=multipolygon][waterway=riverbank](32.8675,106.8233,33.2675,107.2233);
node[natural~"^(peak|saddle)$"](32.8675,106.8233,33.2675,107.2233);
);
out meta geom;
