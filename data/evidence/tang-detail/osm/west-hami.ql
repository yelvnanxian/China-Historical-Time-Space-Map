[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](42.4,92.9,43.35,93.95);
way[natural=water](42.4,92.9,43.35,93.95);
way[waterway=riverbank](42.4,92.9,43.35,93.95);
relation[type=multipolygon][natural=water](42.4,92.9,43.35,93.95);
relation[type=multipolygon][waterway=riverbank](42.4,92.9,43.35,93.95);
node[natural~"^(peak|saddle)$"](42.4,92.9,43.35,93.95);
);
out meta geom;
