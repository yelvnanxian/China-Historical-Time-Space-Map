[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](25.63,114.73,26.03,115.13);
way[natural=water](25.63,114.73,26.03,115.13);
way[waterway=riverbank](25.63,114.73,26.03,115.13);
relation[type=multipolygon][natural=water](25.63,114.73,26.03,115.13);
relation[type=multipolygon][waterway=riverbank](25.63,114.73,26.03,115.13);
node[natural~"^(peak|saddle)$"](25.63,114.73,26.03,115.13);
);
out meta geom;
