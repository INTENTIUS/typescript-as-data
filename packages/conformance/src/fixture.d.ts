export interface ExpressionFixture {
    kind: "expression";
    id: string;
    dir: string;
    input: string;
    rules: string[];
    exportName: string;
    shape: "accept" | "reject";
    fold: "fold" | "run";
    value?: unknown;
    rejectAt?: {
        line: number;
        column: number;
    };
    note?: string;
}
export interface ProjectFixture {
    kind: "project";
    id: string;
    dir: string;
    rules: string[];
    /** Path relative to project/, to source. Paths use "/" on every platform. */
    files: Map<string, string>;
    verdicts: Record<string, "fold" | "run">;
    tentative?: Record<string, "fold" | "run">;
    taintedBy?: Record<string, string>;
    exports?: Record<string, Record<string, unknown>>;
    /** The rule a `run` verdict must name, per file. An adapter that reports no rule is not held to it. */
    rejectRule?: Record<string, string>;
    /** A named host from host.ts. Required for any fixture whose sources import one. */
    host?: string;
    note?: string;
}
export type Fixture = ExpressionFixture | ProjectFixture;
/** Kept as the name the expression-only callers import; `kind` narrows. */
export declare const expressionFixtures: (all: Fixture[]) => ExpressionFixture[];
export declare const projectFixtures: (all: Fixture[]) => ProjectFixture[];
export declare function loadFixtures(root: string): Fixture[];
//# sourceMappingURL=fixture.d.ts.map