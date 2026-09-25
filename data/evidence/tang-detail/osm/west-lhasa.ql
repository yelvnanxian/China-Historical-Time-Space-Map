[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](29.2,90.65,30,91.65);
way[natural=water](29.2,90.65,30,91.65);
way[waterway=riverbank](29.2,90.65,30,91.65);
relation[type=multipolygon][natural=water](29.2,90.65,30,91.65);
relation[type=multipolygon][waterway=riverbank](29.2,90.65,30,91.65);
node[natural~"^(peak|saddle)$"](29.2,90.65,30,91.65);
);
out meta geom;
