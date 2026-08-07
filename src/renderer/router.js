const routes = ['projects', 'brief', 'story', 'characters', 'storyboard', 'voice', 'timeline', 'export', 'settings'];
export function routeFromHash() { const value = location.hash.replace('#/', ''); return routes.includes(value) ? value : 'projects'; }
export function navigate(route) { location.hash = `#/${routes.includes(route) ? route : 'projects'}`; }
export { routes };
