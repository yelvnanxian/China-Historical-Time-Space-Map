[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](25.0344,109.9799,25.4344,110.45);
way[natural=water](25.0344,109.9799,25.4344,110.45);
way[waterway=riverbank](25.0344,109.9799,25.4344,110.45);
relation[type=multipolygon][natural=water](25.0344,109.9799,25.4344,110.45);
relation[type=multipolygon][waterway=riverbank](25.0344,109.9799,25.4344,110.45);
node[natural~"^(peak|saddle)$"](25.0344,109.9799,25.4344,110.45);
);
out meta geom;
