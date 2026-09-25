[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](41.3,82.35,42.25,83.65);
way[natural=water](41.3,82.35,42.25,83.65);
way[waterway=riverbank](41.3,82.35,42.25,83.65);
relation[type=multipolygon][natural=water](41.3,82.35,42.25,83.65);
relation[type=multipolygon][waterway=riverbank](41.3,82.35,42.25,83.65);
node[natural~"^(peak|saddle)$"](41.3,82.35,42.25,83.65);
);
out meta geom;
