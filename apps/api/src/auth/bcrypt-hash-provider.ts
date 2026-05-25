import bcrypt from 'bcryptjs'
import type { IHashProvider } from '@beechcms/core'

export const BCRYPT_SALT_ROUNDS = 10

export class BcryptHashProvider implements IHashProvider {
  private readonly saltRounds: number

  constructor(saltRounds: number = BCRYPT_SALT_ROUNDS) {
    this.saltRounds = saltRounds
  }

  async hash(plaintextPassword: string): Promise<string> {
    return bcrypt.hash(plaintextPassword, this.saltRounds)
  }

  async verify(plaintextPassword: string, storedHash: string): Promise<boolean> {
    return bcrypt.compare(plaintextPassword, storedHash)
  }
}
