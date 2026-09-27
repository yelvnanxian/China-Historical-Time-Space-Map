[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"](29.5054,115.8026,29.9054,116.2026);
way[natural=water](29.5054,115.8026,29.9054,116.2026);
way[waterway=riverbank](29.5054,115.8026,29.9054,116.2026);
relation[type=multipolygon][natural=water](29.5054,115.8026,29.9054,116.2026);
relation[type=multipolygon][waterway=riverbank](29.5054,115.8026,29.9054,116.2026);
node[natural~"^(peak|saddle)$"](29.5054,115.8026,29.9054,116.2026);
);
out meta geom;
