[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](29.3637,106.5504,29.7637,106.7504);
way[natural=water](29.3637,106.5504,29.7637,106.7504);
way[waterway=riverbank](29.3637,106.5504,29.7637,106.7504);
relation[type=multipolygon][natural=water](29.3637,106.5504,29.7637,106.7504);
relation[type=multipolygon][waterway=riverbank](29.3637,106.5504,29.7637,106.7504);
node[natural~"^(peak|saddle)$"](29.3637,106.5504,29.7637,106.7504);
);
out meta geom;
