[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](32.5,113.5,35.5,116.5);
way[natural=water](32.5,113.5,35.5,116.5);
way[waterway=riverbank](32.5,113.5,35.5,116.5);
relation[type=multipolygon][natural=water](32.5,113.5,35.5,116.5);
relation[type=multipolygon][waterway=riverbank](32.5,113.5,35.5,116.5);
node[natural~"^(peak|saddle)$"](32.5,113.5,35.5,116.5);
);
out meta geom;
