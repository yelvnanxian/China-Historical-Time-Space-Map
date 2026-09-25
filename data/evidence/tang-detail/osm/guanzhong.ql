[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](33.5,106.5,35.5,110.5);
way[natural=water](33.5,106.5,35.5,110.5);
way[waterway=riverbank](33.5,106.5,35.5,110.5);
relation[type=multipolygon][natural=water](33.5,106.5,35.5,110.5);
relation[type=multipolygon][waterway=riverbank](33.5,106.5,35.5,110.5);
node[natural~"^(peak|saddle)$"](33.5,106.5,35.5,110.5);
);
out meta geom;
