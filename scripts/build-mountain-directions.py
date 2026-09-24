"""Derive schematic directions from pinned Natural Earth naming polygons.

Run: python scripts/build-mountain-directions.py
Requires Shapely 2.x, pyproj 3.x and NumPy. No network access is required.
These are polygon-derived display directions, not DEM-derived or surveyed ridges.
"""
from __future__ import annotations
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pyproj
import shapely
from pyproj import CRS, Transformer
from shapely import contains_xy
from shapely.affinity import affine_transform
from shapely.geometry import LineString, MultiLineString, mapping, shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/data'
INPUT = PUBLIC / 'physical-regions.geojson'
SOURCE_MANIFEST = PUBLIC / 'physical-geography-sources.json'
SOURCE_DATASET = 'ne_10m_geography_regions_polys'
OUTPUT = PUBLIC / 'mountain-directions.geojson'
MANIFEST = PUBLIC / 'mountain-directions-sources.json'
VALIDATION = ROOT / 'data/evidence/physical-geography/mountain-directions-validation.json'
METHOD = 'local-aeqd-area-pca-cross-section-midpoints-smoothed-clipped-v1'
NOTE = '走向示意，非测绘山脊线；由Natural Earth 1:1000万山系命名概括范围的内部截面推导，未经DEM山脊提取或野外测量。'
PARAMETERS = {
    'samplingGridCellsPerAxis': 64,
    'minimumInteriorSamples': 24,
    'minimumComponentAreaKm2': 25,
    'minimumComponentRelativeArea': 0.001,
    'minimumPrincipalAxisRatio': 1.35,
    'minimumAxisLengthKm': 20,
    'endTrimFraction': 0.025,
    'targetCrossSectionSpacingKm': 20,
    'minimumCrossSections': 16,
    'maximumCrossSections': 64,
    'maximumPerpendicularJumpToStepRatio': 3,
    'minimumDiscontinuityAxisFraction': 0.03,
    'chaikinIterations': 2,
    'minimumOutputPartLengthKm': 10,
    'minimumCoveredAxisFraction': 0.4,
    'maximumPathToAxisRatio': 2.2,
}


def sha(payload):
    return hashlib.sha256(payload).hexdigest()


def json_bytes(value, pretty=False):
    return (json.dumps(value, ensure_ascii=False, indent=2 if pretty else None,
                       separators=None if pretty else (',', ':')) + '\n').encode()


def line_parts(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'LineString':
        return [geometry] if len(geometry.coords) > 1 else []
    if geometry.geom_type in ['MultiLineString', 'GeometryCollection']:
        return [line for part in geometry.geoms for line in line_parts(part)]
    return []


def smooth(points):
    """Corner-cut an open line while retaining the first/last sample positions."""
    current = np.asarray(points, dtype=float)
    for _ in range(PARAMETERS['chaikinIterations']):
        result = [current[0]]
        for a, b in zip(current[:-1], current[1:]):
            result.extend([0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b])
        result.append(current[-1])
        current = np.asarray(result)
    return current.tolist()


def component_direction(polygon, largest_area):
    report = {'areaKm2': polygon.area / 1_000_000, 'relativeArea': polygon.area / largest_area}
    if report['areaKm2'] < PARAMETERS['minimumComponentAreaKm2'] or report['relativeArea'] < PARAMETERS['minimumComponentRelativeArea']:
        return [], {**report, 'status': 'skipped', 'reason': '分量过小，不生成可读方向，且不与主分量跨空白连接。'}
    west, south, east, north = polygon.bounds
    cells = PARAMETERS['samplingGridCellsPerAxis']
    x = np.linspace(west, east, cells, endpoint=False) + (east - west) / (2 * cells)
    y = np.linspace(south, north, cells, endpoint=False) + (north - south) / (2 * cells)
    xx, yy = np.meshgrid(x, y)
    inside = contains_xy(polygon, xx, yy)
    samples = np.column_stack([xx[inside], yy[inside]])
    report['interiorSamples'] = len(samples)
    if len(samples) < PARAMETERS['minimumInteriorSamples']:
        return [], {**report, 'status': 'skipped', 'reason': '内部面积采样不足，未推导可靠可读方向。'}
    eigenvalues, eigenvectors = np.linalg.eigh(np.cov(samples, rowvar=False))
    ratio = math.sqrt(float(eigenvalues[1] / eigenvalues[0])) if eigenvalues[0] > 0 else math.inf
    report['principalAxisRatio'] = ratio
    if not math.isfinite(ratio) or ratio < PARAMETERS['minimumPrincipalAxisRatio']:
        return [], {**report, 'status': 'skipped', 'reason': '命名范围形状接近团块，没有足够明确的单一主方向。'}
    axis = eigenvectors[:, 1]
    if axis[0] < 0 or (axis[0] == 0 and axis[1] < 0):
        axis = -axis
    dx, dy = map(float, axis)
    # x becomes distance along the principal direction, y the perpendicular.
    aligned = affine_transform(polygon, [dx, dy, -dy, dx, 0, 0])
    u0, v0, u1, v1 = aligned.bounds
    axis_length = u1 - u0
    report['axisLengthKm'] = axis_length / 1000
    if axis_length < PARAMETERS['minimumAxisLengthKm'] * 1000:
        return [], {**report, 'status': 'skipped', 'reason': '概括范围主轴过短，不生成本比例尺走向线。'}
    steps = max(PARAMETERS['minimumCrossSections'], min(PARAMETERS['maximumCrossSections'],
                math.ceil(axis_length / (PARAMETERS['targetCrossSectionSpacingKm'] * 1000))))
    trim = PARAMETERS['endTrimFraction'] * axis_length
    points = []
    for u in np.linspace(u0 + trim, u1 - trim, steps):
        section = LineString([(u, v0 - 1000), (u, v1 + 1000)])
        parts = line_parts(aligned.intersection(section))
        if not parts:
            continue
        # Only one principal path, not every branch or edge of the range.
        longest = max(parts, key=lambda part: part.length)
        points.append(list(longest.interpolate(0.5, normalized=True).coords[0]))
    if len(points) < PARAMETERS['minimumCrossSections'] // 2:
        return [], {**report, 'status': 'skipped', 'reason': '有效内部截面不足，保留名称，不强造连续走向。'}
    sections = [[points[0]]]
    for a, b in zip(points[:-1], points[1:]):
        jump_limit = max(PARAMETERS['maximumPerpendicularJumpToStepRatio'] * (b[0] - a[0]),
                         PARAMETERS['minimumDiscontinuityAxisFraction'] * axis_length)
        if abs(b[1] - a[1]) > jump_limit:
            # A different lobe may become the longest interval. Do not invent
            # a steep connector merely to keep this schematic continuous.
            sections.append([])
        sections[-1].append(b)
    report['crossSectionDiscontinuities'] = len(sections) - 1
    parts = []
    for section in sections:
        if len(section) < 3:
            continue
        candidate = LineString(smooth(section))
        # Clip AFTER smoothing: no shortcut can remain outside the source.
        clipped = candidate.intersection(aligned)
        parts.extend(part for part in line_parts(clipped)
                     if part.length >= PARAMETERS['minimumOutputPartLengthKm'] * 1000)
    if not parts:
        return [], {**report, 'status': 'skipped', 'reason': '平滑后仅剩短碎段，不适合作为走向示意。'}
    length = sum(part.length for part in parts)
    covered_axis = sum(part.bounds[2] - part.bounds[0] for part in parts)
    report.update({'crossSections': len(points), 'coveredAxisFraction': covered_axis / axis_length,
                   'pathToAxisRatio': length / axis_length, 'outputLengthKm': length / 1000,
                   'outputParts': len(parts)})
    if covered_axis / axis_length < PARAMETERS['minimumCoveredAxisFraction'] or length / axis_length > PARAMETERS['maximumPathToAxisRatio']:
        return [], {**report, 'status': 'skipped', 'reason': '方向线过于碎裂或曲折，不能合理代表命名范围的主走向。'}
    restored = [affine_transform(part, [dx, -dy, dy, dx, 0, 0]) for part in parts]
    return restored, {**report, 'status': 'available', 'reason': '内部截面中点产生的主走向示意，不是地形山脊线。'}


input_bytes = INPUT.read_bytes()
source_manifest_bytes = SOURCE_MANIFEST.read_bytes()
source_manifest = json.loads(source_manifest_bytes)
source_record = next(source for source in source_manifest['sources'] if source['dataset'] == SOURCE_DATASET)
snapshot = ROOT / source_record['snapshotPath']
snapshot_bytes = snapshot.read_bytes()
assert sha(snapshot_bytes) == source_record['sha256']
source_features = json.loads(snapshot_bytes)['features']
data = json.loads(input_bytes)
mountains = [f for f in data['features'] if f['properties']['kind'] == 'mountain']
assert len(mountains) == 52
features = []
availability = []
validation = []

for mountain in mountains:
    p = mountain['properties']
    assert mountain['geometry'] == source_features[p['sourceFeatureIndices'][0]]['geometry']
    geometry = shape(mountain['geometry'])
    assert geometry.is_valid and geometry.geom_type in ['Polygon', 'MultiPolygon']
    center = geometry.centroid
    local_crs = CRS.from_proj4(f'+proj=aeqd +lat_0={center.y:.10f} +lon_0={center.x:.10f} +datum=WGS84 +units=m +no_defs')
    to_local = Transformer.from_crs('EPSG:4326', local_crs, always_xy=True).transform
    to_geo = Transformer.from_crs(local_crs, 'EPSG:4326', always_xy=True).transform
    local = transform(to_local, geometry)
    components = list(local.geoms) if local.geom_type == 'MultiPolygon' else [local]
    largest_area = max(part.area for part in components)
    reports = []
    result_parts = []
    for component_index, component in enumerate(components):
        lines, report = component_direction(component, largest_area)
        report['sourceComponentIndex'] = component_index
        reports.append(report)
        for line in lines:
            # Return to WGS84 and clip once more to the unprojected original,
            # accounting for straight-segment differences between projections.
            projected_back = transform(to_geo, line)
            source_component = (list(geometry.geoms)[component_index] if geometry.geom_type == 'MultiPolygon' else geometry)
            final_parts = line_parts(projected_back.intersection(source_component))
            result_parts.extend(part for part in final_parts
                                if transform(to_local, part).length >= PARAMETERS['minimumOutputPartLengthKm'] * 1000)
    record = {'groupId': p['groupId'], 'name': p['name'], 'components': reports,
              'localProjection': local_crs.to_string()}
    if not result_parts:
        availability.append({'groupId': p['groupId'], 'name': p['name'], 'status': 'label-only',
                             'reason': '；'.join(dict.fromkeys(report['reason'] for report in reports))})
        validation.append({**record, 'status': 'label-only'})
        continue
    result = result_parts[0] if len(result_parts) == 1 else MultiLineString(result_parts)
    longest = max(result_parts, key=lambda part: transform(to_local, part).length)
    # Interpolate the actual exported WGS84 line, so the label is exactly on it.
    point = longest.interpolate(0.5, normalized=True)
    assert result.is_valid and not result.is_empty
    assert result.difference(geometry.buffer(1e-9)).is_empty
    assert longest.distance(point) < 1e-10
    feature_id = f'mountain-direction-{p["groupId"]}'
    feature = {
        'type': 'Feature', 'id': feature_id,
        'properties': {
            'id': feature_id, 'groupId': p['groupId'], 'name': p['name'], 'kind': 'mountain',
            'labelCoordinates': list(point.coords[0]), 'bounds': list(result.bounds),
            'geometryNote': NOTE, 'method': METHOD, 'sourceUrl': p['sourceUrl'],
            'sourceDataset': p['sourceDataset'], 'sourcePolygonId': p['id'],
            'sourceFeatureIndices': p['sourceFeatureIndices'], 'schematic': True,
            'minZoom': p['minZoom'],
        },
        'geometry': mapping(result),
    }
    features.append(feature)
    availability.append({'groupId': p['groupId'], 'name': p['name'], 'status': 'available',
                         'reason': '仅选中后显示由命名范围推导的主走向示意；不代表测绘山脊。'})
    validation.append({**record, 'status': 'available', 'outputParts': len(result_parts),
                       'outputLengthKm': transform(to_local, result).length / 1000,
                       'labelDistanceToLineDegrees': result.distance(point),
                       'outsideSourceLengthDegrees': result.difference(geometry).length})

output = {
    'type': 'FeatureCollection',
    'metadata': {'version': '1.0.0', 'method': METHOD, 'geometryNote': NOTE,
                 'sourceManifestUrl': '/data/mountain-directions-sources.json',
                 'modernBackgroundOnly': True, 'displayPolicy': 'Selected mountain only; no default all-mountain line overlay.'},
    'features': features,
}
output_bytes = json_bytes(output)
OUTPUT.write_bytes(output_bytes)
validation_bytes = json_bytes({'method': METHOD, 'parameters': PARAMETERS, 'records': validation}, pretty=True)
VALIDATION.write_bytes(validation_bytes)
manifest = {
    'version': '1.0.0', 'geometryUrl': '/data/mountain-directions.geojson', 'method': METHOD,
    'geometryNote': NOTE, 'coordinateSystem': 'WGS84 longitude/latitude, EPSG:4326',
    'source': source_record, 'sourceScale': '1:10,000,000 (not 10 metres)',
    'license': source_manifest['license'], 'licenseUrl': source_manifest['licenseUrl'],
    'input': {'path': str(INPUT.relative_to(ROOT)), 'sha256': sha(input_bytes)},
    'output': {'path': str(OUTPUT.relative_to(ROOT)), 'sha256': sha(output_bytes), 'bytes': len(output_bytes)},
    'validation': {'path': str(VALIDATION.relative_to(ROOT)), 'sha256': sha(validation_bytes)},
    'counts': {'candidateMountains': len(mountains), 'withDirection': len(features),
               'labelOnly': len(mountains) - len(features),
               'skippedComponents': sum(report['status'] == 'skipped' for item in validation for report in item['components'])},
    'parameters': PARAMETERS,
    'availability': availability,
    'derivation': [
        'Only kind=mountain is processed. Each Polygon component is handled independently in a local azimuthal-equidistant metre projection.',
        'Use a regular area sample grid to estimate a geometric principal direction; reject near-isotropic, tiny or too-short components.',
        'Take midpoint of the longest interior interval on perpendicular sections; this is one principal display direction, not all mountain branches.',
        'Split sudden cross-section midpoint jumps into separate paths instead of inventing steep connections between polygon lobes.',
        'Apply two open Chaikin corner-cutting iterations; clip the smoothed line back to its own source component, removing short fragments.',
        'Transform back to WGS84 and clip to the exact original polygon again; never connect separate polygon components across empty space.',
        'Place the label at the WGS84 coordinate-length midpoint of the longest retained path.',
    ],
    'limitations': [
        'These lines describe the geometry of cartographic naming regions, not physical ridge crests, relief, mountain edges, routes or surveyed geography.',
        'No DEM-based ridge extraction, historic mountain reconstruction or external survey was performed.',
        'Plateaus and seas receive no direction line. Unsuitable mountain shapes remain label-only with recorded reasons.',
        'Fine-looking curves do not add accuracy beyond the 1:10,000,000 source. Branching ranges are reduced to one principal path per component.',
    ],
    'runtime': {'shapely': shapely.__version__, 'pyproj': pyproj.__version__, 'numpy': np.__version__},
    'reproduction': 'python scripts/build-mountain-directions.py (no network required)',
}
MANIFEST.write_bytes(json_bytes(manifest, pretty=True))
assert INPUT.read_bytes() == input_bytes and SOURCE_MANIFEST.read_bytes() == source_manifest_bytes
assert snapshot.read_bytes() == snapshot_bytes
print(json.dumps({'counts': manifest['counts'], 'bytes': len(output_bytes),
                  'labelOnly': [entry for entry in availability if entry['status'] == 'label-only']}, ensure_ascii=False, indent=2))
