[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](32.088,105.324,32.488,105.724);
way[natural=water](32.088,105.324,32.488,105.724);
way[waterway=riverbank](32.088,105.324,32.488,105.724);
relation[type=multipolygon][natural=water](32.088,105.324,32.488,105.724);
relation[type=multipolygon][waterway=riverbank](32.088,105.324,32.488,105.724);
node[natural~"^(peak|saddle)$"](32.088,105.324,32.488,105.724);
);
out meta geom;
