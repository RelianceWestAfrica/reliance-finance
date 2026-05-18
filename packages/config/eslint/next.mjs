import baseConfig from './index.mjs';

// Note : pour eviter le couplage a eslint-plugin-react et eslint-plugin-react-hooks
// (qui necessitent une installation distincte), ce preset herite uniquement de la
// config TypeScript de base. Le projet Next.js peut ajouter ses propres regles
// React via "eslint-config-next" charge en flat-config (cf. apps/web/eslint.config.mjs).

/** @type {import('eslint').Linter.Config[]} */
export default [...baseConfig];
