[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](30.3547,114.1128,30.7547,114.5128);
way[natural=water](30.3547,114.1128,30.7547,114.5128);
way[waterway=riverbank](30.3547,114.1128,30.7547,114.5128);
relation[type=multipolygon][natural=water](30.3547,114.1128,30.7547,114.5128);
relation[type=multipolygon][waterway=riverbank](30.3547,114.1128,30.7547,114.5128);
node[natural~"^(peak|saddle)$"](30.3547,114.1128,30.7547,114.5128);
);
out meta geom;
