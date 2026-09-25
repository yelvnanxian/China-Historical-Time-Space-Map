[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](25.95,119.0833,26.35,119.4833);
way[natural=water](25.95,119.0833,26.35,119.4833);
way[waterway=riverbank](25.95,119.0833,26.35,119.4833);
relation[type=multipolygon][natural=water](25.95,119.0833,26.35,119.4833);
relation[type=multipolygon][waterway=riverbank](25.95,119.0833,26.35,119.4833);
node[natural~"^(peak|saddle)$"](25.95,119.0833,26.35,119.4833);
);
out meta geom;
