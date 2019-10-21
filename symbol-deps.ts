import ts = require("typescript");
import path = require("path");
import { readdirSync } from "fs";
const dtRoot = path.join(__dirname, "../../DefinitelyTyped/types/");

function analyzePackageDependencies(packageName: string) {
    const dependencies: any[] = [];
    const packageRoot = path.resolve(path.join(dtRoot, packageName));
    const tsConfigRoot = path.resolve(path.join(packageRoot, "tsconfig.json"));

    const host = ts.sys as any;
    host.onUnRecoverableConfigFileDiagnostic = (diag: any) => {
        console.log(JSON.stringify(diag));
    };
    const cfg = ts.getParsedCommandLineOfConfigFile(tsConfigRoot, ts.getDefaultCompilerOptions(), host);

    if (!cfg) throw new Error("Failed to parse tsconfig");
    const program = ts.createProgram({ options: cfg.options, rootNames: cfg.fileNames });
    const checker = program.getTypeChecker();
    for (const p of program.getSourceFiles()) {
        const packageOfFile = getPackageName(p.fileName);
        if (packageOfFile !== packageName) continue;
        analyzeSourceFile(p);
    }

    return { dependencies };

    function collectUsageOfType(typeNode: ts.TypeNode) {
        const annotatedType = checker.getTypeFromTypeNode(typeNode);
        if (annotatedType.symbol) {
            const decls = annotatedType.symbol.getDeclarations();
            for (const d of (decls ?? [])) {
                const file = d.getSourceFile();
                const filePkg = getPackageName(file.fileName);
                if (filePkg !== packageName) {
                    let targetSymbol = annotatedType.symbol;
                    while ("target" in targetSymbol) {
                        targetSymbol = (targetSymbol as any)["target"];
                    }

                    dependencies.push({
                        from: packageName,
                        to: filePkg,
                        type: targetSymbol.name
                    });
                }
            }
        }

    }

    function analyzeSourceFile(file: ts.SourceFile) {
        ts.forEachChild(file, analyze);

        function analyze(node: ts.Node) {
            if (ts.isTypeReferenceNode(node)) {
                collectUsageOfType(node);
            }

            ts.forEachChild(node, analyze);
        }
    }
}

function getPackageName(fileName: string) {
    const originalFileName = fileName;

    do {
        if (path.basename(path.dirname(fileName)) === "types") {
            return path.basename(fileName);
        }
        let base = path.dirname(fileName);
        if (base === fileName) {
            return path.basename(originalFileName);
        }
        fileName = base;
    } while (path.dirname(fileName) !== "types");
    return path.basename(fileName);
}

for (const p of readdirSync(dtRoot)) {
    try {
        const { dependencies } = analyzePackageDependencies(p);
        for (const d of dependencies) {
            console.log(`${d.from},${d.to},${d.type}`);
        }
    }
    catch {
        console.error(p);
    }
}
