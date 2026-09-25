[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](29.5,119.5,32.5,122);
way[natural=water](29.5,119.5,32.5,122);
way[waterway=riverbank](29.5,119.5,32.5,122);
relation[type=multipolygon][natural=water](29.5,119.5,32.5,122);
relation[type=multipolygon][waterway=riverbank](29.5,119.5,32.5,122);
node[natural~"^(peak|saddle)$"](29.5,119.5,32.5,122);
);
out meta geom;
