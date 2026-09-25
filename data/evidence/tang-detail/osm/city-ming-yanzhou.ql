[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](35.35,116.63,35.75,117.03);
way[natural=water](35.35,116.63,35.75,117.03);
way[waterway=riverbank](35.35,116.63,35.75,117.03);
relation[type=multipolygon][natural=water](35.35,116.63,35.75,117.03);
relation[type=multipolygon][waterway=riverbank](35.35,116.63,35.75,117.03);
node[natural~"^(peak|saddle)$"](35.35,116.63,35.75,117.03);
);
out meta geom;
