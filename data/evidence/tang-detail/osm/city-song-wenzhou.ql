[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](27.793,120.499,28.193,120.899);
way[natural=water](27.793,120.499,28.193,120.899);
way[waterway=riverbank](27.793,120.499,28.193,120.899);
relation[type=multipolygon][natural=water](27.793,120.499,28.193,120.899);
relation[type=multipolygon][waterway=riverbank](27.793,120.499,28.193,120.899);
node[natural~"^(peak|saddle)$"](27.793,120.499,28.193,120.899);
);
out meta geom;
