/**
 * Global jest setup: silences console.warn and console.log in every suite.
 *
 * Production code logs routine diagnostics (e.g. Anki duplicate notes),
 * which would drown real test failures in noise. console.error stays loud
 * on purpose - it usually signals genuine trouble worth seeing.
 */
beforeEach(() => {
// jest.spyOn(console, "warn").mockImplementation(() => undefined);
//  jest.spyOn(console, "log").mockImplementation(() => undefined);
});
