import type { ConformanceAdapter } from "./adapter.js";
import type { ExpressionFixture, Fixture, ProjectFixture } from "./fixture.js";
export interface FixtureReport {
    fixture: string;
    adapter: string;
    pass: boolean;
    skipped?: string;
    failures: string[];
}
export declare function runFixture(adapter: ConformanceAdapter, f: ExpressionFixture): FixtureReport;
export declare function runFixtures(adapter: ConformanceAdapter, fixtures: Fixture[]): Promise<FixtureReport[]>;
/** #24 — a whole-build fixture. J3's edges are invisible in any single file, so this is the only shape that can test them. */
export declare function runProjectFixture(adapter: ConformanceAdapter, f: ProjectFixture): Promise<FixtureReport>;
/** #11 — two implementations must agree on every fixture, independently of what the fixture expects. */
export declare function compareAdapters(a: ConformanceAdapter, b: ConformanceAdapter, fixtures: Fixture[]): Promise<string[]>;
//# sourceMappingURL=runner.d.ts.map