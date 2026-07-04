import { parseInfograph } from './input'
import { readFileSync } from 'fs'
import * as YAML from 'js-yaml'
import * as infograph from './infograph'

const data = YAML.load(readFileSync('example-infographs/alt.yaml', 'utf8'))
const ig = parseInfograph(data)
const fc = infograph.toMermaid(ig, { neutralVerb: '-' })
console.log(fc)
