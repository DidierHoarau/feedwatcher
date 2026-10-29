// Single source of truth for the sources tree.
//
// The API returns one entry per (source, label) pair. `buildSourceTree` turns
// that flat payload into an ordered list of rows where `depth` is the real
// hierarchy depth: the "All" root is 0, top-level labels and unlabeled
// sources are 1, their children 2, and so on. Both the sources list and the
// label picker render these rows through `SourceTreeRow.vue`, which indents a
// row by `depth * --tree-step`; every level therefore steps in by the same
// amount, for labels and sources alike.

export interface SourceTreeInput {
  sourceId: string;
  sourceName: string;
  labelName?: string | null;
  sourceInfo?: any;
}

export interface SourceTreeRow {
  isLabel: boolean;
  isRoot?: boolean;
  // Hierarchy depth: root 0, top-level labels/sources 1, ...
  depth: number;
  labelName: string;
  displayName: string;
  name: string;
  sourceId?: string;
  icon?: string;
  sourceInfo: any;
  unreadCount: number;
  savedCount: number;
  isCollapsed: boolean;
  isVisible: boolean;
}

interface LabelNode {
  labelName: string;
  displayName: string;
  depth: number;
  sources: SourceTreeInput[];
  children: Map<string, LabelNode>;
}

export function buildSourceTree(
  inputs: SourceTreeInput[],
  isLabelCollapsed: (labelName: string) => boolean,
): SourceTreeRow[] {
  const root: LabelNode = {
    labelName: "",
    displayName: "All",
    depth: 0,
    sources: [],
    children: new Map(),
  };
  for (const input of inputs) {
    const labelName = (input.labelName || "").trim();
    const node = labelName ? ensureLabel(root, labelName) : root;
    node.sources.push(input);
  }

  const rows: SourceTreeRow[] = [
    {
      isLabel: true,
      isRoot: true,
      depth: 0,
      labelName: "",
      displayName: "All",
      name: "All",
      sourceInfo: {},
      unreadCount: 0,
      savedCount: 0,
      isCollapsed: false,
      isVisible: true,
    },
  ];
  appendChildren(root, false);
  return rows;

  function appendChildren(node: LabelNode, ancestorCollapsed: boolean) {
    for (const source of sortBy(node.sources, sourceNameOf)) {
      rows.push({
        isLabel: false,
        isRoot: false,
        depth: node.depth + 1,
        labelName: node.labelName,
        displayName: source.sourceName,
        name: source.sourceName,
        sourceId: source.sourceId,
        icon: source.sourceInfo?.icon,
        sourceInfo: source.sourceInfo || {},
        unreadCount: 0,
        savedCount: 0,
        isCollapsed: false,
        isVisible: !ancestorCollapsed,
      });
    }
    const children = sortBy(
      [...node.children.values()],
      (child: LabelNode) => child.displayName,
    );
    for (const child of children) {
      const collapsed = isLabelCollapsed(child.labelName);
      rows.push({
        isLabel: true,
        isRoot: false,
        depth: child.depth,
        labelName: child.labelName,
        displayName: child.displayName,
        name: child.displayName,
        sourceInfo: {},
        unreadCount: 0,
        savedCount: 0,
        isCollapsed: collapsed,
        isVisible: !ancestorCollapsed,
      });
      appendChildren(child, ancestorCollapsed || collapsed);
    }
  }
}

function ensureLabel(root: LabelNode, labelName: string): LabelNode {
  let node = root;
  let path = "";
  for (const part of labelName.split("/")) {
    path = path ? `${path}/${part}` : part;
    let child = node.children.get(part);
    if (!child) {
      child = {
        labelName: path,
        displayName: part,
        depth: node.depth + 1,
        sources: [],
        children: new Map(),
      };
      node.children.set(part, child);
    }
    node = child;
  }
  return node;
}

function sourceNameOf(source: SourceTreeInput): string {
  return source.sourceName;
}

function sortBy<T>(items: T[], key: (item: T) => string): T[] {
  return items.sort((a, b) => {
    const left = key(a);
    const right = key(b);
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  });
}

// A row is hidden by the first collapsed ancestor label. Rows are in tree
// order, so a collapsed label only hides the following rows that are deeper
// than it; the next row at its depth or above is a sibling and stays visible.
export function applyTreeVisibility(rows: SourceTreeRow[]): void {
  let collapsedDepth: number | null = null;
  for (const row of rows) {
    if (collapsedDepth !== null && row.depth > collapsedDepth) {
      row.isVisible = false;
      continue;
    }
    collapsedDepth = null;
    row.isVisible = true;
    if (row.isLabel && !row.isRoot && row.isCollapsed) {
      collapsedDepth = row.depth;
    }
  }
}

// Per-source counts plus one aggregate per label. A label aggregates the
// sources of its whole subtree ("news" sums "news" and "news/tech").
export function assignTreeCounts(
  rows: SourceTreeRow[],
  counts: { sourceId: string; [field: string]: any }[],
  field: string,
): void {
  const bySourceId = new Map<string, any>();
  for (const count of counts) {
    bySourceId.set(count.sourceId, count);
  }
  const labelTotals = new Map<string, number>();
  for (const row of rows) {
    if (row.isLabel) {
      labelTotals.set(row.labelName, 0);
    }
  }
  for (const row of rows) {
    if (row.isLabel) {
      continue;
    }
    const count = bySourceId.get(row.sourceId as string);
    const value = (count ? count[field] : 0) || 0;
    (row as any)[field] = value;
    let labelName = row.labelName;
    while (true) {
      labelTotals.set(labelName, (labelTotals.get(labelName) || 0) + value);
      if (!labelName) {
        break;
      }
      const cut = labelName.lastIndexOf("/");
      labelName = cut === -1 ? "" : labelName.slice(0, cut);
    }
  }
  for (const row of rows) {
    if (row.isLabel) {
      (row as any)[field] = labelTotals.get(row.labelName) || 0;
    }
  }
}

// Indices (into `rows`) of the rows matching `query`, including the ancestor
// labels needed to keep the result indented like the tree, plus the root when
// there is a match. Without a query, returns the rows the tree currently
// shows (collapsed subtrees excluded).
export function filterTreeIndices(
  rows: SourceTreeRow[],
  query: string,
): number[] {
  const text = query.trim().toLowerCase();
  if (!text) {
    return rows
      .map((row, index) => (row.isVisible ? index : -1))
      .filter((index) => index !== -1);
  }
  // "cars/" and "cars" select the same subtree.
  const pathText = text.replace(/\/+$/, "");
  const included = new Set<number>();
  let matches = 0;
  rows.forEach((row, index) => {
    if (row.isRoot) {
      return;
    }
    const name = (row.displayName || "").toLowerCase();
    const path = (row.labelName || "").toLowerCase();
    const matchesName = name.includes(text);
    const matchesPath = !row.isLabel && path.includes(pathText);
    if (!matchesName && !matchesPath) {
      return;
    }
    matches++;
    included.add(index);
    let depth = row.depth;
    for (let previous = index - 1; previous >= 0 && depth > 0; previous--) {
      const ancestor = rows[previous];
      if (ancestor.isLabel && ancestor.depth === depth - 1) {
        included.add(previous);
        depth = ancestor.depth;
      }
    }
  });
  if (matches === 0) {
    return [];
  }
  included.add(0);
  return [...included].sort((left, right) => left - right);
}
