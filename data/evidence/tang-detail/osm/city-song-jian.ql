[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](26.89,114.76,27.29,115.16);
way[natural=water](26.89,114.76,27.29,115.16);
way[waterway=riverbank](26.89,114.76,27.29,115.16);
relation[type=multipolygon][natural=water](26.89,114.76,27.29,115.16);
relation[type=multipolygon][waterway=riverbank](26.89,114.76,27.29,115.16);
node[natural~"^(peak|saddle)$"](26.89,114.76,27.29,115.16);
);
out meta geom;
