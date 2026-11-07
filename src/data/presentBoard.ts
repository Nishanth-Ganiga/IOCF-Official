import { isHiddenBoard } from './hiddenBoards.mjs';
import { store } from './store';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Statistics lines played for a dismantled board belong to players who have since joined other boards: such a player is shown under his
 * present board (from the roster), or, if he is not on a roster yet, under "Moved to another board". The dismantled board is never named.
 */
export function withPresentBoard<T extends { name: string; board?: string | null; boardName: string | null }>(players: T[]): T[] {
  return players.map((p) => {
    if (!isHiddenBoard(p.board ?? '') && !isHiddenBoard(p.boardName ?? '')) return p;
    const now = store.players.find((x) => norm(x.name) === norm(p.name));
    const board = now && store.boards.find((b) => slug(b.name) === now.boardId);
    return board ? { ...p, board: slug(board.name), boardName: board.name } : { ...p, board: null, boardName: 'Moved to another board' };
  });
}
