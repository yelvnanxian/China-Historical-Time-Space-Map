[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](28.483,115.658,28.883,116.058);
way[natural=water](28.483,115.658,28.883,116.058);
way[waterway=riverbank](28.483,115.658,28.883,116.058);
relation[type=multipolygon][natural=water](28.483,115.658,28.883,116.058);
relation[type=multipolygon][waterway=riverbank](28.483,115.658,28.883,116.058);
node[natural~"^(peak|saddle)$"](28.483,115.658,28.883,116.058);
);
out meta geom;
