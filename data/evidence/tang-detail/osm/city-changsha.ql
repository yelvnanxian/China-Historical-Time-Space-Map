[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](28.028,112.739,28.428,113.139);
way[natural=water](28.028,112.739,28.428,113.139);
way[waterway=riverbank](28.028,112.739,28.428,113.139);
relation[type=multipolygon][natural=water](28.028,112.739,28.428,113.139);
relation[type=multipolygon][waterway=riverbank](28.028,112.739,28.428,113.139);
node[natural~"^(peak|saddle)$"](28.028,112.739,28.428,113.139);
);
out meta geom;
