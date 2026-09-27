[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](30.8175,109.265,31.2175,109.665);
way[natural=water](30.8175,109.265,31.2175,109.665);
way[waterway=riverbank](30.8175,109.265,31.2175,109.665);
relation[type=multipolygon][natural=water](30.8175,109.265,31.2175,109.665);
relation[type=multipolygon][waterway=riverbank](30.8175,109.265,31.2175,109.665);
node[natural~"^(peak|saddle)$"](30.8175,109.265,31.2175,109.665);
);
out meta geom;
