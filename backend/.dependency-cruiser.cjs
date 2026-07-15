/**
 * Phase 0.5 (build-guide.md): the search-API-must-not-import-persistence rule,
 * wired in before the search module even exists so it guards from the moment
 * it does. See search-interface-contract.md §4.4 — this is the build-time
 * enforcement of the "interface module cannot leak into the implementation"
 * boundary; the TypeScript-ecosystem equivalent of the ArchUnit rule the
 * Java version of this design used.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'search-api-no-persistence',
      severity: 'error',
      comment:
        'src/search/api (the UnifiedSearchService contract) must not depend on Prisma or any ' +
        'persistence-layer module — that dependency direction is what keeps the retrieval engine swappable.',
      from: { path: '^src/search/api' },
      to: { path: '^(src/prisma|node_modules/@prisma|node_modules/prisma)' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
