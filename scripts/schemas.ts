import { writeFileSync } from 'fs'
import { join } from 'path'
import { getSchema } from '../src/input'

writeFileSync(join(import.meta.dirname, '..', 'schemas', 'infograph.json'), JSON.stringify(getSchema(), null, 2))
