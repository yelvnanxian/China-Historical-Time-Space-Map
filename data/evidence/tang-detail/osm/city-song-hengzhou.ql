[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](26.693,112.372,27.093,112.772);
way[natural=water](26.693,112.372,27.093,112.772);
way[waterway=riverbank](26.693,112.372,27.093,112.772);
relation[type=multipolygon][natural=water](26.693,112.372,27.093,112.772);
relation[type=multipolygon][waterway=riverbank](26.693,112.372,27.093,112.772);
node[natural~"^(peak|saddle)$"](26.693,112.372,27.093,112.772);
);
out meta geom;
