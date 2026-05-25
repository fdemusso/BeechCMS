import type { IHashProvider } from '@beechcms/core'

const HASH_PREFIX = 'HASH:'

export class InMemoryHashProvider implements IHashProvider {
  async hash(plaintextPassword: string): Promise<string> {
    return HASH_PREFIX + plaintextPassword
  }

  async verify(plaintextPassword: string, storedHash: string): Promise<boolean> {
    return storedHash === HASH_PREFIX + plaintextPassword
  }
}
