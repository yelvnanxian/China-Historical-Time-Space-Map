[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](28,118,30.7,122);
way[natural=water](28,118,30.7,122);
way[waterway=riverbank](28,118,30.7,122);
relation[type=multipolygon][natural=water](28,118,30.7,122);
relation[type=multipolygon][waterway=riverbank](28,118,30.7,122);
node[natural~"^(peak|saddle)$"](28,118,30.7,122);
);
out meta geom;
