[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](30.8958,104.8936,31.2958,105.2936);
way[natural=water](30.8958,104.8936,31.2958,105.2936);
way[waterway=riverbank](30.8958,104.8936,31.2958,105.2936);
relation[type=multipolygon][natural=water](30.8958,104.8936,31.2958,105.2936);
relation[type=multipolygon][waterway=riverbank](30.8958,104.8936,31.2958,105.2936);
node[natural~"^(peak|saddle)$"](30.8958,104.8936,31.2958,105.2936);
);
out meta geom;
