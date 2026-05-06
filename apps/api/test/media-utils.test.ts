import { describe, expect, it } from 'vitest'
import { extractMediaKeysFromData } from '../src/media-utils'
import { TEST_SEEDS } from './fixtures'

const seed = TEST_SEEDS[0] // posts in fixtures

describe('media-utils - extractMediaKeysFromData', () => {
  it('estrae chiave da campo file (stringa singola)', () => {
    const data = {
      title: 'Post',
      image: 'https://example.com/api/media/123-img.png'
    }
    const keys = extractMediaKeysFromData(seed, data)
    expect(keys).toEqual(['123-img.png'])
  })

  it('restituisce array vuoto per data vuoto', () => {
    expect(extractMediaKeysFromData(seed, {})).toEqual([])
  })

  it('ignora URL non Beech', () => {
    const data = {
      image: 'https://other-cdn.com/img.png'
    }
    expect(extractMediaKeysFromData(seed, data)).toEqual([])
  })
})
