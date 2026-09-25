[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](41.55,86,42.45,87.05);
way[natural=water](41.55,86,42.45,87.05);
way[waterway=riverbank](41.55,86,42.45,87.05);
relation[type=multipolygon][natural=water](41.55,86,42.45,87.05);
relation[type=multipolygon][waterway=riverbank](41.55,86,42.45,87.05);
node[natural~"^(peak|saddle)$"](41.55,86,42.45,87.05);
);
out meta geom;
