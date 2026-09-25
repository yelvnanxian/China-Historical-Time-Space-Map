import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { TangCountyDiagnostics, TangCountyResearch } from "../shared/tang-county-diagnostics";

const root = new URL("../", import.meta.url);
const bytes = (path: string) => readFileSync(new URL(path, root));
const read = <T,>(path: string): T => JSON.parse(bytes(path).toString("utf8"));
interface ResearchSource { id: string; title: string; url: string; kind: string; snapshotPath: string; snapshotSha256: string }
interface ResearchEntry extends Omit<TangCountyResearch, "findings"> {
  settlementIds: string[]; boundaryIds: string[];
  findings: { topic: string; statement: string; evidence: { sourceId: string; quote: string; locator: string }[] }[];
}
interface Decision { settlementId: string; boundaryId: string; researchEntryId: string; reason: string }
interface Bundle { sources: ResearchSource[]; entries: ResearchEntry[]; exclusions?: Decision[]; links?: Decision[] }
const bundles = ["focus", "bulk", "identities"].map(name => read<Bundle>(`data/evidence/tang-county-research/${name}.json`));
const entries = bundles.flatMap(bundle => bundle.entries);
const diagnostics = read<TangCountyDiagnostics>("public/data/tang-county-diagnostics.json");
const countyId = (id: number) => `hartwell-741-county-v5_0741_chin_chn_0741_c-${id}`;

test("每项研究有可逐字复核的归档出处和未决问题，来源完整性与版本可追溯", () => {
  assert.ok(entries.length >= 50, "发布研究批次应覆盖重点个案及广覆盖县级条目");
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
  const kinds = new Set<string>();
  for (const bundle of bundles) {
    const sources = new Map(bundle.sources.map(source => [source.id, source]));
    for (const source of sources.values()) {
      assert.equal(createHash("sha256").update(bytes(source.snapshotPath)).digest("hex"), source.snapshotSha256, source.id);
      assert.match(source.url, /^https:\/\//);
      if (source.url.includes("wikisource.org")) assert.match(source.url, /oldid=\d+/, source.id);
      kinds.add(source.kind);
    }
    for (const entry of bundle.entries) {
      assert.ok(entry.summary && entry.findings.length && entry.unresolved.length, entry.id);
      for (const finding of entry.findings) {
        assert.ok(finding.evidence.length, `${entry.id}: unsupported statement`);
        for (const evidence of finding.evidence) {
          const source = sources.get(evidence.sourceId);
          assert.ok(source, evidence.sourceId);
          assert.ok(evidence.locator, entry.id);
          assert.ok(bytes(source.snapshotPath).toString("utf8").includes(evidence.quote), `${entry.id}: ${evidence.quote}`);
        }
      }
    }
  }
  assert.ok(kinds.has("official-history") && kinds.has("historical-geography") && kinds.has("dataset"));
});

test("研究只发布到明确审核的点和面，公共引文没有丢失或换成别的来源", () => {
  const count = (side: "bySettlement" | "byBoundary") => Object.values(diagnostics[side] as Record<string, { historicalResearch?: unknown[] }>).filter(item => item.historicalResearch?.length).length;
  assert.equal(diagnostics.researchCoverage?.entries, entries.length);
  assert.equal(diagnostics.researchCoverage?.settlements, count("bySettlement"));
  assert.equal(diagnostics.researchCoverage?.boundaries, count("byBoundary"));
  for (const bundle of bundles) {
    const sources = new Map(bundle.sources.map(source => [source.id, source]));
    for (const entry of bundle.entries) {
      const expected = { id: entry.id, title: entry.title, summary: entry.summary, correspondence: entry.correspondence, unresolved: entry.unresolved,
        findings: entry.findings.map(finding => ({ ...finding, evidence: finding.evidence.map(evidence => {
          const source = sources.get(evidence.sourceId)!;
          return { sourceId: source.id, sourceTitle: source.title, sourceUrl: source.url, sourceKind: source.kind, quote: evidence.quote, locator: evidence.locator };
        }) })) };
      for (const [side, ids] of [["bySettlement", entry.settlementIds], ["byBoundary", entry.boundaryIds]] as const) {
        const actualIds = Object.entries(diagnostics[side] as Record<string, { historicalResearch?: TangCountyResearch[] }>).filter(([, record]) => record.historicalResearch?.some(item => item.id === entry.id)).map(([id]) => id);
        assert.deepEqual(actualIds.sort(), [...ids].sort(), entry.id);
        for (const id of ids) assert.deepEqual(diagnostics[side][id].historicalResearch?.find(item => item.id === entry.id), expected, `${id}/${entry.id}`);
      }
    }
  }
});

test("古籍身份排除移除错误同名候选；明确改名链保留其证据来源并重新检验点面", () => {
  const exclusions = bundles.flatMap(bundle => bundle.exclusions ?? []), links = bundles.flatMap(bundle => bundle.links ?? []);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  assert.equal(diagnostics.researchCoverage?.excludedPairs, exclusions.length);
  assert.equal(diagnostics.researchCoverage?.documentedLinks, links.length);
  assert.ok(exclusions.length > 0 && links.length > 0);
  for (const decision of [...exclusions, ...links]) {
    const entry = byId.get(decision.researchEntryId)!;
    assert.ok(entry.settlementIds.includes(decision.settlementId) && entry.boundaryIds.includes(decision.boundaryId));
    assert.ok(decision.reason);
  }
  for (const decision of exclusions) {
    const point = diagnostics.bySettlement[decision.settlementId], model = diagnostics.byBoundary[decision.boundaryId];
    assert.equal(byId.get(decision.researchEntryId)!.correspondence, "different-unit");
    assert.ok(!point.candidateBoundaryIds.includes(decision.boundaryId));
    assert.ok(point.excludedHomonymBoundaryIds.includes(decision.boundaryId));
    assert.ok(!model.sourcePoints.some(item => item.id === decision.settlementId));
    assert.ok(model.excludedHomonyms.some(item => item.id === decision.settlementId));
  }
  for (const decision of links) {
    assert.equal(byId.get(decision.researchEntryId)!.correspondence, "same-unit");
    const candidate = diagnostics.bySettlement[decision.settlementId].candidates.find(item => item.boundaryId === decision.boundaryId);
    assert.ok(candidate);
    assert.equal(candidate.basis, "documented-research");
  }
  assert.ok(diagnostics.bySettlement["chgis-county-42639"].excludedHomonymBoundaryIds.includes(countyId(1288)), "安南县不能作为安南都护府治所");
});

test("重点年代核查保留真正异文，且不把CHGIS最后有效年误作撤销年", () => {
  const focus = bundles[0];
  const tang = focus.entries.find(entry => entry.id === "county-focus-tangcheng")!;
  assert.ok(tang.findings.some(finding => finding.statement.includes("736") && finding.statement.includes("738") && finding.evidence.length >= 3));
  const hubei = focus.entries.find(entry => entry.id === "county-focus-jiyang-hubei")!;
  assert.ok(hubei.findings.some(finding => finding.statement.includes("808") && finding.statement.includes("恢复")));
  const hainan = focus.entries.find(entry => entry.id === "county-focus-jiyang-hainan")!;
  const chronology = hainan.findings.find(finding => finding.topic === "chronology")!;
  assert.match(chronology.statement, /1072.*1073.*相容/);
  assert.ok(chronology.evidence.some(evidence => evidence.sourceId === "county-focus-chgis-dictionary" && evidence.quote.includes("last year for which this record is valid")));
  // Research adds knowledge, not a fabricated resolution of the geographic discrepancy.
  for (const id of ["chgis-county-43627", "chgis-county-43673"]) assert.equal(diagnostics.bySettlement[id].status, "outside");
});
