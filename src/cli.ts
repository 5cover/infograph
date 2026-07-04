import { parseInfograph } from './input'
import { readFileSync } from 'fs'
import * as YAML from 'js-yaml'

const data = YAML.load(readFileSync('example-infographs/alt.yaml', 'utf8'))
const ig = parseInfograph(data)
console.dir(ig, { depth: null })
