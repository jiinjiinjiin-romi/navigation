import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const navigationRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(navigationRoot, '..')
const sourcePath = path.join(workspaceRoot, 'scenario', 'scenario-db.json')
const targetPath = path.join(navigationRoot, 'src', 'features', 'demo-scenarios', 'data', 'scenario-db.json')

const database = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
const cleanDatabase = {
  scenarios: database.scenarios.map(({ editorLayout, ...scenario }) => ({
    ...scenario,
    events: scenario.events.map(({ editorAction, assistantState, ...event }) => event),
  })),
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true })
fs.writeFileSync(targetPath, `${JSON.stringify(cleanDatabase, null, 2)}\n`)

