[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](29.16,112.93,29.56,113.33);
way[natural=water](29.16,112.93,29.56,113.33);
way[waterway=riverbank](29.16,112.93,29.56,113.33);
relation[type=multipolygon][natural=water](29.16,112.93,29.56,113.33);
relation[type=multipolygon][waterway=riverbank](29.16,112.93,29.56,113.33);
node[natural~"^(peak|saddle)$"](29.16,112.93,29.56,113.33);
);
out meta geom;
