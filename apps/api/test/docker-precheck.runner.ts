import { assertDockerStackReady } from './docker-precheck'
export async function setup() { await assertDockerStackReady() }
