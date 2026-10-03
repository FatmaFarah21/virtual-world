export function findPath(graph, start, end) {
  const queue = [[start]], visited = new Set([start]);
  while (queue.length) {
    const path = queue.shift(), last = path.at(-1);
    if (last === end) return path.map(id => graph[id]);
    for (const next of graph[last]?.edges || []) if (!visited.has(next)) { visited.add(next); queue.push([...path, next]); }
  }
  throw new Error(`No route from ${start} to ${end}`);
}
