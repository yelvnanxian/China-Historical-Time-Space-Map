[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](36.41,114.29,36.81,114.69);
way[natural=water](36.41,114.29,36.81,114.69);
way[waterway=riverbank](36.41,114.29,36.81,114.69);
relation[type=multipolygon][natural=water](36.41,114.29,36.81,114.69);
relation[type=multipolygon][waterway=riverbank](36.41,114.29,36.81,114.69);
node[natural~"^(peak|saddle)$"](36.41,114.29,36.81,114.69);
);
out meta geom;
