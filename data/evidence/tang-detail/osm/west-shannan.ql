[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](29,91.35,29.65,92.15);
way[natural=water](29,91.35,29.65,92.15);
way[waterway=riverbank](29,91.35,29.65,92.15);
relation[type=multipolygon][natural=water](29,91.35,29.65,92.15);
relation[type=multipolygon][waterway=riverbank](29,91.35,29.65,92.15);
node[natural~"^(peak|saddle)$"](29,91.35,29.65,92.15);
);
out meta geom;
