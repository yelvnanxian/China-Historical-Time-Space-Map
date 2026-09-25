[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](42.45,88.5,43.35,89.65);
way[natural=water](42.45,88.5,43.35,89.65);
way[waterway=riverbank](42.45,88.5,43.35,89.65);
relation[type=multipolygon][natural=water](42.45,88.5,43.35,89.65);
relation[type=multipolygon][waterway=riverbank](42.45,88.5,43.35,89.65);
node[natural~"^(peak|saddle)$"](42.45,88.5,43.35,89.65);
);
out meta geom;
