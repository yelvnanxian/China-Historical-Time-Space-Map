[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](33.3,110.5,35.5,113.5);
way[natural=water](33.3,110.5,35.5,113.5);
way[waterway=riverbank](33.3,110.5,35.5,113.5);
relation[type=multipolygon][natural=water](33.3,110.5,35.5,113.5);
relation[type=multipolygon][waterway=riverbank](33.3,110.5,35.5,113.5);
node[natural~"^(peak|saddle)$"](33.3,110.5,35.5,113.5);
);
out meta geom;
