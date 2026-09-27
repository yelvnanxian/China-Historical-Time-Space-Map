[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](31.347,104.5579,31.587,104.7979);
way[natural=water](31.347,104.5579,31.587,104.7979);
way[waterway=riverbank](31.347,104.5579,31.587,104.7979);
relation[type=multipolygon][natural=water](31.347,104.5579,31.587,104.7979);
relation[type=multipolygon][waterway=riverbank](31.347,104.5579,31.587,104.7979);
node[natural~"^(peak|saddle)$"](31.347,104.5579,31.587,104.7979);
);
out meta geom;
