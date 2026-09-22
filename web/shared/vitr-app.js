import { recommendAsset } from './release-classifier.js';

export const VITR_REPO = 'voidnont/vitr';

export const VITR_APP = {
  id: 'vitr',
  name: 'Vitr',
  sources: [
    { repo: VITR_REPO },
  ],
};

export function mergeVitrSources(sourceSummaries = [], target = { os: 'unknown', arch: 'unknown' }) {
  const taggedAssets = sourceSummaries.flatMap((source) =>
    (source.assets || []).map((asset) => ({ ...asset, repo: source.repo })),
  );
  const recommended = target.os === 'unknown' ? null : recommendAsset(taggedAssets, target);
  return {
    id: VITR_APP.id,
    name: VITR_APP.name,
    sources: sourceSummaries,
    assets: taggedAssets,
    availablePlatforms: [...new Set(taggedAssets
      .filter((asset) => asset.installable && asset.platform !== 'unknown')
      .map((asset) => asset.platform))],
    recommended,
  };
}
