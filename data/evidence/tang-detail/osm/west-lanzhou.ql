[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](35.8,103.25,36.55,104.55);
way[natural=water](35.8,103.25,36.55,104.55);
way[waterway=riverbank](35.8,103.25,36.55,104.55);
relation[type=multipolygon][natural=water](35.8,103.25,36.55,104.55);
relation[type=multipolygon][waterway=riverbank](35.8,103.25,36.55,104.55);
node[natural~"^(peak|saddle)$"](35.8,103.25,36.55,104.55);
);
out meta geom;
