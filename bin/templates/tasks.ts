/** Task: project management tasks with progress slider */
export const TASK_SEED: Seed = {
  slug: 'tasks',
  label: 'Task',
  labelPlural: 'Tasks',
  displayNameAlias: 'title',
  branches: [
    { alias: 'title',      label: 'Task Title', type: 'text', requiredOnCreate: true },
    { alias: 'taskStatus', label: 'Status',     type: 'text', options: ['todo', 'in_progress', 'done'] },
    { alias: 'completion', label: 'Completion', type: 'number', numberOptions: { format: 'percentage', min: 0, max: 100, step: 5, control: 'slider' } }
  ],
}
