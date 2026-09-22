/**
 * Where a new note is born.
 *
 * "New note" used to look at the open tab, take its base and create the file
 * inside it. That holds only while the base is a folder. A file opened on its
 * own, by double click or from the file manager, is its own base, and its id
 * is the path of the file itself: creating "inside" it asks the system to put
 * a file inside a file, which fails. With nothing open at all there was no
 * base to find and the command returned without a word.
 *
 * So the question is answered here, and answered with a folder or with
 * nothing. Nothing is not a failure: it means the note has no home yet, and
 * the caller asks the person to choose one.
 */

interface BaseLike {
  id: string
}

interface TabLike {
  id: string
  baseId: string
  path: string
}

export interface NoteHome {
  baseId: string
  /** Folder inside the base, '' for its root. */
  parent: string
}

/** The folder an entry sits in. '' when it sits at the root of the base. */
function parentOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut < 0 ? '' : path.slice(0, cut)
}

/**
 * The folder a new note should go in, or nothing when no folder is open.
 *
 * Beside the open file when that file lives in a folder the person opened,
 * because that is where they are working. Otherwise the first open folder, so
 * that a loose file in front does not send the note somewhere surprising.
 */
export function noteHome(
  bases: readonly BaseLike[],
  tabs: readonly TabLike[],
  activeId: string | null,
): NoteHome | null {
  const active = tabs.find((tab) => tab.id === activeId)
  if (active && bases.some((base) => base.id === active.baseId)) {
    return { baseId: active.baseId, parent: parentOf(active.path) }
  }
  const first = bases[0]
  return first ? { baseId: first.id, parent: '' } : null
}
