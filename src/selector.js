export function selectApp(detectedIds, apps, config) {
  const order = [...config.priority, ...apps.map((app) => app.id).filter((id) => !config.priority.includes(id))];
  const id = order.find((candidate) => detectedIds.includes(candidate) && !config.disabled.includes(candidate));
  return apps.find((app) => app.id === id) ?? null;
}
