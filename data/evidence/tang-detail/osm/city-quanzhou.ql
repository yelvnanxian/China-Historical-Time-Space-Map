[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](24.68,118.48,25.08,118.88);
way[natural=water](24.68,118.48,25.08,118.88);
way[waterway=riverbank](24.68,118.48,25.08,118.88);
relation[type=multipolygon][natural=water](24.68,118.48,25.08,118.88);
relation[type=multipolygon][waterway=riverbank](24.68,118.48,25.08,118.88);
node[natural~"^(peak|saddle)$"](24.68,118.48,25.08,118.88);
);
out meta geom;
