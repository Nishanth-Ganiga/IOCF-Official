import type { Board } from './boards';

/** Official Instagram handle of each board, keyed by board slug (see boardSlug in boards.ts). */
export const instagramHandles: Record<string, string> = {
  afghanistan: 'afghanistan.iocf',
  australia: 'cricket.australia_oc',
  bangladesh: 'bangladeshoc_iocf',
  canada: 'canada_iocf',
  england: 'england_onlinecricket',
  india: 'iocb_oc',
  ireland: 'ireland_iocf',
  italy: 'italy_oc',
  japan: 'japanonlinecricket.teamiocf',
  kenya: 'kenya.iocf',
  nepal: 'nepal_oc',
  netherlands: 'boardnetherlands',
  'new-zealand': 'newzealand_oc',
  pakistan: 'pakistan_oc',
  'papua-new-guinea': 'png.iocf',
  portugal: 'portugal.iocf',
  qatar: 'iocf_qatar',
  scotland: 'scotland_oc',
  'south-africa': 'cric.sa_oc',
  spain: 'spain.iocf',
  'sri-lanka': 'srilankaoc',
  uae: 'uae_iocf',
  uganda: 'uganda_oc',
  usa: 'usa_iocf',
  'west-indies': 'westindiesoc',
  zimbabwe: 'iocfzimbabwe',
};

/** The board's Instagram profile, if one is listed. */
export function instagramOf(board: Board): { handle: string; url: string } | undefined {
  // same slug rule as boardSlug in boards.ts, which is lazy-loaded and so not imported here
  const handle = instagramHandles[board.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')];
  return handle ? { handle, url: `https://www.instagram.com/${handle}/` } : undefined;
}
