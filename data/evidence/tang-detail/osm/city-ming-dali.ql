[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](25.49,99.97,26.0,100.37);
way[natural=water](25.49,99.97,26.0,100.37);
way[waterway=riverbank](25.49,99.97,26.0,100.37);
relation[type=multipolygon][natural=water](25.49,99.97,26.0,100.37);
relation[type=multipolygon][waterway=riverbank](25.49,99.97,26.0,100.37);
node[natural~"^(peak|saddle)$"](25.49,99.97,26.0,100.37);
);
out meta geom;
