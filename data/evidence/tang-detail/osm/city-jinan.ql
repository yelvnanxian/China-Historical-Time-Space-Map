[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](36.47,116.8,36.87,117.2);
way[natural=water](36.47,116.8,36.87,117.2);
way[waterway=riverbank](36.47,116.8,36.87,117.2);
relation[type=multipolygon][natural=water](36.47,116.8,36.87,117.2);
relation[type=multipolygon][waterway=riverbank](36.47,116.8,36.87,117.2);
node[natural~"^(peak|saddle)$"](36.47,116.8,36.87,117.2);
);
out meta geom;
