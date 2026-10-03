/** The build this game was made from: the git commit, injected by Vite's define (vite.config.ts); 'dev' outside a build (tests, the
 *  headless scripts). A replay records it, and warns when it is played on another build (iteration 67). */
declare const __BUILD__: string | undefined;
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
